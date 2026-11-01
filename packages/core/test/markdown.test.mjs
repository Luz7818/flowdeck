// parsePlanMarkdown —— 手动模式的零 LLM 解析器。表驱动覆盖七类行 + 缩进附件 +
// emoji 代理对安全(0.1.1 修复过 slice(1) 切半代理对,这里固化回归)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanMarkdown } from '../dist/index.js';

const types = (plan) => plan.modules.map((m) => m.type);

test('解析:# 标题进 title,缺标题走双语默认值', () => {
  assert.equal(parsePlanMarkdown('# 周末计划\n').title, '周末计划');
  assert.equal(parsePlanMarkdown('没有标题的正文').title, 'Untitled plan / 未命名计划');
});

test('解析:## 变分组,步骤/问题/风险/建议/检查点/资源七类齐全', () => {
  const plan = parsePlanMarkdown(
    [
      '# t',
      '## 阶段一',
      '- [x] 安装依赖 — npm install',
      '? 用哪个库 | A | B',
      '> 注意版本冲突',
      '💡 先跑冒烟 — 再动后端',
      '✅ 构建通过: npm run build',
      '📦 配置文件 (docs/config.yaml)',
    ].join('\n'),
  );
  assert.deepEqual(types(plan), [
    'group',
    'step',
    'question',
    'risk',
    'suggestion',
    'checkpoint',
    'resource',
  ]);
  assert.equal(plan.schemaVersion, 1);
  const [group, step, question, risk, suggestion, checkpoint, resource] = plan.modules;
  assert.equal(group.title, '阶段一');
  assert.equal(step.title, '安装依赖');
  assert.equal(step.detail, 'npm install');
  assert.deepEqual(question.options, ['A', 'B']);
  assert.equal(risk.level, 'warn');
  assert.equal(suggestion.title, '先跑冒烟');
  assert.equal(suggestion.detail, '再动后端');
  assert.deepEqual(checkpoint.criteria, ['npm run build']);
  assert.equal(resource.path, 'docs/config.yaml');
});

test('解析:每个模块都拿到 id', () => {
  const plan = parsePlanMarkdown('# t\n- 步骤一\n- 步骤二');
  for (const m of plan.modules) assert.match(m.id, /^step_\d{3}_/);
});

test('解析:- [ ] 未勾选 → excluded 步骤(画布上可恢复),- [x] 正常入列', () => {
  const plan = parsePlanMarkdown('# t\n- [ ] 可选步骤\n- [x] 必做步骤');
  assert.equal(plan.modules[0].excluded, true);
  assert.equal(plan.modules[1].excluded, undefined);
});

test('解析:? 无选项的问题 → 双语默认选项', () => {
  const plan = parsePlanMarkdown('# t\n? 继续吗');
  assert.deepEqual(plan.modules[0].options, ['确认 / yes', '调整 / adjust']);
});

test('解析:缩进行挂在检查点下成为验收条件', () => {
  const plan = parsePlanMarkdown('# t\n✅ 发布就绪\n  - 测试全绿\n  - 文档同步');
  assert.deepEqual(plan.modules[0].criteria, ['测试全绿', '文档同步']);
});

test('解析:缩进行挂在步骤下并入 detail(— 连接)', () => {
  const plan = parsePlanMarkdown('# t\n- 主步骤\n  - 子说明');
  assert.equal(plan.modules[0].detail, '子说明');
  const twice = parsePlanMarkdown('# t\n- 主步骤 — 首段\n  - 次段');
  assert.equal(twice.modules[0].detail, '首段 — 次段');
});

test('解析:文档开头的缩进行没有宿主,退化为独立步骤', () => {
  const plan = parsePlanMarkdown('  - 孤儿行');
  assert.equal(types(plan).join(','), 'step');
  assert.equal(plan.modules[0].title, '孤儿行');
});

test('解析:代码围栏内的行被跳过', () => {
  const plan = parsePlanMarkdown('# t\n```\n- 不是步骤\n```');
  assert.deepEqual(types(plan), []);
});

test('解析:emoji 代理对安全——💡/✅/📦 剥离后不残留半个字符', () => {
  const plan = parsePlanMarkdown('# t\n💡 建议\n✅ 检查点\n📦 资源');
  assert.equal(plan.modules[0].title, '建议');
  assert.equal(plan.modules[1].title, '检查点');
  assert.equal(plan.modules[2].label, '资源');
  for (const m of plan.modules) {
    const label = m.title ?? m.label;
    assert.equal(/\ud83c|\ud83d|\ud83e/.test(label), false); // 不出现孤立高代理
  }
});

test('解析:资源路径剥反引号、全角括号也认', () => {
  const plan = parsePlanMarkdown('# t\n📦 README (`docs/a.md`)\n📦 模型(模型.md)');
  assert.equal(plan.modules[0].path, 'docs/a.md');
  assert.equal(plan.modules[1].path, '模型.md');
});

test('解析:风险行空引用不生成模块', () => {
  const plan = parsePlanMarkdown('# t\n>\n>   ');
  assert.deepEqual(types(plan), []);
});
