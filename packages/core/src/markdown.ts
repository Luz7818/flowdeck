import { Plan } from './schema.js';
import { normalizePlan } from './normalize.js';

/**
 * Deterministic (zero-LLM) parser for the manual mode `npx flowdeck open`.
 * Supported lines:
 *   # Title             → plan title
 *   ## Group            → group lane header
 *   - [ ] / - / * step  → step (" — detail" suffix becomes the detail)
 *   > note              → risk (warn)
 *   ? Question | a | b  → question with options
 *   💡 text             → suggestion
 *   ✅ title (+ indented "- c" bullets) → checkpoint with criteria
 *   📦 label            → resource
 *   indented "- x" under a step  → appended to that step's detail
 *   indented "- x" under a checkpoint → appended to that checkpoint's criteria
 */
export function parsePlanMarkdown(md: string): Plan {
  const title = md.match(/^\s*#\s+(.+)$/m)?.[1]?.trim() ?? 'Untitled plan / 未命名计划';
  const modules: Array<Record<string, unknown>> = [];

  for (const rawLine of md.split(/\r?\n/)) {
    const indented = /^[ \t]+/.test(rawLine);
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
      } else {
        modules.push({ type: 'question', question: parts[0], options: ['确认 / yes', '调整 / adjust'] });
      }
      continue;
    }

    const risk = line.match(/^>\s?(.*)$/);
    if (risk && risk[1].trim()) {
      modules.push({ type: 'risk', note: risk[1].trim(), level: 'warn' });
      continue;
    }

    // emoji prefixes: strip codepoint-safe (💡 is a surrogate pair — slice(1) would orphan it)
    const stripEmoji = (s: string) => s.replace(/^\p{Extended_Pictographic}\s*/u, '');

    if (line.startsWith('💡')) {
      const [head, ...rest] = stripEmoji(line).split(/\s+—\s+|\s+-\s+/);
      modules.push({ type: 'suggestion', title: head.trim(), detail: rest.join(' — ').trim() || undefined });
      continue;
    }

    if (line.startsWith('✅')) {
      const [head, ...rest] = stripEmoji(line).split(/\s*[:：]\s*/);
      modules.push({ type: 'checkpoint', title: head.trim(), criteria: rest.length ? [rest.join(': ').trim()] : [] });
      continue;
    }

    if (line.startsWith('📦')) {
      const text = stripEmoji(line);
      const [label, pathPart] = text.split(/\s*[(（]\s*/);
      const path = pathPart?.replace(/[)）]\s*$/, '').replace(/[`]/g, '');
      modules.push({ type: 'resource', label: (label ?? text).trim(), path: path || undefined });
      continue;
    }

    // indented bullets attach to the previous module instead of becoming steps
    const bullet = line.match(/^(?:-|\*|•)\s+(.+)$/);
    if (bullet && indented && modules.length > 0) {
      const last = modules[modules.length - 1];
      const text = bullet[1].trim();
      if (last.type === 'checkpoint') {
        last.criteria = [...((last.criteria as string[]) ?? []), text];
        continue;
      }
      if (last.type === 'step') {
        last.detail = last.detail ? `${last.detail} — ${text}` : text;
        continue;
      }
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
