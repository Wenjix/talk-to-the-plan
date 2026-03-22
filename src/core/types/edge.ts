import { z } from 'zod';
import { UUIDSchema, ISODateTimeSchema } from './primitives';

export const SemanticEdgeSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  laneId: UUIDSchema,
  sourceNodeId: UUIDSchema,
  targetNodeId: UUIDSchema,
  label: z.string().optional(),
  createdAt: ISODateTimeSchema,
});
export type SemanticEdge = z.infer<typeof SemanticEdgeSchema>;
