#!/usr/bin/env node
/**
 * 动效令牌防回潮闸门(批2「令牌归仓」,综合路线图 §8.3:搬家批必须带 grep 验收,
 * 并把该 grep 写进门禁矩阵防回潮;§8.4:CI 不新增工具,只跑已有命令)。
 * 三条断言与体检验收 grep 一字对齐:
 *   1) grep -rn "var(--dur" packages/                 → 消费不得为 0(四档 --dur 白立即红)
 *   2) grep -rn "transition-all" packages/web/src     → 必须为 0(emil:点名确切属性)
 *   3) grep -nE "0\.(22|3|32|42)s" packages/web/src/index.css
 *        → 仅剩豁免行(豁免行以内联 `token-exempt:` 注释标记,未标记者红)
 * 与 grep 原文的唯一差别:递归扫描跳过 gitignore 的 node_modules/ 与 dist/
 * (产物不参与门禁,源码才是事实;体检验收时按 grep 原文跑过,产物无命中噪音)。
 * 跑法:仓库根 `npm run check:tokens`(CI token-gate job 跑同一命令)。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'dist', '.git']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
let failures = 0;

// 1) 四档 --dur 必须有消费(定义行是 `--dur-N:` 裸写,`var(--dur` 只会命中消费点)
const durHits = [];
for (const f of walk(path.join(root, 'packages'))) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (line.includes('var(--dur')) durHits.push(`${rel(f)}:${i + 1}`);
  });
}
if (durHits.length === 0) {
  console.error('[tokens] FAIL 1: var(--dur 消费为 0 —— 四档时长令牌立而未搬');
  failures++;
} else {
  console.log(`[tokens] ok 1: var(--dur 消费 ${durHits.length} 处(首处 ${durHits[0]})`);
}

// 2) transition-all 必须清零
const transitionAll = [];
const webSrc = path.join(root, 'packages/web/src');
for (const f of walk(webSrc)) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (line.includes('transition-all')) transitionAll.push(`${rel(f)}:${i + 1}:${line.trim()}`);
  });
}
if (transitionAll.length > 0) {
  console.error('[tokens] FAIL 2: transition-all 未清零(应点名确切属性):');
  for (const h of transitionAll) console.error(`  ${h}`);
  failures++;
} else {
  console.log('[tokens] ok 2: packages/web/src transition-all = 0');
}

// 3) index.css 裸秒值仅剩豁免行(带 token-exempt 内联标记)
const bareHits = [];
const indexCss = path.join(root, 'packages/web/src/index.css');
readFileSync(indexCss, 'utf8').split(/\r?\n/).forEach((line, i) => {
  if (/0\.(22|3|32|42)s/.test(line) && !/token-exempt/.test(line)) {
    bareHits.push(`${rel(indexCss)}:${i + 1}:${line.trim()}`);
  }
});
if (bareHits.length > 0) {
  console.error('[tokens] FAIL 3: index.css 裸秒值未贴梯且未豁免(豁免需内联 token-exempt: 原因):');
  for (const h of bareHits) console.error(`  ${h}`);
  failures++;
} else {
  console.log('[tokens] ok 3: index.css 裸秒值 0.(22|3|32|42)s 仅剩 token-exempt 豁免行');
}

if (failures > 0) {
  console.error(`[tokens] ${failures} 条断言未过 —— 动效令牌闸门红`);
  process.exit(1);
}
console.log('[tokens] ALL PASS ✅ 三断言全绿(--dur 有消费 / transition-all 清零 / 裸秒值仅豁免行)');
