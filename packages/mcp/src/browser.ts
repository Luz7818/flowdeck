import { spawn } from 'node:child_process';

/**
 * Open a URL in the default browser, cross-platform.
 * Set FLOWDECK_NO_OPEN=1 to skip (used by tests and headless runs).
 * Set FLOWDECK_OPEN_MODE=vscode to skip too — the VS Code-family extension
 * (packages/vscode) watches ~/.flowdeck/last-session.json and opens the canvas
 * in an IDE-embedded webview panel; auto-opening a browser tab as well would
 * show two competing canvases for the same confirmation.
 */
export function openBrowser(url: string): void {
  // always print the URL to stderr — a browser window that was closed, missed
  // or auto-open-failed is recoverable by copy-pasting it back (GET-START
  // promises the printable URL for headless runs; real runs get it too now)
  console.error(`[flowdeck] canvas URL: ${url}`);
  if (process.env.FLOWDECK_NO_OPEN === '1') return;
  if (process.env.FLOWDECK_OPEN_MODE === 'vscode') return;
  try {
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    // spawn failure (e.g. bare Linux without xdg-open) surfaces asynchronously as
    // an 'error' event on the ChildProcess — without this listener it crashes the
    // whole MCP process instead of falling back to the printed URL
    child.on('error', () => console.error(`[flowdeck] open manually: ${url}`));
    child.unref();
  } catch {
    // best effort — print the URL so the user can open it manually
    console.error(`[flowdeck] open manually: ${url}`);
  }
}
