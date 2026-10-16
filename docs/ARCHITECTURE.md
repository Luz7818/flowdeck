# FlowDeck 架构

> 用途:给要理解或改动项目结构的人。架构总览、目录结构(含根目录所有文件用途)、数据组织方式、
> 模块依赖关系都在这里。操作步骤在 `docs/GET-START.md`;每块目录负责什么的细节在它的 `README.md`。

## 架构总览

仓库是 npm workspaces monorepo,三个包各管一段:`@flowdeck/core` 是纯逻辑库(schema、图算法、
解析、摘要),`@flowdeck/mcp` 是进程侧服务(MCP 工具 + 本地 HTTP/WebSocket 宿主 + CLI),
`packages/web` 是浏览器画布(React Flow 框线图 + 列表双视图)。数据流向一句话:agent 调
`present_plan` 传入结构化计划 → 宿主建会话并自动打开浏览器 → 用户在画布上编辑 → 确认后前端把
连线图线性化回有序计划 → 宿主存档并把 JSON + Markdown 摘要作为工具返回值交还 agent。
全程零 LLM 调用:智能全部来自调用方 agent。

## 目录结构

```
flowdeck/
├── docs/             手册与规范(GET-START/ARCHITECTURE/CODE-STYLE/TESTING/GIT/DEPLOYMENT/ide-setup/demo-plan)
├── packages/         三个工作区包(说明:packages/README.md)
│   ├── core/         纯逻辑库:schema/graph/markdown/summary/normalize(说明:packages/README.md)
│   ├── mcp/          MCP 服务 + 画布宿主 + CLI(说明:packages/README.md)
│   └── web/          React 画布页(说明:packages/README.md)
├── scripts/          e2e / 交互演示驱动 / 发布准备(说明:scripts/README.md)
├── AGENTS.md         协作规范唯一权威入口
├── DESIGN.md         视觉与交互规范
├── HISTORY.md        版本与决策记录(只追加)
├── README.md         项目首页
├── TODO.md           模块计划与进度
├── 目录说明.md        全仓导航
├── LICENSE           MIT
├── package.json      workspace 根清单(npm run build / dev:web / test:e2e)
├── package-lock.json 依赖锁
├── tsconfig.base.json TypeScript 基础配置,各包 tsconfig 继承它
└── .gitignore        忽略 node_modules 与各 dist
```

根目录每个文件的用途已逐个列在上方;`AGENTS.md`、`HISTORY.md`、`TODO.md`、`目录说明.md`、
`DESIGN.md` 是工作区文档体系《项目整体规范.md》的固定住户,命名不得改。

## 数据组织方式

- **计划(Plan)**:核心数据结构,`packages/core/src/schema.ts` 定义。`schemaVersion` 当前为 1;
  模块七类(step / question / group / suggestion / risk / checkpoint / resource),每类可选
  `excluded`(画布上移除)与 `pos`(画布坐标,流程图序列化产物);step 另有 `dependsOn`(依赖的
  步骤 id 列表)。**未知类型原样保留**——旧画布不丢新版 agent 的模块,这是 schema 演进策略。
- **连线图 ↔ 计划**:画布上的链式边由 `chainFromOrder` 按模块顺序生成;确认时 `linearizePlan`
  沿链从无入边节点走一遍得到最终顺序,断链节点按原顺序追加(绝不丢模块),`defaultLayout`
  提供确定性自动布局(分组分行)。
- **确认存档**:每次确认,宿主把 `{savedAt, plan, summary}` 写入
  `~/.flowdeck/history/<时间戳>-<标题>.json`。由程序生成,**勿手改**;无生成脚本(写文件逻辑在
  `packages/mcp/src/canvas-server.ts` 的 `archive`),历史查看器与未来复盘页是它的消费者。
- **画布静态产物**:`packages/web/dist`(开发态)与 `packages/mcp/web-dist`(发布态,由
  `node scripts/prepare-publish.mjs` 拷贝生成,勿手改)。

## 模块依赖关系

```
agent(任意支持 MCP 的 IDE)
   │  stdio: present_plan
   ▼
@flowdeck/mcp ──拉起──▶ 浏览器画布(packages/web 构建产物)
   │                      │ WebSocket: init / confirm / cancel
   ▼                      ▼
@flowdeck/core ◀──────────(两端都只依赖 core)
```

- `web → core`、`mcp → core`:schema、normalize、summary、graph 全在 core。
- `mcp → @modelcontextprotocol/sdk / ws / zod`;`web → react / @xyflow/react / tailwind`。
- **禁止反向引用**:core 不 import 任何 Node 专属模块与 React(它必须可被浏览器打包,
  曾因 `node:crypto` 违反此条导致 vite 构建失败,改用 Web Crypto,见 HISTORY.md 2026-10-15)。
- 跨包改动同步义务:改 schema 或图算法( core)必须同跑 web 与 mcp 的构建与 e2e(见 docs/TESTING.md)。

## 子目录说明索引

| 子目录 | 说明 |
|---|---|
| `packages/` | [`packages/README.md`](../packages/README.md) |
| `scripts/` | [`scripts/README.md`](../scripts/README.md) |
| `docs/` | 文档目录,免板块说明;本表与其余手册都在这里 |

整棵树的导航另见仓根 `目录说明.md`。

## 已知架构问题

- 双视图(流程图/列表)共享一份计划 state:离开流程图视图或确认时经 `getPlan()` 线性化落账,
  该同步边界依赖 `registerCommit` 回调注册,新增视图时必须接入同一机制,否则编辑会丢。
- `resolveWebDist` 的三级回退(env → mcp/web-dist → web/dist)让发布与开发共用一套服务,
  但开发态残留 `web-dist` 会盖住新构建(AGENTS.md 已知坑),长期应把发布布局改为构建期注入。
- 浏览器内拖拽/键盘手势在自动化环境不可靠(环境限制),画布交互回归依赖人工清单,
  e2e 只覆盖数据层;见 docs/TESTING.md 的分层说明。
