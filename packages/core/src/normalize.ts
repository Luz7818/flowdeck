import {
  Plan,
  PlanModule,
  PlanModuleSchema,
  SCHEMA_VERSION,
} from './schema.js';

let seq = 0;

function genId(type: string): string {
  seq = (seq + 1) % 1000;
  // Web Crypto (available in browsers and Node ≥19) — keeps core browser-bundleable
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 4)
      : Math.random().toString(36).slice(2, 6);
  return `${type}_${seq.toString().padStart(3, '0')}_${rand}`;
}

/**
 * Normalize raw plan input: fill schema version, assign missing ids and
 * module-level defaults. Unknown module types are preserved as-is.
 */
export function normalizePlan(input: {
  title: string;
  modules: Array<Record<string, unknown>>;
}): Plan {
  const modules: PlanModule[] = [];
  for (const raw of input.modules ?? []) {
    const parsed = PlanModuleSchema.safeParse(raw);
    if (!parsed.success) {
      // Preserve unknown/future module types instead of dropping them.
      modules.push({ ...(raw as object), id: (raw as any)?.id ?? genId('mod') } as PlanModule);
      continue;
    }
    const mod = { ...parsed.data } as PlanModule;
    if (!mod.id) mod.id = genId(mod.type);
    if (mod.type === 'risk' && !mod.level) mod.level = 'warn';
    if (mod.type === 'checkpoint' && !mod.criteria) mod.criteria = [];
    modules.push(mod);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    title: input.title,
    modules,
  };
}
