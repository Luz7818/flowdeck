# FlowDeck 架构

> 用途:给要理解或改动项目结构的人。架构总览、目录结构(含根目录所有文件用途)、数据组织方式、
> 模块依赖关系都在这里。操作步骤在 `docs/GET-START.md`;每块目录负责什么的细节在它的 `README.md`。

## 架构总览

仓库是 npm workspaces monorepo,三个包各管一段:`@flowdeck/core` 是纯逻辑库(schema、图算法、
解析、摘要),`@flowdeck/mcp` 是进程侧服务(MCP 工具 + 本地 HTTP/WebSocket 宿主 + CLI),
`packages/web` 是浏览器画布(React Flow 框线图,唯一编辑面)。数据流向一句话:agent 调
`present_plan` 传入结构化计划 → 宿主建会话并自动打开浏览器 → 用户在画布上自由连线编辑(编辑
经 WS `autosave` 防抖回传宿主存于会话,页面刷新/重连 init 返回的是最新编辑而非原始草稿) →
确认后前端把连线图按深度优先顺序线性化回有序计划(分支按序展开,断链节点按原顺序追加) →
宿主存档并把 JSON + Markdown 摘要作为工具返回值交还 agent。
全程零 LLM 调用:智能全部来自调用方 agent。宿主生命周期与 IDE 会话绑定:IDE 结束 stdin
即结清全部会话退出进程;IDE 取消工具调用即按 cancelled 结清对应画布会话(浏览器页同步收到取消态)。
例外是历史页「重新打开画布」(POST /api/history/reopen)产生的 ephemeral 会话——它不属于
工具调用等待,自带双层回收:未打开 30 分钟、打开后最后一个标签页离开 30 秒。

**VS Code 系内嵌轨道**(packages/vscode,可选):画布不经宿主代理,以 iframe 直接嵌进
IDE(VS Code / Cursor / Qoder 通用)的 webview 面板。机制:宿主每次创建会话把
`{url, sessionId, ts}` 写进 `~/.flowdeck/last-session.json`(跨进程握手——扩展轮询
`/sessions` 要覆盖会漂移的端口,一个文件不需要);扩展监听该文件,变化即自动开面板,
另有「打开最近画布 / 粘贴 URL」两条手动命令兜底;MCP 服务器设 `FLOWDECK_OPEN_MODE=vscode`
时抑制默认浏览器自动弹出(stderr 的画布 URL 仍照打),避免画布双开。面板 URL 固定带
`?dir=tb`:侧栏窄,画布以竖排开场(链路自上而下,布局算法见 core `defaultLayout` 的
direction 参数),画布工具栏可切回横排(URL 参数优先于画布记住的选择)。iframe 直连而非把
画布跑进 webview 外壳文档,是刻意的:外壳文档的源是 `vscode-webview://<panel-id>`,
画布若跑在那里,其请求 Origin 过不了宿主的 DNS-rebinding 守卫;iframe 内画布自己的请求
Host/Origin 均为 127.0.0.1,天然合规。守卫只对「嵌入文档的 Origin」开一个
`vscode-webview://` 前缀例外(canvas-server.ts `isLocalRequest`):Host 仍必须回环,
rebinding 防线不动,普通网页也造不出该 Origin。宿主不发 X-Frame-Options / CSP
frame-ancestors,iframe 嵌入不被宿主响应头挡;确认/自动保存/取消照旧走同一套 WS
`handleSocket` 路径,服务端行为与浏览器版完全一致。

## 目录结构

```
flowdeck/
├── .github/          CI(workflows/ci.yml:build + e2e,ubuntu/windows 矩阵)
├── docs/             手册与规范(GET-START/ARCHITECTURE/CODE-STYLE/TESTING/GIT/DEPLOYMENT/ide-setup/demo-plan)
├── packages/         工作区包(说明:packages/README.md)
│   ├── core/         纯逻辑库:schema/graph/markdown/summary/normalize(说明:packages/README.md)
│   ├── mcp/          MCP 服务 + 画布宿主 + CLI(说明:packages/README.md)
│   ├── web/          React 画布页(说明:packages/README.md)
│   └── vscode/       VS Code 系内嵌扩展(vsce 打包,不发布 npm;说明:packages/vscode/README.md)
├── scripts/          e2e / 交互演示驱动 / 发布准备(说明:scripts/README.md)
├── AGENTS.md         协作规范唯一权威入口
├── DESIGN.md         视觉与交互规范
├── HISTORY.md        版本与决策记录(只追加)
├── README.md         项目首页
├── TODO.md           模块计划与进度
├── 目录说明.md        全仓导航
├── server.json       MCP Registry 提交清单(版本由 prepare-publish.mjs 与包版本对齐)
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
- **连线图 ↔ 计划**:画布上的链式边由 `chainFromOrder` 按模块顺序生成,用户可自由改接/分支;
  确认时 `linearizePlan` 从全部无入边节点按深度优先前序展开(多出线按目标原序 tiebreak,
  多起点与菱形结构天然支持),断链节点按原顺序追加(绝不丢模块),`defaultLayout`
  提供确定性自动布局(分组分行)。
- **确认存档**:每次确认,宿主把 `{savedAt, plan, summary}` 写入
  `~/.flowdeck/history/<时间戳>-<标题>.json`。由程序生成,**勿手改**;无生成脚本(写文件逻辑在
  `packages/mcp/src/canvas-server.ts` 的 `archive`),历史查看器与未来复盘页是它的消费者。
- **画布静态产物**:`packages/web/dist`(开发态)与 `packages/mcp/web-dist`(发布态,由
  `node scripts/prepare-publish.mjs` 拷贝生成,勿手改)。
- **会话握手文件**:`~/.flowdeck/last-session.json`(`{url, sessionId, ts}`)——宿主每次
  创建会话写入(程序生成,勿手改),供 VS Code 系扩展(packages/vscode)监听以在 IDE 内
  开画布;e2e 断言后即删,测试不留死 URL。

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
- `packages/vscode` 不 import 任何 npm 包(只用 Node 内置模块 + VS Code API),只通过
  `~/.flowdeck/last-session.json` 与画布 URL 复用 mcp 的 HTTP/WS 宿主;不进根 `npm run build`
  链与 prepare-publish,唯一构建入口是根 `npm run package:vsix`(vsce 打 vsix)。
- 跨包改动同步义务:改 schema 或图算法( core)必须同跑 web 与 mcp 的构建与 e2e(见 docs/TESTING.md)。

## 子目录说明索引

| 子目录 | 说明 |
|---|---|
| `packages/` | [`packages/README.md`](../packages/README.md) |
| `scripts/` | [`scripts/README.md`](../scripts/README.md) |
| `docs/` | 文档目录,免板块说明;本表与其余手册都在这里 |

整棵树的导航另见仓根 `目录说明.md`。

## 已知架构问题

- 画布是唯一编辑面,`plan` 状态经 WS init 进入后由 FlowView 独占编辑;App 只通过
  `registerCommit`(确认时拉取线性化计划)与 `onStats`(header 统计)两个回调消费画布,
  不再回写——新增向 App 回传状态时必须走同样的单向通道,否则会重新引入双向同步。
- `resolveWebDist` 的三级回退(env → mcp/web-dist → web/dist)让发布与开发共用一套服务,
  但开发态残留 `web-dist` 会盖住新构建(AGENTS.md 已知坑),长期应把发布布局改为构建期注入;
  且 `packages/mcp/src/doctor.ts` 为真故障检查复制了同款判定(该函数模块私有,doctor 改为
  本地复制)——调整回退顺序时两处必须同步演化,长期可考虑导出共享。
- 浏览器内拖拽/键盘手势在自动化环境不可靠(环境限制),画布交互回归依赖人工清单,
  e2e 只覆盖数据层;见 docs/TESTING.md 的分层说明。
- packages/vscode 的自动开面板按文件变化触发,不感知宿主窗口:多个 VS Code 系窗口同时
  开着时各自都会开面板;iframe 被宿主拦时面板内有 Simple Browser 兜底。webview 属
  后台/遮挡场景,rAF/ResizeObserver 停摆的已知坑(AGENTS.md)适用——画布已内置无帧
  测量兜底,验证用结构化断言。
