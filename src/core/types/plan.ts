import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const EvidenceRefSchema = z.object({
  nodeId: UUIDSchema,
  laneId: UUIDSchema,
  quote: z.string().min(1),
  relevance: z.enum(['primary', 'supporting']),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const PlanSectionSchema = z.object({
  heading: z.string().min(1),
  content: z.array(z.string().min(1)).min(1),
  evidence: z.array(EvidenceRefSchema).min(1),
});
export type PlanSection = z.infer<typeof PlanSectionSchema>;

export const StructuredPlanSchema = z.object({
  goals: z.array(PlanSectionSchema).min(1),
  assumptions: z.array(PlanSectionSchema).min(1),
  strategy: z.array(PlanSectionSchema).min(1),
  milestones: z.array(PlanSectionSchema).min(1),
  risks: z.array(PlanSectionSchema).min(1),
  nextActions: z.array(PlanSectionSchema).min(1),
});
export type StructuredPlan = z.infer<typeof StructuredPlanSchema>;

export const LanePlanSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  laneId: UUIDSchema,
  title: z.string().min(1),
  sections: StructuredPlanSchema,
  sourcePromotionIds: z.array(UUIDSchema).min(1),
  confidence: z.number().min(0).max(1),
  createdAt: ISODateTimeSchema,
  updatedAt: ISODateTimeSchema,
});
export type LanePlan = z.infer<typeof LanePlanSchema>;
