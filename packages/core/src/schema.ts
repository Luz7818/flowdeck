import { z } from 'zod';

/**
 * FlowDeck plan schema.
 * Module system is intentionally extensible: every module carries a `type`
 * discriminator; unknown types are preserved verbatim so newer agents and
 * older canvases can still round-trip plans.
 */
export const SCHEMA_VERSION = 1;

/** Optional persisted canvas position (flow view). */
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** Base fields shared by every module type. */
const excludedField = { excluded: z.boolean().optional() } as const;
const posField = { pos: PointSchema.optional() } as const;

export const StepModuleSchema = z.object({
  type: z.literal('step'),
  id: z.string().optional(),
  title: z.string(),
  detail: z.string().optional(),
  /** user removed this step from the plan on the canvas */
  ...excludedField,
  /** ids of steps that must run before this one (dashed dependency wires) */
  dependsOn: z.array(z.string()).optional(),
  ...posField,
});

export const QuestionModuleSchema = z.object({
  type: z.literal('question'),
  id: z.string().optional(),
  question: z.string(),
  options: z.array(z.string()).min(1),
  /** option chosen by the user, null until answered */
  answer: z.string().nullable().optional(),
  ...excludedField,
  ...posField,
});

export const GroupModuleSchema = z.object({
  type: z.literal('group'),
  id: z.string().optional(),
  title: z.string(),
  note: z.string().optional(),
  /** lane header; nodes after it (until the next group) belong to it */
  collapsed: z.boolean().optional(),
  ...excludedField,
  ...posField,
});

export const RiskModuleSchema = z.object({
  type: z.literal('risk'),
  id: z.string().optional(),
  note: z.string(),
  level: z.enum(['info', 'warn', 'danger']).optional(),
  ...excludedField,
  ...posField,
});

export const SuggestionModuleSchema = z.object({
  type: z.literal('suggestion'),
  id: z.string().optional(),
  title: z.string(),
  detail: z.string().optional(),
  /** user adopted this suggestion on the canvas */
  adopted: z.boolean().optional(),
  ...excludedField,
  ...posField,
});

export const CheckpointModuleSchema = z.object({
  type: z.literal('checkpoint'),
  id: z.string().optional(),
  title: z.string(),
  criteria: z.array(z.string()).optional(),
  ...excludedField,
  ...posField,
});

export const ResourceModuleSchema = z.object({
  type: z.literal('resource'),
  id: z.string().optional(),
  label: z.string(),
  kind: z.enum(['file', 'dir', 'service']).optional(),
  path: z.string().optional(),
  ...excludedField,
  ...posField,
});

export const PlanModuleSchema = z.discriminatedUnion('type', [
  StepModuleSchema,
  QuestionModuleSchema,
  GroupModuleSchema,
  RiskModuleSchema,
  SuggestionModuleSchema,
  CheckpointModuleSchema,
  ResourceModuleSchema,
]);

export type StepModule = z.infer<typeof StepModuleSchema>;
export type QuestionModule = z.infer<typeof QuestionModuleSchema>;
export type GroupModule = z.infer<typeof GroupModuleSchema>;
export type RiskModule = z.infer<typeof RiskModuleSchema>;
export type SuggestionModule = z.infer<typeof SuggestionModuleSchema>;
export type CheckpointModule = z.infer<typeof CheckpointModuleSchema>;
export type ResourceModule = z.infer<typeof ResourceModuleSchema>;
export type PlanModule = z.infer<typeof PlanModuleSchema>;

export const PlanSchema = z.object({
  schemaVersion: z.number().int().optional(),
  title: z.string(),
  modules: z.array(PlanModuleSchema),
});

export type Plan = z.infer<typeof PlanSchema>;

export type PlanResult =
  | { status: 'confirmed'; plan: Plan; summary: string }
  | { status: 'cancelled' };

export type RiskLevel = NonNullable<RiskModule['level']>;
export type ResourceKind = NonNullable<ResourceModule['kind']>;
