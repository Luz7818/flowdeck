# 六个 IDE 接入 FlowDeck

> 用途:给要把 FlowDeck 接进某个 AI IDE 的人。每个 IDE 一段可直接粘贴的 MCP 配置、
> 让 agent 主动调用画布的 rules 片段、验证方法与故障排查;文末是 M5 实测记录表。

FlowDeck 是标准 MCP 服务器(stdio),任何支持 MCP 的 AI IDE 都能用。以下路径均替换为你机器上 `flowdeck/packages/mcp/dist/index.js` 的绝对路径。

仓库开发态用本地绝对路径;**发布后无需路径**,把各配置中的 `command`/`args` 换成:

```json
{ "command": "npx", "args": ["-y", "@flowdeck/mcp", "serve"] }
```
(全局安装过 `npm i -g @flowdeck/mcp` 的话,`command` 也可直接填 `flowdeck`,`args` 填 `["serve"]`。)

本仓库当前绝对路径示例(Windows):
```
D:\东南大学\项目\Project\flowdeck\packages\mcp\dist\index.js
```

## 1. ZCode

在 MCP 设置中添加(或编辑 `~/.zcode/mcp.json` 等对应配置文件):

```json
{
  "mcpServers": {
    "flowdeck": {
      "command": "node",
      "args": ["D:\\东南大学\\项目\\Project\\flowdeck\\packages\\mcp\\dist\\index.js"]
    }
  }
}
```

## 2. Cursor

`Cursor Settings → MCP & Integrations → Add Custom MCP`,或编辑 `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "flowdeck": {
      "command": "node",
      "args": ["D:\\东南大学\\项目\\Project\\flowdeck\\packages\\mcp\\dist\\index.js"]
    }
  }
}
```

## 3. Claude Code

```bash
claude mcp add flowdeck -- node "D:\东南大学\项目\Project\flowdeck\packages\mcp\dist\index.js"
```

## 4. Qoder / 5. DSH / 6. WorkBuddy

三家均遵循标准 MCP 配置(JSON 形如上面的 `mcpServers` 块)。在各自设置的 MCP / 工具页添加,command 填 `node`,args 填 dist/index.js 绝对路径。若设置界面要求手动启动,也可直接运行:

```bash
node "D:\东南大学\项目\Project\flowdeck\packages\mcp\dist\index.js"
```

> 注意:stdio 型 MCP 服务器由 IDE 自己拉起,不要在多个 IDE 里手动重复启动进程。

## 让 Agent 主动调用画布(关键一步)

MCP 工具默认不会被 agent 主动想到,建议把下面片段加入各 IDE 的规则文件(Cursor 的 `.cursorrules` / Project Rule,Claude Code 的 `CLAUDE.md`,ZCode 的系统提示/规则等):

```
## 计划确认规范
当你需要在执行多步骤任务前向我确认计划/方案时,必须调用 flowdeck 的 present_plan 工具:
- 把计划拆成模块传入:step(步骤)、group(阶段)、question(需要我决策的问题,给出选项)、
  suggestion(候选方案)、risk(不可逆/高风险操作)、checkpoint(验收标准)、resource(涉及文件)
- 我会在浏览器画布上调整并确认;工具返回的 Markdown 摘要是最终版本,请严格按它执行,
  其中标注"已移除"的步骤不要执行,问题卡的答案视为我的决定
- 如果工具返回 cancelled,改用纯文本方式和我确认
```

## 验证接入是否成功

在 IDE 里说一句:

> 用 flowdeck 把这个计划展示成画布让我确认:1. 初始化项目 2. 安装依赖

浏览器应自动弹出画布页,调整后点"确认方案",IDE 对话中会收到 Markdown 摘要。

## 故障排查

- **页面 404 / 空白**:先 `npm run build -w @flowdeck/web` 生成画布静态文件
- **端口冲突**:默认 7688,被占用自动换随机端口;可用 `FLOWDECK_PORT` 固定
- **浏览器没弹出**:设置 `FLOWDECK_NO_OPEN=1` 后需手动访问服务打印的 URL;Windows 下弹出失败时也会在 stderr 打印 URL
- **agent 不调用工具**:确认 rules 片段已加入,并检查 IDE 的 MCP 工具列表里出现 `present_plan`
- **节点在、连线全无**:窗口被遮挡/最小化导致渲染帧停止,页面置前等 1-2 秒(画布内置兜底会自动补测量,见 `AGENTS.md` 已知坑)

## M5 六 IDE 实测记录

接入后在真实使用中逐项验证,全通过即满足 TODO.md 模块 6 的验收标准。
每行三项:唤起(说一句话能弹画布)、渲染(节点与连线完整)、返回(确认后 IDE 对话收到摘要)。

| IDE | 日期 | 唤起 | 渲染 | 返回 | 备注 |
|---|---|---|---|---|---|
| ZCode | — | ☐ | ☐ | ☐ | |
| Cursor | — | ☐ | ☐ | ☐ | |
| Claude Code | — | ☐ | ☐ | ☐ | |
| Qoder | — | ☐ | ☐ | ☐ | |
| DSH | — | ☐ | ☐ | ☐ | |
| WorkBuddy | — | ☐ | ☐ | ☐ | |
