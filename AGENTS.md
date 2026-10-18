# AGENTS.md —— FlowDeck 项目协作与代码开发规范(唯一权威入口)

> 用途:给 AI 编码助手与所有开发者。这里是规范入口与索引:目标、原则、流程、模块规则、维护矩阵、
> 阅读清单都在这份文件里。细则一律链接到对应文件,冲突时以细则文件为准并回改本文件。
> 被别的文档引用的事实(测试数、命令、路径)以本文件为准,其他文档只链接不复述。

## 项目目标

- 定位:一个 MCP 服务器 + 浏览器框线图画布。把 AI IDE(Cursor / Claude Code / ZCode / Qoder 等)
  对话中"向使用者确认任务流程/方案"这一步,从纯文本变成可拖拽、可连线的模块化画布;确认结果以
  JSON + Markdown 双份自动流回 agent。形态:npm 包(CLI + MCP 服务)+ 本地 Web 页面。
- 核心功能:
  - `present_plan` MCP 工具:把 agent 的结构化计划渲染为画布,确认后返回线性化计划与摘要
  - 框线图编辑:节点自由拖拽、拉线改执行顺序、拉线加依赖、添加/删除模块、连线改接与删除
  - 零 LLM 手动模式:`npx flowdeck open` 把 Markdown 计划变成画布;`flowdeck history` 回看确认记录
- 技术栈:TypeScript(strict)运行于 Node ≥ 20;MCP SDK `@modelcontextprotocol/sdk` ^1.32;
  画布 React 19 + `@xyflow/react` 12;样式 Tailwind 4(复核:`node -v`、`npm ls @xyflow/react react`)
- 详情:[README.md](README.md)、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 开发原则

1. 正确性优先。
2. 可维护性优先。
3. 代码简洁、项目简洁。
4. 小步迭代。
5. 单模块开发。
6. 每个改动必须有明确设计与验收标准。
7. 禁止一次生成整个项目。
8. 禁止跳步开发。

执行口径:先想后写(假设与歧义先挑明);最简优先(不加没要求的功能与抽象);外科手术式改动
(每行改动可追溯到需求);目标驱动(宣称完成前先跑通验证)。零 LLM 依赖是产品底线:画布服务
只做渲染与回传,不得引入任何模型调用或 API key。

## 开发流程

**分析 → 设计 → 实现 → 测试 → 文档更新 → Git提交 → 等待确认**。不得跳过任何阶段。

| 阶段 | 产出物 | 放行标准 |
|---|---|---|
| 分析 | 影响面清单(动哪些文件、影响哪些模块) | 影响面说全,无"顺手改"的暗项 |
| 设计 | 方案说明(思路、数据/接口变化、回退方式) | 验收标准已定义;与更简方案比较过 |
| 实现 | 代码 | 只含设计内改动,无未用导入与死代码 |
| 测试 | 测试结果 | 符合 [docs/TESTING.md](docs/TESTING.md) |
| 文档更新 | 受影响文档 diff | 下方维护矩阵逐项过完 |
| Git提交 | 提交 | 符合 [docs/GIT.md](docs/GIT.md),一批一提交 |
| 等待确认 | —— | 等人确认后才进入下一步 |

未创建 `docs/DEVELOPMENT.md`(单人 + AI 协作,流程以本表为准)。

## 模块开发规则

- 一个智能体一次只开发一个模块;模块完成后才能进入下一模块。
- 如需同时开发,使用多个子智能体,每个子智能体同样一次只开发一个模块。

模块完成标准(全部满足才算完成):

1. 功能完成:达到 [TODO.md](TODO.md) 中该模块的验收标准。
2. 测试通过:符合 [docs/TESTING.md](docs/TESTING.md)。
3. 最简原则:代码和项目架构都保持最简洁,无冗余抽象与重复实现。
4. [TODO.md](TODO.md) 更新:勾选完成项、明确下一项。
5. [HISTORY.md](HISTORY.md) 追加变更记录。
6. 受影响的 docs 更新(按需)。
7. [README.md](README.md) 更新(如有面向使用者的变化)。
8. Commit message 符合 [docs/GIT.md](docs/GIT.md)。

## 文档维护规则

| 事件 | 需更新 |
|---|---|
| 模块完成 | `TODO.md`、`HISTORY.md`、受影响 docs、新增子文件夹的说明 |
| 架构决策(选型、目录/数据模型/接口变更、新依赖、推翻决策) | `docs/ARCHITECTURE.md` + `HISTORY.md` 记录缘由 |
| 命令/入口/参数/目录结构变化 | `README.md` / `docs/GET-START.md` / 对应子目录 README |
| 增删一级或二级目录 | 仓根 `目录说明.md` + 父目录 README 的子目录表 |
| 测试数/依赖/门禁命令/已知坑变化 | 本文件的「当前状态」与「已知坑」 |
| 新对话/新任务开始 | 按下方阅读清单阅读 |

按需规范文件的取舍(2026-10-15 定,推翻时须在 HISTORY.md 记缘由):已创建 `DESIGN.md` 与
`docs/DEPLOYMENT.md`;不创建 `docs/PAGE-STRUCTURE.md`(组件结构并入 ARCHITECTURE,避免两处漂移)、
`docs/DEVELOPMENT.md`、`docs/REGISTRY.md`(无组件分发)、`docs/REFACTORING.md`(暂无重构专项约定)。

## 开发前阅读清单

每个新对话/新任务,按顺序阅读:

1. 本文件(`AGENTS.md`)
2. [TODO.md](TODO.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/GET-START.md](docs/GET-START.md)
5. [HISTORY.md](HISTORY.md)(近期变更)
6. 与任务相关的专项规范(`docs/CODE-STYLE.md`、`docs/TESTING.md`、`docs/GIT.md`、`DESIGN.md`、
   `docs/DEPLOYMENT.md`、`docs/ide-setup.md`)

阅读完成后**不要写代码**:先做架构评审,输出——项目理解 / 核心模块 / 模块依赖关系 / 潜在风险 /
建议优化项 / 推荐开发顺序 / 是否发现架构问题——然后等待确认。

## Git 索引

- Git 规范:[docs/GIT.md](docs/GIT.md)(分支提交、必须入库/禁止上传、commit message、一批一提交)
- 工作区文档门禁:提交前跑 `python check_docs.py flowdeck`(见 §十一,退出码 0 才许提交)

## 当前状态

| 项 | 值 | 复核命令 |
|---|---|---|
| 版本 | 0.2.6 | `node -p "require('./packages/mcp/package.json').version"` |
| 端到端测试 | 全部断言通过,预期输出含 ALL PASS | `npm run test:e2e` |
| 构建 | 三包(core → web → mcp)exit 0 | `npm run build` |
| CI | 无 | `.github/` 不存在 |
| 运行时依赖 | 各包 `package.json` 的 `dependencies` | — |
| 存档目录 | `~/.flowdeck/history/`(agent 运行时生成,勿手改) | `ls ~/.flowdeck/history` |

## 已知坑(省下一次的调查时间)

- 受控模式下用 `setEdges` 整表恢复历史快照, xyflow 的增量 diff 会给"端点节点在上一份状态里
  不存在"的边(典型: redo 重新加回模块)留下失效的边内部状态——该连线此后永不渲染, 后续任何
  重推/改 id/清空重建都无法唤醒。因此撤销/重做通过重挂载 `<ReactFlow>`(key=flowEpoch)恢复,
  且重挂载后必须重置测量兜底开关(`measurementFixed`)并轮询重测, 否则全新节点全部未测量、
  连线整体消失。修复验证时注意: 该缺陷的表现是非确定的, 单次通过不代表修复。
- 遮挡/最小化的浏览器窗口停止产出渲染帧,ResizeObserver 与 requestAnimationFrame 全部不触发,
  React Flow 节点因此永远处于未测量状态、连线不渲染——这不是代码回归。FlowView 内置了
  无帧测量兜底(轮询 + `updateNodeInternals` DOM 直读),自动化测试遇"节点在边不在"先检查窗口
  是否被遮挡。
- 工作区 npm 会拦 esbuild 的 postinstall(`allow-scripts`),首次 `npm install` 后需要
  `npm approve-scripts esbuild && npm rebuild esbuild`,否则 vite 构建报错。
- `packages/mcp/web-dist/` 是发布布局的打包产物,由 `scripts/prepare-publish.mjs` 生成;
  开发态若手动创建它会盖住 `packages/web/dist` 的新构建(解析顺序见
  `packages/mcp/src/canvas-server.ts` 的 `resolveWebDist`),开发时保持该目录不存在。
- 自动化环境(IAB)里 `fill()` 不触发 React 受控组件的 onChange、键盘事件不达页面:
  测试请用原生 value setter + `input` 事件,或真实鼠标。这是环境限制,不是产品 bug。
