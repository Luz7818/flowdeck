import { spawn } from 'node:child_process';

/**
 * Open a URL in the default browser, cross-platform.
 * Set FLOWDECK_NO_OPEN=1 to skip (used by tests and headless runs).
 */
export function openBrowser(url: string): void {
  if (process.env.FLOWDECK_NO_OPEN === '1') {
    // docs/GET-START.md promises a printable URL for headless runs
    console.error(`[flowdeck] canvas URL: ${url}`);
    return;
  }
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
