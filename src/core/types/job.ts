import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const JobFSMStateSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'retrying',
  'failed',
]);
export type JobFSMState = z.infer<typeof JobFSMStateSchema>;

export const JobTypeSchema = z.enum([
  'answer',
  'branch',
  'dialogue_turn',
  'lane_plan',
  'unified_plan',
  'path_questions',
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const GenerationJobSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  targetNodeId: UUIDSchema,
  jobType: JobTypeSchema,
  fsmState: JobFSMStateSchema.default('queued'),
  attempts: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(3),
  idempotencyKey: z.string().min(1),
  error: z.string().optional(),
  createdAt: ISODateTimeSchema,
  resolvedAt: ISODateTimeSchema.optional(),
});
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
