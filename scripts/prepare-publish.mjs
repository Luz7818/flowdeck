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

// 2.5 keep server.json (MCP Registry submission) in lockstep with the package version
const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/mcp/package.json'), 'utf-8'),
).version;
const serverJsonPath = path.join(root, 'server.json');
const serverJson = JSON.parse(fs.readFileSync(serverJsonPath, 'utf-8'));
if (serverJson.version !== pkgVersion || serverJson.packages?.[0]?.version !== pkgVersion) {
  serverJson.version = pkgVersion;
  serverJson.packages[0].version = pkgVersion;
  fs.writeFileSync(serverJsonPath, JSON.stringify(serverJson, null, 2) + '\n', 'utf-8');
  console.log(`server.json version synced → ${pkgVersion}`);
}

// 3. pack dry-runs
for (const pkg of ['core', 'mcp']) {
  run(`npm pack --dry-run -w @flowdeck/${pkg}`);
}

console.log(`
=== checklist ===
[ ] npm 登录(whoami 有输出)+ npmjs.com 已创建 flowdeck organization(scope 可用)
[ ] 删除 README.md 安装节顶部「尚未发布」声明(HISTORY.md 2026-11-02 FD-01 处置约定:实际发布时删除)
[ ] npm publish -w @flowdeck/core        # 先发核心包
[ ] npm publish -w @flowdeck/mcp         # 再发 MCP 包(依赖刚发布的 core)
[ ] 发布后验证:npx -y @flowdeck/mcp history 能打开历史页;npx -y @flowdeck/mcp serve 可作为 IDE MCP 入口
[ ] MCP Registry 登记:registry.modelcontextprotocol.io 以 GitHub 方式登记本仓库(根 server.json)
[ ] git tag v<版本> 并 push;GitHub Release(可选)
[ ] 真机实测:在 ZCode 验证一次 logging 通知可见(对话 UI 或 IDE 的 MCP 日志)——「画布链接进对话侧」是 0.8.0 卖点的前置;与 docs/ide-setup.md 六个 IDE 实测矩阵逐项打勾合并执行(M5 自用期)
[ ] 首发文章 + Show HN / r/vibecoding / 即刻 / 掘金
`);
