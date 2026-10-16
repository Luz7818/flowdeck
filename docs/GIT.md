# FlowDeck Git 规范

> 用途:给提交代码的人。分支策略、什么入库什么禁止上传、commit message 与 PR 的规矩都在这里。

## 分支与提交策略

- 分支:单人 + AI 协作,`main` 直推;发布前或实验性大改(如 v0.2.0 框线图重构)开 feature
  分支,合并前自跑全部门禁。
- **一批一提交**:一个提交 = 一个可回退单元;每批提交前跑该仓全部门禁
  (`npm run build` + `npm run test:e2e`)+ `python "D:\东南大学\项目\Project\文档标准\check_docs.py" flowdeck`。
- 整理/精简类改动另加两条判据:测试数与基线一致(不加不删);生成物逐字节回归
  (重跑 `npm run build` 后 `git status` 为空)。

## 必须入库 / 禁止上传

| 判定 | 规则 |
|---|---|
| 必须入库 | 源码、文档、`docs/demo-plan.md`(示例资产)、构建配置与锁文件 |
| 禁止上传 | `node_modules/`、各 `dist/` 与 `packages/mcp/web-dist/`(构建产物)、`~/.flowdeck/history/`(用户数据,本就不在仓内)、日志、密钥 |
| 兜底 | 拿不准的进 `.gitignore` 并在 `AGENTS.md` 记一句为什么 |

产物入库的唯一例外是字节稳定三条件(重建可复现 + 有约定目录 + 有生成脚本)——本仓当前无此类产物。

## commit message

- 格式:`<type>: <一句话说清做了什么>`;type 取 `feat / fix / docs / refactor / test / chore`。
- 版本节点在正文标注版本号(例:`v0.2.0: real node-wire flow canvas (React Flow)`),
  并在 `HISTORY.md` 追加对应条目。
- 破坏性变更或推翻既有决策:正文写清缘由,并在 `HISTORY.md` 追加记录
  (先例:2026-10-15 框线图重构推翻列表式交互)。

## PR 规范

- 当前无远端仓库,无 PR 流程;M6 发布建 GitHub 仓后按以下规则执行。
- PR 描述必填:做了什么、怎么验的(贴命令与结果)、影响面。
- 合并前:门禁绿;有文档连带改动时 `check_docs` 全绿。
