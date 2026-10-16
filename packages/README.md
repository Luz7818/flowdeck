# packages/ —— 三个工作区包

> 用途:说明本目录在整个项目里管哪一段,以及每个包干什么。

本目录是 npm workspaces 的包根,FlowDeck 的全部源码都在这三个包里:core 提供纯逻辑
(schema/图算法/解析/摘要),mcp 提供进程侧服务(MCP 工具 + 画布宿主 + CLI),web 提供浏览器
画布。输入是 agent 传来的结构化计划与用户的画布编辑,输出是确认后的有序计划与 Markdown 摘要。
去掉本目录项目就没有任何实现。依赖方向固定:web 和 mcp 都只依赖 core,禁止反向引用
(core 必须可被浏览器打包,不能 import Node 专属模块与 React)。

## 文件清单

本目录没有直接文件,全部内容在三个包目录里,每个包自带 `package.json` 与 `tsconfig.json`
(继承仓根 `tsconfig.base.json`)。

## 子目录

| 子目录 | 负责 |
|---|---|
| `core/` | 纯逻辑库:计划 schema(七类模块)、链↔线性化图算法、Markdown 解析、摘要生成、normalize |
| `mcp/` | MCP 服务器(`present_plan` 工具)、本地 HTTP/WebSocket 画布宿主、CLI(open/history)、历史 API |
| `web/` | React 19 + React Flow 画布页:框线图视图(默认)与列表视图、双语、历史查看器页面 |

## 和谁打交道

- **上游**:根 `package.json` 的 workspace 声明把三个包接进 monorepo;agent 通过 stdio 调 mcp。
- **下游**:`scripts/e2e.mjs` 与 `scripts/manual-session.mjs` 消费 mcp 的构建产物;
  `scripts/prepare-publish.mjs` 把 web 构建产物拷进 mcp 的发布布局。
- **改这里之后要跑**:`npm run build && npm run test:e2e`(动了 core 还要跑图算法验证,
  见 `docs/TESTING.md` 的改动后验证表)。

## 别动

- 包间依赖方向是架构红线:core 不得依赖 react / @xyflow/react / ws / MCP SDK
  (曾因 `node:crypto` 进 core 导致 vite 构建失败,已改 Web Crypto,见 `HISTORY.md`)。
- `mcp/src/canvas-server.ts` 的 `resolveWebDist` 三级回退顺序(env → web-dist → web/dist)
  决定开发态与发布态各加载哪份画布,调整顺序会让开发时加载到旧构建。
- `web/src/flow/FlowNode.tsx` 的把手 id(`in`/`out`/`dep-in`/`dep-out`)是连线契约,
  前后端共同依赖,改名会静默破坏连线与线性化。
