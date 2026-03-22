import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const PersonaIdSchema = z.enum([
  'expansive',
  'analytical',
  'pragmatic',
  'socratic',
]);
export type PersonaId = z.infer<typeof PersonaIdSchema>;

export const ModelLaneSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  label: z.string().min(1),
  personaId: PersonaIdSchema,
  colorToken: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  isEnabled: z.boolean().default(true),
  createdAt: ISODateTimeSchema,
  updatedAt: ISODateTimeSchema,
});
export type ModelLane = z.infer<typeof ModelLaneSchema>;

export const DEFAULT_LANES: Array<{
  personaId: PersonaId;
  label: string;
  colorToken: string;
}> = [
  { personaId: 'expansive', label: 'Expansive', colorToken: '#7B4FBF' },
];

export const PERSONA_META: Record<PersonaId, { label: string; colorToken: string }> = {
  expansive: { label: 'Expansive', colorToken: '#7B4FBF' },
  analytical: { label: 'Analytical', colorToken: '#4A90D9' },
  pragmatic: { label: 'Pragmatic', colorToken: '#3DAA6D' },
  socratic: { label: 'Socratic', colorToken: '#D94F4F' },
};
