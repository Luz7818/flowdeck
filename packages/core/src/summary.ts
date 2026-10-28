import { Plan, PlanModule, RiskLevel } from './schema.js';

const RISK_MARK: Record<RiskLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  danger: '🛑',
};

/** Display label of any module (title / question / note / label). Shared by the
 * summary renderer and the web list view so the two never drift. */
export function moduleLabel(mod: PlanModule): string {
  if (mod.type === 'question') return mod.question;
  if (mod.type === 'risk') return mod.note;
  if (mod.type === 'resource') return mod.label;
  return (mod as { title?: string }).title ?? '';
}

/**
 * Render a Plan as a human-readable Markdown summary. This is the copy the
 * agent sees and the artifact archived to ~/.flowdeck/history.
 */
export function generateSummary(plan: Plan): string {
  const out: string[] = [];
  out.push(`# ${plan.title}`);
  out.push('');

  let stepNo = 0;
  let currentGroup: string | null = null;

  const flushGroup = () => {
    if (currentGroup !== null) {
      out.push('');
      currentGroup = null;
    }
  };

  for (const mod of plan.modules) {
    if (mod.type !== 'step' && (mod as { excluded?: boolean }).excluded) {
      out.push(`- ~~${moduleLabel(mod)}~~ (已移除 / removed)`);
      continue;
    }
    switch (mod.type) {
      case 'group':
        flushGroup();
        currentGroup = mod.title;
        out.push(`## ${mod.title}`);
        if (mod.note) out.push(`_${mod.note}_`);
        out.push('');
        break;
      case 'step':
        stepNo += 1;
        if (mod.excluded) {
          out.push(`${stepNo}. ~~${mod.title}~~ (已移除 / removed)`);
        } else {
          out.push(`${stepNo}. ${mod.title}`);
          if (mod.detail) out.push(`   - ${mod.detail}`);
        }
        break;
      case 'question':
        out.push(
          `- ❓ ${mod.question} → **${mod.answer ?? '(未回答 / unanswered)'}**`,
        );
        break;
      case 'risk':
        out.push(`- ${RISK_MARK[mod.level ?? 'warn']} ${mod.note}`);
        break;
      case 'suggestion':
        out.push(
          `- 💡 ${mod.adopted ? '**[已采纳 / adopted]** ' : ''}${mod.title}${mod.detail ? ` — ${mod.detail}` : ''}`,
        );
        break;
      case 'checkpoint':
        out.push(`- ✅ 检查点 / checkpoint: ${mod.title}`);
        for (const c of mod.criteria ?? []) out.push(`  - ${c}`);
        break;
      case 'resource':
        out.push(`- 📦 ${mod.label}${mod.path ? ` (\`${mod.path}\`)` : ''}`);
        break;
      default: {
        const unknown = mod as PlanModule & { type?: string };
        out.push(`- ▪ (${unknown.type ?? 'unknown'}) ${JSON.stringify(mod)}`);
      }
    }
  }
  flushGroup();
  return out.join('\n').trimEnd() + '\n';
}
