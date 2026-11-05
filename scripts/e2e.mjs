/**
 * FlowDeck end-to-end verification (headless):
 * MCP client (stdio) → present_plan → canvas host → fake browser (WS) → edit → confirm → result.
 * Covers: reorder, insert, multi-type removal, question answer, suggestion→step conversion,
 * history API + archiving.
 * Run from repo root: npm run test:e2e
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
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

// collect server→client logging notifications: present_plan pushes the canvas
// URL to the conversation side this way while the user decides on the canvas
const loggingNotifications = [];
client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
  loggingNotifications.push(notification.params);
});

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
// 6c. dependency wire semantics: install deps depends on the converted step AND
// on the excluded init step — the summary must render the live one, drop the excluded one
const converted = plan.modules.find((m) => m.type === 'step' && m.title.includes('先用 SQLite'));
const install = plan.modules.find((m) => m.type === 'step' && m.title.includes('安装依赖'));
install.dependsOn = [converted.id, stepInit.id];

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
// malformed payloads (non-object plan, numeric title) must be ignored, not
// poison the session or crash the host — the refresh assertion below only
// passes if this junk autosave was dropped and the good one kept
ws.send(JSON.stringify({ type: 'autosave', plan: 42 }));
ws.send(JSON.stringify({ type: 'autosave', plan: { title: 7, modules: [] } }));
ws.send(JSON.stringify({ type: 'autosave', plan: autosaved }));
// the host processes the autosave message and the second WS handshake concurrently
// — give the message a moment to land or the refresh may read the pre-edit plan
await new Promise((r) => setTimeout(r, 300));
const ws2 = new WebSocket(`ws://127.0.0.1:${new URL(base).port}/ws?id=${sessionId}`);
await new Promise((resolve, reject) => {
  ws2.once('open', resolve);
  ws2.once('error', reject);
});
const init2 = JSON.parse(String(await new Promise((resolve) => ws2.once('message', resolve))));
assert(init2.type === 'init' && init2.plan?.title?.includes('(edited)'), 'refresh after autosave restores the edited plan');
ws2.close();

// DNS-rebinding guard (FD-03): a forged Host header (what a rebound page sends)
// and a cross-origin WebSocket must both be refused. fetch() cannot set Host
// (forbidden header), so the Host case goes through raw node:http.
const http = await import('node:http');
const port = new URL(base).port;
const forgedStatus = await new Promise((resolve, reject) => {
  const req = http.request(
    { host: '127.0.0.1', port, path: '/healthz', headers: { Host: 'evil.example:7688' } },
    (res) => {
      res.resume();
      resolve(res.statusCode);
    },
  );
  req.once('error', reject);
  req.end();
});
assert(forgedStatus === 403, 'forged Host header (DNS rebinding) rejected with 403');

// the flip side: a same-origin Origin header (module scripts send it, CORS mode)
// must still pass — a regression here blanks the whole page in real browsers
const sameOrigin = await fetch(`${base}/healthz`, { headers: { Origin: base } });
assert(sameOrigin.status === 200, 'same-origin Origin header passes the guard');

const evilWs = new WebSocket(`ws://127.0.0.1:${port}/ws?id=${sessionId}`, {
  headers: { Origin: 'http://evil.example:7688' },
});
const evilOutcome = await new Promise((resolve) => {
  let done = false;
  const settle = (v) => {
    if (!done) {
      done = true;
      resolve(v);
    }
  };
  evilWs.once('open', () => settle('open'));
  evilWs.once('unexpected-response', (_req, res) => settle(`status:${res.statusCode}`));
  evilWs.once('error', (e) => settle(`error:${e.message}`));
});
assert(evilOutcome !== 'open', 'cross-origin WebSocket handshake rejected');

// malformed confirm (numeric plan) is ignored; the real confirm right after
// proving the session survived IS the assertion
ws.send(JSON.stringify({ type: 'confirm', plan: 42 }));
ws.send(JSON.stringify({ type: 'confirm', plan: wired }));

const result = await callPromise;
const sc = result.structuredContent ?? {};
const summaryText = (result.content ?? []).map((c) => c.text ?? '').join('\n');

assert(loggingNotifications.some((n) => typeof n.data === 'string' && n.data.includes('/s/')), 'canvas URL reaches the conversation side as a logging notification during the wait');
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
assert(/依赖 \/ depends on: 先用 SQLite$/m.test(summaryText), 'dependency line rendered with the live target');
assert(!/依赖[^\n]*初始化项目/.test(summaryText), 'excluded dependency target dropped from the dependency line');
const confirmedInstall = sc.plan.modules.find((m) => m.title?.includes('安装依赖'));
assert(Array.isArray(confirmedInstall?.dependsOn) && !confirmedInstall.dependsOn.includes(stepInit.id), 'confirmed plan JSON drops the excluded dependency reference too');

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

// history reopen API (POST /api/history/reopen): an archive comes back as a
// live canvas session — no browser auto-open, reclaimed when abandoned
const reopenRes = await fetch(`${base}/api/history/reopen`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: hist[0].file }),
});
const reopened = await reopenRes.json();
const reopenPage = await fetch(`${base}${reopened.url}`);
// fake browser opens the reopened session: init must carry the archived plan
// (connecting also retires the 30-min reclaim fallback, keeping e2e exit clean)
const ws3 = new WebSocket(`ws://127.0.0.1:${port}/ws?id=${reopened.url.split('/s/')[1]}`);
await new Promise((resolve, reject) => {
  ws3.once('open', resolve);
  ws3.once('error', reject);
});
const init3 = JSON.parse(String(await new Promise((resolve) => ws3.once('message', resolve))));
assert(reopenPage.status === 200 && init3.type === 'init' && init3.plan?.title === fileJson.plan.title, 'reopened session serves the page and its WS init carries the archived plan');
ws3.close();

const reopenTraversal = await fetch(`${base}/api/history/reopen`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '..%2F..%2Fpackage.json' }),
});
assert(reopenTraversal.status === 400, 'path traversal rejected on reopen');

const reopenMissing = await fetch(`${base}/api/history/reopen`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'no-such-archive.json' }),
});
assert(reopenMissing.status === 404, 'reopening a missing archive returns 404');

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
