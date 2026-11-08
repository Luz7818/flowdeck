import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * flowdeck doctor — 本机自检。真故障检查(Node 版本 / 画布静态产物 / 历史目录可写)
 * 任意一项失败即 exit 1;IDE MCP 配置是中性检查,只提示、永不参与退出码
 * (Qoder 与既有四家同为 JSON 配置检查;DSH / WorkBuddy 无标准用户级
 * mcpServers JSON,只做安装探测)。
 */

/** Same fallback order as canvas-server.ts resolveWebDist() (env → mcp/web-dist →
 *  web/dist), copied because that one is module-private. doctor.js lands side by
 *  side with canvas-server.js in dist/, so the relative layout resolves the same;
 *  两侧必须同步演化。 */
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

interface IdeCheck {
  label: string;
  file: string;
  /** json = parse + look for <key>.flowdeck (+ entry target existence); text = substring
   *  match — ~/.claude.json is Claude Code's big state file written via `claude mcp add`,
   *  so a text scan mirrors what `flowdeck setup` actually achieves for it; manual = the
   *  IDE has no standard user-level mcpServers JSON (DSH / WorkBuddy), so `file` is only
   *  the install marker (~/.dsh, ~/.workbuddy). */
  kind: 'json' | 'text' | 'manual';
  key?: string;
}

const IDE_CHECKS: IdeCheck[] = [
  { label: 'ZCode', file: path.join(os.homedir(), '.zcode', 'mcp.json'), kind: 'json', key: 'mcpServers' },
  { label: 'Cursor', file: path.join(os.homedir(), '.cursor', 'mcp.json'), kind: 'json', key: 'mcpServers' },
  { label: 'Qoder', file: path.join(os.homedir(), '.qoder', 'settings.json'), kind: 'json', key: 'mcpServers' },
  { label: 'VS Code', file: path.resolve('.vscode', 'mcp.json'), kind: 'json', key: 'servers' },
  { label: 'Claude Code', file: path.join(os.homedir(), '.claude.json'), kind: 'text' },
  { label: 'DSH', file: path.join(os.homedir(), '.dsh'), kind: 'manual' },
  { label: 'WorkBuddy', file: path.join(os.homedir(), '.workbuddy'), kind: 'manual' },
];

/** ok | stale | missing | unreadable | manual — only ever surfaced as a hint. */
function ideStatus(check: IdeCheck): 'ok' | 'stale' | 'missing' | 'unreadable' | 'manual' {
  if (!fs.existsSync(check.file)) return 'missing';
  if (check.kind === 'manual') return 'manual';
  let raw: string;
  try {
    raw = fs.readFileSync(check.file, 'utf-8');
  } catch {
    return 'unreadable';
  }
  if (check.kind === 'text') {
    return raw.includes('flowdeck') ? 'ok' : 'missing';
  }
  try {
    const servers = JSON.parse(raw)?.[check.key as string];
    if (!servers || typeof servers !== 'object' || !('flowdeck' in servers)) return 'missing';
    // entry present — when it launches a local file (node + absolute path), verify it exists
    const entry = (servers as Record<string, unknown>).flowdeck as
      | { command?: unknown; args?: unknown }
      | undefined;
    const args = Array.isArray(entry?.args) ? (entry?.args as unknown[]) : undefined;
    const target =
      entry?.command === 'node' && typeof args?.[0] === 'string' && path.isAbsolute(args[0] as string)
        ? (args[0] as string)
        : undefined;
    return target && !fs.existsSync(target) ? 'stale' : 'ok';
  } catch {
    return 'unreadable';
  }
}

export function runDoctor(): void {
  const fatal: string[] = [];

  // 1. Node >= 20 — the engines floor every package in the repo ships with
  const major = Number(process.versions.node.split('.')[0]);
  const nodeOk = major >= 20;
  if (!nodeOk) fatal.push(`Node v${process.versions.node} 低于要求的 20`);

  // 2. canvas static build — without it every canvas page 404s
  const webDist = resolveWebDist();
  const webOk = fs.existsSync(path.join(webDist, 'index.html'));
  if (!webOk) fatal.push(`画布静态产物缺失:${webDist}(先 npm run build -w @flowdeck/web)`);

  // 3. history dir writable — archives are the whole confirmation record
  const historyDir = path.join(os.homedir(), '.flowdeck', 'history');
  let historyOk = false;
  try {
    fs.mkdirSync(historyDir, { recursive: true });
    // pid keeps concurrent doctors from stepping on each other's probe; the
    // non-.json name also keeps it invisible to the history prune/listing
    const probe = path.join(historyDir, `.doctor-probe-${process.pid}`);
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    historyOk = true;
  } catch {
    // the probe failing IS the diagnosis — report via historyOk below
  }
  if (!historyOk) fatal.push(`历史目录不可写:${historyDir}`);

  console.error('[flowdeck] doctor — FlowDeck 本机自检\n');
  console.error('真故障检查(任一 ⚠️ → exit 1):');
  const line = (ok: boolean, text: string) => console.error(`  ${ok ? '✅' : '⚠️'} ${text}`);
  line(nodeOk, `Node v${process.versions.node}(要求 ≥ 20)`);
  line(webOk, `画布静态产物  ${webDist}`);
  line(historyOk, `历史目录可写  ${historyDir}`);

  console.error('\nIDE MCP 配置(仅提示,不影响退出码):');
  const note: Record<string, string> = {
    ok: '✅ 已配置',
    stale: '⚠️ 已配置,但入口文件不存在(重跑 setup 或修正路径)',
    missing: '— 未配置',
    unreadable: '⚠️ 文件存在但 JSON 解析失败(仅提示)',
  };
  for (const check of IDE_CHECKS) {
    const st = ideStatus(check);
    const text =
      check.kind === 'manual'
        ? st === 'manual'
          ? '⌨️ 已检测到安装,需在应用内手动接入(docs/ide-setup.md §5-6)'
          : '— 未检测到安装'
        : note[st];
    console.error(`  ${text}  ${check.label}\n      ${check.file}`);
  }

  console.error(`\n结论:${fatal.length === 0 ? '未发现真故障' : `发现 ${fatal.length} 项真故障:`}`);
  for (const f of fatal) console.error(`  - ${f}`);
  process.exitCode = fatal.length > 0 ? 1 : 0;
}
