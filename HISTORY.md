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

## 2026-10-17 · v0.2.8 发布准备(M6 前置)

- CLI:新增 `flowdeck serve` 子命令(启动 MCP stdio 服务器,`npx -y @flowdeck/mcp serve`
  即 IDE 配置入口);修复帮助文档承诺的 `flowdeck open [plan.md]`——原实现会把 "open"
  当文件名读必然 ENOENT,现在 `open` 后接文件名或缺省走 stdin。
- 发布元数据:@flowdeck/mcp 与 @flowdeck/core 补 `license`(MIT)、`engines`(node>=20)、
  `publishConfig.access=public`(scoped 包必需)、repository/homepage/bugs/keywords;
  mcp 对 core 的依赖从 `*` 锁定为 `^0.2.8`。
- README:新增「安装与 MCP 接入」章节(npx/全局安装/MCP 配置 JSON,发布形态优先于仓库
  路径)、npm 三徽章;引用 URL 占位符 `<owner>` → Luz7818。
- 文档同步:TODO.md M6 验收命令改为 `npx @flowdeck/mcp history`;AGENTS.md 核心功能补
  serve 入口;DEPLOYMENT.md 示例版本对齐并补 npx 形态;ide-setup.md 补发布后的无路径
  配置变体;prepare-publish 检查单修正陈旧注释与验证命令。
- 变更缘由:用户指示「依次完成」npm 发布差距清单;本批为其中代码侧全部项。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ `node packages/mcp/bin/flowdeck.js
  serve` 冒烟(进程常驻等待 stdio)+ pack 演练。

## 2026-10-17 · v0.2.9 「深度体验」轮批次 A:痛点清零

- line-clamp 修复:动态插值 `line-clamp-${lines}` Tailwind 永不生成——长内容防护与点击
  展开自 v0.2.3 起实际失效;改静态映射 CLAMP(审计发现,自省条目)。
- 连接韧性:ws `send` 前置 `readyState` 检查 + try/catch(此前断线时确认会抛
  InvalidStateError 且按钮永久卡死);CanvasClient 指数退避自动重连(1s→15s 封顶,5 次
  上限后停在错误横幅交还手动重试,4404 会话消失直接终态);断线横幅从列表分支提升为
  双视图共享;header 加连接状态点;确认按钮 waiting 期加 spinner + 10s 超时复位。
- 画布排除:非步骤卡 header 悬停 ×(语义同列表排除,进撤销栈);已排除非步骤卡显示
  「恢复」chip;选中节点按 Delete = 排除 + 首次提示 toast(模块是排除而非删除)。
- IME:EditableText 与 InsertCard 的 Enter/Escape 补 `isComposing`/229 守卫——中文
  输入法确认组词不再误提交。
- 布局:MiniMap/Controls/图例从 bottom-3/14 提升到 bottom-16,脱离 footer 重叠区。
- 开发注意:prepare-publish 留下的 `packages/mcp/web-dist` 会盖住新构建(AGENTS.md 已知坑
  应验),开发态验证前先删除该目录。
- 变更缘由:「深度体验」轮批次 A,审计驱动的痛点清零。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(clamp=3 生效、× 排除
  → 恢复 chip、Delete 排除 + toast + 撤销恢复、断线横幅/重连梯/状态点)。

## 2026-10-17 · 「深度体验」轮批次 B:流畅度深化

- 动效去伪:undo/redo 重挂载不再重播入场 stagger 与连线 draw-in(`entrance` 上下文,
  flowEpoch>0 时 FDNode/WireEdge 跳过);程序化新增节点跳过 stagger(`fresh` 标记)。
- Tidy 重排滑行:布局替换时挂 `.fd-relayout`(节点 transform 0.35s 过渡),拖拽中跳过。
- 浮层退场:palette/tips/取消确认改常挂 + `fd-pop`/透明度过渡驱动,进入与退出都有动画。
- Overview 折叠 `grid-template-rows 0fr↔1fr` 过渡(列表组折叠动画延后——画布折叠在批次 C
  落地后列表将跟随统一)。
- 视图切换真交叉淡入:双视图常挂 + 透明度过渡,顺带消灭了切回流程图时的重挂载(状态不再丢)。
- 画布手感:`panOnScroll` + `zoomOnPinch` + `zoomOnScroll=false`(滚轮平移/捏合缩放,
  Figma 预期);`selectionOnDrag` + `panOnDrag=[1,2]` 框选;缩放百分比 chip(点击回 100%);
  tips 第 6 条。
- 细节:SortableCard 倾斜/缩放移到内层(修 dnd-kit 内联 transform 覆盖类 transform 的死
  效果);边选中辉光加 filter 过渡;minimap 入场淡入。
- 按 find-animation-opportunities 门筛拒绝项:palette 键盘导航不加动画(高频)、把手 hover
  不再加动效(已有缩放)、列表组折叠动画延后。
- 变更缘由:「深度体验」轮批次 B。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(undo 后入场类清零、
  fd-pop 常挂、缩放 chip 实时、概览 0fr/1fr)。

## 2026-10-19 · 「深度体验」轮批次 C:阶段泳道与导航整合

- 阶段泳道(旗舰):组从浮动色带改为 `parentId` 容器——淡染相位区域包裹成员卡,区域随成员
  包围盒自适应(`normalizeGroups`),拖组成员带动区域生长;画布折叠=成员 `hidden` + 区域缩回
  头带尺寸,与列表折叠语义统一;计划/schema 保持绝对坐标,FlowView 内做相对↔绝对转换层,
  core 与 e2e 零改动;小地图按相位色渲染,成为相位图。
- 顶部玻璃 dock:工具栏与统计条合并为单一居中毛玻璃条(添加模块 | 撤销/重做 | 整理 | 全览 |
  帮助 | 缩放% ‖ 步骤/阶段/待确认/风险/已移除 + 进度),漂浮面板 4→3;tidy/help 图标化。
- 列表与画布一致:组 pill 按相位色着色、成员卡左 3px 相位色边、编号口径统一(排除不计);
  新增「已移除 (n)」托盘抽屉(一键恢复)。
- Tips onboarding 视觉化:微图解卡(SVG 演示链线/依赖线/泳道/添加),`tips.seen.v2` 让
  老用户重看一次;帮助/整理改图标按钮。
- 修复:双视图常挂后列表编辑不再回流画布(planRev 重建信号,相机保持);process 重构期
  曾引入 render-phase setState 导致 React #301 无限重渲染,已修并记取教训——脚本化重放
  改动后必须逐点验证语句归属。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ 浏览器实测(泳道渲染/尺寸、dock
  单行、列表阶段色与托盘、画布↔列表双向同步、折叠联动)。

## 2026-10-19 · v0.3.0 「深度体验」轮批次 D 清扫 + 版本收口

- i18n:连线把手 title 从硬编码双语改为跟随界面语言(dict.hIn/hOut/hDepIn/hDepOut)。
- a11y:问题/建议 chip 与排除勾选补 `aria-pressed`;概览折叠与列表组 pill 补
  `aria-expanded`;tips 弹窗补 `role=dialog` + `aria-modal` + `aria-label`。
- 一致性:清理 4 处 `transition-colors` 残留(它们覆盖全局按钮过渡导致按压反馈瞬变);
  列表可见行判断 O(n²) `includes` → Set。
- 边界:index.html 补 meta description + theme-color。
- 版本收口 0.3.0:本「深度体验」轮累计四批(0.2.9 痛点清零 / 流畅度 / 阶段泳道与 dock /
  本批清扫),含结构性大改(泳道容器、双视图常挂、连接韧性),按语义化版本升次版本号。
- 变更缘由:用户要求「美观酷炫、流畅、无痛点」的前端深度轮,审计驱动的收尾。
- 复核:`npm run build` + `npm run test:e2e`(ALL PASS)+ check_docs 零阻断。

## 2026-10-20 · 发布就绪轮:宿主韧性修复 + 后端瘦身

- 端口韧性:固定端口被占用(EADDRINUSE)或被 Windows WinNAT 保留段拦截(EACCES,本机
  实测 7779–7978 段)统一回退随机空闲端口并告警;并修复回退路径的隐患——Node 失败的
  listen 会遗留已注册的 'listening' 回调,重试成功后旧回调抢先 resolve 首选端口,导致打印
  的画布 URL 指向死端口(原 EADDRINUSE 回退路径同样中招)。e2e 改为从 stderr 解析画布
  URL(端口 + 会话 id 一次拿到),删除固定端口轮询,机器无关。
- IDE 断连退出:StdioServerTransport 在 stdin 结束时不触发 onclose(SDK 行为),宿主进程
  随每次 IDE 会话残留为僵尸;现在直接监听 `process.stdin` end,`stop()` 结清会话/连接后
  自然退出(unref 兜底计时器;强杀 `process.exit` 会触发 Windows libuv teardown 断言)。
- 工具调用取消:present_plan 接入 `extra.signal`——IDE 侧取消请求即结清画布会话并按
  cancelled 收尾,浏览器页同步收到取消态(实测 /sessions 随之清空)。
- 版本与依赖:MCP server 注册版本从硬编码 0.1.0 改为运行时读 package.json(消除漂移);
  mcp 对 core 的依赖规格 ^0.2.8 → ^0.3.0(发布阻塞项)。
- CLI:补 `--help/-h` 与 `--version/-v`;顺带吞掉 stdout EPIPE(管道下游提前关闭不再崩)。
- 简化:core 新增 `moduleLabel`(模块展示标题的唯一来源),summary 与 web 列表视图共用;
  MCP inputSchema 直接复用 core 的 `PlanModuleSchema`(删 7 个重复导入);web 抽出共享
  `newId`(id.ts),App/FlowView 两份重复实现合一;i18n 清理 6 个无引用键
  (questionHint/criteria/collapse/expand/edit/statsDeps)。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS)+ 专项验证(被保留端口
  回退后 URL 与实际监听一致且 healthz 200;notifications/cancelled 后 /sessions 清空;
  stdin 结束后子进程 exit 0)+ `flowdeck --version/--help` + 无头 open 实测。

## 2026-10-20 · 发布差距清零轮(Registry/CI/历史页/响应式)

- MCP Registry:新增根 `server.json`(2025-10-17 schema,npm 包 + stdio 传输 + 环境变量说明);
  `prepare-publish.mjs` 发布准备时把 `server.json` 版本与 `packages/mcp/package.json` 自动对齐,
  发布清单补 Registry 登记步骤。
- CI:新增 `.github/workflows/ci.yml`(ubuntu/windows 矩阵,npm ci → rebuild esbuild →
  build → e2e;rebuild 步骤对应 AGENTS.md 已知坑的 esbuild postinstall 拦截)。
- 历史查看器:摘要一键复制(回退纯文本确认时粘回 IDE 用);条目两步确认删除,后端新增
  `DELETE /api/history/file`(与 GET 共用同一文件名白名单);e2e 补删除/再删 404/DELETE
  穿越拒绝四条断言。
- 版本可见:宿主版本号随 WS init 与 /healthz 下发,画布 tips 弹窗显示 `FlowDeck v<版本>`,
  用户可核对画布与 CLI 版本是否一致。
- 窄窗口收纳:header logo 磁贴 <sm 隐藏;画布顶部 dock 的统计区 <md 隐藏、缩放百分比 <sm
  隐藏;概览面板 <md 隐藏;图例栏允许换行并限宽——IDE 内嵌窄面板不再溢出(浏览器人工
  冒烟待做)。
- 工具文案中性化:present_plan 确认/取消返回改为英文在前、中文在后的双语(与摘要风格一致)。
- 稳定性收尾:宿主 JSON API 统一 `Connection: close`,e2e 改为自然退出(unref 兜底),
  消除 Windows 上 `process.exit` 触发的 libuv teardown 断言噪音。
- 代码分割:vite manualChunks 拆 vendor-react / vendor-canvas / vendor-dnd,主包不再超
  500kB 警戒线。
- 深色模式:明确不做进本批——属 DESIGN.md 的主题级设计决策,需独立批次(设计 + 全界面
  视觉回归),不在发布差距清零轮夹带。
- 复核:`npm run build`(exit 0,四 chunk 全部低于警戒线)+ `npm run test:e2e`(ALL PASS,
  19 断言,Windows 本机结尾无 libuv 断言)+ `flowdeck --version/--help` + 无头 open 实测。

## 2026-10-20 · 深色模式(独立批次)

- 策略:class 变体(Tailwind 4 `@custom-variant dark`,`@theme` 阴影变量在 `.dark` 域整体
  加重);默认跟随系统,header 日/夜按钮手动切换并记忆(`flowdeck.theme`);`index.html`
  boot 脚本在首帧前落 `.dark`,无闪烁;theme-color meta 拆亮/暗双份(media 查询)。
- 色板定稿入 DESIGN.md:基底 zinc-950 / 表面 zinc-900 / 发丝线 zinc-800,类型语义色保持
  (徽章 `*-500/15` + `*-300` 字);连线颜色改走 `--fd-chain-stroke`/`--fd-dep-stroke`
  CSS 变量(亮暗互换),点阵与小地图遮罩随 `useIsDark`(MutationObserver 订阅 class)切换;
  极光/辉光/流光/光环在暗底原样保留。
- 覆盖面:画布卡、泳道带、dock、概览、图例、tips、toast、palette;列表全部卡型 + 插入行 +
  已移除托盘;历史页(列表/详情/骨架/空态);header/footer/横幅/Splash;xyflow 控件与
  小地图 chrome;滚动条、选区、placeholder。
- 顺手:`aria-pressed` 落到主题切换钮;DESIGN.md「别动」新增连线颜色必须改 CSS 变量的约束。
- 复核:`npm run build`(exit 0,产物 CSS 含 434 处 dark 选择器、双值 CSS 变量、boot 脚本)+
  `npm run test:e2e`(ALL PASS)。浏览器双主题人工冒烟待做(自动化只覆盖数据层)。

## 2026-10-20 · 单一画布 + 自由分支图(用户实测反馈轮)

- 移除列表视图(用户反馈「双轨割裂」):画布成为唯一编辑面。删 `ModuleCard`/`SortableCard`/
  `InsertCard` 与 dnd-kit 三依赖,App 删 view 切换器与 planRev/registerCommit 双向同步
  (净删约 700 行);`EditableText` 迁为独立组件。状态流单向化:画布经 `onStats` 上报
  header 统计(带变更护栏,拖拽帧不刷父级)、确认时经 `registerCommit` 拉取线性化计划——
  顺带修掉旧双视图下画布编辑不刷新 header 计数的暗病;ARCHITECTURE 的「双视图同步边界」
  已知问题删除。
- 自由分支图(用户反馈「流程图应自由画」):`linearizePlan` 从单链游走升级为多起点 DFS
  前序——起点取全部无入边节点(原序),多出线按目标原序 tiebreak(连线创建顺序不进语义),
  菱形/多起点天然支持,断链节点按原顺序追加(「绝不丢模块」契约保持),整图成环时以首模块
  为伪起点;线性链输出与旧行为完全一致。画布侧 `onConnect` 不再清除同源/同目标链线
  (分支直接画),链把手支持反向起笔(in/out 均可 start/end)。
- 开场聚焦(用户反馈「从实际的第一个框开始」):打开画布相机 snap 到计划入口节点
  (复用 focus 坐标算法,免测量、dead-rAF 安全),「全览」按钮与小地图承担全局导航。
- 测试:e2e 改为模拟真实画布序列化(建链线 → `linearizePlan`),新增分支 DFS 顺序与
  「未连线模块追加在后、不丢」两条断言(19→21);core 六场景行为验证(线性链兼容/分支/
  菱形/多起点/成环/确定性)。
- 复核:`npm run build`(exit 0,三分包;vendor-dnd 消失,应用包 135→126 kB)+ 图算法
  六场景脚本 + `npm run test:e2e`(ALL PASS,21 断言)。浏览器人工冒烟待做。

## 2026-10-20 · 动效精修轮(确认仪式 + 交互态反馈)

- 修 bug:历史页从「卸载重挂」改为全屏 overlay——旧实现路由切走即卸载画布,画布上的
  编辑(唯一副本)全部丢失,返回后看到的是 stale 计划;现在画布保持挂载(visibility 隐藏),
  往返后编辑原样还在。
- 确认仪式(每会话一次的惊喜预算):点「确认方案」→ 卡片按链序依次泛翡翠环光
  (波次索引 stamp 到节点数据,70ms/张 stagger,拖拽冻结),画布保持约 0.95s 后交叉淡入
  成功 Splash,Splash 勾选磁贴外圈单发环爆发;取消路径不庆祝、即时落 Splash。
- 交互态反馈:拖新连线时预览虚线 dash 行进(0.5s);选中节点时全部把手呼吸脉冲
  (1.8s,邀请接线);全部待确认问题答完的一瞬,确认按钮双弹脉冲 + 辉光转翡翠
  (one-shot);连线上悬停加极淡辉光提示可点选。
- 入场精修:node-in 加 1.2° 旋度沉降(overshoot 收尾);palette 展开菜单项 30ms 级联、
  概览面板展开 45ms 级联;画布最上层加静态镜头暗角(亮/暗两套),点阵与节点边缘微收,
  提供景深(零动画)。
- 依据:find-animation-opportunities 四道门(频率/目的/预算/功能)收敛候选;标杆对齐
  tldraw 连接反馈、FigJam 连接器手感、Linear/Raycast 克制微交互。常驻动画仍四个不变;
  新增均为交互态或一次性,`prefers-reduced-motion` 全部继承降级。DESIGN.md 动效系统
  已改写为 2026-10-20 口径。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS)。确认波/暗角/级联为
  视觉层,浏览器人工冒烟待做。

## 2026-10-29 · 画布操作效率轮(流程逻辑补全 + 交互增强 + 动效精修)

- 流程逻辑补全:阶段泳道加折叠/展开按钮(此前 collapsed 只有数据字段、无 UI 入口,
  列表视图移除后彻底无法折叠);checkpoint/suggestion/resource 标题改为行内可编辑
  (此前手动添加的这三类模块只能删掉重加);question 卡支持自定义答案(行内输入,
  新选项即选中——agent 给的选项不必然覆盖使用者的想法)。
- 搜索定位:dock 新增搜索按钮(Ctrl+F / Ctrl+K),输入即过滤模块(标题/问题/备注/
  标签/详情全文),结果点击或 Enter 飞向卡片并选中。
- 撤销/重做保留相机:重挂载 <ReactFlow> 前保存 transform,以 defaultViewport 复原
  (此前每次 undo/redo 视口跳回默认位置)。
- 新模块即写即得:添加模块后标题自动进入编辑态(data.fresh 驱动 EditableText
  autoEdit;undo 快照剥离 fresh,恢复重挂载不会重复弹编辑)。
- 空计划引导:零模块时画布中央给出「还没有模块 + 添加」空态卡(emptyPlan 文案
  首次落地)。
- 统计条可点:待确认/风险数字点击聚焦第一张对应卡片,步骤数字回到全览。
- 资源卡类型徽章:kind(file/dir/service)以色徽显示。
- 文案修正:排除提示不再指向已移除的列表托盘。
- 动效与质感:主题切换 350ms 颜色交叉过渡(.fd-theme-anim,只过渡颜色属性,不碰
  transform 动效系统);选中连线的 × 删除钮 pop-in;连线手型光标;history 覆盖层
  slide-up 转场;footer 取消按钮补投影;palette 打开时添加按钮转品牌蓝。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS)。

## 2026-10-29 · 编辑防丢轮(WS autosave)

- 画布编辑不再只活在页面内存:FlowView 在最后一次编辑 2.5s 后把线性化计划经 WS
  `autosave` 推给宿主,宿主存于会话(`session.plan`);页面刷新或断线重连后 init
  返回的是最新编辑而非 agent 原始草稿(此前刷新即丢全部编辑)。首次运行只记录
  原始计划不发送;序列化相同则跳过;确认中(confirming)短路——会话即将终结。
- 宿主侧对 malformed autosave 静默忽略(保留上一份好计划);settled 会话不再接收。
- e2e 补断言:autosave 后第二个 WS 连接(模拟刷新)的 init 必须携带编辑后标题
  (22 断言)。
- 变更缘由:用户实测「画布是唯一编辑面、页面刷新丢编辑」是确认流程的最大数据
  风险;autosave 让刷新/崩溃恢复无感。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS,22 断言)。

## 2026-10-29 · 真实浏览器走查轮(效率轮修复 + 无帧新节点修复)

- 用内置浏览器对 demo 计划全旅程走查:阶段折叠/展开、搜索(结果过滤 + 点击跳转 +
  自动关闭)、问题自定义答案(MongoDB 添加即选中)、统计条点击聚焦、深浅主题切换、
  新模块自动编辑、撤销视口保持——效率轮功能全部实测通过,深浅两主题渲染正常。
- 修 bug(走查暴露,均与「新模块自动进入编辑」链路相关):
  1. EditableText autoEdit 挂载即编辑时内容为空——原 effect 只在非编辑态同步 value;
     现在进入编辑且内容为空时播种初始值。
  2. 编辑焦点丢失——xyflow 新节点挂载时未测量(visibility:hidden),对不可见元素
     focus 被浏览器丢弃;现在重试至元素真正拿到焦点(≤10 次)。
  3. 无帧环境新节点永不显示——frameless/后台 webview 的 ResizeObserver 不触发,
     新挂载节点永远停在 visibility:hidden(AGENTS.md 已知坑的添加模块变体);
     现在添加模块时预置 `measured`(group 330×56 / 卡 252×96),xyflow 的
     nodeHasDimensions 认它为已测量、卡片立即可见,真实测量随后覆盖。手动测量
     兜底(updateNodeInternals 轮询)保留不动。
- 顺带:走查确认取消路径不落存档(history 无新增)。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS,22 断言)+
  内置浏览器全旅程走查(上述七项)。

## 2026-10-29 · 语义微调轮(风险等级可调 + 检查点可勾)

- 风险等级用户可调:风险卡的级别徽章(info/warn/danger)改为可点击,三档循环;
  agent 的风险判断可以被使用者降级/升级,等级随摘要流回 agent。
- 检查点条目可勾选:schema 新增可选 `criteriaDone: boolean[]`(与 criteria 按下标
  对齐,旧数据缺省视为全未完成,零破坏);画布上点条目即切换,摘要按 ☑/☐ 渲染
  并为已完成条目标注 (已达成 / done)。这是 Phase 2 复盘页统计的埋点基础。
- 摘要:checkpoint 条目从裸文本改为 ☑/☐ 前缀(向后兼容——criteriaDone 缺省时
  全部 ☐,仅多了复选框语义)。
- e2e 补两条断言:criteriaDone 以 ☑ 呈现、勾的是被点的那条(24 断言)。
- 复核:`npm run build`(exit 0)+ `npm run test:e2e`(ALL PASS,24 断言)。
