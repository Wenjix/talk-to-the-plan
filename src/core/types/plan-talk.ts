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

const PlanSectionKeySchema = z.enum([
  'goals',
  'assumptions',
  'strategy',
  'milestones',
  'risks',
  'nextActions',
]);

// --- Gap Card ---

export const PlanGapCardSchema = z.object({
  id: UUIDSchema,
  sectionKey: PlanSectionKeySchema,
  severity: GapSeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  evidenceFromTranscript: z.array(z.string().min(1)),
  rationale: z.string().min(1),
});
export type PlanGapCard = z.infer<typeof PlanGapCardSchema>;

// --- Proposed Plan Edit ---

export const ProposedPlanEditSchema = z.object({
  id: UUIDSchema,
  sectionKey: PlanSectionKeySchema,
  operation: PlanEditOperationSchema,
  targetHeading: z.string().optional(),
  draftHeading: z.string().optional(),
  draftContent: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  approved: z.boolean(),
});
export type ProposedPlanEdit = z.infer<typeof ProposedPlanEditSchema>;

// --- Reflection Response (AI output) ---

export const PlanReflectionResponseSchema = z.object({
  understanding: z.string().min(1),
  gapCards: z.array(PlanGapCardSchema),
  proposedEdits: z.array(ProposedPlanEditSchema),
  unresolvedQuestions: z.array(z.string().min(1)),
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
