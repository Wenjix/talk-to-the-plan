import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema, PathTypeSchema } from './primitives';

export const NodeFSMStateSchema = z.enum([
  'idle',
  'generating',
  'resolved',
  'failed',
  'stale',
]);
export type NodeFSMState = z.infer<typeof NodeFSMStateSchema>;

export const NodeTypeSchema = z.enum([
  'root',
  'exploration',
  'unified_plan',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const AnswerSchema = z.object({
  summary: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(1).max(8),
});
export type Answer = z.infer<typeof AnswerSchema>;

export const BranchQualitySchema = z.object({
  novelty: z.number().min(0).max(1),
  specificity: z.number().min(0).max(1),
  challenge: z.number().min(0).max(1),
});
export type BranchQuality = z.infer<typeof BranchQualitySchema>;

export const SemanticNodeSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  laneId: UUIDSchema,
  parentId: UUIDSchema.nullable(),
  nodeType: NodeTypeSchema,
  pathType: PathTypeSchema,
  question: z.string().min(1),
  context: z.string().optional(),
  answer: AnswerSchema.optional(),
  fsmState: NodeFSMStateSchema.default('idle'),
  promoted: z.boolean().default(false),
  quality: BranchQualitySchema.optional(),
  depth: z.number().int().nonnegative().default(0),
  createdAt: ISODateTimeSchema,
  updatedAt: ISODateTimeSchema,
});
export type SemanticNode = z.infer<typeof SemanticNodeSchema>;
