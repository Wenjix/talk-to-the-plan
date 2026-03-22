import { z } from 'zod';

export const ContextRoleSchema = z.enum([
  'ancestor',
  'sibling',
  'cousin',
]);
export type ContextRole = z.infer<typeof ContextRoleSchema>;

export const ContextEntrySchema = z.object({
  nodeId: z.string(),
  role: ContextRoleSchema,
  distanceFromTarget: z.number().int().nonnegative(),
  content: z.string(),
  tokenEstimate: z.number().int().nonnegative(),
});
export type ContextEntry = z.infer<typeof ContextEntrySchema>;

export const CompiledContextSchema = z.object({
  entries: z.array(ContextEntrySchema),
  totalTokenEstimate: z.number().int().nonnegative(),
  targetNodeId: z.string(),
  formatted: z.string(),
});
export type CompiledContext = z.infer<typeof CompiledContextSchema>;
