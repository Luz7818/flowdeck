/**
 * FlowDeck end-to-end verification (headless):
 * MCP client (stdio) → present_plan → canvas host → fake browser (WS) → edit → confirm → result.
 * Covers: reorder, insert, multi-type removal, question answer, suggestion→step conversion,
 * history API + archiving.
 * Run from repo root: npm run test:e2e
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.E2E_PORT ?? '7799';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'packages/mcp/dist/index.js')],
  cwd: root,
  env: {
    ...process.env,
    FLOWDECK_PORT: PORT,
    FLOWDECK_NO_OPEN: '1',
    FLOWDECK_TIMEOUT_MS: '20000',
  },
});

const client = new Client({ name: 'flowdeck-e2e', version: '0.1.0' });
await client.connect(transport);
console.log('[e2e] MCP client connected');

const callPromise = client.callTool({
  name: 'present_plan',
  arguments: {
    title: 'FlowDeck 自测计划 / E2E plan',
    modules: [
      { type: 'group', title: '准备 / Setup' },
      { type: 'step', title: '初始化项目 / init project', detail: 'scaffold monorepo' },
      { type: 'step', title: '安装依赖 / install deps' },
      { type: 'question', question: '用哪种状态管理 / state library?', options: ['zustand', 'jotai'] },
      { type: 'risk', note: '会删除 dist 目录 / deletes dist/', level: 'danger' },
      { type: 'suggestion', title: '先用 SQLite', detail: '后续再换 Postgres' },
      { type: 'checkpoint', title: '构建通过 / build passes', criteria: ['npm run build 成功'] },
      { type: 'resource', label: 'schema.ts', kind: 'file', path: 'packages/core/src/schema.ts' },
    ],
  },
});

// wait for the canvas host to register the session
let sessionId = null;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/sessions`);
    const sessions = await res.json();
    const ids = Object.keys(sessions);
    if (ids.length > 0) {
      sessionId = ids[0];
      break;
    }
  } catch {
    /* host not up yet */
  }
}
if (!sessionId) throw new Error('canvas session never appeared');
console.log('[e2e] canvas session:', sessionId);

// fake browser: connect WS, receive init, edit like the real canvas would, confirm
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?id=${sessionId}`);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
const initMsg = await new Promise((resolve) => ws.once('message', resolve));
const { plan } = JSON.parse(String(initMsg));
console.log('[e2e] received plan with', plan.modules.length, 'modules');

// --- user edits on the canvas ---
// 1. answer the question
const question = plan.modules.find((m) => m.type === 'question');
question.answer = 'zustand';
// 2. exclude a step (remove button)
const stepInit = plan.modules.find((m) => m.type === 'step' && m.title.includes('初始化'));
stepInit.excluded = true;
// 3. exclude the risk too (multi-type removal)
const risk = plan.modules.find((m) => m.type === 'risk');
risk.excluded = true;
// 4. reorder: move '安装依赖' before its lane (swap with the group header's next slot)
const idxGroup = plan.modules.findIndex((m) => m.type === 'group');
const idxDeps = plan.modules.findIndex((m) => m.type === 'step' && m.title.includes('安装依赖'));
[plan.modules[idxGroup + 1], plan.modules[idxDeps]] = [plan.modules[idxDeps], plan.modules[idxGroup + 1]];
// 5. insert a new step right after the group header
plan.modules.splice(idxGroup + 1, 0, {
  type: 'step',
  id: 'step_ui_e2e_1',
  title: '拉取分支 / checkout branch',
  detail: 'git checkout -b feature/e2e',
});
// 6. adopt suggestion then convert it into a step (canvas "转为步骤")
const sugIdx = plan.modules.findIndex((m) => m.type === 'suggestion');
plan.modules[sugIdx] = {
  type: 'step',
  id: 'step_ui_e2e_2',
  title: '先用 SQLite',
  detail: '后续再换 Postgres',
};

ws.send(JSON.stringify({ type: 'confirm', plan }));

const result = await callPromise;
const sc = result.structuredContent ?? {};
const summaryText = (result.content ?? []).map((c) => c.text ?? '').join('\n');

const assert = (cond, label) => {
  if (!cond) {
    console.error('[e2e] FAIL:', label);
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log('[e2e] ok:', label);
};

assert(sc.status === 'confirmed', 'tool returned confirmed');
assert(sc.plan?.schemaVersion === 1, 'plan schemaVersion present');
assert(summaryText.includes('zustand'), 'question answer flows into summary');
assert(summaryText.includes('拉取分支'), 'inserted step present in summary');
assert(summaryText.includes('git checkout -b feature/e2e'), 'inserted step detail present');
assert(summaryText.includes('~~初始化项目'), 'excluded step struck through in summary');
assert(summaryText.includes('~~会删除 dist 目录'), 'excluded risk struck through in summary');
assert(summaryText.includes('1. 拉取分支'), 'reorder + insert reflected in step numbering');
assert(summaryText.includes('先用 SQLite'), 'converted suggestion survives as step');
assert(!summaryText.includes('已采纳'), 'converted suggestion no longer marked as suggestion');
assert(summaryText.includes('## 准备'), 'group lane header in summary');

// history API + archive on disk
const hist = await (await fetch(`http://127.0.0.1:${PORT}/api/history`)).json();
assert(Array.isArray(hist) && hist.length > 0, 'history API returns entries');
assert(hist[0].title.includes('E2E'), 'history newest entry is this plan');
const fileJson = await (
  await fetch(`http://127.0.0.1:${PORT}/api/history/file?name=${encodeURIComponent(hist[0].file)}`)
).json();
assert(fileJson.plan.title.includes('E2E') && fileJson.summary.includes('zustand'), 'history file content round-trips');
const bad = await fetch(`http://127.0.0.1:${PORT}/api/history/file?name=..%2F..%2Fpackage.json`);
assert(bad.status === 400, 'path traversal rejected');

console.log('\n----- summary returned to agent -----\n');
console.log(sc.summary);
console.log('[e2e] ALL PASS ✅');
ws.close();
await client.close();
process.exit(0);
