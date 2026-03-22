import type { LanePlan, UnifiedPlan, StructuredPlan, EvidenceRef, PersonaId } from '../core/types';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useToastStore } from './toast-store';
import { generateId } from '../utils/ids';
import { buildLanePlanPrompt, buildDirectPlanPrompt } from '../generation/prompts/lane-plan';
import { getProviderForPersona, getDefaultProvider } from '../generation/providers';
import { parseAndValidate } from '../core/validation/schema-gates';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';
import { sessionTransition } from '../core/fsm/session-fsm';

export async function generateLanePlan(laneId: string, personaId: PersonaId): Promise<LanePlan> {
  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  // Collect promoted nodes for this lane
  const { nodes, promotions } = useSemanticStore.getState();
  const lanePromotions = promotions.filter(p => p.laneId === laneId);

  if (lanePromotions.length === 0) {
    throw new Error('No promoted nodes in this lane');
  }

  const promotedNodes = lanePromotions
    .map(p => ({
      node: nodes.find(n => n.id === p.nodeId)!,
      promotion: p,
    }))
    .filter(pn => pn.node);

  // Build prompt
  const prompt = buildLanePlanPrompt(promotedNodes, personaId, session.topic);

  // Generate via provider (per-persona routing)
  const settings = await loadSettings();
  const apiKeys = resolveApiKeys(settings);
  const provider = getProviderForPersona(personaId, apiKeys);
  const raw = await provider.generate(prompt);

  // Parse and validate against StructuredPlan schema
  const result = parseAndValidate('lane_plan', raw);
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to generate lane plan');
  }

  const structuredSections = result.data as StructuredPlan;
  const timestamp = new Date().toISOString();

  const plan: LanePlan = {
    id: generateId(),
    sessionId: session.id,
    laneId,
    title: `${personaId.charAt(0).toUpperCase() + personaId.slice(1)} Lane Plan`,
    sections: structuredSections,
    sourcePromotionIds: lanePromotions.map(p => p.id),
    confidence: computeConfidence(structuredSections),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  useSemanticStore.getState().addLanePlan(plan);

  // Update session FSM — pass current lane plan count
  const lanePlanCount = useSemanticStore.getState().lanePlans.length;
  const newStatus = sessionTransition(session.status, {
    type: 'LANE_PLAN_CREATED',
    lanePlanCount,
  });
  if (newStatus) {
    useSessionStore.getState().setSession({ ...session, status: newStatus });
    if (newStatus === 'synthesis_ready') {
      useSessionStore.getState().setPlanPanelOpen(true);
      useToastStore.getState().addToast(
        `${lanePlanCount} lane plans ready \u2014 you can now synthesize a unified plan`,
        'info',
        5000,
      );
    }
  }

  return plan;
}

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
    throw new Error(result.error ?? 'Failed to generate direct plan');
  }

  const sections = result.data as StructuredPlan;
  const evidence = extractAllEvidence(sections);
  const timestamp = new Date().toISOString();

  const unifiedPlan: UnifiedPlan = {
    id: generateId(),
    sessionId: session.id,
    sourcePlanIds: [],
    title: `Unified Plan: ${session.topic}`,
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

/**
 * Compute a simple confidence heuristic based on how many sections have
 * multi-point evidence. Returns a value between 0 and 1.
 */
function computeConfidence(sections: StructuredPlan): number {
  const sectionKeys = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;
  let totalEvidence = 0;
  let totalItems = 0;
  for (const key of sectionKeys) {
    const items = sections[key];
    if (Array.isArray(items)) {
      for (const item of items) {
        totalItems += 1;
        totalEvidence += item.evidence.length;
      }
    }
  }
  if (totalItems === 0) return 0;
  // Average evidence per item, capped at 1
  return Math.min(1, totalEvidence / (totalItems * 2));
}
