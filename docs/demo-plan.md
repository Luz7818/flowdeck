# FlowDeck 功能演示计划 / Demo Plan

## 阶段一:环境准备 / Setup

- 初始化项目 / init project — scaffold monorepo 结构
- 安装依赖 / install deps — npm install
- 配置环境变量 / configure env — 复制 .env.example

## 阶段二:核心功能 / Core

- 实现数据层 / data layer — schema + repository
- 实现画布渲染 / canvas render — React 组件树
- 接入 WebSocket / wire websocket — 实时同步

> 注意:删除 dist 目录属不可逆操作 / deletes dist/ irreversibly

- 冒烟测试 / smoke test

? 数据库选哪种 / which database? | SQLite | PostgreSQL | 不需要 / none

💡 建议先用内存存储原型 / prototype with in-memory store first

✅ 构建与测试通过 / build & tests pass
  - npm run build 成功
  - npm run test:e2e 全绿

📦 涉及文件 / files involved
