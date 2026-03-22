import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const PromotionReasonSchema = z.enum([
  'insightful_reframe',
  'actionable_detail',
  'risk_identification',
  'assumption_challenge',
  'cross_domain_link',
]);
export type PromotionReason = z.infer<typeof PromotionReasonSchema>;

export const PromotionSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  laneId: UUIDSchema,
  nodeId: UUIDSchema,
  reason: PromotionReasonSchema,
  note: z.string().max(500).optional(),
  createdAt: ISODateTimeSchema,
});
export type Promotion = z.infer<typeof PromotionSchema>;
