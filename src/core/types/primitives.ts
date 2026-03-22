import { z } from 'zod';

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

export const ISODateTimeSchema = z.string().datetime({ offset: true });
export type ISODateTime = z.infer<typeof ISODateTimeSchema>;

export const PathTypeSchema = z.enum([
  'clarify',
  'go-deeper',
  'challenge',
  'apply',
  'connect',
  'surprise',
]);
export type PathType = z.infer<typeof PathTypeSchema>;

export const ChallengeDepthSchema = z.enum(['gentle', 'balanced', 'intense']);
export type ChallengeDepth = z.infer<typeof ChallengeDepthSchema>;
