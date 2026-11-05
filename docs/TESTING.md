# FlowDeck 测试规范

> 用途:给写测试和跑门禁的人。测试分层、覆盖率要求、用例写法、运行命令都在这里;
> 测试数与门禁命令的事实口径在根目录 `AGENTS.md` 的「当前状态」。

## 测试分层

| 层 | 管什么 | 放哪 | 数量级 |
|---|---|---|---|
| core 单元测试 | schema 净化、链→线性化(改线/分支/断链/环/排除引用)、Markdown 解析(emoji/缩进附件/围栏)、摘要七类渲染 | `packages/core/test/*.test.mjs`(Node 内置 `node:test`,零依赖) | 按源模块四文件 |
| 无头端到端 | MCP 调用 → 会话 → WS 编辑 → 确认 → 返回/存档/历史 API 全链路 | `scripts/e2e.mjs` | 少而稳,每场景一条断言 |
| 浏览器交互冒烟 | 人工:拖拽、连线、分支吸附、深浅主题、六 IDE 唤起 | `scripts/manual-session.mjs` + docs/ide-setup.md 矩阵 | 每次发布一轮 |

自动化不覆盖浏览器内手势(拖拽连线、键盘):IAB 环境里 CUA/键盘/合成指针事件不可靠
(见 AGENTS.md 已知坑),手势回归依赖人工清单,这是承认的边界而非缺口。

## 覆盖率要求

无行覆盖率硬门槛。必须覆盖的路径:七类模块在确认摘要中的全部渲染分支、未知类型保留、
分支图 DFS 线性化(一节点两下游按目标原序展开)、断链线性化不丢模块、路径穿越拒绝
(历史 API 文件名白名单:GET/DELETE 的 `/api/history/file` 与 POST `/api/history/reopen`)、
历史条目删除(删除后列表消失、再删 404)、历史重开(归档重开为临时会话且 init 带归档
计划、缺失归档 404)、取消/超时返回 cancelled、伪造 Host 与跨源 WebSocket 被拒
(DNS rebinding 防护)、present_plan 等待期间对话侧收到含画布地址的 logging 通知。
改这些路径时先补断言再改码。

## 用例编写规范

- e2e 断言一行一事,格式 `assert(条件, '中文说明')`,失败时脚本打印完整返回 JSON。
- 修 bug 先提交复现断言:0.1.1 的五项修复各自先有失败断言(对照 HISTORY.md 逐条可查)。
- 模拟浏览器编辑直接改 WS 协议 JSON(跳过 DOM),断言落在最终 summary 与 plan 上——
  协议是稳定契约,DOM 不是。

## 运行命令

```bash
npm run test:core       # 预期:44 用例全 ✔,退出码 0(先重建 core 再跑)
npm run test:e2e        # 预期:结尾 [e2e] ALL PASS ✅,退出码 0
npm run build           # 预期:三包依次构建,退出码 0
```

core 单测 import 构建产物 `packages/core/dist/index.js`,`test:core` 脚本自带重建步骤,
无需手工先 build。给 core 加新纯函数时在对应 `*.test.mjs` 里补断言,四文件与
`src/` 的 graph / markdown / summary / normalize 一一对应。

## 改动后的验证

| 你动了 | 必须跑 |
|---|---|
| `packages/core/**`(schema/graph/summary/markdown) | `npm run build` + `npm run test:core` + `npm run test:e2e` |
| `packages/web/**` | `npm run build -w @flowdeck/web` + `npm run test:e2e` + 浏览器人工冒烟(弹出画布拖一次) |
| `packages/mcp/**` | `npm run build -w @flowdeck/mcp` + `npm run test:e2e` + CLI 冒烟(`node packages/mcp/bin/flowdeck.js docs/demo-plan.md`) |
| `scripts/**` | `npm run test:e2e` |
| 任何文档 | `python "D:\东南大学\项目\Project\文档标准\check_docs.py" flowdeck` |
