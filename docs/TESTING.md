# FlowDeck 测试规范

> 用途:给写测试和跑门禁的人。测试分层、覆盖率要求、用例写法、运行命令都在这里;
> 测试数与门禁命令的事实口径在根目录 `AGENTS.md` 的「当前状态」。

## 测试分层

| 层 | 管什么 | 放哪 | 数量级 |
|---|---|---|---|
| 图算法单元验证 | schema 往返、链→线性化、断链安全、自动布局 | 临时 `node --input-type=module` 脚本(命令见 docs/TESTING.md §运行命令) | 按需 |
| 无头端到端 | MCP 调用 → 会话 → WS 编辑 → 确认 → 返回/存档/历史 API 全链路 | `scripts/e2e.mjs` | 少而稳,每场景一条断言 |
| 浏览器交互冒烟 | 人工:拖拽、连线、吸附、双视图、六 IDE 唤起 | `scripts/manual-session.mjs` + docs/ide-setup.md 矩阵 | 每次发布一轮 |

自动化不覆盖浏览器内手势(拖拽连线、键盘):IAB 环境里 CUA/键盘/合成指针事件不可靠
(见 AGENTS.md 已知坑),手势回归依赖人工清单,这是承认的边界而非缺口。

## 覆盖率要求

无行覆盖率硬门槛。必须覆盖的路径:七类模块在确认摘要中的全部渲染分支、未知类型保留、
断链线性化不丢模块、路径穿越拒绝(`/api/history/file` 的文件名白名单)、
取消/超时返回 cancelled。改这些路径时先补断言再改码。

## 用例编写规范

- e2e 断言一行一事,格式 `assert(条件, '中文说明')`,失败时脚本打印完整返回 JSON。
- 修 bug 先提交复现断言:0.1.1 的五项修复各自先有失败断言(对照 HISTORY.md 逐条可查)。
- 模拟浏览器编辑直接改 WS 协议 JSON(跳过 DOM),断言落在最终 summary 与 plan 上——
  协议是稳定契约,DOM 不是。

## 运行命令

```bash
npm run test:e2e        # 预期:结尾 [e2e] ALL PASS ✅,退出码 0
npm run build           # 预期:三包依次构建,退出码 0
node --input-type=module -e "import('./packages/core/dist/index.js').then(m => { /* 图算法断言 */ })"
```

图算法四测(往返/改线/断链/布局)的完整脚本在 HISTORY.md 2026-10-15 v0.2.0 条目的开发过程里,
按 docs/GET-START.md §5.2 的指引临时执行。

## 改动后的验证

| 你动了 | 必须跑 |
|---|---|
| `packages/core/**`(schema/graph/summary/markdown) | `npm run build` + 图算法四测 + `npm run test:e2e` |
| `packages/web/**` | `npm run build -w @flowdeck/web` + `npm run test:e2e` + 浏览器人工冒烟(弹出画布拖一次) |
| `packages/mcp/**` | `npm run build -w @flowdeck/mcp` + `npm run test:e2e` + CLI 冒烟(`node packages/mcp/bin/flowdeck.js docs/demo-plan.md`) |
| `scripts/**` | `npm run test:e2e` |
| 任何文档 | `python "D:\东南大学\项目\Project\文档标准\check_docs.py" flowdeck` |
