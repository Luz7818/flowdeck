export type Lang = 'zh' | 'en';

const dict = {
  zh: {
    tagline: '计划确认画布',
    confirm: '确认方案',
    cancel: '取消',
    connecting: '连接画布服务…',
    disconnected: '与画布服务断开连接',
    retry: '重新连接',
    notFound: '会话不存在或已结束,请回到 IDE 重新发起计划确认。',
    doneTitle: '方案已发送',
    doneBody: '你的调整已返回给 IDE 对话,可以回到 IDE 继续了。',
    cancelledTitle: '已取消',
    cancelledBody: '本次确认已取消,agent 将改用文字方式与你确认。',
    step: '步骤',
    question: '待确认',
    questionHint: '点选你的答案',
    suggestion: 'AI 建议',
    adopt: '采纳',
    adopted: '已采纳',
    risk: '风险',
    checkpoint: '检查点',
    criteria: '验收标准',
    resource: '资源',
    keep: '保留',
    excluded: '已移除',
    insert: '插入步骤',
    titlePh: '步骤标题…',
    detailPh: '补充说明(可选)…',
    add: '添加',
    edit: '编辑',
    remove: '移除',
    toStep: '转为步骤',
    collapse: '折叠',
    expand: '展开',
    history: '历史',
    back: '返回',
    emptyHistory: '暂无确认记录',
    modulesUnit: '个模块',
    dependsOn: '依赖',
    lang: 'EN',
  },
  en: {
    tagline: 'Plan confirmation canvas',
    confirm: 'Confirm plan',
    cancel: 'Cancel',
    connecting: 'Connecting to canvas service…',
    disconnected: 'Disconnected from canvas service',
    retry: 'Reconnect',
    notFound: 'Session not found or already finished. Re-trigger the plan confirmation from your IDE.',
    doneTitle: 'Plan sent',
    doneBody: 'Your edits were returned to the IDE conversation. You can go back now.',
    cancelledTitle: 'Cancelled',
    cancelledBody: 'Confirmation cancelled. The agent will fall back to plain-text confirmation.',
    step: 'Step',
    question: 'Question',
    questionHint: 'Click to answer',
    suggestion: 'Suggestion',
    adopt: 'Adopt',
    adopted: 'Adopted',
    risk: 'Risk',
    checkpoint: 'Checkpoint',
    criteria: 'Acceptance criteria',
    resource: 'Resource',
    keep: 'Keep',
    excluded: 'Removed',
    insert: 'Insert step',
    titlePh: 'Step title…',
    detailPh: 'Details (optional)…',
    add: 'Add',
    edit: 'Edit',
    remove: 'Remove',
    toStep: 'Convert to step',
    collapse: 'Collapse',
    expand: 'Expand',
    history: 'History',
    back: 'Back',
    emptyHistory: 'No archived plans yet',
    modulesUnit: ' modules',
    dependsOn: 'depends on',
    lang: '中',
  },
} as const;

export type Dict = Record<keyof (typeof dict)['zh'], string>;

export function detectLang(): Lang {
  const saved = localStorage.getItem('flowdeck.lang');
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getDict(lang: Lang): Dict {
  return dict[lang];
}

export function saveLang(lang: Lang): void {
  localStorage.setItem('flowdeck.lang', lang);
}
