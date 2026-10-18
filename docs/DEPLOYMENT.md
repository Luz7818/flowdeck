# DEPLOYMENT —— FlowDeck 构建与发布

> 用途:给发布和排障的人与 AI。怎么构建、发布到 npm、怎么确认发布成功、失败怎么回滚都在这里。
> 按需文件:在 `AGENTS.md` 登记索引;本项目无服务器部署,部署 = npm 包发布。

## 构建与发布

| 步骤 | 命令 | 预期 |
|---|---|---|
| 构建 | `npm run build` | 三包(core → web → mcp)依次编译,退出码 0 |
| 发布准备 | `node scripts/prepare-publish.mjs` | 全量构建 + 画布拷入 `packages/mcp/web-dist/` + 两包 `npm pack --dry-run` 清单 + 打印检查清单 |
| 发布核心包 | `npm publish -w @flowdeck/core` | registry 出现 @flowdeck/core@0.2.8 |
| 发布 MCP 包 | `npm publish -w @flowdeck/mcp` | registry 出现 @flowdeck/mcp@0.2.8(依赖刚发的 core) |
| 验证 | `npm view @flowdeck/mcp version` | 输出 `0.2.8` |
| 冒烟 | `npx -y @flowdeck/mcp history` | 拉包成功并打开历史查看器(`npx -y @flowdeck/mcp serve` 为 IDE 配置入口) |

发布顺序固定先 core 后 mcp:mcp 的 `dependencies` 声明了 `@flowdeck/core`,顺序反了会发布
一个指向不存在版本的包。

## 环境与密钥

- npm 账号与登录:`npm whoami` 应输出用户名;未登录先 `npm login`。
- 运行时环境变量(只写名字与作用,发布产物不内置任何真实值):

| 变量 | 作用 |
|---|---|
| `FLOWDECK_PORT` | 固定画布宿主端口,默认 7688,被占用自动回退随机端口 |
| `FLOWDECK_NO_OPEN` | 设为 `1` 时不自动打开浏览器 |
| `FLOWDECK_TIMEOUT_MS` | 确认等待超时,超时按 cancelled 返回 |
| `FLOWDECK_WEB_DIST` | 覆盖画布静态文件目录(调试用) |

## 回滚

- 72 小时内可 `npm unpublish @flowdeck/mcp@<版本>`;超过时限用
  `npm deprecate @flowdeck/mcp@<版本> "<原因>"` 标记废弃并发 patch 版本。
- 版本回退:`git revert <提交>` 后走一遍构建与发布流程出新 patch,不原地重发同号。

## 别动

- `packages/mcp/web-dist/` 是 `prepare-publish.mjs` 的生成物,勿手改、勿手删后忘记重跑脚本
  (它不在 git 里,重跑脚本重建)。
- `@flowdeck/web` 是 private 包,不发布——它的产物经 web-dist 随 mcp 包分发。
