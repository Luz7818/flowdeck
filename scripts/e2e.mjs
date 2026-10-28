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

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'packages/mcp/dist/index.js')],
  cwd: root,
  stderr: 'pipe',
  env: {
    ...process.env,
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

// With FLOWDECK_NO_OPEN=1 the host prints the canvas URL to stderr once the
// session is up. Parse it for the base URL and session id — machine-independent
// (the default port may be busy or sit in a Windows WinNAT reserved range; the
// host then serves on a random free port and this URL carries the resolved one).
const canvasUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('canvas URL never printed to stderr')), 30000);
  transport.stderr.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.trim()) continue;
      console.error('[server]', line);
      const m = line.match(/canvas URL: (http:\/\/127\.0\.0\.1:\d+\/s\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    }
  });
});
const sessionId = canvasUrl.split('/s/')[1];
const base = canvasUrl.slice(0, canvasUrl.indexOf('/s/'));
console.log('[e2e] canvas session:', sessionId);

const assert = (cond, label) => {
  if (!cond) {
    console.error('[e2e] FAIL:', label);
    process.exit(1);
  }
  console.log('[e2e] ok:', label);
};
const sessions = await (await fetch(`${base}/sessions`)).json();
if (!sessions[sessionId]) throw new Error('/sessions does not list the canvas session');

// fake browser: connect WS, receive init, edit like the real canvas would, confirm
const ws = new WebSocket(`ws://127.0.0.1:${new URL(base).port}/ws?id=${sessionId}`);
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
// 6b. tick the first checkpoint criterion (criteriaDone flows into the summary)
const cp = plan.modules.find((m) => m.type === 'checkpoint');
cp.criteriaDone = [true, false];

// 7. free-branch wiring: the real canvas serializes by building chain wires and
// DFS-linearizing via @flowdeck/core — mimic that. One step gets TWO downstreams;
// everything left unwired is appended in module order (must never be lost).
const { linearizePlan } = await import('@flowdeck/core');
const byTitle = (t) => plan.modules.find((m) => (m.title ?? '').includes(t));
const chain = [
  ['准备', '拉取分支'],
  ['拉取分支', '安装依赖'],
  ['拉取分支', '先用 SQLite'],
].map(([s, t]) => ({ source: byTitle(s).id, target: byTitle(t).id }));
const wired = linearizePlan(plan, chain);

// 8. edit preservation: autosave the edited plan, then open a second socket
// (what a page refresh does) — its init must carry the edits, not the draft
const autosaved = linearizePlan(plan, chain);
autosaved.title = 'FlowDeck 自测计划 / E2E plan (edited)';
ws.send(JSON.stringify({ type: 'autosave', plan: autosaved }));
const ws2 = new WebSocket(`ws://127.0.0.1:${new URL(base).port}/ws?id=${sessionId}`);
await new Promise((resolve, reject) => {
  ws2.once('open', resolve);
  ws2.once('error', reject);
});
const init2 = JSON.parse(String(await new Promise((resolve) => ws2.once('message', resolve))));
assert(init2.type === 'init' && init2.plan?.title?.includes('(edited)'), 'refresh after autosave restores the edited plan');
ws2.close();

ws.send(JSON.stringify({ type: 'confirm', plan: wired }));

const result = await callPromise;
const sc = result.structuredContent ?? {};
const summaryText = (result.content ?? []).map((c) => c.text ?? '').join('\n');

assert(sc.status === 'confirmed', 'tool returned confirmed');
assert(sc.plan?.schemaVersion === 1, 'plan schemaVersion present');
assert(summaryText.includes('zustand'), 'question answer flows into summary');
assert(summaryText.includes('拉取分支'), 'inserted step present in summary');
assert(summaryText.includes('git checkout -b feature/e2e'), 'inserted step detail present');
assert(summaryText.includes('~~初始化项目'), 'excluded step struck through in summary');
assert(summaryText.includes('~~会删除 dist 目录'), 'excluded risk struck through in summary');
assert(summaryText.includes('1. 拉取分支'), 'reorder + insert reflected in step numbering');
assert(summaryText.indexOf('2. 安装依赖') < summaryText.indexOf('3. 先用 SQLite'), 'branch DFS: first downstream before second (module-order tiebreak)');
assert(summaryText.indexOf('3. 先用 SQLite') < summaryText.indexOf('检查点'), 'unwired modules appended after the branch, nothing lost');
assert(summaryText.includes('先用 SQLite'), 'converted suggestion survives as step');
assert(!summaryText.includes('已采纳'), 'converted suggestion no longer marked as suggestion');
assert(summaryText.includes('## 准备'), 'group lane header in summary');
assert(summaryText.includes('☑'), 'checkpoint criteriaDone rendered as a ticked checkbox');
assert(/☑[^\n]*build 成功/.test(summaryText), 'ticked criterion is the build one');

// history API + archive on disk
const hist = await (await fetch(`${base}/api/history`)).json();
assert(Array.isArray(hist) && hist.length > 0, 'history API returns entries');
assert(hist[0].title.includes('E2E'), 'history newest entry is this plan');
const fileJson = await (
  await fetch(`${base}/api/history/file?name=${encodeURIComponent(hist[0].file)}`)
).json();
assert(fileJson.plan.title.includes('E2E') && fileJson.summary.includes('zustand'), 'history file content round-trips');
const bad = await fetch(`${base}/api/history/file?name=..%2F..%2Fpackage.json`);
assert(bad.status === 400, 'path traversal rejected');

// history delete API
const del = await fetch(`${base}/api/history/file?name=${encodeURIComponent(hist[0].file)}`, { method: 'DELETE' });
assert(del.status === 200, 'history entry deleted');
const histAfter = await (await fetch(`${base}/api/history`)).json();
assert(!histAfter.some((e) => e.file === hist[0].file), 'deleted entry gone from history list');
const delAgain = await fetch(`${base}/api/history/file?name=${encodeURIComponent(hist[0].file)}`, { method: 'DELETE' });
assert(delAgain.status === 404, 'deleting a missing entry returns 404');
const badDel = await fetch(`${base}/api/history/file?name=..%2F..%2Fpackage.json`, { method: 'DELETE' });
assert(badDel.status === 400, 'path traversal rejected on DELETE');

console.log('\n----- summary returned to agent -----\n');
console.log(sc.summary);
console.log('[e2e] ALL PASS ✅');
ws.close();
await client.close();
// natural exit — host APIs send Connection: close so no pooled sockets linger.
// Forcing process.exit() here trips a libuv teardown assertion on Windows; the
// unref'd timer only fires if some handle is genuinely stuck.
setTimeout(() => process.exit(0), 8000).unref();
