# FlowDeck 上手手册

> 用途:给要真的把它用起来或改它的人。每一步给命令、给预期输出、给出错时怎么办。
> 阅读顺序:从第一节往下做,不需要跳读。术语第一次出现都有解释。

## 1. 你需要准备什么

| 项目 | 要求 | 怎么确认 |
|---|---|---|
| 操作系统 | Windows / macOS / Linux | — |
| 运行时 | Node.js ≥ 20 | `node -v`,期望输出 `v20.` 及以上 |
| 包管理器 | npm(随 Node 附带) | `npm -v` |
| 网络 | 安装依赖时需访问 npm registry;运行时不需要 | — |
| 密钥 | 无(产品底线:零 LLM 依赖、零 API key) | — |

## 2. 装好它

```bash
npm install
npm run build
```

预期输出:`npm install` 结尾为 `found 0 vulnerabilities`(或有 allow-scripts 警告,见第 6 节);
`npm run build` 依次构建 core → web → mcp,退出码 0。

工作区 npm 拦截了 esbuild 的 postinstall 时,补一句:

```bash
npm approve-scripts esbuild && npm rebuild esbuild
```

## 3. 跑一遍最小流程

```bash
npm run test:e2e
```

预期看到(结尾):

```
[e2e] ALL PASS ✅
```

这条无头测试模拟了完整链路:MCP 客户端调用 → 画布宿主建会话 → 模拟浏览器连线编辑 → 确认 →
JSON + Markdown 返回,并检查存档与历史 API。想亲眼看画布:

```bash
node packages/mcp/bin/flowdeck.js docs/demo-plan.md
```

浏览器自动弹出《FlowDeck 功能演示计划》画布(14 个模块)。编辑后点「确认方案」,
终端打印最终 Markdown 计划,退出码 0。

## 4. 日常怎么用

### 4.1 接入 AI IDE(主路径)

把 MCP 配置加进 IDE,再把「计划确认规范」片段贴进 rules/系统提示——两个 IDE 一份模板:

```bash
# 配置示例与六个 IDE 的逐一说明
start docs/ide-setup.md   # Windows;macOS/Linux 用 open 或 xdg-open
```

验证:在 IDE 里说"用 flowdeck 把这个计划展示成画布让我确认:1. … 2. …",
浏览器应弹出画布,确认后 IDE 对话收到 Markdown 摘要。

### 4.2 手动模式(不依赖 IDE)

```bash
echo "# 我的计划" - 第一步 | node packages/mcp/bin/flowdeck.js
```

支持的行语法:`# 标题`、`## 阶段`、`- 步骤 — 详情`、`> 风险`、`? 问题 | 选项A | 选项B`、
`💡 建议`、`✅ 检查点`(缩进 `-` 为验收标准)、`📦 资源`。解析是确定性的,不经任何模型。

### 4.3 回看确认记录

```bash
node packages/mcp/bin/flowdeck.js history
```

浏览器打开历史查看器,列出 `~/.flowdeck/history/` 下全部确认记录,点条目看最终摘要。

### 4.4 交互演示驱动(测试/调试)

```bash
node scripts/manual-session.mjs docs/demo-plan.md
```

弹出画布并挂起等确认;确认或取消后把完整结果打成 JSON。环境变量 `FLOWDECK_NO_OPEN=1`
禁止自动开浏览器,`FLOWDECK_PORT` 固定端口,`FLOWDECK_TIMEOUT_MS` 限时(超时按取消返回)。

## 5. 想改它:常见三种改动

### 5.1 加一种画布模块类型

四处同改:`packages/core/src/schema.ts`(zod schema + 联合类型)、
`packages/web/src/flow/FlowNode.tsx`(节点渲染 + GLYPH/TYPE_TINT)、
`packages/web/src/flow/FlowView.tsx`(DEFAULTS + PALETTE_TYPES)、
`packages/core/src/summary.ts`(摘要渲染)。改完必跑:`npm run build && npm run test:e2e`。
未知类型本就会被原样保留,漏改任何一处不会崩,只会在对应环节显示占位。

### 5.2 改画布布局参数

列距/行距在 `packages/core/src/graph.ts` 的 `defaultLayout`;节点宽度在
`packages/web/src/flow/FlowNode.tsx` 的 `w-[252px]`。改动后跑一遍图算法测试(见 docs/TESTING.md)
确认往返与断链安全仍成立。

### 5.3 加一个端到端断言

在 `scripts/e2e.mjs` 的用户编辑区仿照现有写法加操作,再在断言区加 `assert(条件, '说明')`。
运行 `npm run test:e2e`,失败时脚本会打印完整返回 JSON。

## 6. 常见故障

| 现象 / 报错原文 | 原因 | 处理 |
|---|---|---|
| `FlowDeck web build not found. Run: npm run build -w @flowdeck/web` | 画布静态文件没构建 | `npm run build -w @flowdeck/web` |
| 浏览器没自动弹出 | 设了 `FLOWDECK_NO_OPEN=1`,或系统默认浏览器未配置 | 手动打开终端/日志里的 `http://127.0.0.1:<port>/s/<id>` |
| agent 不调用画布 | rules 片段没加,或 MCP 没注册 | 按 `docs/ide-setup.md` 第「让 Agent 主动调用画布」一节补齐 |
| 页面打开后节点在、连线全无 | 窗口被遮挡/最小化,渲染帧停止(见 AGENTS.md 已知坑) | 页面置前等 1-2 秒;画布内置兜底会自动补测量 |
| npm 构建报 esbuild 相关错误 | postinstall 被工作区 allow-scripts 拦截 | `npm approve-scripts esbuild && npm rebuild esbuild` |
| 连线拖不动/连不上 | 把手语义:实线走节点顶/底,虚线走步骤左/右侧 | 见页面内「帮助」弹窗的操作提示第 2/3/5 条 |

## 7. 验证你改的东西没弄坏

```bash
npm run build
npm run test:e2e
python "D:\东南大学\项目\Project\文档标准\check_docs.py" flowdeck
```

通过标准:三条退出码都是 0。这些命令的含义与口径写在仓库根的 `AGENTS.md`。
