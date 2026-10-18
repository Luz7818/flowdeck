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

## 2026-10-17 · v0.2.4 chip 与节点微交互(丝滑档)

- 问题/建议 chip(画布+列表):悬停放大上浮(`.fd-chip`,pointer:fine 限定)、按下 0.93
  压缩、选中弹性 pop(`.fd-chip-on`,overshoot 0.88→1.07→1),选中对勾从文本前缀改为
  SVG 描画动画(`.fd-check`,pathLength 归一)。
- 画布卡片(含阶段带):入场从匀速 slide-up 换回弹曲线 node-in(0.42s overshoot,
  backwards fill 避免阻断后续 hover transform);悬停抬升 2px;拖拽压缩 0.96 + overlay
  阴影(`.fd-dragging`,NodeProps.dragging 驱动)。列表卡片复用同一悬停手感。
- CSS 优先级注意:全局 `button:active` 按压规则 specificity 高于单类,chip 需
  `button.fd-chip:active` 覆写;`.fd-dragging` 需 `.fd-card.fd-dragging` 压过 hover。
- 变更缘由:用户反馈动效仍欠佳,要求选项卡与流程框「炫酷丝滑灵动」。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(chip 选中态、
  对勾描画、类挂载)。

## 2026-10-17 · v0.2.5 视觉「炫酷档」:极光画布与发光质感

- 环境极光:画布渐变底上叠加蓝/紫/青三团模糊光斑缓慢漂移(`.fd-aurora`,transform 动画,
  `prefers-reduced-motion` 下降级为静态辉光)。
- 发光质感:卡片悬停带类型色辉光(`--glow` 内联注入 hover 阴影第二层,拖拽态同样);
  选中 chip 渐变填充+同色泛光(`.chip-grad-amber`/`.chip-grad-violet`);阶段带 5.5s 斜向
  流光(`.fd-band::after`);选中连线蓝色 drop-shadow 辉光;「确认方案」主按钮改品牌渐变
  (蓝→紫)+泛光(`.fd-cta`),取代纯黑。
- 未答问题/危险风险光环加宽泛光层(halo-pulse 双层阴影)。
- DESIGN.md:视觉风格新增极光与质感语言条目;常驻动画清单从两个扩到四个(极光漂移、
  阶段带流光为新增,已按"先改规范"约定修订)。
- 变更缘由:用户反馈「不够炫酷,要让人有用的欲望」,在 v0.2.4 微交互之上做视觉级升级;
  仍零依赖纯 CSS。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(极光渲染、悬停辉光、
  渐变 chip、流光动画)。

## 2026-10-17 · v0.2.6 细节回应层

- 把手诱导:节点悬停时其全部连线把手放大 1.3(把手自身 hover 仍 1.5),接线入口更醒目。
- 一次性奖励动效:问题被回答时卡片 pop(`.fd-reward`,0.55s 后自清);统计条数字变化时
  单发弹跳(`.stat-pop`,key 驱动)。
- 工具栏:撤销/重做从文本字形 ↶↷ 改为内联 SVG 曲线箭头。
- 玻璃质感:统计条/概览/图例/帮助弹窗四面板加 `.fd-glass` 顶部高光;概览空状态加 logo
  方格插画;列表拖拽 1.2° 倾斜。
- 变更缘由:用户反馈「继续抠细节」。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(类挂载、reward 触发
  与自清、把手过渡)。

## 2026-10-17 · v0.2.7 相机导航:新增聚焦、全览复位、小地图视口框

- 添加模块/建议转步骤:镜头自动飞向新卡(duration 500)+ 新卡选中(旧卡全部取消选中),
  新增内容永远不落在视野外。
- 工具栏新增「全览」按钮(fit-view 图标,回完整视图);此前该能力藏在 xyflow 左下角
  控件里不可发现。
- 小地图:`maskColor` 调淡 + 视口矩形蓝色描边(`maskStrokeColor/#2563eb`)——当前视野在
  缩略图上的对应位置一眼可见。
- 修复相机动画在此环境不生效:该 IAB 的 rAF 完全不回调(0 次/600ms 实测),d3-zoom 时长
  动画永远停在第一帧——挂载时探测 rAF 健康度,不健康时所有相机移动瞬移(duration 0),
  真实浏览器仍走平滑飞行;机理并入 AGENTS.md 已知坑 rAF 条目。
- 变更缘由:用户反馈「新选择/新规划出现时聚焦到该位置、小地图有对应位置显示、可回到
  完整视图」。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(添加后视口移动+新卡
  选中、全览复位、minimap mask 描边)。
