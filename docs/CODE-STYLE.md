# FlowDeck 代码风格

> 用途:给写这个项目代码的人与 AI。风格、命名、错误处理、日志的约定都在这里;
> 与工具链冲突时以工具链为准,并把本文改掉。

## 代码风格

- 语言与版本:TypeScript strict,Node ≥ 20;类型检查由 `tsc -p tsconfig.json` 强制
  (复核:`npm run build`,任一包类型错误即失败)。模块体系 ESM(`"type": "module"`,
  导入带 `.js` 后缀)。
- 前端样式用 Tailwind 4 原子类,不写独立 CSS(除 `index.css` 的三行全局);类内修饰器
  (`!h-3` 等)只在覆盖 React Flow 默认样式时使用。
- 工具没管的约定:组件内回调一律 `useCallback` 并写全依赖;跨组件共享的画布服务走
  `FDContext`,不往节点 `data` 里塞函数(旧版曾因此踩过期闭包)。

## 文件与目录命名

- React 组件文件大驼峰(`FlowView.tsx`、`ModuleCard.tsx`);工具与非组件模块小驼峰
  (`canvas-server.ts`、`graph.ts`);脚本目录 `scripts/` 用 `.mjs`。
- 规范文档用工作区固定大写名(`AGENTS.md`、`GET-START.md` 等),其余文档英文小写加连字符
  (`ide-setup.md`);唯一例外是仓根 `目录说明.md`(工作区规范规定)。
- 测试文件对应被测物:无头端到端集中一个 `scripts/e2e.mjs`,按场景分段注释,不按文件拆。

## 错误处理

- 只处理会发生的错误;禁止空 catch。有意吞掉的异常必须留注释说明为什么
  (例:`canvas-server.ts` 的 `archive`——存档失败不得阻塞确认流程)。
- 报错信息带上下文值:CLI 用 `[flowdeck] <信息>` 前缀打到 stderr,如
  `[flowdeck] opening canvas for "<标题>" (<N> modules)…`。
- 对外接口的错误形态:MCP 工具不抛异常,取消/超时一律返回 `status: cancelled` 结构化结果;
  WebSocket 协议错误用关闭码区分(4404 = 会话不存在),页面据此显示对应终态。

## 日志

- CLI 与宿主进程:进度与提示走 `console.error`(stderr),最终结果走 `console.log`(stdout)——
  stdout 只放要被管道消费的数据(如确认后的 Markdown)。
- 浏览器侧不打业务日志;诊断用页面内终态(Splash)表达。
- 不许记录:用户计划内容以外的任何本机路径、密钥(本项目本就无密钥)。
