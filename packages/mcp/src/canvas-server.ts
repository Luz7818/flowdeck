import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { generateSummary, normalizePlan, Plan, PlanResult } from '@flowdeck/core';

const DEFAULT_PORT = 7688;

/** Default confirmation wait: bounded so a missed browser window can't wedge the tool call forever. */
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Reopen-session reclamation — a reopened archive has no tool call waiting on
 * it, so nothing else would ever end it. Two unref'd layers:
 * (a) never opened: reclaimed REOPEN_ABANDON_MS after reopen();
 * (b) opened then abandoned: reclaimed REOPEN_IDLE_MS after the last tab left.
 */
const REOPEN_ABANDON_MS = 30 * 60_000;
const REOPEN_IDLE_MS = 30_000;

// the host's own version — shown in the canvas UI so users can match it against the CLI
const HOST_VERSION = (
  JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
).version;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' };

/**
 * DNS-rebinding guard: a rebound page arrives with the victim's own IP but a
 * foreign Host header, making it same-origin from the browser's point of view.
 * Only loopback hostnames may talk to the canvas host; a present Origin header
 * (browsers attach it to cross-site fetches and CORS-mode module scripts) must
 * name a loopback too. Non-browser clients send no Origin and are unaffected.
 */
function loopbackHostname(raw: string): boolean {
  try {
    const h = new URL(raw).hostname;
    return h === '127.0.0.1' || h === 'localhost';
  } catch {
    return false;
  }
}

function isLocalRequest(req: http.IncomingMessage): boolean {
  // Host: host[:port] (no scheme) — the prepend makes it parseable
  if (!loopbackHostname(`http://${req.headers.host ?? ''}`)) return false;
  // Origin: scheme://host[:port] — already a full URL, never prepend
  const origin = req.headers.origin;
  if (origin && !loopbackHostname(origin)) return false;
  return true;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  // Connection: close releases pooled client sockets (undici in CLI/e2e) at once,
  // so test processes exit cleanly instead of waiting out keep-alive
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

interface Session {
  id: string;
  plan: Plan;
  sockets: Set<WebSocket>;
  settled: boolean;
  resolve: (result: PlanResult) => void;
  /** reopen-spawned session: no tool call waits on it, reclaim timers do */
  ephemeral?: boolean;
  /** reclaim layer (a): armed by reopen(), cleared on first connection and at settle */
  abandonTimer?: NodeJS.Timeout;
  /** reclaim layer (b): armed when the last socket leaves, cleared on reconnect and at settle */
  idleTimer?: NodeJS.Timeout;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function resolveWebDist(): string {
  const override = process.env.FLOWDECK_WEB_DIST;
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  // published layout: packages/mcp/web-dist (bundled at publish time)
  const bundled = path.resolve(here, '../web-dist');
  if (fs.existsSync(path.join(bundled, 'index.html'))) return bundled;
  // monorepo layout: packages/web/dist
  return path.resolve(here, '../../web/dist');
}

/**
 * Structural check for plan payloads arriving over WS: the confirm path feeds
 * archive() with `plan.title` and `plan.modules`, so a number or a missing
 * title must be refused here — normalizePlan itself is intentionally total and
 * does not validate (schema evolution keeps unknown module types verbatim, so
 * a full PlanSchema.safeParse would wrongly reject future canvases).
 */
function asPlanInput(plan: unknown): { title: string; modules: Array<Record<string, unknown>> } | null {
  if (!plan || typeof plan !== 'object') return null;
  const title = (plan as { title?: unknown }).title;
  if (typeof title !== 'string') return null;
  const modules = (plan as { modules?: unknown }).modules;
  if (modules !== undefined && !Array.isArray(modules)) return null;
  return { title, modules: modules as Array<Record<string, unknown>> };
}

function historyDir(): string {
  return path.join(os.homedir(), '.flowdeck', 'history');
}

/** Strict basename whitelist for history file names — no path traversal
 *  (unicode-aware: titles may be Chinese). */
function isHistoryFileName(name: string): boolean {
  return /^[\p{L}\p{N}._-]+\.json$/u.test(name);
}

/** Keep the newest N archives on disk — local history, not an unbounded log (FD-05). */
const HISTORY_KEEP = 500;

/** Oldest-first prune past HISTORY_KEEP; ISO timestamp filenames sort chronologically. */
function pruneHistory(): void {
  try {
    const files = fs.readdirSync(historyDir()).filter((f) => f.endsWith('.json')).sort();
    for (const file of files.slice(0, Math.max(0, files.length - HISTORY_KEEP))) {
      try {
        fs.unlinkSync(path.join(historyDir(), file));
      } catch {
        /* concurrent reader or already gone — the next prune retries */
      }
    }
  } catch {
    // pruning is best-effort; archiving must never break the confirmation flow
  }
}

function archive(plan: Plan, summary: string): void {
  try {
    fs.mkdirSync(historyDir(), { recursive: true });
    const file = path.join(historyDir(), `${new Date().toISOString().replace(/[:.]/g, '-')}-${plan.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.json`);
    fs.writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), plan, summary }, null, 2), 'utf-8');
    pruneHistory();
  } catch {
    // archiving must never break the confirmation flow
  }
}

/** History list entry (newest first). */
function listHistory(): Array<{ file: string; title: string; savedAt: string; moduleCount: number }> {
  try {
    const files = fs
      .readdirSync(historyDir())
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 100);
    return files.map((file) => {
      try {
        const json = JSON.parse(fs.readFileSync(path.join(historyDir(), file), 'utf-8'));
        return {
          file,
          title: json?.plan?.title ?? '(unknown)',
          savedAt: json?.savedAt ?? '',
          moduleCount: Array.isArray(json?.plan?.modules) ? json.plan.modules.length : 0,
        };
      } catch {
        return { file, title: '(corrupted)', savedAt: '', moduleCount: 0 };
      }
    });
  } catch {
    return [];
  }
}

/**
 * Hosts the canvas web page over local HTTP, bridges the browser UI and the
 * MCP tool call via WebSocket, and archives confirmed plans.
 */
export class CanvasHost {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number | null = null;
  private sessions = new Map<string, Session>();
  /** in-flight ensureStarted — concurrent present() calls must share one listen
   *  (two parallel tool calls otherwise race into two servers on two ports) */
  private startPromise: Promise<number> | null = null;

  async ensureStarted(): Promise<number> {
    if (this.port) return this.port;
    if (!this.startPromise) {
      this.startPromise = this.startServer().then(
        (port) => {
          this.startPromise = null;
          return port;
        },
        (err) => {
          this.startPromise = null;
          throw err;
        },
      );
    }
    return this.startPromise;
  }

  private async startServer(): Promise<number> {
    const preferred = Number(process.env.FLOWDECK_PORT) || DEFAULT_PORT;

    const server = http.createServer((req, res) => {
      if (!isLocalRequest(req)) {
        res.writeHead(403).end();
        return;
      }
      if (req.method === 'POST' && req.url === '/__err') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          console.error('[flowdeck] page error:', body.slice(0, 3000));
          res.writeHead(204).end();
        });
        return;
      }
      this.handleHttp(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (!isLocalRequest(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const id = url.searchParams.get('id') ?? '';
      if (url.pathname !== '/ws' || !id || !this.sessions.has(id)) {
        // accept then close with a semantic code so the page can show "session ended"
        this.wss!.handleUpgrade(req, socket, head, (ws) => ws.close(4404, 'session not found'));
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.handleSocket(id, ws));
    });

    const port = await new Promise<number>((resolve, reject) => {
      // one listening/error pair armed per attempt: a failed listen() leaves
      // its 'listening' callback armed in Node, so reusing them across retries
      // would let the stale callback resolve the promise with the dead port
      const tryListen = (p: number) => {
        const onListening = () => {
          cleanup();
          resolve(p === 0 ? (server.address() as { port: number }).port : p);
        };
        const onError = (err: Error) => {
          cleanup();
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EADDRINUSE' || code === 'EACCES') {
            // busy, or blocked by Windows WinNAT reserved ranges (EACCES) —
            // any free port keeps the canvas up; the resolved URL reports it
            console.error(`[flowdeck] port ${p} unavailable (${code}), picking a free port`);
            tryListen(0);
          } else {
            reject(err);
          }
        };
        const cleanup = () => {
          server.off('listening', onListening);
          server.off('error', onError);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(p, '127.0.0.1');
      };
      tryListen(preferred);
    });

    this.server = server;
    this.port = port;
    return port;
  }

  /**
   * Present a plan on the canvas and wait for the user's confirmation.
   * `signal` aborts the wait when the IDE client cancels the tool call.
   * `onSession` fires once with the canvas URL once the session is up (before
   * the browser opens) — the tool layer uses it to notify the conversation side.
   */
  async present(
    plan: Plan,
    opts: { signal?: AbortSignal; onSession?: (url: string) => void } = {},
  ): Promise<PlanResult> {
    const port = await this.ensureStarted();
    const id = randomUUID();
    const session: Session = {
      id,
      plan,
      sockets: new Set(),
      settled: false,
      resolve: () => {},
    };
    this.sessions.set(id, session);

    const onAbort = () => session.resolve({ status: 'cancelled' });
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const settle = (result: PlanResult) => {
      opts.signal?.removeEventListener('abort', onAbort);
      this.settleSession(session, result);
    };

    if (opts.signal?.aborted) {
      settle({ status: 'cancelled' });
      return { status: 'cancelled' };
    }

    const url = `http://127.0.0.1:${port}/s/${id}`;
    opts.onSession?.(url);
    openCanvas(url);
    return new Promise<PlanResult>((resolve) => {
      session.resolve = (result) => {
        settle(result);
        resolve(result);
      };
      // FLOWDECK_TIMEOUT_MS overrides the default wait; 0 (or any value not
      // > 0) disables the limit entirely
      const raw = Number(process.env.FLOWDECK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
      if (raw > 0) {
        setTimeout(() => session.resolve({ status: 'cancelled' }), raw).unref();
      }
    });
  }

  /** Shared settle tail: retire reclaim timers, notify live sockets, drop the session. */
  private settleSession(session: Session, result: PlanResult): void {
    if (session.settled) return;
    session.settled = true;
    clearTimeout(session.abandonTimer);
    clearTimeout(session.idleTimer);
    for (const ws of session.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: result.status === 'confirmed' ? 'confirmed' : 'cancelled' }));
      }
    }
    this.sessions.delete(session.id);
  }

  /**
   * Bring an archived plan back as a live canvas session (history reopen).
   * Same session shape as present(), but nothing waits on it: no browser
   * auto-open, no abort wiring, no timeout. Confirm / autosave / cancel go
   * through the regular handleSocket path (confirm re-archives via archive());
   * abandonment is reclaimed by the two unref'd timers on the session.
   */
  reopen(plan: Plan): { id: string } {
    const id = randomUUID();
    const session: Session = {
      id,
      plan,
      sockets: new Set(),
      settled: false,
      resolve: (result) => this.settleSession(session, result),
      ephemeral: true,
    };
    this.sessions.set(id, session);
    // layer (a): the browser may never open this URL — reclaim after a generous
    // half hour so /sessions and /healthz can't accumulate ghost sessions
    session.abandonTimer = setTimeout(() => session.resolve({ status: 'cancelled' }), REOPEN_ABANDON_MS).unref();
    return { id };
  }

  private handleSocket(id: string, ws: WebSocket) {
    const session = this.sessions.get(id);
    if (!session) {
      ws.close();
      return;
    }
    // a (re)connection means someone is looking: retire the reopen fallback
    // timer and any pending last-socket reclaim (a page refresh lands here)
    clearTimeout(session.abandonTimer);
    session.abandonTimer = undefined;
    clearTimeout(session.idleTimer);
    session.idleTimer = undefined;
    session.sockets.add(ws);
    ws.send(JSON.stringify({ type: 'init', sessionId: id, plan: session.plan, version: HOST_VERSION }));

    ws.on('message', (data) => {
      let msg: { type?: string; plan?: unknown };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'confirm') {
        const input = asPlanInput(msg.plan);
        if (!input) return; // malformed confirm payload — session stays open for a retry
        const confirmed = normalizePlan(input);
        const summary = generateSummary(confirmed);
        archive(confirmed, summary);
        session.resolve({ status: 'confirmed', plan: confirmed, summary });
      } else if (msg.type === 'autosave' && !session.settled) {
        // keep the newest edited plan on the session so a page refresh /
        // reconnect restores the user's edits instead of the original draft
        const input = asPlanInput(msg.plan);
        if (input) session.plan = normalizePlan(input); // malformed autosave — keep the last good plan
      } else if (msg.type === 'cancel') {
        session.resolve({ status: 'cancelled' });
      }
    });
    ws.on('close', () => {
      session.sockets.delete(ws);
      // reclaim layer (b): an ephemeral session whose last tab just left gets a
      // short grace window, then is cancelled — a page refresh reconnects well
      // within it, so only a truly abandoned session is reclaimed
      if (session.ephemeral && !session.settled && session.sockets.size === 0) {
        session.idleTimer = setTimeout(() => session.resolve({ status: 'cancelled' }), REOPEN_IDLE_MS).unref();
      }
    });
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/sessions') {
      sendJson(res, 200, Object.fromEntries([...this.sessions.entries()].map(([id, s]) => [id, { title: s.plan.title }])));
      return;
    }
    if (url.pathname === '/api/history') {
      sendJson(res, 200, listHistory());
      return;
    }
    if (url.pathname === '/api/history/reopen') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POST only' });
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let name = '';
        try {
          name = String(JSON.parse(body).name ?? '');
        } catch {
          sendJson(res, 400, { error: 'invalid body' });
          return;
        }
        if (!isHistoryFileName(name)) {
          sendJson(res, 400, { error: 'invalid name' });
          return;
        }
        let raw: string;
        try {
          raw = fs.readFileSync(path.join(historyDir(), name), 'utf-8');
        } catch {
          sendJson(res, 404, { error: 'not found' });
          return;
        }
        let json: { plan?: unknown };
        try {
          json = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: 'corrupted archive' });
          return;
        }
        const input = asPlanInput(json?.plan);
        if (!input) {
          sendJson(res, 400, { error: 'invalid plan' });
          return;
        }
        const { id } = this.reopen(normalizePlan(input));
        sendJson(res, 200, { url: `/s/${id}` });
      });
      return;
    }
    if (url.pathname === '/api/history/file') {
      const name = url.searchParams.get('name') ?? '';
      if (!isHistoryFileName(name)) {
        sendJson(res, 400, { error: 'invalid name' });
        return;
      }
      const file = path.join(historyDir(), name);
      if (req.method === 'DELETE') {
        try {
          fs.unlinkSync(file);
          sendJson(res, 200, { ok: true });
        } catch {
          sendJson(res, 404, { error: 'not found' });
        }
        return;
      }
      try {
        const json = fs.readFileSync(file, 'utf-8');
        res.writeHead(200, JSON_HEADERS);
        res.end(json);
      } catch {
        sendJson(res, 404, { error: 'not found' });
      }
      return;
    }
    if (url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true, sessions: this.sessions.size, version: HOST_VERSION });
      return;
    }

    const webDist = resolveWebDist();
    let file = url.pathname.startsWith('/s/')
      ? path.join(webDist, 'index.html')
      : path.join(webDist, url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, ''));
    file = path.normalize(file);
    if (!file.startsWith(path.normalize(webDist))) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA fallback
        fs.readFile(path.join(webDist, 'index.html'), (err2, index) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('FlowDeck web build not found. Run: npm run build -w @flowdeck/web');
          } else {
            res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
            res.end(index);
          }
        });
        return;
      }
      // no-store: the canvas is a local dev tool — a stale index.html would load a dead bundle hash
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  }

  /** Tear everything down: settle pending sessions, drop sockets, close servers. */
  async stop(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      session.resolve({ status: 'cancelled' });
      for (const ws of session.sockets) ws.terminate();
    }
    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.wss = null;
    this.server = null;
    this.port = null;
    this.startPromise = null;
  }
}

function openCanvas(url: string): void {
  // lazy import to keep browser.ts side-effect free for tests
  import('./browser.js').then(({ openBrowser }) => openBrowser(url));
}
