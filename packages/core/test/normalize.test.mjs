// normalizePlan —— 画布与解析器共用的入口净化:补版本号、补 id、补默认值,
// 未知/非法模块原样保留(schema 演进策略的核心承诺,丢模块是它最坏的失败模式)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan } from '../dist/index.js';

test('净化:补 schemaVersion 与标题', () => {
  const plan = normalizePlan({ title: '标题', modules: [] });
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.title, '标题');
  assert.deepEqual(plan.modules, []);
});

test('净化:modules 缺省按空数组处理', () => {
  const plan = normalizePlan({ title: 't' });
  assert.deepEqual(plan.modules, []);
});

test('净化:缺 id 的模块补 id,已有 id 原样保留', () => {
  const plan = normalizePlan({
    title: 't',
    modules: [
      { type: 'step', title: '有id', id: 'fixed_id' },
      { type: 'step', title: '无id' },
    ],
  });
  assert.equal(plan.modules[0].id, 'fixed_id');
  assert.match(plan.modules[1].id, /^step_\d{3}_/);
});

test('净化:风险缺档补 warn,检查点缺 criteria 补空数组', () => {
  const plan = normalizePlan({
    title: 't',
    modules: [{ type: 'risk', note: 'n' }, { type: 'checkpoint', title: 'c' }],
  });
  assert.equal(plan.modules[0].level, 'warn');
  assert.deepEqual(plan.modules[1].criteria, []);
});

test('净化:未知类型原样保留并补 id(不丢弃)', () => {
  const plan = normalizePlan({ title: 't', modules: [{ type: 'widget', title: '神秘', version: 9 }] });
  const w = plan.modules[0];
  assert.equal(w.type, 'widget');
  assert.equal(w.title, '神秘');
  assert.equal(w.version, 9);
  assert.match(w.id, /^mod_\d{3}_/);
});

test('净化:已知类型字段非法(问题缺选项)同样原样保留而不是丢弃', () => {
  const plan = normalizePlan({ title: 't', modules: [{ type: 'question', question: '缺选项' }] });
  const q = plan.modules[0];
  assert.equal(q.type, 'question');
  assert.equal(q.question, '缺选项');
  assert.ok(q.id);
});
