import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LanePlan, PlanningSession, StructuredPlan, ModelLane } from '../../core/types';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { generatePairs, extractPlanSummary, triggerSynthesis } from '../../store/synthesis-actions';

// ---------------------------------------------------------------------------
// Mock the settings store to avoid IndexedDB in tests
// ---------------------------------------------------------------------------
vi.mock('../../persistence/settings-store', () => ({
  loadSettings: vi.fn().mockResolvedValue({ geminiApiKey: '', mistralApiKey: '', anthropicApiKey: '', openaiApiKey: '' }),
  resolveApiKeys: vi.fn().mockReturnValue({ mistral: '', gemini: '', anthropic: '', openai: '' }),
}));

// ---------------------------------------------------------------------------
// Mock the generation providers
// ---------------------------------------------------------------------------
vi.mock('../../generation/providers', () => ({
  getDefaultProvider: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue('{}'),
    generateStream: vi.fn().mockResolvedValue('{}'),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = '2026-03-01T00:00:00.000+00:00';
const sessionId = '00000000-0000-4000-a000-000000000001';

const laneIds = [
  '00000000-0000-4000-a000-000000000010',
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000030',
  '00000000-0000-4000-a000-000000000040',
];

const nodeIds = [
  '00000000-0000-4000-a000-000000000100',
  '00000000-0000-4000-a000-000000000200',
  '00000000-0000-4000-a000-000000000300',
  '00000000-0000-4000-a000-000000000400',
];

function makePlanSection(heading: string, nodeId: string, laneId: string) {
  return {
    heading,
    content: [`Content for ${heading}`],
    evidence: [{
      nodeId,
      laneId,
      quote: `Evidence for ${heading}`,
      relevance: 'primary' as const,
    }],
  };
}

function makeStructuredPlan(nodeId: string, laneId: string): StructuredPlan {
  return {
    goals: [makePlanSection('Goal 1', nodeId, laneId)],
    assumptions: [makePlanSection('Assumption 1', nodeId, laneId)],
    strategy: [makePlanSection('Strategy 1', nodeId, laneId)],
    milestones: [makePlanSection('Milestone 1', nodeId, laneId)],
    risks: [makePlanSection('Risk 1', nodeId, laneId)],
    nextActions: [makePlanSection('Next Action 1', nodeId, laneId)],
  };
}

function makeLanePlan(index: number): LanePlan {
  return {
    id: `00000000-0000-4000-a000-00000000100${index}`,
    sessionId,
    laneId: laneIds[index],
    title: `Lane Plan ${index}`,
    sections: makeStructuredPlan(nodeIds[index], laneIds[index]),
    sourcePromotionIds: [`00000000-0000-4000-a000-00000000200${index}`],
    confidence: 0.8,
    createdAt: now,
    updatedAt: now,
  };
}

function makeLane(index: number): ModelLane {
  const labels = ['Expansive', 'Analytical', 'Pragmatic', 'Socratic'];
  const personas = ['expansive', 'analytical', 'pragmatic', 'socratic'] as const;
  return {
    id: laneIds[index],
    sessionId,
    label: labels[index],
    personaId: personas[index],
    colorToken: '#000000',
    sortOrder: index,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function makeSession(overrides?: Partial<PlanningSession>): PlanningSession {
  return {
    id: sessionId,
    topic: 'How to build a sustainable startup from scratch',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: laneIds[0],
    status: 'synthesis_ready',
    version: 'fuda_v1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generatePairs
// ---------------------------------------------------------------------------

describe('generatePairs', () => {
  it('produces C(4,2) = 6 pairs for 4 items', () => {
    const items = ['a', 'b', 'c', 'd'];
    const pairs = generatePairs(items);
    expect(pairs).toHaveLength(6);
  });

  it('produces C(3,2) = 3 pairs for 3 items', () => {
    const items = [1, 2, 3];
    const pairs = generatePairs(items);
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('produces empty array for empty input', () => {
    const pairs = generatePairs([]);
    expect(pairs).toEqual([]);
  });

  it('produces empty array for single item', () => {
    const pairs = generatePairs(['only']);
    expect(pairs).toEqual([]);
  });

  it('produces 1 pair for 2 items', () => {
    const pairs = generatePairs(['x', 'y']);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual(['x', 'y']);
  });
});

// ---------------------------------------------------------------------------
// extractPlanSummary
// ---------------------------------------------------------------------------

describe('extractPlanSummary', () => {
  it('produces text containing section headings', () => {
    const plan = makeLanePlan(0);
    const summary = extractPlanSummary(plan);
    expect(summary).toContain('Goal 1');
    expect(summary).toContain('Strategy 1');
    expect(summary).toContain('Risk 1');
  });

  it('includes the plan title', () => {
    const plan = makeLanePlan(0);
    const summary = extractPlanSummary(plan);
    expect(summary).toContain('Lane Plan 0');
  });

  it('includes all section keys', () => {
    const plan = makeLanePlan(1);
    const summary = extractPlanSummary(plan);
    expect(summary).toContain('goals:');
    expect(summary).toContain('assumptions:');
    expect(summary).toContain('strategy:');
    expect(summary).toContain('milestones:');
    expect(summary).toContain('risks:');
    expect(summary).toContain('nextActions:');
  });
});

// ---------------------------------------------------------------------------
// triggerSynthesis — precondition checks
// ---------------------------------------------------------------------------

describe('triggerSynthesis preconditions', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
  });

  it('throws when no session exists', async () => {
    await expect(triggerSynthesis()).rejects.toThrow('No active session');
  });

  it('throws when session status is not synthesis_ready', async () => {
    useSessionStore.getState().setSession(makeSession({ status: 'exploring' }));
    await expect(triggerSynthesis()).rejects.toThrow(
      'Cannot trigger synthesis: session status is "exploring"',
    );
  });

  it('throws when fewer than 3 lane plans exist', async () => {
    useSessionStore.getState().setSession(makeSession());
    useSemanticStore.getState().addLanePlan(makeLanePlan(0));
    useSemanticStore.getState().addLanePlan(makeLanePlan(1));

    await expect(triggerSynthesis()).rejects.toThrow(
      'Cannot trigger synthesis: need at least 3 lane plans',
    );
  });
});

// ---------------------------------------------------------------------------
// triggerSynthesis — full flow with mock provider
// ---------------------------------------------------------------------------

describe('triggerSynthesis full flow', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    vi.restoreAllMocks();
  });

  it('executes the 3-stage pipeline and produces a UnifiedPlan', async () => {
    // Set up session
    useSessionStore.getState().setSession(makeSession());

    // Set up lanes
    for (let i = 0; i < 4; i++) {
      useSemanticStore.getState().setLanes([makeLane(0), makeLane(1), makeLane(2), makeLane(3)]);
    }

    // Add 4 lane plans
    for (let i = 0; i < 4; i++) {
      useSemanticStore.getState().addLanePlan(makeLanePlan(i));
    }

    // Mock the pairwise map response
    const mockPairwiseResponse = JSON.stringify({
      contradictions: [{
        description: 'Approach conflict',
        planAPosition: 'Incremental rollout',
        planBPosition: 'Big bang migration',
      }],
      synergies: [{
        description: 'Both prioritize testing',
        sharedInsight: 'Automated testing is crucial',
      }],
      gaps: [{
        description: 'Monitoring gap',
        coveredBy: 'planA',
        missingFrom: 'planB',
      }],
    });

    // Mock the reduce response
    const mockReduceResponse = JSON.stringify({
      conflictsResolved: [{
        description: 'Approach conflict',
        laneAId: laneIds[0],
        laneBId: laneIds[1],
        resolution: 'Phased incremental approach',
        tradeoff: 'Slower but safer',
      }],
      unresolvedQuestions: ['What is the budget for monitoring tools?'],
    });

    // Mock the format response (StructuredPlan)
    const mockFormatResponse = JSON.stringify(
      makeStructuredPlan(nodeIds[0], laneIds[0]),
    );

    // Mock getProvider to return a custom mock
    const { getDefaultProvider } = await import('../../generation/providers');
    vi.mocked(getDefaultProvider).mockReturnValue({
      generate: vi.fn()
        // C(4,2)=6 pairwise calls, then 1 reduce, then 1 format
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockPairwiseResponse)
        .mockResolvedValueOnce(mockReduceResponse)
        .mockResolvedValueOnce(mockFormatResponse),
      generateStream: vi.fn(),
    });

    const result = await triggerSynthesis();

    // Verify the result
    expect(result).toBeDefined();
    expect(result.sessionId).toBe(sessionId);
    expect(result.sourcePlanIds).toHaveLength(4);
    expect(result.title).toContain('Unified Plan');
    expect(result.sections).toBeDefined();
    expect(result.sections.goals).toHaveLength(1);
    expect(result.conflictsResolved).toHaveLength(1);
    expect(result.conflictsResolved[0].resolution).toBe('Phased incremental approach');
    expect(result.unresolvedQuestions).toContain('What is the budget for monitoring tools?');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.createdAt).toBeDefined();

    // Verify the plan was stored
    const storedPlan = useSemanticStore.getState().unifiedPlan;
    expect(storedPlan).toEqual(result);

    // Verify the session status was updated
    const updatedSession = useSessionStore.getState().session;
    expect(updatedSession?.status).toBe('synthesized');
  });

  it('calls provider.generate the correct number of times', async () => {
    // Set up session + 3 lane plans (C(3,2)=3 pairs)
    useSessionStore.getState().setSession(makeSession());
    useSemanticStore.getState().setLanes([makeLane(0), makeLane(1), makeLane(2)]);
    for (let i = 0; i < 3; i++) {
      useSemanticStore.getState().addLanePlan(makeLanePlan(i));
    }

    const mockPairwiseResponse = JSON.stringify({
      contradictions: [],
      synergies: [],
      gaps: [],
    });

    const mockReduceResponse = JSON.stringify({
      conflictsResolved: [],
      unresolvedQuestions: [],
    });

    const mockFormatResponse = JSON.stringify(
      makeStructuredPlan(nodeIds[0], laneIds[0]),
    );

    const mockGenerate = vi.fn()
      .mockResolvedValueOnce(mockPairwiseResponse)
      .mockResolvedValueOnce(mockPairwiseResponse)
      .mockResolvedValueOnce(mockPairwiseResponse)
      .mockResolvedValueOnce(mockReduceResponse)
      .mockResolvedValueOnce(mockFormatResponse);

    const { getDefaultProvider } = await import('../../generation/providers');
    vi.mocked(getDefaultProvider).mockReturnValue({
      generate: mockGenerate,
      generateStream: vi.fn(),
    });

    await triggerSynthesis();

    // 3 pairwise (map) + 1 reduce + 1 format = 5 calls
    expect(mockGenerate).toHaveBeenCalledTimes(5);
  });
});
