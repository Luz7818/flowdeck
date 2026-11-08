import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * FlowDeck VS Code-family extension (VS Code / Cursor / Qoder 共用).
 *
 * The MCP host records every created canvas session in
 * ~/.flowdeck/last-session.json ({url, sessionId, ts} — see
 * packages/mcp/src/canvas-server.ts writeLastSession). This extension watches
 * that file and opens the canvas inside the IDE as a webview panel holding a
 * single iframe pointed at the canvas URL: all canvas JS/WS stays inside the
 * iframe (its requests carry the loopback canvas origin the host guard
 * expects, plus the vscode-webview:// allowance for the embedding document),
 * the shell proxies nothing. Set FLOWDECK_OPEN_MODE=vscode on the MCP server
 * so the default browser tab does not double-open.
 */

const CANVAS_FILE = path.join(os.homedir(), '.flowdeck', 'last-session.json');

/** Only loopback canvas URLs may be embedded — mirrors the host's own guard
 *  (canvas-server.ts isLocalRequest): anything else would just get a 403 from
 *  the canvas server. Returns the normalized URL, or undefined. */
function asCanvasUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Best-effort read: no session yet, or a read that raced a partial write. */
function readLastSessionUrl(): string | undefined {
  try {
    const json = JSON.parse(fs.readFileSync(CANVAS_FILE, 'utf-8')) as { url?: unknown };
    return asCanvasUrl(json.url);
  } catch {
    return undefined;
  }
}

/** The webview shell: one iframe + a Simple Browser fallback if the host
 *  blocks the frame. All canvas logic lives in the iframe's own document. */
function shellHtml(url: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const frameOrigin = new URL(url).origin;
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${frameOrigin}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
  #frame { width: 100%; height: 100%; border: 0; display: block; }
  #fallback { display: none; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); padding: 16px; line-height: 1.9; }
  #fallback a { color: var(--vscode-textLink-foreground); }
</style>
</head>
<body>
<iframe id="frame" src="${url}"></iframe>
<div id="fallback">
  画布 iframe 未能加载(可能被宿主拦截)。
  <a href="#" id="simple">改用 Simple Browser 打开(仍在 IDE 窗口内)</a>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const frame = document.getElementById('frame');
  const fallback = document.getElementById('fallback');
  let loaded = false;
  frame.addEventListener('load', () => { loaded = true; fallback.style.display = 'none'; });
  setTimeout(() => {
    if (loaded) {
      try {
        // a successfully loaded canvas is cross-origin (access throws); a
        // frame the host blocked stays on an accessible about:blank
        if (frame.contentWindow && frame.contentWindow.location.href === 'about:blank') loaded = false;
      } catch { /* cross-origin — the canvas is really there */ }
    }
    if (!loaded) fallback.style.display = 'block';
  }, 4000);
  document.getElementById('simple').addEventListener('click', (e) => {
    e.preventDefault();
    vscode.postMessage({ type: 'openInSimpleBrowser', url: ${JSON.stringify(url)} });
  });
</script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined;
  let shownUrl: string | undefined;

  const openCanvas = (url: string, preserveFocus: boolean): void => {
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        'flowdeckCanvas',
        'FlowDeck 画布',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
        { enableScripts: true, retainContextWhenHidden: true },
      );
      panel.onDidDispose(() => {
        panel = undefined;
      }, null, context.subscriptions);
      panel.webview.onDidReceiveMessage((msg: unknown) => {
        const m = msg as { type?: string; url?: unknown };
        if (m?.type === 'openInSimpleBrowser' && typeof m.url === 'string') {
          const parsed = asCanvasUrl(m.url);
          if (parsed) void vscode.commands.executeCommand('simpleBrowser.api.open', vscode.Uri.parse(parsed));
        }
      }, null, context.subscriptions);
    } else {
      panel.reveal(undefined, preserveFocus);
    }
    panel.webview.html = shellHtml(url);
    shownUrl = url;
  };

  // auto-open on session creation. Watch the parent directory (a file watcher
  // would die if the file were recreated); history lives in a subdir, so
  // events here are last-session.json writes.
  try {
    let timer: NodeJS.Timeout | undefined;
    const watcher = fs.watch(path.dirname(CANVAS_FILE), { persistent: false }, (_event, fileName) => {
      if (fileName && fileName !== 'last-session.json') return;
      clearTimeout(timer);
      // debounce past the host's writeFileSync — a mid-write read is garbage
      timer = setTimeout(() => {
        const url = readLastSessionUrl();
        if (url && url !== shownUrl) openCanvas(url, true);
      }, 150);
    });
    watcher.on('error', () => {
      // the host removed the directory mid-run — manual commands still work
    });
    context.subscriptions.push({ dispose: () => watcher.close() });
  } catch {
    // ~/.flowdeck doesn't exist yet (no session ever ran) — nothing to watch
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('flowdeck.openLastCanvas', () => {
      const url = readLastSessionUrl();
      if (!url) {
        void vscode.window.showInformationMessage(
          'FlowDeck:还没有画布会话记录 — 先在 IDE 对话里让 agent 调用 present_plan。',
        );
        return;
      }
      openCanvas(url, false);
    }),
    vscode.commands.registerCommand('flowdeck.openCanvasUrl', async () => {
      const picked = await vscode.window.showInputBox({
        prompt: '粘贴 FlowDeck 画布 URL(形如 http://127.0.0.1:7688/s/<id>)',
        value: readLastSessionUrl() ?? '',
        ignoreFocusOut: true,
      });
      const url = asCanvasUrl(picked);
      if (!url) {
        void vscode.window.showWarningMessage('FlowDeck:不是合法的本地画布 URL(需为 127.0.0.1 / localhost 的 http(s) 地址)。');
        return;
      }
      openCanvas(url, false);
    }),
  );
}
