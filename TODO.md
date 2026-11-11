# TODO —— 开发计划与当前进度

> 用途:给开发者与 AI。当前在做哪个模块、每个模块按什么标准验收、接下来做什么。
> 完成一项就勾一项并写明下一项;历史性记录写进 [HISTORY.md](HISTORY.md),这里只留计划。

## 当前进度

- 正在做:M5 六 IDE 自用期(ZCode/Cursor/Claude Code/Qoder/DSH/WorkBuddy 日常实测,
  把发现的问题记进 HISTORY;验证闸门:确认计划时默认想用 FlowDeck)
- M5 进展(实测 2026-11-08,落账 2026-11-09):ZCode 协议级端到端通过(stdio 拉起 dist /
  tools list / 真会话 + 画布 URL 三路一致 / 600s 超时→cancelled 契约 / 取消无存档核验;
  渲染与 confirmed 摘要回流待亲测,亲测提示词见 docs/ide-setup.md 矩阵下注)、Claude Code
  已注册+探活通过、Qoder setup 已写入配置;DSH/WorkBuddy 待实测,模块 6 保持进行中
- 发布轨道推进:0.6.0(2026-11-03 便利轮:把手命中区/双击落点添加/数字键快捷生成/URL
  常打印)、0.7.0(2026-11-04 「都卡手」收敛:初开全览/会话切换器/`flowdeck setup`)、
  0.7.1(2026-11-04 历史页与周边精修)三次发版收口完成;0.8.0(2026-11-06 发布收口:
  画布链接经 MCP logging 进对话侧、历史页重开画布、setup 自动写 rules 片段、doctor
  自检、确认等待默认 600000/0 禁用),`node scripts/prepare-publish.mjs` 打包预演通过;
  只差 npm 发布(需 npm 账号登录,见 prepare-publish 清单)与六 IDE 实测记录;
  0.9.0(2026-11-08:VS Code 系内嵌扩展、宿主 last-session 握手、setup/doctor 覆盖
  Qoder/DSH/WorkBuddy)版本与文档收口完成,同样只差 npm 发布;
  发布材料收口(2026-11-12):publish.yml(OIDC、无 --provenance、仅 workflow_dispatch,
  tag 推送不触发发布)+ README 撤未发布声明 + 本地 tag v0.9.0 + prepare-publish
  清单七步(Trusted Publisher/mcp-publisher 口径)——账号侧动作(npm 首发两包 →
  配 Trusted Publisher → dispatch 首次 CI 发布 → MCP Registry)按清单人工执行
- Phase 2 起步(2026-11-08):模块 8 的代码面完成——`packages/vscode` 内嵌扩展(vsix 已
  打包)、宿主 last-session 握手、守卫 vscode-webview 例外、setup/doctor 覆盖
  Qoder/DSH/WorkBuddy(e2e 34→37);待 Cursor/Qoder 实装验证后收口
- 下一个:M6 公开发布(npm + GitHub)

## 模块计划

| # | 模块 | 验收标准(可验证) | 状态 |
|---|---|---|---|
| 1 | core:schema/图算法/解析/摘要 | `node --input-type=module` 往返/改线/断链/布局四测全 true;`npm run build` exit 0 | 完成 |
| 2 | mcp:present_plan + 画布宿主 | `npm run test:e2e` 含 ALL PASS;存档出现在 `~/.flowdeck/history/` | 完成 |
| 3 | web:框线图画布 | 浏览器实测:节点拖拽、拉线改流程、连线改接/删除、依赖吸附全部可用 | 完成 |
| 4 | 历史查看器 | `node packages/mcp/bin/flowdeck.js history` 打开页面且列表非空 | 完成 |
| 5 | CLI 手动模式 | `node packages/mcp/bin/flowdeck.js docs/demo-plan.md` 弹出画布并回打印摘要 | 完成 |
| 6 | M5 六 IDE 实测矩阵 | docs/ide-setup.md 六个 IDE 各留一条实测记录(唤起/渲染/返回全通过) | 进行中 |
| 7 | M6 npm 发布 | `npm publish` 两包成功;`npx @flowdeck/mcp history` 可用;GitHub 仓库公开 + README 徽章 | 进行中(发布材料就绪:publish.yml OIDC 工作流/清单七步/README 撤声明/本地 tag v0.9.0——2026-11-12,待 npm 账号发布) |
| 8 | Phase 2:VS Code 系内嵌 webview | Cursor/Qoder 内画布渲染与浏览器版一致,确认结果可回流 | 进行中(扩展/宿主握手/守卫例外已实现,待 Cursor/Qoder 实装验证) |
| 9 | Phase 2:复盘页与游戏化结算 | 消费 `~/.flowdeck/history/` 展示确认统计,蓝图卡分享可回链 | 待开始 |

状态取值:待开始 / 进行中 / 待确认 / 完成。

## 完成记录

- [x] core:schema/图算法/解析/摘要 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] mcp:present_plan + 画布宿主 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] web:框线图画布 —— 2026-10-15(细节见 HISTORY.md v0.2.0 条目)
- [x] 历史查看器 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] CLI 手动模式 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
