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
    if (process.platform === 'win32') {
      // `start` needs an empty window-title argument to be safe with URLs containing '&'
      const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
      child.unref();
    } else if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    } else {
      const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch {
    // best effort — print the URL so the user can open it manually
    console.error(`[flowdeck] open manually: ${url}`);
  }
}
