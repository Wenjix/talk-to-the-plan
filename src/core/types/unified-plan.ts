import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';
import { StructuredPlanSchema, EvidenceRefSchema } from './plan';

export const ConflictResolutionSchema = z.object({
  description: z.string().min(1),
  laneAId: UUIDSchema,
  laneBId: UUIDSchema,
  resolution: z.string().min(1),
  tradeoff: z.string().min(1),
});
export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

export const UnifiedPlanSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  sourcePlanIds: z.array(UUIDSchema).min(0),
  title: z.string().min(1),
  sections: StructuredPlanSchema,
  conflictsResolved: z.array(ConflictResolutionSchema).default([]),
  unresolvedQuestions: z.array(z.string().min(1)).default([]),
  evidence: z.array(EvidenceRefSchema).min(1),
  createdAt: ISODateTimeSchema,
  revision: z.number().int().positive().default(1),
  updatedAt: ISODateTimeSchema.optional(),
});
export type UnifiedPlan = z.infer<typeof UnifiedPlanSchema>;
