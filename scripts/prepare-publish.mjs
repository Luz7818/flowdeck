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
[ ] npm login(或配置 registry)
[ ] npm publish -w @flowdeck/core        # 先发核心包
[ ] npm publish -w @flowdeck/mcp         # 再发 MCP 包(依赖 core@0.1.0)
[ ] npm publish -w @flowdeck/mcp 后验证:npx flowdeck history 能打开历史页
[ ] GitHub 建仓库并 push(README 徽章、demo GIF)
[ ] docs/ide-setup.md 六个 IDE 实测矩阵逐项打勾(M5 自用期)
[ ] 首发文章 + Show HN / r/vibecoding / 即刻 / 掘金
`);
