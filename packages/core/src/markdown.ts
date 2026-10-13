import { Plan } from './schema.js';
import { normalizePlan } from './normalize.js';

/**
 * Deterministic (zero-LLM) parser for the manual mode `npx flowdeck open`.
 * Supported lines:
 *   # Title            → plan title
 *   ## Group           → group lane header
 *   - [ ] / - / * step → step (detail on the same line after " — " or " - ")
 *   > note             → risk (warn)
 *   ? Question | a | b → question with options
 */
export function parsePlanMarkdown(md: string): Plan {
  const title = md.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() ?? 'Untitled plan / 未命名计划';
  const modules: Array<Record<string, unknown>> = [];

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('```')) continue;

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) continue; // title already captured

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      modules.push({ type: 'group', title: h2[1].trim() });
      continue;
    }

    const question = line.match(/^(?:-|•)?\s*\?\s*(.+)$/);
    if (question) {
      const parts = question[1].split('|').map((p) => p.trim());
      if (parts.length > 1) {
        modules.push({ type: 'question', question: parts[0], options: parts.slice(1) });
        continue;
      }
      modules.push({ type: 'question', question: parts[0], options: ['确认 / yes', '调整 / adjust'] });
      continue;
    }

    const risk = line.match(/^>\s?(.*)$/);
    if (risk && risk[1].trim()) {
      modules.push({ type: 'risk', note: risk[1].trim(), level: 'warn' });
      continue;
    }

    const step = line.match(/^(?:-|\*|•)\s+\[( |x|X)\]\s+(.+)$/) ?? line.match(/^(?:-|\*|•)\s+(.+)$/);
    if (step) {
      const text = (step[2] ?? step[1]).trim();
      const [head, ...rest] = text.split(/\s+—\s+|\s+-\s+/);
      const detail = rest.join(' — ').trim() || undefined;
      const excluded = step.length === 3 && step[1].toLowerCase() !== 'x';
      modules.push({ type: 'step', title: head.trim(), detail, excluded: excluded || undefined });
      continue;
    }
  }

  return normalizePlan({ title, modules });
}
