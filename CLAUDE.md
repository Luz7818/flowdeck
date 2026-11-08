## 计划确认规范
当你需要在执行多步骤任务前向我确认计划/方案时,必须调用 flowdeck 的 present_plan 工具:
- 把计划拆成模块传入:step(步骤)、group(阶段)、question(需要我决策的问题,给出选项)、
  suggestion(候选方案)、risk(不可逆/高风险操作)、checkpoint(验收标准)、resource(涉及文件)
- 我会在浏览器画布上调整并确认;工具返回的 Markdown 摘要是最终版本,请严格按它执行,
  其中标注"已移除"的步骤不要执行,问题卡的答案视为我的决定
- 如果工具返回 cancelled,改用纯文本方式和我确认
