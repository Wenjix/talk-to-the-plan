import type { LanePlan, UnifiedPlan, StructuredPlan, EvidenceRef, ConflictResolution } from '../core/types';
import type { PairwiseReport, LanePlanSummary } from '../generation/prompts/unified-plan';
import { buildPairwiseMapPrompt, buildReducePrompt, buildFormatPrompt } from '../generation/prompts/unified-plan';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { generateId } from '../utils/ids';
import { getDefaultProvider } from '../generation/providers';
import { parseAndValidate } from '../core/validation/schema-gates';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';
import { sessionTransition } from '../core/fsm/session-fsm';
import { extractAllEvidence } from './plan-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate all C(n,2) combinations from an array. */
export function generatePairs<T>(items: T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

/** Summarize a lane plan's sections into a short text for prompts. */
export function extractPlanSummary(plan: LanePlan): string {
  const lines: string[] = [];
  lines.push(`Plan: ${plan.title}`);

  const sectionKeys = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;
  for (const key of sectionKeys) {
    const items = plan.sections[key];
    if (Array.isArray(items) && items.length > 0) {
      const headings = items.map((item) => item.heading).join(', ');
      lines.push(`${key}: ${headings}`);
    }
  }

  return lines.join('\n');
}

/** Build a LanePlanSummary from a LanePlan and its lane label. */
function toLanePlanSummary(plan: LanePlan, label: string): LanePlanSummary {
  return {
    laneId: plan.laneId,
    label,
    title: plan.title,
    goalHeadings: plan.sections.goals.map((g) => g.heading),
    strategyHeadings: plan.sections.strategy.map((s) => s.heading),
  };
}

/** Resolve lane label from the semantic store lanes, falling back to laneId. */
function getLaneLabel(laneId: string): string {
  const lanes = useSemanticStore.getState().lanes;
  const lane = lanes.find((l) => l.id === laneId);
  return lane?.label ?? laneId;
}

// ---------------------------------------------------------------------------
// Synthesis orchestrator
// ---------------------------------------------------------------------------

export async function triggerSynthesis(): Promise<UnifiedPlan> {
  // 1. Validate preconditions
  const session = useSessionStore.getState().session;
  if (!session) {
    throw new Error('No active session');
  }
  if (session.status !== 'synthesis_ready') {
    throw new Error(
      `Cannot trigger synthesis: session status is "${session.status}", expected "synthesis_ready"`,
    );
  }

  const lanePlans = useSemanticStore.getState().lanePlans;
  if (lanePlans.length < 3) {
    throw new Error(
      `Cannot trigger synthesis: need at least 3 lane plans, have ${lanePlans.length}`,
    );
  }

  // 2. Get provider (cross-lane operation uses default provider)
  const settings = await loadSettings();
  const apiKeys = resolveApiKeys(settings);
  const provider = getDefaultProvider(apiKeys);

  // 3. Generate all C(n,2) pairs
  const pairs = generatePairs(lanePlans);

  // 4. Map phase: compare each pair in parallel
  const pairwiseReports = await Promise.all(
    pairs.map(async ([planA, planB]): Promise<PairwiseReport> => {
      const laneALabel = getLaneLabel(planA.laneId);
      const laneBLabel = getLaneLabel(planB.laneId);

      const prompt = buildPairwiseMapPrompt(planA, planB, laneALabel, laneBLabel);
      const raw = await provider.generate(prompt);

      const result = parseAndValidate('pairwise_map', raw);
      if (!result.success) {
        throw new Error(result.error ?? 'Pairwise map failed validation');
      }

      const parsed = result.data as {
        contradictions: Array<{ description: string; planAPosition: string; planBPosition: string }>;
        synergies: Array<{ description: string; sharedInsight: string }>;
        gaps: Array<{ description: string; coveredBy: 'planA' | 'planB'; missingFrom: 'planA' | 'planB' }>;
      };

      return {
        laneALabel,
        laneBLabel,
        contradictions: parsed.contradictions,
        synergies: parsed.synergies,
        gaps: parsed.gaps,
      };
    }),
  );

  // 5. Reduce phase: resolve conflicts
  const reducePrompt = buildReducePrompt(pairwiseReports, lanePlans);
  const reduceRaw = await provider.generate(reducePrompt);

  const reduceResult = parseAndValidate('reduce', reduceRaw);
  if (!reduceResult.success) {
    throw new Error(reduceResult.error ?? 'Reduce phase failed validation');
  }

  const reduceData = reduceResult.data as {
    conflictsResolved: ConflictResolution[];
    unresolvedQuestions: string[];
  };

  // Collect all synergies from pairwise reports
  const allSynergies = pairwiseReports.flatMap((r) => r.synergies);

  // 6. Format phase: generate final unified plan sections
  const lanePlanSummaries = lanePlans.map((plan) =>
    toLanePlanSummary(plan, getLaneLabel(plan.laneId)),
  );

  const formatPrompt = buildFormatPrompt(
    reduceData.conflictsResolved,
    allSynergies,
    lanePlanSummaries,
    session.topic,
  );
  const formatRaw = await provider.generate(formatPrompt);

  const formatResult = parseAndValidate('unified_plan', formatRaw);
  if (!formatResult.success) {
    throw new Error(formatResult.error ?? 'Format phase failed validation');
  }

  // The format prompt asks for StructuredPlan sections directly, and the
  // unified_plan schema gate validates against StructuredPlanSchema — this is
  // intentional: the LLM returns sections in the StructuredPlan shape.
  let sections: StructuredPlan;
  const formatData = formatResult.data as StructuredPlan;
  sections = formatData;

  // 7. Build UnifiedPlan
  const evidence = extractAllEvidence(sections);
  const timestamp = new Date().toISOString();

  const unifiedPlan: UnifiedPlan = {
    id: generateId(),
    sessionId: session.id,
    sourcePlanIds: lanePlans.map((p) => p.id),
    title: `Unified Plan: ${session.topic}`,
    sections,
    conflictsResolved: reduceData.conflictsResolved,
    unresolvedQuestions: reduceData.unresolvedQuestions,
    evidence,
    createdAt: timestamp,
  };

  // 8. Store the plan
  useSemanticStore.getState().setUnifiedPlan(unifiedPlan);

  // 9. Update session FSM
  const newStatus = sessionTransition(session.status, { type: 'SYNTHESIS_TRIGGERED' });
  if (newStatus) {
    useSessionStore.getState().setSession({ ...session, status: newStatus });
  }

  // 10. Return
  return unifiedPlan;
}
