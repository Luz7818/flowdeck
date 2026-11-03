import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
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
  '  flowdeck setup [--ide <id>]  检测本机 IDE 并写入 FlowDeck MCP 配置(id: zcode/cursor/claude-code/vscode)',
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

  if (arg === 'setup') {
    runSetup(process.argv[3] === '--ide' ? process.argv[4] : undefined);
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

/* ---------- flowdeck setup: one command wires every detected IDE ---------- */

interface IdeTarget {
  id: string;
  label: string;
  /** config file path (built lazily so `flowdeck --version` stays side-effect free) */
  file: () => string;
  /** JSON key holding server entries (VS Code uses "servers", everyone else "mcpServers") */
  key: string;
}

const IDE_TARGETS: IdeTarget[] = [
  { id: 'zcode', label: 'ZCode', file: () => join(homedir(), '.zcode', 'mcp.json'), key: 'mcpServers' },
  { id: 'cursor', label: 'Cursor', file: () => join(homedir(), '.cursor', 'mcp.json'), key: 'mcpServers' },
  { id: 'vscode', label: 'VS Code(当前目录 .vscode/mcp.json)', file: () => resolve('.vscode', 'mcp.json'), key: 'servers' },
];

/** Repo checkouts register the local dist directly; published installs use npx —
 *  the same split docs/ide-setup.md documents manually. */
function mcpEntry(): { command: string; args: string[] } {
  if (existsSync(new URL('../../web/dist', import.meta.url))) {
    return { command: 'node', args: [fileURLToPath(new URL('./index.js', import.meta.url))] };
  }
  return { command: 'npx', args: ['-y', '@flowdeck/mcp', 'serve'] };
}

/** Patch one JSON config: returns created | written | already | unreadable | skip. */
function patchIdeConfig(target: IdeTarget, entry: { command: string; args: string[] }, force: boolean): string {
  const file = target.file();
  if (!existsSync(file)) {
    if (!force) return 'skip';
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ [target.key]: { flowdeck: entry } }, null, 2)}\n`, 'utf-8');
    return 'created';
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return 'unreadable';
  }
  if (!json[target.key] || typeof json[target.key] !== 'object') json[target.key] = {};
  const servers = json[target.key] as Record<string, unknown>;
  if (JSON.stringify(servers.flowdeck) === JSON.stringify(entry)) return 'already';
  // first-touch courtesy backup — these files belong to the IDE, not to us
  const backup = `${file}.flowdeck-backup`;
  if (!existsSync(backup)) copyFileSync(file, backup);
  servers.flowdeck = entry;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
  return 'written';
}

function runSetup(ideArg?: string): void {
  const entry = mcpEntry();
  const entryLine = `${entry.command} ${entry.args.join(' ')}`;
  console.error(`[flowdeck] MCP 入口 / entry: ${entryLine}\n`);

  const outcomes: Array<[string, string, string]> = []; // [label, id, result]
  for (const target of IDE_TARGETS) {
    if (ideArg && ideArg !== target.id) continue;
    const file = target.file();
    const force = ideArg === target.id; // explicit --ide creates missing configs
    const result = patchIdeConfig(target, entry, force);
    outcomes.push([target.label, file, result]);
  }

  // Claude Code: a big stateful ~/.claude.json we'd rather not rewrite — its own
  // CLI is the supported writer; shell out to it, fall back to the exact command
  if (!ideArg || ideArg === 'claude-code') {
    const quoted = entry.args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
    const cmd = `claude mcp add flowdeck -- ${entry.command} ${quoted}`;
    const probe = spawnSync('claude --version', { encoding: 'utf-8', shell: platform() === 'win32' });
    if (probe.status === 0) {
      const add = spawnSync(`claude mcp add flowdeck -- ${entry.command} ${quoted}`, {
        encoding: 'utf-8',
        shell: platform() === 'win32',
      });
      outcomes.push(['Claude Code', '~/.claude.json (via claude mcp add)', add.status === 0 ? 'written' : 'failed']);
    } else {
      outcomes.push(['Claude Code', '(claude CLI 不在 PATH)', 'manual']);
      console.error(`  手动执行 / run manually:\n    ${cmd}`);
    }
  }

  console.error('');
  for (const [label, file, result] of outcomes) {
    const mark: Record<string, string> = {
      created: '✅ 已创建',
      written: '✅ 已写入',
      already: '☑ 已配置(无变化)',
      unreadable: '⚠️ JSON 解析失败,跳过(请手工检查)',
      failed: '⚠️ claude mcp add 执行失败',
      manual: '⌨️ 请手动执行',
      skip: '— 未检测到,跳过',
    };
    console.error(`  ${mark[result] ?? result}  ${label}\n      ${file}`);
  }

  console.error(`
下一步 / next steps:
  1. 重启对应 IDE(或在 IDE 的 MCP 设置里确认 flowdeck 已出现)
  2. 让 agent 主动调用画布:把 docs/ide-setup.md 的「计划确认规范」片段加入规则文件
  3. 验证:对 IDE 说「用 flowdeck 把这个计划展示成画布让我确认:1. 初始化项目 2. 安装依赖」
`);
}

main().catch((err) => {
  console.error('[flowdeck] fatal:', err);
  process.exit(1);
});
