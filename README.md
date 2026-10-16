# FlowDeck · AI IDE 计划确认的框线图画布

> 用途:给第一次打开这个仓库的人。看完知道它是什么、能不能解决你的问题、怎么跑起来。

FlowDeck 把 AI 编程助手里"确认任务流程"这一步从一屏纯文本变成一张框线图:agent 把计划拆成
模块节点(步骤/问题/建议/风险/检查点/资源/阶段)摆上画布,你拖拽节点、拉线改顺序、点选答案,
点"确认方案"后结果自动流回 IDE 对话——零复制粘贴。给 agent 的输入是一份结构化计划,返回的是
按你的连线线性化后的 JSON + Markdown 摘要。

**7 种模块类型、端到端测试全绿**(复核:`npm run test:e2e`,预期输出含 ALL PASS)

## 30 秒跑通

```bash
# 在仓库根目录执行(首次需 npm install && npm run build)
node packages/mcp/bin/flowdeck.js docs/demo-plan.md
```

浏览器自动弹出一张框线图,拖一拖、点"确认方案",终端打印最终 Markdown 计划就说明装对了。
完整步骤与故障排查看 [上手手册](docs/GET-START.md)。

## 它能做什么

| 能力 | 怎么用 | 细节 |
|---|---|---|
| IDE 内弹出画布确认计划 | 在 MCP 配置里注册本服务 | [docs/ide-setup.md](docs/ide-setup.md) |
| 把 Markdown 计划变成画布 | `node packages/mcp/bin/flowdeck.js <文件>` | [docs/GET-START.md](docs/GET-START.md) |
| 回看历次确认记录 | `node packages/mcp/bin/flowdeck.js history` | [docs/GET-START.md](docs/GET-START.md) |
| 无头回归测试 | `npm run test:e2e` | [docs/TESTING.md](docs/TESTING.md) |

## 目录怎么分

| 目录 | 负责 |
|---|---|
| `packages/core/` | 计划 schema、图算法(链→线性化)、Markdown 解析、摘要生成 |
| `packages/mcp/` | MCP 服务、画布宿主(HTTP/WS)、CLI |
| `packages/web/` | React 画布页(框线图 + 列表双视图) |
| `scripts/` | 端到端测试、交互演示驱动、发布准备 |

每块的细节在各目录 `README.md`,整棵树见 [目录说明](目录说明.md)。

## 已知做不到什么

- 终端型 agent(Claude Code/ZCode)没有可嵌入的 UI,画布只能以浏览器页呈现;VS Code 系的
  内嵌 webview 在 Phase 2。
- 连线语义固定:实线 = 执行顺序(顶/底把手),虚线 = 依赖(左/右把手,仅步骤之间);不支持
  一个步骤多个下游的分支图的执行语义(画得上,线性化时按链取首路径)。
- 画布服务不调用任何模型:问题选项、建议内容的质量取决于调用方 agent。

## 环境要求

Node.js ≥ 20(复核:`node -v`);安装依赖需访问 npm registry;运行时零 API key、零外部服务。

## 许可与引用

MIT,见 [LICENSE](LICENSE)。引用格式:`FlowDeck —— AI IDE 计划确认画布,https://github.com/<owner>/flowdeck`。

---

维护:AI 改动本仓库前请读 [AGENTS.md](AGENTS.md)。
