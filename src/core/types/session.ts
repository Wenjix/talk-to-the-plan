import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema, ChallengeDepthSchema } from './primitives';

export const SessionStatusSchema = z.enum([
  'exploring',
  'synthesized',
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const PlanningSessionSchema = z.object({
  id: UUIDSchema,
  topic: z.string().min(10, 'Topic must be at least 10 characters'),
  createdAt: ISODateTimeSchema,
  updatedAt: ISODateTimeSchema,
  challengeDepth: ChallengeDepthSchema.default('balanced'),
  activeLaneId: UUIDSchema,
  status: SessionStatusSchema.default('exploring'),
  version: z.literal('fuda_v1'), // Preserved for IndexedDB/export backward compatibility
});
export type PlanningSession = z.infer<typeof PlanningSessionSchema>;
