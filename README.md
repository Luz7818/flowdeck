# FlowDeck

> 把 AI IDE 对话中"确认任务流程/方案"这一步,从纯文本变成可拖拽、模块化、清晰的画布。

FlowDeck 是一个 **MCP 服务器 + 框线图画布**:当 AI 编程助手(Cursor / Claude Code / ZCode / Qoder / DSH / WorkBuddy…任何支持 MCP 的环境)在执行前需要你确认计划时,它不再抛给你一屏文字,而是自动弹出一张**节点流程图**——

- **框线图**:AI 把计划拆成模块节点铺在画布上,实线箭头串起执行顺序,虚线表示依赖
- **自由拖拽**:节点任意移动安排流程;**拉线改顺序**:从底部把手拖到另一节点顶部即改写执行链
- **自己加流程**:工具栏添加 7 类模块(步骤/问题/建议/风险/检查点/资源/阶段),自动接入链尾
- **待确认问题卡**:agent 的澄清问题变成选项芯片,点一下就是答案
- **AI 建议卡**:一键采纳或转为流程节点
- **分组阶段带 / 小地图 / 自动整理**:大计划也不迷路
- **列表视图**:可切换回传统纵向列表,两视图编辑同一份数据

点"确认方案",画布上的连线顺序被线性化成 **JSON(机器执行)+ Markdown 摘要(人类留痕)** 自动流回 IDE 对话——全程零复制粘贴。每次确认自动存档到 `~/.flowdeck/history/`,并可通过 `flowdeck history` 回看。

**零 LLM 依赖、零 API key**:画布服务只做渲染与回传,智能由你的 IDE agent 提供。

## 快速开始

```bash
# 构建(core → web → mcp)
npm install
npm run build

# 无头端到端自测(模拟 MCP 客户端 + 浏览器确认,覆盖拖拽重排/插卡/移除/历史)
npm run test:e2e

# 手动模式试玩:把 Markdown 计划变成画布(确定性解析,不经 LLM)
node packages/mcp/bin/flowdeck.js my-plan.md
# 或从 stdin:
echo "# 部署\n- 构建\n- 上传" | node packages/mcp/bin/flowdeck.js

# 浏览历史确认记录
node packages/mcp/bin/flowdeck.js history
```

## 接入你的 AI IDE

在 IDE 的 MCP 配置中添加(以 ZCode 为例,Cursor / Claude Code 同理):

```json
{
  "mcpServers": {
    "flowdeck": {
      "command": "node",
      "args": ["/绝对路径/flowdeck/packages/mcp/dist/index.js"]
    }
  }
}
```

然后建议在系统提示/规则文件中加入引导,让 agent 主动使用画布:

```
当你需要在执行前向用户确认任务流程或方案时,调用 flowdeck 的 present_plan 工具,
把计划拆成 step / group / question / suggestion / risk / checkpoint / resource 模块传入,
以画布返回的 Markdown 摘要为最终执行依据。
```

详见 [docs/ide-setup.md](docs/ide-setup.md)(六个 IDE 的逐一配置)。

## 画布模块类型(schema v1,可扩展)

| type | 用途 | 关键字段 |
|---|---|---|
| `step` | 可执行步骤 | `title` `detail?` `excluded?` `dependsOn?[]` |
| `group` | 分组/里程碑泳道头 | `title` `note?` `collapsed?` |
| `question` | 待确认问题(选项芯片) | `question` `options[]` `answer?` |
| `suggestion` | AI 候选方案 | `title` `detail?` `adopted?` |
| `risk` | 风险/不可逆操作 | `note` `level: info\|warn\|danger` |
| `checkpoint` | 验收检查点 | `title` `criteria[]` |
| `resource` | 涉及文件/目录/服务 | `label` `kind?` `path?` |

除 `group` 外所有类型均支持 `excluded`(用户在画布上移除)。未知 `type` 会被原样保留——旧版画布不会丢掉新版 agent 的模块,这是 schema 演进策略。

## 发布

```bash
node scripts/prepare-publish.mjs   # 全量构建 + 打包画布进 mcp 包 + pack 演练 + 打印清单
```

详见 [CHANGELOG.md](CHANGELOG.md)。

## 环境变量

| 变量 | 说明 |
|---|---|
| `FLOWDECK_PORT` | 固定画布服务端口(默认 7688,被占用时自动换随机端口) |
| `FLOWDECK_NO_OPEN` | 设为 `1` 时不自动打开浏览器(测试用) |
| `FLOWDECK_TIMEOUT_MS` | 确认等待超时,超时按 cancelled 返回 |
| `FLOWDECK_WEB_DIST` | 覆盖画布静态文件目录 |

## Roadmap

- [x] **M1** MCP 服务 + `present_plan` + 画布渲染 + 确认闭环 + 存档 + CLI 手动模式
- [x] **M2-M3** 编辑能力(列表:拖拽/行内编辑/插卡;全类型移除、折叠、依赖)
- [x] **M4** 历史查看器、发布布局、双语
- [x] **v0.2** 框线图画布(React Flow):节点+连线+自由拖拽+拉线改流程/加依赖+添加模块+自动整理
- [ ] **M5** 六 IDE 实测矩阵打磨(自用期,进行中)
- [ ] **Phase 2** Cursor/Qoder 内嵌 webview、分支/汇聚图形化、复盘页 + 游戏化结算

## License

MIT
