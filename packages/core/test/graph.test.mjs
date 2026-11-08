// linearizePlan / chainFromOrder / defaultLayout —— FD-04 固化的图算法单元测试。
// 断言落在确认语义上:改线跟线走、分支按目标原序、断链绝不丢模块、环不炸、
// 排除步骤的依赖引用从确认计划中剔除(c66abe8 语义,此前只有 e2e 单点覆盖)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainFromOrder, linearizePlan, defaultLayout } from '../dist/index.js';

const step = (id, extra = {}) => ({ type: 'step', id, title: id, ...extra });
const planOf = (...modules) => ({ title: 't', modules });
const orderOf = (plan) => plan.modules.map((m) => m.id);

test('chainFromOrder:相邻模块成链,缺 id 的模块被跳过', () => {
  const edges = chainFromOrder([step('a'), step('b'), { type: 'step', title: '无id' }, step('c')]);
  assert.deepEqual(edges, [{ source: 'a', target: 'b' }]);
});

test('linearizePlan:往返——链线还原为模块原序', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const out = linearizePlan(plan, chainFromOrder(plan.modules));
  assert.equal(orderOf(out).join(','), 'a,b,c');
  assert.equal(out.title, 't');
});

test('linearizePlan:改线——顺序跟线走而不是模块数组序', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const out = linearizePlan(plan, [
    { source: 'b', target: 'a' },
    { source: 'a', target: 'c' },
  ]);
  assert.equal(orderOf(out).join(','), 'b,a,c');
});

test('linearizePlan:分支——一个节点两条下游按目标模块序展开', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const out = linearizePlan(plan, [
    { source: 'a', target: 'c' },
    { source: 'a', target: 'b' },
  ]);
  assert.equal(orderOf(out).join(','), 'a,b,c'); // 出线按目标原序 tiebreak,与边给出顺序无关
});

test('linearizePlan:多起点——各入口按模块序依次走完', () => {
  const plan = planOf(step('a'), step('b'), step('c'), step('d'));
  const out = linearizePlan(plan, [{ source: 'b', target: 'd' }]);
  assert.equal(orderOf(out).join(','), 'a,b,d,c');
});

test('linearizePlan:断链——指向不存在节点的边被忽略,模块一个不丢', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const out = linearizePlan(plan, [{ source: 'a', target: 'ghost' }]);
  assert.equal(orderOf(out).join(','), 'a,b,c');
});

test('linearizePlan:局部环——环上节点按原序追加,环外节点先走', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const out = linearizePlan(plan, [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' },
  ]);
  assert.equal(orderOf(out).join(','), 'c,a,b');
});

test('linearizePlan:整环——退化用首模块当伪入口', () => {
  const plan = planOf(step('a'), step('b'));
  const out = linearizePlan(plan, [
    { source: 'a', target: 'b' },
    { source: 'b', target: 'a' },
  ]);
  assert.equal(orderOf(out).join(','), 'a,b');
});

test('linearizePlan:自环与重复边各自被忽略/去重', () => {
  const plan = planOf(step('a'), step('b'));
  const out = linearizePlan(plan, [
    { source: 'a', target: 'a' },
    { source: 'a', target: 'b' },
    { source: 'a', target: 'b' },
  ]);
  assert.equal(orderOf(out).join(','), 'a,b');
});

test('linearizePlan:排除步骤的依赖引用被剔除——活引用保留、失效引用清空', () => {
  const plan = planOf(
    step('x'),
    { ...step('e2'), excluded: true },
    { type: 'question', id: 'q1', question: 'q', options: ['a'] },
    step('s', { dependsOn: ['x', 'e2', 's', 'ghost', 'q1'] }),
  );
  const out = linearizePlan(plan, []);
  const s = out.modules.find((m) => m.id === 's');
  assert.deepEqual(s.dependsOn, ['x']);
});

test('linearizePlan:依赖全失效时 dependsOn 字段整个删除', () => {
  const plan = planOf(step('s', { dependsOn: ['ghost'] }));
  const out = linearizePlan(plan, []);
  const s = out.modules.find((m) => m.id === 's');
  assert.equal('dependsOn' in s, false);
});

test('linearizePlan:提供 positions 时回写节点坐标', () => {
  const plan = planOf(step('a'), step('b'));
  const out = linearizePlan(plan, [], { a: { x: 10, y: 20 } });
  assert.deepEqual(out.modules[0].pos, { x: 10, y: 20 });
  assert.equal(out.modules[1].pos, undefined);
});

test('defaultLayout:组起新行,行内按 332 列距排布,非步骤 y 下移 26', () => {
  const plan = planOf(
    { type: 'group', id: 'g1', title: 'G' },
    step('a'),
    { type: 'question', id: 'q1', question: 'q', options: ['a'] },
    step('b'),
  );
  const layout = defaultLayout(plan);
  assert.deepEqual(layout.g1, { x: 0, y: 0 });
  assert.deepEqual(layout.a, { x: 332, y: 0 });
  assert.deepEqual(layout.q1, { x: 664, y: 26 });
  assert.deepEqual(layout.b, { x: 996, y: 0 });
});

test('defaultLayout:第二个组换行且锚在行首', () => {
  const plan = planOf(
    { type: 'group', id: 'g1', title: 'G1' },
    step('a'),
    { type: 'group', id: 'g2', title: 'G2' },
    step('b'),
  );
  const layout = defaultLayout(plan);
  assert.deepEqual(layout.g2, { x: 0, y: 230 });
  assert.deepEqual(layout.b, { x: 332, y: 230 });
});

// —— defaultLayout 方向参数(竖排批):lr 为默认与既有行为,tb 轴心互换 ——
const group = (id) => ({ type: 'group', id, title: id });

test('defaultLayout:默认横排——链上节点同一行,x 递增(既有行为不变)', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const layout = defaultLayout(plan);
  assert.equal(layout.b.y, layout.a.y);
  assert.equal(layout.c.y, layout.a.y);
  assert.ok(layout.b.x > layout.a.x && layout.c.x > layout.b.x);
});

test('defaultLayout:tb 竖排——链上节点同一列,y 递增、x 相同', () => {
  const plan = planOf(step('a'), step('b'), step('c'));
  const layout = defaultLayout(plan, { direction: 'tb' });
  assert.equal(layout.b.x, layout.a.x);
  assert.equal(layout.c.x, layout.a.x);
  assert.ok(layout.b.y > layout.a.y && layout.c.y > layout.b.y);
});

test('defaultLayout:tb 分组起新列——组锚定列顶,成员纵向续排;lr 镜像为新行', () => {
  const plan = planOf(step('a'), step('b'), group('g'), step('c'));
  const tb = defaultLayout(plan, { direction: 'tb' });
  assert.equal(tb.b.x, tb.a.x); // 组前成员同列
  assert.ok(tb.g.x > tb.a.x); // 组起新列
  assert.equal(tb.c.x, tb.g.x); // 组后成员与组同列
  assert.ok(tb.c.y > tb.g.y);
  assert.equal(tb.c.y, tb.b.y); // 同为各列第 2 行
  const lr = defaultLayout(plan);
  assert.ok(lr.g.y > lr.a.y); // 镜像:组起新行
  assert.equal(lr.c.y, lr.g.y);
  assert.equal(lr.c.x, lr.b.x);
});

test('defaultLayout:tb 非步骤节点横移 26px(与 lr 的 +26y 对称)', () => {
  const plan = planOf({ type: 'question', id: 'q', title: '用哪种库' }, step('a'));
  const tb = defaultLayout(plan, { direction: 'tb' });
  assert.equal(tb.q.x, tb.a.x + 26); // 同列,问题节点右移一档
  assert.ok(tb.a.y > tb.q.y); // 链序向下,行随链递增
});
