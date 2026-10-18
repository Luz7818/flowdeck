/**
 * Deliverable preparation: build everything, bundle the canvas into the mcp
 * package (published layout), and print the publish checklist.
 *   node scripts/prepare-publish.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

console.log('=== FlowDeck publish preparation ===\n');

// 1. full build
run('npm run build');

// 2. bundle canvas into published layout
const webDist = path.join(root, 'packages/web/dist');
const webDistBundled = path.join(root, 'packages/mcp/web-dist');
fs.rmSync(webDistBundled, { recursive: true, force: true });
fs.cpSync(webDist, webDistBundled, { recursive: true });
console.log(`\nbundled ${path.relative(root, webDist)} → ${path.relative(root, webDistBundled)}`);

// 3. pack dry-runs
for (const pkg of ['core', 'mcp']) {
  run(`npm pack --dry-run -w @flowdeck/${pkg}`);
}

console.log(`
=== checklist ===
[ ] npm 登录(whoami 有输出)+ npmjs.com 已创建 flowdeck organization(scope 可用)
[ ] npm publish -w @flowdeck/core        # 先发核心包
[ ] npm publish -w @flowdeck/mcp         # 再发 MCP 包(依赖刚发布的 core)
[ ] 发布后验证:npx -y @flowdeck/mcp history 能打开历史页;npx -y @flowdeck/mcp serve 可作为 IDE MCP 入口
[ ] git tag v<版本> 并 push;GitHub Release(可选)
[ ] docs/ide-setup.md 六个 IDE 实测矩阵逐项打勾(M5 自用期)
[ ] 首发文章 + Show HN / r/vibecoding / 即刻 / 掘金
`);
