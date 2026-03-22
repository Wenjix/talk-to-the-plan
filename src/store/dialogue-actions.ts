import type { DialecticMode, DialogueTurn, ChallengeDepth, SemanticNode } from '../core/types';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useViewStore } from './view-store';
import { useToastStore } from './toast-store';
import { generateId } from '../utils/ids';
import { compileContext } from '../core/graph/context-compiler';
import { buildDialoguePrompt, buildConcludeSynthesisPrompt } from '../generation/prompts/dialogue';
import { getProviderForPersona } from '../generation/providers';
import type { ApiKeys } from '../generation/providers/types';
import { parseAndValidate } from '../core/validation/schema-gates';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';

export const MAX_DIALOGUE_TURNS = 20;

/**
 * Add a user turn to the dialogue.
 * If the dialogue has reached MAX_DIALOGUE_TURNS, auto-concludes instead.
 */
export function addUserTurn(nodeId: string, content: string, mode: DialecticMode): DialogueTurn {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  const turns = useSemanticStore.getState().getDialogueTurnsByNode(nodeId);

  // Dialogue turn cap: auto-conclude at the limit
  if (turns.length >= MAX_DIALOGUE_TURNS) {
    void concludeDialogue(nodeId);
    throw new Error(
      `Dialogue turn cap reached (${MAX_DIALOGUE_TURNS}). Dialogue has been auto-concluded.`,
    );
  }

  const turn: DialogueTurn = {
    id: generateId(),
    sessionId: session.id,
    nodeId,
    turnIndex: turns.length,
    speaker: 'user',
    dialecticMode: mode,
    content,
    createdAt: new Date().toISOString(),
  };

  useSemanticStore.getState().addDialogueTurn(turn);
  return turn;
}

/**
 * Generate an AI dialogue response.
 * If the dialogue has reached MAX_DIALOGUE_TURNS, auto-concludes instead.
 */
export async function generateDialogueResponse(
  nodeId: string,
  mode: DialecticMode,
): Promise<DialogueTurn> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  const { nodes, edges } = useSemanticStore.getState();
  const turns = useSemanticStore.getState().getDialogueTurnsByNode(nodeId);

  // Dialogue turn cap: auto-conclude at the limit
  if (turns.length >= MAX_DIALOGUE_TURNS) {
    await concludeDialogue(nodeId);
    throw new Error(
      `Dialogue turn cap reached (${MAX_DIALOGUE_TURNS}). Dialogue has been auto-concluded.`,
    );
  }

  const challengeDepth = useSessionStore.getState().challengeDepth;

  // Apply defensive user detection
  const isDefensive = detectDefensiveUser(turns);
  const effectiveDepth = isDefensive
    ? backOffDepth(challengeDepth)
    : challengeDepth;

  // Persist backed-off depth and notify user
  if (isDefensive && effectiveDepth !== challengeDepth) {
    useSessionStore.getState().setChallengeDepth(effectiveDepth);
    useToastStore.getState().addToast(
      'Easing challenge depth based on conversation flow.',
      'info',
    );
  }

  // Compile context
  const context = compileContext(nodeId, nodes, edges);

  // Build dialogue prompt
  const prompt = buildDialoguePrompt(mode, turns, context, effectiveDepth);

  // Get provider (routed by node's lane persona)
  const settings = await loadSettings();
  const apiKeys = resolveApiKeys(settings);
  const provider = resolveProviderForNode(nodeId, nodes, apiKeys);

  // Generate with streaming (RAF-batched to reduce store updates)
  const streamKey = `dialogue-${nodeId}`;
  let pendingDialogueChunk = '';
  let dialogueRafScheduled = false;
  const flushDialogueChunk = () => {
    dialogueRafScheduled = false;
    if (pendingDialogueChunk) {
      useViewStore.getState().appendStream(streamKey, pendingDialogueChunk);
      pendingDialogueChunk = '';
    }
  };
  const raw = await provider.generateStream(prompt, (chunk) => {
    pendingDialogueChunk += chunk;
    if (!dialogueRafScheduled) {
      dialogueRafScheduled = true;
      requestAnimationFrame(flushDialogueChunk);
    }
  });
  // Flush any remaining buffered chunk
  if (pendingDialogueChunk) {
    useViewStore.getState().appendStream(streamKey, pendingDialogueChunk);
    pendingDialogueChunk = '';
  }
  useViewStore.getState().clearStream(streamKey);

  // Parse response
  const result = parseAndValidate('dialogue_turn', raw);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to parse dialogue response');
  }

  const data = result.data as {
    content: string;
    turnType: string;
    suggestedResponses?: Array<{ text: string; intent: string }>;
  };

  const aiTurn: DialogueTurn = {
    id: generateId(),
    sessionId: session.id,
    nodeId,
    turnIndex: turns.length,
    speaker: 'ai',
    dialecticMode: mode,
    turnType: data.turnType as DialogueTurn['turnType'],
    content: data.content,
    suggestedResponses: data.suggestedResponses as DialogueTurn['suggestedResponses'],
    createdAt: new Date().toISOString(),
  };

  useSemanticStore.getState().addDialogueTurn(aiTurn);
  return aiTurn;
}

/**
 * Conclude dialogue and synthesize an enriched answer for the node.
 */
export async function concludeDialogue(nodeId: string): Promise<void> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  const node = useSemanticStore.getState().getNode(nodeId);
  if (!node?.answer) throw new Error('Node has no answer to enrich');

  const { nodes, edges } = useSemanticStore.getState();
  const turns = useSemanticStore.getState().getDialogueTurnsByNode(nodeId);
  if (turns.length === 0) throw new Error('No dialogue turns to synthesize');

  const context = compileContext(nodeId, nodes, edges);
  const prompt = buildConcludeSynthesisPrompt(turns, context, node.answer);

  const settings = await loadSettings();
  const apiKeys = resolveApiKeys(settings);
  const provider = resolveProviderForNode(nodeId, nodes, apiKeys);
  const raw = await provider.generate(prompt);

  const result = parseAndValidate('answer', raw);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to parse synthesis');
  }

  const enrichedAnswer = result.data as { summary: string; bullets: string[] };

  // Update the node's answer with enriched version
  useSemanticStore.getState().updateNode(nodeId, {
    answer: enrichedAnswer,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Detect defensive user patterns: last 3 responses all < 20 words
 * with defensive markers.
 */
function detectDefensiveUser(turns: DialogueTurn[]): boolean {
  const userTurns = turns.filter((t) => t.speaker === 'user');
  if (userTurns.length < 3) return false;

  const lastThree = userTurns.slice(-3);
  const defensiveMarkers = [
    'i already said',
    'like i mentioned',
    'as i stated',
    'i told you',
    'already explained',
  ];

  return lastThree.every((t) => {
    const words = t.content.trim().split(/\s+/).length;
    const lower = t.content.toLowerCase();
    return words < 20 && defensiveMarkers.some((m) => lower.includes(m));
  });
}

/**
 * Back off challenge depth by one level.
 */
function backOffDepth(depth: ChallengeDepth): ChallengeDepth {
  switch (depth) {
    case 'intense':
      return 'balanced';
    case 'balanced':
      return 'gentle';
    case 'gentle':
      return 'gentle';
  }
}

/**
 * Resolve the provider for a node by looking up its lane's persona.
 */
function resolveProviderForNode(nodeId: string, nodes: SemanticNode[], apiKeys: ApiKeys) {
  const node = nodes.find(n => n.id === nodeId);
  const lanes = useSemanticStore.getState().lanes;
  const lane = lanes.find(l => l.id === node?.laneId);
  const personaId = lane?.personaId ?? 'analytical';
  return getProviderForPersona(personaId, apiKeys);
}
