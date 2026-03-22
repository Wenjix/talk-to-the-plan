import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const VoiceNoteTranscriptStatusSchema = z.enum(['pending', 'done', 'failed']);
export type VoiceNoteTranscriptStatus = z.infer<typeof VoiceNoteTranscriptStatusSchema>;

export const VoiceNoteSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  nodeId: UUIDSchema,
  durationMs: z.number().int().nonnegative(),
  mimeType: z.string(),
  transcript: z.string().optional(),
  transcriptStatus: VoiceNoteTranscriptStatusSchema.default('pending'),
  createdAt: ISODateTimeSchema,
});
export type VoiceNote = z.infer<typeof VoiceNoteSchema>;
