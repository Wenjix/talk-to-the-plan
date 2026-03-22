import type {
  JobType,
  SemanticNode,
  SemanticEdge,
  PlanningSession,
  ModelLane,
} from '../core/types';
import type { ApiKeys } from './providers/types';
import { compileContext } from '../core/graph/context-compiler';
import { buildPrompt } from './prompts';
import { getProviderForPersona } from './providers';
import { parseAndValidate } from '../core/validation/schema-gates';
import { rateLimiter } from './rate-limiter';

export interface GenerateOptions {
  targetNodeId: string;
  jobType: JobType;
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  session: PlanningSession;
  lanes: ModelLane[];
  apiKeys: ApiKeys;
  onChunk?: (delta: string) => void;
}

export interface GenerateResult {
  success: boolean;
  data?: unknown;
  error?: string;
  feedback: string;
}

export async function generate(
  options: GenerateOptions,
): Promise<GenerateResult> {
  // 1. Compile context from graph
  const context = compileContext(
    options.targetNodeId,
    options.nodes,
    options.edges,
  );

  // 2. Resolve persona from the target node's lane (not the active lane)
  const targetNode = options.nodes.find(n => n.id === options.targetNodeId);
  const targetLane = options.lanes.find(l => l.id === targetNode?.laneId);
  const personaId = targetLane?.personaId ?? 'analytical';

  // 3. Build prompt with context + persona
  const prompt = buildPrompt(
    options.jobType,
    context,
    options.session,
    personaId,
  );

  // 4. Acquire rate limiter token before calling provider
  await rateLimiter.acquire();

  // 5. Call provider (resolved per persona → provider mapping)
  const provider = getProviderForPersona(personaId, options.apiKeys);
  const raw = options.onChunk
    ? await provider.generateStream(prompt, options.onChunk)
    : await provider.generate(prompt);

  // 6. Parse + validate
  return parseAndValidate(options.jobType, raw);
}
