import { readFileSync } from 'node:fs';
import { parsePlanMarkdown } from '@flowdeck/core';
import { CanvasHost } from './canvas-server.js';
import { openBrowser } from './browser.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as { version: string };

const USAGE = [
  `FlowDeck ${version} — 把 AI 计划确认变成框线图画布 / plan confirmation canvas`,
  '',
  '  flowdeck serve            启动 MCP stdio 服务器(IDE 接入入口)',
  '  flowdeck open [plan.md]   Markdown 计划 → 画布确认 → 打印最终摘要(open 可省略,省略文件时读 stdin)',
  '  flowdeck history          浏览器打开历史确认记录查看器',
  '  flowdeck --version',
].join('\n');

/**
 * FlowDeck CLI
 *   flowdeck serve            start the MCP stdio server (IDE / npx entry)
 *   flowdeck open [plan.md]   Markdown 计划 → 画布确认 → 打印最终摘要 (default)
 *   flowdeck history          浏览器打开历史确认记录查看器
 */
async function main() {
  const arg = process.argv[2];

  if (arg === '--help' || arg === '-h' || arg === 'help') {
    console.log(USAGE);
    return;
  }
  if (arg === '--version' || arg === '-v') {
    console.log(version);
    return;
  }

  if (arg === 'serve') {
    await import('./index.js'); // starts the MCP stdio server on import
    return;
  }

  if (arg === 'history') {
    const host = new CanvasHost();
    const port = await host.ensureStarted();
    openBrowser(`http://127.0.0.1:${port}/#/history`);
    console.error('[flowdeck] history viewer opened in browser. Press Ctrl+C to exit.');
    await new Promise<never>(() => {}); // keep serving until interrupted
    return;
  }

  // default command: open (the explicit `open` token is optional)
  const file = arg === 'open' ? process.argv[3] : arg;
  let md: string;
  if (file && file !== '-') {
    md = readFileSync(file, 'utf-8');
  } else {
    md = await new Promise<string>((resolve, reject) => {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (c) => (buf += c));
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }

  const plan = parsePlanMarkdown(md);
  if (plan.modules.length === 0) {
    console.error('No plan lines found. Example:\n\n# My plan\n## Setup\n- init project\n- install deps\n> careful: deletes dist/');
    process.exit(1);
  }

  console.error(`[flowdeck] opening canvas for "${plan.title}" (${plan.modules.length} modules)…`);
  const host = new CanvasHost();
  const result = await host.present(plan);

  if (result.status === 'cancelled') {
    console.error('[flowdeck] cancelled.');
    process.exit(2);
  }
  console.log(result.summary);
}

main().catch((err) => {
  console.error('[flowdeck] fatal:', err);
  process.exit(1);
});
