import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { generateSummary, normalizePlan, Plan, PlanResult } from '@flowdeck/core';

const DEFAULT_PORT = 7688;

// the host's own version — shown in the canvas UI so users can match it against the CLI
const HOST_VERSION = (
  JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
).version;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', Connection: 'close' };

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

function historyDir(): string {
  return path.join(os.homedir(), '.flowdeck', 'history');
}

function archive(plan: Plan, summary: string): void {
  try {
    fs.mkdirSync(historyDir(), { recursive: true });
    const file = path.join(historyDir(), `${new Date().toISOString().replace(/[:.]/g, '-')}-${plan.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.json`);
    fs.writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), plan, summary }, null, 2), 'utf-8');
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

  async ensureStarted(): Promise<number> {
    if (this.port) return this.port;
    const preferred = Number(process.env.FLOWDECK_PORT) || DEFAULT_PORT;

    const server = http.createServer((req, res) => {
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
   */
  async present(plan: Plan, opts: { signal?: AbortSignal } = {}): Promise<PlanResult> {
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
      if (session.settled) return;
      session.settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      for (const ws of session.sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: result.status === 'confirmed' ? 'confirmed' : 'cancelled' }));
        }
      }
      this.sessions.delete(id);
    };

    if (opts.signal?.aborted) {
      settle({ status: 'cancelled' });
      return { status: 'cancelled' };
    }

    openCanvas(`http://127.0.0.1:${port}/s/${id}`);
    return new Promise<PlanResult>((resolve) => {
      session.resolve = (result) => {
        settle(result);
        resolve(result);
      };
      if (process.env.FLOWDECK_TIMEOUT_MS) {
        const ms = Number(process.env.FLOWDECK_TIMEOUT_MS);
        setTimeout(() => session.resolve({ status: 'cancelled' }), ms).unref();
      }
    });
  }

  private handleSocket(id: string, ws: WebSocket) {
    const session = this.sessions.get(id);
    if (!session) {
      ws.close();
      return;
    }
    session.sockets.add(ws);
    ws.send(JSON.stringify({ type: 'init', sessionId: id, plan: session.plan, version: HOST_VERSION }));

    ws.on('message', (data) => {
      let msg: { type?: string; plan?: unknown };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.type === 'confirm' && msg.plan) {
        const confirmed = normalizePlan(msg.plan as { title: string; modules: Array<Record<string, unknown>> });
        const summary = generateSummary(confirmed);
        archive(confirmed, summary);
        session.resolve({ status: 'confirmed', plan: confirmed, summary });
      } else if (msg.type === 'cancel') {
        session.resolve({ status: 'cancelled' });
      }
    });
    ws.on('close', () => session.sockets.delete(ws));
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
    if (url.pathname === '/api/history/file') {
      const name = url.searchParams.get('name') ?? '';
      // strict basename check — no path traversal (unicode-aware: titles may be Chinese)
      if (!/^[\p{L}\p{N}._-]+\.json$/u.test(name)) {
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
  }
}

function openCanvas(url: string): void {
  // lazy import to keep browser.ts side-effect free for tests
  import('./browser.js').then(({ openBrowser }) => openBrowser(url));
}
