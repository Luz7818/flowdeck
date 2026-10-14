# Changelog

## 0.1.1 — 真实浏览器交互测试修复

经过真实浏览器(In-app Browser)全旅程交互测试后发现并修复 5 个问题:

1. **Markdown 解析器补全**:💡建议 / ✅检查点(含缩进 criteria)/ 📦资源 三类行此前不识别,缩进的验收标准被误判为独立步骤;现已正确解析
2. **静态资源缓存**:画布服务器未发 `Cache-Control`,index.html 被浏览器启发式缓存导致加载到旧 bundle;现统一 `no-store`(本地工具无缓存需求)
3. **行内编辑首次点击失焦**:contentEditable 在 mousedown 后才翻转,真实用户第一次点击标题后打字无效;现进入编辑态时程序化聚焦并把光标移到末尾
4. **历史页往返丢失编辑**:返回画布时服务器重发 init 把未确认的本地编辑全部重置;现复用客户端实例并忽略后续 init(历史往返、断线重连均保留编辑)
5. **Emoji 代理对切割**:`slice(1)` 把 💡/✅/📦 拆成半个字符留下 U+FFFD;现用 `\p{Extended_Pictographic}` 正则整体剥离

另:发布布局 `web-dist` 优先级曾盖住 monorepo 最新构建(开发态已移除该目录,仅发布脚本生成);dnd-kit 增加 KeyboardSensor(键盘空格抓取 + 方向键移动,无障碍加分);新增 `scripts/manual-session.mjs` 交互测试驱动与 `docs/demo-plan.md` 演示计划。

## 0.1.0 — 首个可交付版本

### MCP 服务(@flowdeck/mcp)
- `present_plan` 工具:接收结构化计划(step/group/question/suggestion/risk/checkpoint/resource 七类模块),自动弹出浏览器画布,确认后返回 JSON + Markdown 双份结果
- 本地 HTTP + WebSocket 画布宿主(默认端口 7688,占用自动回退随机端口)
- 会话不存在时 WS 以 4404 关闭,页面可区分"会话已结束"
- 每次确认自动存档至 `~/.flowdeck/history/`(存档失败不阻塞确认流程)
- 历史查看 API:`GET /api/history`、`GET /api/history/file?name=…`(严格文件名白名单,防路径穿越)
- CLI:`flowdeck open <plan.md>`(Markdown→画布,零 LLM)、`flowdeck history`(浏览器打开历史查看器)
- 环境变量:`FLOWDECK_PORT` / `FLOWDECK_NO_OPEN` / `FLOWDECK_TIMEOUT_MS` / `FLOWDECK_WEB_DIST`
- 发布布局适配:web-dist 三级回退(env 覆盖 → 打包目录 → monorepo 目录)

### 画布(@flowdeck/web)
- 七类模块渲染与交互:步骤勾选/移除、问题选项芯片作答、建议采纳、风险分级、检查点清单、资源标注、分组泳道
- 拖拽排序(dnd-kit,拖拽把手,已移除卡片禁拖)
- 行内编辑步骤标题/详情(commit-on-blur,Enter 提交、Escape 还原)
- 空位插卡(每张卡下方"+ 插入步骤")、AI 建议一键"转为步骤"
- 分组泳道折叠/展开(折叠隐藏成员,组头保留可展开)
- 步骤依赖徽标(展示 agent 提供的 dependsOn,点击移除)
- 全部非步骤类卡片同样支持移除
- 历史查看器页面(`/api/history` 列表 + 摘要详情)
- 中英双语(一键切换,localStorage 记忆)
- 确认/取消后终态页,断线重连

### 核心(@flowdeck/core)
- 计划 schema v1:全类型模块支持 `excluded`;step 支持 `dependsOn`
- 未知模块类型原样保留(schema 演进策略)
- 确定性 Markdown 计划解析(标题/分组/步骤/风险/问题)
- Markdown 摘要生成(删除线标记移除项、双语标注)
