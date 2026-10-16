# scripts/ —— 测试、演示与发布脚本

> 用途:说明本目录在整个项目里管哪一段,以及每个脚本干什么。

本目录放跨包的开发工具脚本:一条无头端到端回归、一个交互演示驱动、一个发布准备入口。
输入是各包的构建产物(`packages/*/dist` 与 `packages/web/dist`),输出是测试结论、演示会话
与可发布的打包布局。去掉本目录项目仍可运行,但失去回归门禁与发布能力。

## 文件清单

| 文件 | 干什么 | 备注 |
|---|---|---|
| `e2e.mjs` | 无头端到端:模拟 MCP 客户端 → 画布会话 → WS 编辑 → 确认,断言摘要/存档/历史 API | 门禁,经 `npm run test:e2e` 运行;改协议必须同步它 |
| `manual-session.mjs` | 交互演示驱动:弹出画布并挂起等确认,结果打成 JSON | 调试与人工冒烟用;支持 `FLOWDECK_PORT` / `FLOWDECK_NO_OPEN` / `FLOWDECK_TIMEOUT_MS` |
| `prepare-publish.mjs` | 发布准备:全量构建 + 拷画布进 `packages/mcp/web-dist/` + 两包 pack 演练 + 打印清单 | 发布前必跑;见 `docs/DEPLOYMENT.md` |

## 和谁打交道

- **上游**:`packages/core`(e2e 断言依赖其 schema 语义)、`packages/mcp/dist`(stdio 启动被测服务)、
  `packages/web/dist`(画布静态产物)。
- **下游**:开发者与 CI(将来)跑 `npm run test:e2e`;发布者跑 `prepare-publish.mjs`。
- **改这里之后要跑**:`npm run test:e2e`。

## 别动

- `e2e.mjs` 里的环境变量注入(`FLOWDECK_PORT`/`FLOWDECK_NO_OPEN`/`FLOWDECK_TIMEOUT_MS`)
  是无头化的前提,删掉会在测试机弹出浏览器或永久挂起。
- `prepare-publish.mjs` 会先 `rm -rf packages/mcp/web-dist` 再拷贝——它是该目录唯一合法的
  生成者,手动往 web-dist 放文件会被下次运行清掉。
