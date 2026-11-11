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
[ ] npm publish -w @flowdeck/core        # 手动首发核心包
[ ] npm publish -w @flowdeck/mcp         # 再发 MCP 包(依赖刚发布的 core)
[ ] 发布后验证:npx -y @flowdeck/mcp history 能打开历史页;npx -y @flowdeck/mcp serve 可作为 IDE MCP 入口
[ ] 两包 Settings 配 Trusted Publisher(repo Luz7818/flowdeck + workflow publish.yml,配置保存后不可改;若填 environment,发布工作流须声明同名 environment)——配置后 2 天内完成首次 CI 发布:0.9.0 已手动首发、npm 版本不可重发,需 bump 未发过的版本号再手动 dispatch .github/workflows/publish.yml(OIDC 发布自动带 provenance,无 --provenance 旗标)
[ ] MCP Registry 登记:registry.modelcontextprotocol.io——装 mcp-publisher(GitHub Release 二进制,非 npm 包)→ mcp-publisher login github → mcp-publisher publish(根 server.json,版本由本脚本对齐)
[ ] git push origin v0.9.0(本地已打 tag;tag 推送不触发发布 CI——ci.yml 仅 branches:main+pull_request,publish.yml 仅 workflow_dispatch);GitHub Release(可选)
[ ] 真机实测:在 ZCode 验证一次 logging 通知可见(对话 UI 或 IDE 的 MCP 日志)——「画布链接进对话侧」是 0.8.0 卖点的前置;与 docs/ide-setup.md 六个 IDE 实测矩阵逐项打勾合并执行(M5 自用期)
[ ] 首发文章 + Show HN / r/vibecoding / 即刻 / 掘金
`);
