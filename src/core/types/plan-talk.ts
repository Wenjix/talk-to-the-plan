import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';
import type { StructuredPlan } from './plan';

// --- Enums ---

export const PlanTalkTurnStateSchema = z.enum([
  'idle',
  'recording',
  'transcribing',
  'analyzing',
  'streaming',
  'responded',
  'error',
]);
export type PlanTalkTurnState = z.infer<typeof PlanTalkTurnStateSchema>;

export const PlanTalkSpeakerSchema = z.enum(['user', 'ai']);
export type PlanTalkSpeaker = z.infer<typeof PlanTalkSpeakerSchema>;

export const GapSeveritySchema = z.enum(['high', 'medium', 'low']);
export type GapSeverity = z.infer<typeof GapSeveritySchema>;

export const PlanEditOperationSchema = z.enum([
  'add_section',
  'update_section',
  'remove_section',
  'update_content_bullet',
]);
export type PlanEditOperation = z.infer<typeof PlanEditOperationSchema>;

export const PlanTalkSourceSchema = z.enum(['voice', 'typed']);
export type PlanTalkSource = z.infer<typeof PlanTalkSourceSchema>;

// --- Section key derived from StructuredPlan ---

export type PlanSectionKey = keyof StructuredPlan;

const SECTION_KEY_ALIASES: Record<string, string> = {
  'next_actions': 'nextActions',
  'nextactions': 'nextActions',
  'next-actions': 'nextActions',
  'actions': 'nextActions',
  'goal': 'goals',
  'assumption': 'assumptions',
  'milestone': 'milestones',
  'risk': 'risks',
  'strategies': 'strategy',
};

const PlanSectionKeySchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const lower = val.toLowerCase().trim();
    return SECTION_KEY_ALIASES[lower] ?? val;
  },
  z.enum(['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions']).catch('strategy'),
);

// --- Severity with normalization ---

const SEVERITY_ALIASES: Record<string, string> = {
  'critical': 'high',
  'important': 'high',
  'moderate': 'medium',
  'minor': 'low',
  'negligible': 'low',
};

const LenientGapSeveritySchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val;
    const lower = val.toLowerCase().trim();
    return SEVERITY_ALIASES[lower] ?? lower;
  },
  GapSeveritySchema.catch('medium'),
);

// --- Gap Card (lenient for LLM output) ---

export const PlanGapCardSchema = z.object({
  id: z.string().default(''),
  sectionKey: PlanSectionKeySchema,
  severity: LenientGapSeveritySchema,
  title: z.string().min(1).catch('Untitled gap'),
  description: z.string().min(1).catch(''),
  evidenceFromTranscript: z.preprocess(
    (val) => {
      if (typeof val === 'string') return val ? [val] : [];
      if (Array.isArray(val)) return val.filter((v: unknown) => typeof v === 'string' && v.length > 0);
      return [];
    },
    z.array(z.string().min(1)).default([]),
  ),
  rationale: z.string().default(''),
});
export type PlanGapCard = z.infer<typeof PlanGapCardSchema>;

// --- Proposed Plan Edit (lenient for LLM output) ---

export const ProposedPlanEditSchema = z.object({
  id: z.string().default(''),
  sectionKey: PlanSectionKeySchema,
  operation: PlanEditOperationSchema.catch('update_section'),
  targetHeading: z.string().optional(),
  draftHeading: z.string().optional(),
  draftContent: z.array(z.string()).optional(),
  confidence: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().min(0).max(1).catch(0.5),
  ),
  reason: z.string().default(''),
  approved: z.boolean().default(false),
});
export type ProposedPlanEdit = z.infer<typeof ProposedPlanEditSchema>;

// --- Reflection Response (AI output — lenient) ---

export const PlanReflectionResponseSchema = z.object({
  understanding: z.string().min(1),
  gapCards: z.array(PlanGapCardSchema).default([]),
  proposedEdits: z.array(ProposedPlanEditSchema).default([]),
  unresolvedQuestions: z.preprocess(
    (val) => {
      if (!Array.isArray(val)) return [];
      return val.filter((v: unknown) => typeof v === 'string' && v.trim().length > 0);
    },
    z.array(z.string()).default([]),
  ),
});
export type PlanReflectionResponse = z.infer<typeof PlanReflectionResponseSchema>;

// --- Turn ---

export const PlanTalkTurnSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  unifiedPlanId: UUIDSchema,
  turnIndex: z.number().int().nonnegative(),
  speaker: PlanTalkSpeakerSchema,
  transcriptText: z.string().min(1),
  source: PlanTalkSourceSchema,
  createdAt: ISODateTimeSchema,
});
export type PlanTalkTurn = z.infer<typeof PlanTalkTurnSchema>;
