# HISTORY —— 版本更新记录

> 用途:记录每次版本、规范与架构变更的内容和缘由。只追加,禁止删除或改写既有条目;
> 写错了就追加一条更正。新条目写在文件末尾。
> 本文件由仓根 `CHANGELOG.md` 迁移而来(2026-10-15,并入工作区文档体系《项目整体规范.md》),
> 原 CHANGELOG 的各版本条目已转为下方带日期条目,原文件删除。

## 2026-10-14 · v0.1.0 首个可交付版本

- MCP 服务 + `present_plan` 工具 + 浏览器画布 + 确认闭环 + 本地存档 + CLI 手动模式
  (复核:`npm run test:e2e`,预期含 ALL PASS)。
- 三包 monorepo(core/mcp/web),计划 schema v1 七类模块,未知类型原样保留。
- 变更缘由:按用户构想立项——把 AI IDE 的计划确认步骤做成可视化模块化画布;先自用后发布。

## 2026-10-14 · v0.1.1 真实浏览器交互测试修复

- 五项修复:Markdown 解析器补全(💡/✅/📦 与缩进 criteria)、静态资源 no-store、
  行内编辑首次点击聚焦、历史页往返丢失编辑、emoji 代理对切割。
- 变更缘由:无头 e2e 之外补真实浏览器全旅程测试,暴露了五个只在前端交互层出现的问题。

## 2026-10-15 · v0.2.0 框线图画布

- 核心交互从"可排序卡片列表"重构为 React Flow 节点框线图:实线执行链 + 虚线依赖、
  自由拖拽、拉线改流程、添加模块、自动整理;core 新增 `graph.ts`(chainFromOrder /
  linearizePlan / defaultLayout),schema 全类型支持 `pos`;core 改用 Web Crypto 以便浏览器打包。
- 变更缘由:用户反馈列表式与原始构想(框线图、AI 铺流程、拖动安排)不符,按构想重构。

## 2026-10-15 · v0.2.1 界面丰富化与无帧测量兜底

- 新增统计条、概览面板(点击定位)、图例条、操作提示、帮助按钮;阶段色彩系统与节点美化。
- 修复遮挡/最小化窗口渲染帧停止导致的连线消失:轮询 + `updateNodeInternals` DOM 直读兜底。
- 变更缘由:用户反馈界面太空;排查中发现环境级渲染帧问题,顺手做成健壮性升级。

## 2026-10-15 · 连线编辑

- 点选连线变蓝并浮出 × 删除按钮;`edgesReconnectable` + `onReconnect` 支持拖拽端点改接
  (链线保持链语义,依赖线同步更新两端 `dependsOn`);Delete/Backspace 删除;操作提示加第五条。
- 变更缘由:用户反馈已连上的线无法编辑。

## 2026-10-15 · 依赖把手修复

- 依赖把手加大加亮(hover 放大 + tooltip);`isValidConnection` 放宽到节点级校验 +
  `connectionRadius 40` 自动吸附;自动布局列间距 270→332,给左右把手留出可拖拽空间。
- 变更缘由:用户反馈左右把手无法连线——根因是把手过小、松手要求像素级瞄准、节点间隙过挤。

## 2026-10-15 · 文档体系按工作区规范建齐

- 按《项目整体规范.md》新档九件建齐:AGENTS/README/HISTORY/TODO/目录说明 + docs 五件,
  另建 `DESIGN.md`、`docs/DEPLOYMENT.md` 与 `packages/`、`scripts/` 板块说明;
  原 `CHANGELOG.md` 并入本文件后删除;四份 `package.json` 版本号对齐 0.2.1
  (复核:`node -p "require('./packages/mcp/package.json').version"`)。
- 变更缘由:遵循工作区文档标准,机器可判部分由 `python check_docs.py flowdeck` 把关。

## 2026-10-17 · v0.2.2 视觉质感与体验升级

- 设计 token 体系(`index.css` Tailwind 4 `@theme`):统一缓动 ease-out-expo/overshoot、
  三档双层阴影(card/lift/overlay)、微字号刻度 text-2xs/text-3xs;全局按压反馈(按钮
  active scale 0.97)、`:focus-visible` 焦点环、细滚动条、`::selection`、EditableText
  占位符 CSS(修复 `data-placeholder` 此前无规则、占位符永不显示)。
- 画布:节点入场 stagger(40ms 递增)、实线 draw-in / 虚线 fade-in(仅新边)、xyflow
  Controls/MiniMap 重塑为圆角毛玻璃语言;风险 severity 三档徽章(画布此前 info/warn 无任何
  区分)、问题选项 chips 加大热区并带选中对勾、组带 glyph 修复(`GLYPH.group` 此前 undefined
  渲染为空);移除节点顶部类型色条,类型色由徽章+边框承载(消除同卡双调色板,DESIGN.md 同步)。
- 浮层:帮助弹窗加遮罩/Esc/点外关闭,palette 加类型图标 + origin-aware 入场 + Esc/点外
  关闭,概览面板行截断 + 自定义滚动条;统计条去掉 `animate-pulse`(常驻动画收回为两个光环)。
- 应用骨架:header logo 徽章 + 滑动指示分段切换器、视图切换交叉淡入、footer z 层修复,
  Splash 终态入场动画 + 确认成功态勾选描画;列表卡片与 History 行 stagger,History 页
  sticky 毛玻璃头部 + 骨架加载 + 日期本地化。
- 体验:取消加二次确认弹层(此前一键立即终止、无撤销);新模块默认文案跟随 UI 语言(此前
  硬编码双语);EditableText 键盘可达(Tab 聚焦、Enter 进入编辑);删除钮触屏常显;
  `FLOWDECK_NO_OPEN=1` 时按 GET-START 承诺打印画布 URL(此前静默返回,headless 拿不到地址)。
- 变更缘由:用户反馈「页面原始粗糙」,按 apple-design / emil-design-eng 规范做质感升级;
  方向定为精修现有浅色风、动效取「更生动」档位——DESIGN.md「动效克制」条目随之修订为
  动效系统规范,零新依赖(纯 CSS,守零外部服务承诺)。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 真实浏览器全旅程走查
  (画布/列表/历史/取消确认/Esc 关闭)。

## 2026-10-17 · v0.2.3 画布撤销/重做 + 长内容防护 + 概览跳转高亮

- 撤销/重做:画布全部操作(节点拖拽、接线/改接/删线、模块编辑与勾选、添加模块、自动整理)
  统一快照可回退,Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y + 工具栏 ↶↷ 按钮;文本编辑焦点内不劫持
  原生撤销;50 步上限;× 删线改走 `deleteElements`,依赖线删除与 Delete 键路径一致地清理
  `dependsOn`。
- 修复 xyflow 恢复渲染缺陷:受控 `setEdges` 整表恢复会给"端点在上一状态缺失"的边留下失效
  内部状态(典型: redo 加回模块后连线永不出现,且对清空重建/改 id/重推免疫,表现非确定)。
  撤销/重做改为重挂载 `<ReactFlow>`(key=flowEpoch)从快照重建内部状态,并重置测量兜底开关
  (节点全部未测量时轮询重测);兜底轮询 700→300ms。细节记入 AGENTS.md 已知坑。
- 长内容防护:画布节点标题/详情/问题/建议/风险/资源按行数截断(line-clamp),点击展开,
  全站卡片 `[overflow-wrap:anywhere]` 断行,超长 agent 输出不再破版。
- 概览面板跳转:点条目后节点同时选中(蓝 ring)+ 镜头居中,可立即定位。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 真实浏览器两轮混合回归
  (回答/添加/整理 × 撤销/重做交错,连线数量逐步断言全对)。
