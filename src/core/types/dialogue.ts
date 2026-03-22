import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const DialecticModeSchema = z.enum([
  'socratic',
  'devil_advocate',
  'steelman',
  'collaborative',
]);
export type DialecticMode = z.infer<typeof DialecticModeSchema>;

export const TurnTypeSchema = z.enum([
  'challenge',
  'pushback',
  'reframe',
  'probe',
  'concede',
  'synthesize',
]);
export type TurnType = z.infer<typeof TurnTypeSchema>;

export const SuggestedResponseSchema = z.object({
  text: z.string().min(1),
  intent: z.enum(['defend', 'concede', 'redirect', 'deepen', 'conclude']),
});
export type SuggestedResponse = z.infer<typeof SuggestedResponseSchema>;

export const DialogueTurnSourceSchema = z.enum(['voice', 'typed']);
export type DialogueTurnSource = z.infer<typeof DialogueTurnSourceSchema>;

export const DialogueTurnSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  nodeId: UUIDSchema,
  turnIndex: z.number().int().nonnegative(),
  speaker: z.enum(['user', 'ai']),
  dialecticMode: DialecticModeSchema,
  turnType: TurnTypeSchema.optional(),
  content: z.string().min(1),
  source: DialogueTurnSourceSchema.optional(),
  suggestedResponses: z.array(SuggestedResponseSchema).max(3).optional(),
  createdAt: ISODateTimeSchema,
});
export type DialogueTurn = z.infer<typeof DialogueTurnSchema>;
