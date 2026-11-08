# 六个 IDE 接入 FlowDeck

> 用途:给要把 FlowDeck 接进某个 AI IDE 的人。每个 IDE 一段可直接粘贴的 MCP 配置、
> 让 agent 主动调用画布的 rules 片段、验证方法与故障排查;文末是 M5 实测记录表。

## 0. 一条命令接入(推荐)

```bash
npx -y @flowdeck/mcp setup              # 自动检测并写入已装 IDE 的配置与 rules 片段
npx -y @flowdeck/mcp setup --ide cursor # 只处理指定 IDE(配置不存在则创建)
```

支持的 id:`zcode`(`~/.zcode/mcp.json`)、`cursor`(`~/.cursor/mcp.json`)、
`qoder`(`~/.qoder/settings.json` 的 `mcpServers`)、`claude-code`(经 `claude mcp add` 写入)、
`vscode`(当前目录 `.vscode/mcp.json`);`dsh` / `workbuddy` 无标准用户级 JSON 配置,
指定时只打印各自的手编指引(见 §5-6)。
仓库开发态自动注册本地 `dist/index.js`,发布态自动用 `npx`——无需手工区分。
命令幂等:已配置则不改动;首次修改前留 `.flowdeck-backup` 备份。ZCode 专供
`--ide` 指定时才会创建缺失配置(避免为未安装的 IDE 留文件)。
setup 还会自动把「让 Agent 主动调用画布」一节的 rules 片段写入 ZCode 的 `AGENTS.md` /
Cursor 的 `.cursorrules` / Claude Code 的 `CLAUDE.md`(当前目录,幂等,首次修改留备份);
Qoder / DSH / WorkBuddy 的 rules 片段则打印在终端供复制(落点见 §4-6)。

下面的分段说明供手工配置或排查用。

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

## 4. Qoder

`flowdeck setup` 自动把 FlowDeck 写入 `~/.qoder/settings.json` 的 `mcpServers`(保留文件里
其他设置,首次修改留 `.flowdeck-backup` 备份)。手编时在设置的 MCP 页添加,或直接编辑该文件:

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

stdio 条目为标准 `command`/`args` 形状;若你的 Qoder 版本设置页要求其他字段,以设置页为准。

## 5. DSH

DSH 没有用户级 `mcpServers` JSON:外部 MCP 服务器以 `@deepseek-ai/dsh-mcp-client` 配置条目接入
(stdio 支持 `command` / `args` / `env` / `cwd`)。在 DSH 应用的 MCP 设置里添加,或在 profile
补丁层 `~/.dsh/profiles/desktop/cordis.patch.yml` 追加一段(发布态把 `command`/`args` 换成
`npx` / `['-y', '@flowdeck/mcp', 'serve']`):

```yaml
- id: flowdeck
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: flowdeck
    transport: stdio
    command: node
    args: ['D:\东南大学\项目\Project\flowdeck\packages\mcp\dist\index.js']
```

重启 DSH 后,画布工具以 `mcp__flowdeck__present_plan` 出现。rules 片段加到
`~/.dsh/AGENTS.md`(DSH 的用户全局 instructions 文件)。

## 6. WorkBuddy

WorkBuddy 没有用户级 `mcpServers` JSON:MCP 服务器经其插件机制接入(agent-plugin 的
`mcp.json` 支持 stdio `command`/`args`),或在设置的 MCP / 工具页粘贴上面的通用
`mcpServers` JSON。rules 片段加到项目 `CODEBUDDY.md`(其 agent 运行时读取的规则文件)。

> 注意:stdio 型 MCP 服务器由 IDE 自己拉起,不要在多个 IDE 里手动重复启动进程;
> 若设置界面要求手动启动,也可直接运行 `node <dist/index.js 绝对路径>` 验证服务本身能起。

## 7. VS Code 系内嵌扩展(可选,画布进 IDE 窗口)

VS Code / Cursor / Qoder 里画布可以不弹浏览器、直接嵌进 IDE 窗口:仓库根执行
`npm run package:vsix` 打出 `packages/vscode/flowdeck-vscode-<版本>.vsix`,在 IDE
扩展面板「从 VSIX 安装」;再把 MCP 配置的 `env` 块加上
`"FLOWDECK_OPEN_MODE": "vscode"`,抑制默认浏览器自动弹出防双开。

工作方式:扩展监听 `~/.flowdeck/last-session.json`(宿主每次创建画布会话都写入
`{url, sessionId, ts}`),会话一建即在侧边打开 webview 面板,内含指向画布 URL 的
iframe;iframe 被拦截时面板内有「Simple Browser 打开」兜底。另有两条手动命令
「FlowDeck: 打开最近画布」「FlowDeck: 从 URL 打开画布」。构建与命令细节见
[packages/vscode/README.md](../packages/vscode/README.md)。

## 让 Agent 主动调用画布(关键一步)

MCP 工具默认不会被 agent 主动想到,建议把下面片段加入各 IDE 的规则文件(Cursor 的 `.cursorrules` / Project Rule,Claude Code 的 `CLAUDE.md`,ZCode 的系统提示/规则等):

ZCode(`AGENTS.md`)、Cursor(`.cursorrules`)、Claude Code(`CLAUDE.md`)三家由
`flowdeck setup` 自动写入(当前目录,幂等);其余 IDE 照手工粘贴:Qoder 加到其规则/系统提示
设置,DSH 加到 `~/.dsh/AGENTS.md`(用户全局),WorkBuddy 加到项目 `CODEBUDDY.md`;
setup 会把片段打印在终端供复制:

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

- **先跑 `npx -y @flowdeck/mcp doctor`**:自检 Node 版本、画布静态产物、历史目录可写(任一失败即退出码 1),并列出各 IDE 的 MCP 配置状态(仅提示,不影响退出码)
- **IDE 对话里没看到画布链接**:画布 URL 会经 MCP logging 通知推送到对话侧,是否直接显示在对话 UI 取决于 IDE——查该 IDE 的 MCP 日志,或复制终端 stderr 打印的画布 URL 重开画布
- **页面 404 / 空白**:先 `npm run build -w @flowdeck/web` 生成画布静态文件
- **端口冲突**:默认 7688,被占用或被系统保留(Windows WinNAT 段)自动换随机端口;可用 `FLOWDECK_PORT` 指定首选端口
- **浏览器没弹出**:画布 URL 始终打印在 stderr,复制到浏览器即可;设 `FLOWDECK_NO_OPEN=1` 则完全不自动弹出
- **agent 不调用工具**:确认 rules 片段已加入,并检查 IDE 的 MCP 工具列表里出现 `present_plan`
- **节点在、连线全无**:窗口被遮挡/最小化导致渲染帧停止,页面置前等 1-2 秒(画布内置兜底会自动补测量,见 `AGENTS.md` 已知坑)

## M5 六 IDE 实测记录

接入后在真实使用中逐项验证,全通过即满足 TODO.md 模块 6 的验收标准。
每行三项:唤起(说一句话能弹画布)、渲染(节点与连线完整)、返回(确认后 IDE 对话收到摘要)。
末行「扩展内嵌」对应 TODO.md 模块 8 的验收(画布渲染与浏览器版一致、确认结果回流),
唤起指会话创建后 IDE 内自动开面板。

| IDE | 日期 | 唤起 | 渲染 | 返回 | 备注 |
|---|---|---|---|---|---|
| ZCode | 2026-11-08 | ☑(协议级) | ☐ | ☐ | 协议级端到端通过(探针经 stdio 直连 MCP):stdio 拉起 dist/index.js 完成 initialize 握手(`~/.zcode/mcp.json` 指向最新 dist,src 无新于 dist 的改动)、tools list 含 present_plan、真会话创建且画布 URL 经 logging 通知(`src/index.ts:66`)/stderr(`src/browser.ts:15`)/last-session.json 三路一致;端口漂移实测复现(7688 被长期 CLI 进程占用 → EADDRINUSE 回退随机端口,`src/canvas-server.ts:289-293` 告警),断言未写死端口。用户未亲测画布操作,默认 600s 等待超时兜底产生 cancelled(实测 waitedMs≈600079,与 `src/canvas-server.ts:13` DEFAULT_TIMEOUT_MS=600_000 一致);取消路径不写档(archive 仅确认时调用,`src/canvas-server.ts:430`),实测 history 零新增。渲染与 confirmed 摘要回流待亲测——用户在真 ZCode 对话里的亲测提示词见下 |
| Cursor | — | ☐ | ☐ | ☐ | |
| Claude Code | 2026-11-08 | ☐ | ☐ | ☐ | 已注册+健康探活通过:`claude mcp add --scope user flowdeck -- node <dist 绝对路径>` 写入 ~/.claude.json(读回一致,与 ZCode 指向同一 dist);`claude mcp list` → ✔ Connected(exit 0,实际拉起 dist 完成 stdio 握手)。应用内亲测待补 |
| Qoder | — | ☐ | ☐ | ☐ | setup 已写入 ~/.qoder/settings.json 的 mcpServers(doctor 提示 ✅),应用内实测待补 |
| DSH | — | ☐ | ☐ | ☐ | 待实测(doctor 已检测到安装,需应用内手动接入,见 §5) |
| WorkBuddy | — | ☐ | ☐ | ☐ | 待实测(doctor 已检测到安装,需应用内手动接入,见 §6) |
| 扩展内嵌(Cursor/Qoder/VS Code) | — | ☐ | ☐ | ☐ | 需先装 vsix 并设 `FLOWDECK_OPEN_MODE=vscode`(见 §7) |

> ZCode 亲测提示词(补上表 ZCode 行「渲染/返回」两格,在真 ZCode 对话里说):
> 「用 flowdeck 的 present_plan 给我出一个『周末大扫除』计划,分两个阶段,带一个要我做决策的问题」
> 预期:agent 调 present_plan 后拿到画布地址(端口不固定,以 agent 报出的实际 URL 为准),
> 浏览器打开画布调整步骤、回答问题卡、点「确认方案」;确认后 agent 收到的 Markdown 摘要是
> 最终版本并严格按它执行;超过 10 分钟未操作(默认 `FLOWDECK_TIMEOUT_MS=600000`,设 0 禁用)
> 工具返回 cancelled,agent 按「计划确认规范」退回纯文本确认。
