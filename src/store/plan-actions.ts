import type { UnifiedPlan, StructuredPlan, EvidenceRef } from '../core/types';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useToastStore } from './toast-store';
import { generateId } from '../utils/ids';
import { buildDirectPlanPrompt } from '../generation/prompts/lane-plan';
import { getDefaultProvider } from '../generation/providers';
import { parseAndValidate } from '../core/validation/schema-gates';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';
import { sessionTransition } from '../core/fsm/session-fsm';

export async function generateDirectPlan(): Promise<UnifiedPlan> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  const { nodes, promotions } = useSemanticStore.getState();
  if (promotions.length < 3) {
    throw new Error(`Need at least 3 promoted nodes, have ${promotions.length}`);
  }

  const promotedNodes = promotions
    .map(p => ({
      node: nodes.find(n => n.id === p.nodeId)!,
      promotion: p,
    }))
    .filter(pn => pn.node);

  const prompt = buildDirectPlanPrompt(promotedNodes, session.topic);

  const settings = await loadSettings();
  const apiKeys = resolveApiKeys(settings);
  const provider = getDefaultProvider(apiKeys);
  const raw = await provider.generate(prompt);

  const result = parseAndValidate('lane_plan', raw);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to generate plan');
  }

  const sections = result.data as StructuredPlan;
  const evidence = extractAllEvidence(sections);
  const timestamp = new Date().toISOString();

  const unifiedPlan: UnifiedPlan = {
    id: generateId(),
    sessionId: session.id,
    sourcePlanIds: [],
    title: `Plan: ${session.topic}`,
    sections,
    conflictsResolved: [],
    unresolvedQuestions: [],
    evidence,
    revision: 1,
    createdAt: timestamp,
  };

  useSemanticStore.getState().setUnifiedPlan(unifiedPlan);

  const newStatus = sessionTransition(session.status, { type: 'DIRECT_PLAN_CREATED' });
  if (newStatus) {
    useSessionStore.getState().setSession({ ...session, status: newStatus });
  }

  useToastStore.getState().addToast(
    'Plan generated successfully',
    'info',
    5000,
  );

  return unifiedPlan;
}

/** Extract all EvidenceRef entries from a StructuredPlan. */
export function extractAllEvidence(sections: StructuredPlan): EvidenceRef[] {
  const evidence: EvidenceRef[] = [];
  const sectionKeys = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;
  for (const key of sectionKeys) {
    const items = sections[key];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (Array.isArray(item.evidence)) {
          evidence.push(...item.evidence);
        }
      }
    }
  }
  return evidence;
}
