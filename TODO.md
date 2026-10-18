# TODO —— 开发计划与当前进度

> 用途:给开发者与 AI。当前在做哪个模块、每个模块按什么标准验收、接下来做什么。
> 完成一项就勾一项并写明下一项;历史性记录写进 [HISTORY.md](HISTORY.md),这里只留计划。

## 当前进度

- 正在做:M5 六 IDE 自用期(ZCode/Cursor/Claude Code/Qoder/DSH/WorkBuddy 日常实测,
  把发现的问题记进 HISTORY;验证闸门:确认计划时默认想用 FlowDeck)
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
| 7 | M6 npm 发布 | `npm publish` 两包成功;`npx @flowdeck/mcp history` 可用;GitHub 仓库公开 + README 徽章 | 待开始 |
| 8 | Phase 2:VS Code 系内嵌 webview | Cursor/Qoder 内画布渲染与浏览器版一致,确认结果可回流 | 待开始 |
| 9 | Phase 2:复盘页与游戏化结算 | 消费 `~/.flowdeck/history/` 展示确认统计,蓝图卡分享可回链 | 待开始 |

状态取值:待开始 / 进行中 / 待确认 / 完成。

## 完成记录

- [x] core:schema/图算法/解析/摘要 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] mcp:present_plan + 画布宿主 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] web:框线图画布 —— 2026-10-15(细节见 HISTORY.md v0.2.0 条目)
- [x] 历史查看器 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
- [x] CLI 手动模式 —— 2026-10-14(细节见 HISTORY.md v0.1.0 条目)
