# FlowDeck Canvas(VS Code 系内嵌扩展)

把 FlowDeck 计划确认画布嵌进 VS Code / Cursor / Qoder 的窗口内,确认计划不用切浏览器。

## 工作方式

- MCP 宿主(`@flowdeck/mcp`)每次创建画布会话时把 `{url, sessionId, ts}` 写进
  `~/.flowdeck/last-session.json`;本扩展监听该文件,自动在 IDE 侧边打开一个
  webview 面板,内含指向画布 URL 的 iframe —— 画布全部 JS 与 WebSocket 都留在
  iframe 内(其请求源就是宿主守卫放行的 127.0.0.1),外壳不做任何代理。
- 若 iframe 被宿主拦截,面板内出现「改用 Simple Browser 打开」的兜底入口
  (Simple Browser 同样在 IDE 窗口内)。
- MCP 服务器建议同时设置环境变量 `FLOWDECK_OPEN_MODE=vscode`(MCP 配置的
  `env` 块),抑制默认浏览器自动弹出,避免画布双开。
- 面板打开画布时固定带 `?dir=tb`:窄侧栏里流程竖着走(自上而下);画布工具栏
  随时可切回横排,浏览器里打开则按上次选择记忆。

## 命令

| 命令 | 用途 |
|---|---|
| `FlowDeck: 打开最近画布 / Open Last Canvas` | 手动打开 `last-session.json` 里最近的会话 |
| `FlowDeck: 从 URL 打开画布 / Open Canvas from URL` | 粘贴画布 URL(仅接受 127.0.0.1 / localhost) |

## 构建

```bash
npm run package:vsix   # 仓库根执行,产物 packages/vscode/flowdeck-vscode-<version>.vsix
```

在 VS Code / Cursor / Qoder 里「从 VSIX 安装」即可。本包不发布 npm,也不进入
根 `npm run build` 链与 prepare-publish。
