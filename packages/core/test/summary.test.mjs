// generateSummary / moduleLabel —— agent 实际读到的摘要文本。七类渲染分支、
// 排除态、依赖行(327ec71/c66abe8 语义:活目标命名、排除目标剔除、全失效不渲染)、
// 未知类型原样兜底,全部固化在这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSummary, moduleLabel } from '../dist/index.js';

const planOf = (...modules) => ({ schemaVersion: 1, title: '计划', modules });
const step = (id, title, extra = {}) => ({ type: 'step', id, title, ...extra });

test('摘要:标题行 + 步骤连续编号 + detail 缩进渲染', () => {
  const md = generateSummary(planOf(step('a', '第一步', { detail: '细节' }), step('b', '第二步')));
  const lines = md.split('\n');
  assert.equal(lines[0], '# 计划');
  assert.equal(lines[2], '1. 第一步');
  assert.equal(lines[3], '   - 细节');
  assert.equal(lines[4], '2. 第二步');
});

test('摘要:排除步骤画删除线并继续占用编号', () => {
  const md = generateSummary(planOf(step('a', '留着'), { ...step('b', '扔了'), excluded: true }, step('c', '收尾')));
  assert.match(md, /^1\. 留着$/m);
  assert.match(md, /^2\. ~~扔了~~ \(已移除 \/ removed\)$/m);
  assert.match(md, /^3\. 收尾$/m);
});

test('摘要:排除的非步骤模块渲染删除线列表项', () => {
  const md = generateSummary(planOf({ type: 'question', id: 'q1', question: '问', options: ['a'], excluded: true }));
  assert.match(md, /^- ~~问~~ \(已移除 \/ removed\)$/m);
});

test('摘要:问题已答/未答两种渲染', () => {
  const answered = generateSummary(planOf({ type: 'question', id: 'q', question: '选库', options: ['x'], answer: 'x' }));
  assert.match(answered, /^- ❓ 选库 → \*\*x\*\*$/m);
  const unanswered = generateSummary(planOf({ type: 'question', id: 'q', question: '选库', options: ['x'] }));
  assert.match(unanswered, /^- ❓ 选库 → \*\*\(未回答 \/ unanswered\)\*\*$/m);
});

test('摘要:风险三档图标,缺档默认 warn', () => {
  const md = generateSummary(planOf(
    { type: 'risk', id: 'r1', note: '信息', level: 'info' },
    { type: 'risk', id: 'r2', note: '警告', level: 'warn' },
    { type: 'risk', id: 'r3', note: '危险', level: 'danger' },
    { type: 'risk', id: 'r4', note: '默认' },
  ));
  assert.match(md, /^- ℹ️ 信息$/m);
  assert.match(md, /^- ⚠️ 警告$/m);
  assert.match(md, /^- 🛑 危险$/m);
  assert.match(md, /^- ⚠️ 默认$/m);
});

test('摘要:建议采纳标记与 detail', () => {
  const adopted = generateSummary(planOf({ type: 'suggestion', id: 's1', title: '建议', detail: '细', adopted: true }));
  assert.match(adopted, /^- 💡 \*\*\[已采纳 \/ adopted\]\*\* 建议 — 细$/m);
  const plain = generateSummary(planOf({ type: 'suggestion', id: 's2', title: '建议' }));
  assert.match(plain, /^- 💡 建议$/m);
});

test('摘要:检查点按 criteriaDone 渲染 ☑/☐ 与达成标记', () => {
  const md = generateSummary(planOf({
    type: 'checkpoint', id: 'c1', title: '发布就绪',
    criteria: ['测试绿', '文档齐'], criteriaDone: [true, false],
  }));
  assert.match(md, /^- ✅ 检查点 \/ checkpoint: 发布就绪$/m);
  assert.match(md, /^ {2}- ☑ 测试绿 \(已达成 \/ done\)$/m);
  assert.match(md, /^ {2}- ☐ 文档齐$/m);
});

test('摘要:资源带路径渲染反引号包裹', () => {
  const withPath = generateSummary(planOf({ type: 'resource', id: 'z1', label: '配置', path: 'a.yaml' }));
  assert.match(withPath, /^- 📦 配置 \(`a\.yaml`\)$/m);
  const noPath = generateSummary(planOf({ type: 'resource', id: 'z2', label: '裸资源' }));
  assert.match(noPath, /^- 📦 裸资源$/m);
});

test('摘要:未知类型原样兜底渲染,不丢不炸', () => {
  const md = generateSummary(planOf({ type: 'widget', id: 'w1', title: '神秘' }));
  assert.match(md, /^- ▪ \(widget\) /m);
});

test('摘要:依赖行命名活目标、剔除排除目标,目标全部失效时不渲染该行', () => {
  const plan = planOf(
    step('dep', '前置'),
    { ...step('gone', '被移除'), excluded: true },
    step('main', '主步骤', { dependsOn: ['dep', 'gone', 'nowhere'] }),
  );
  const md = generateSummary(plan);
  const depLine = md.split('\n').find((l) => l.includes('depends on'));
  assert.equal(depLine, '   - 依赖 / depends on: 前置');

  const allDead = generateSummary(planOf(
    { ...step('gone', '被移除'), excluded: true },
    step('main', '主步骤', { dependsOn: ['gone'] }),
  ));
  assert.doesNotMatch(allDead, /depends on/);
});

test('摘要:分组标题与斜体备注', () => {
  const md = generateSummary(planOf({ type: 'group', id: 'g', title: '阶段', note: '备注' }, step('a', '步骤')));
  assert.match(md, /^## 阶段$/m);
  assert.match(md, /^_备注_$/m);
});

test('moduleLabel:问题取 question、风险取 note、资源取 label,其余取 title', () => {
  assert.equal(moduleLabel({ type: 'question', question: '问句', options: ['a'] }), '问句');
  assert.equal(moduleLabel({ type: 'risk', note: '备注' }), '备注');
  assert.equal(moduleLabel({ type: 'resource', label: '资源' }), '资源');
  assert.equal(moduleLabel({ type: 'step', title: '标题' }), '标题');
  assert.equal(moduleLabel({ type: 'widget' }), '');
});
