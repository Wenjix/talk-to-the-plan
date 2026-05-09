import { z } from 'zod';
import { PathTypeSchema } from '../../core/types/primitives';

export const BranchIntentSchema = z.object({
  anchorHint: z.string().optional(),
  pathType: PathTypeSchema,
  seedQuestion: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(200).optional(),
});
export type BranchIntent = z.infer<typeof BranchIntentSchema>;

export const ListenerResponseSchema = z.object({
  intents: z.array(BranchIntentSchema).max(3),
});
export type ListenerResponse = z.infer<typeof ListenerResponseSchema>;
