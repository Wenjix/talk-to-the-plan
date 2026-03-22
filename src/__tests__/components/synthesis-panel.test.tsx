import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SynthesisPanel } from '../../components/SynthesisPanel/SynthesisPanel';
import type { LanePlan, UnifiedPlan } from '../../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeLanePlan(overrides?: Partial<LanePlan>): LanePlan {
  return {
    id: 'plan-1',
    sessionId: 'session-1',
    laneId: 'lane-1',
    title: 'Expansive Plan',
    sections: {
      goals: [{ heading: 'Goal 1', content: ['Achieve X'], evidence: [{ nodeId: 'n1', laneId: 'lane-1', quote: 'Evidence for goal', relevance: 'primary' }] }],
      assumptions: [{ heading: 'Assumption 1', content: ['Assume Y'], evidence: [{ nodeId: 'n2', laneId: 'lane-1', quote: 'Evidence for assumption', relevance: 'supporting' }] }],
      strategy: [{ heading: 'Strategy 1', content: ['Do Z'], evidence: [{ nodeId: 'n3', laneId: 'lane-1', quote: 'Evidence for strategy', relevance: 'primary' }] }],
      milestones: [{ heading: 'Milestone 1', content: ['By Q2'], evidence: [{ nodeId: 'n4', laneId: 'lane-1', quote: 'Evidence for milestone', relevance: 'primary' }] }],
      risks: [{ heading: 'Risk 1', content: ['Might fail'], evidence: [{ nodeId: 'n5', laneId: 'lane-1', quote: 'Evidence for risk', relevance: 'supporting' }] }],
      nextActions: [{ heading: 'Action 1', content: ['Start now'], evidence: [{ nodeId: 'n6', laneId: 'lane-1', quote: 'Evidence for action', relevance: 'primary' }] }],
    },
    sourcePromotionIds: ['promo-1'],
    confidence: 0.85,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeUnifiedPlan(overrides?: Partial<UnifiedPlan>): UnifiedPlan {
  return {
    id: 'unified-1',
    sessionId: 'session-1',
    sourcePlanIds: ['plan-1', 'plan-2', 'plan-3'],
    title: 'Unified Strategic Plan',
    sections: {
      goals: [{ heading: 'Unified Goal', content: ['Combined objective'], evidence: [{ nodeId: 'n1', laneId: 'lane-1', quote: 'Goal evidence', relevance: 'primary' }] }],
      assumptions: [{ heading: 'Unified Assumption', content: ['Shared assumption'], evidence: [{ nodeId: 'n2', laneId: 'lane-2', quote: 'Assumption evidence', relevance: 'supporting' }] }],
      strategy: [{ heading: 'Unified Strategy', content: ['Merged approach'], evidence: [{ nodeId: 'n3', laneId: 'lane-3', quote: 'Strategy evidence', relevance: 'primary' }] }],
      milestones: [{ heading: 'Unified Milestone', content: ['Timeline'], evidence: [{ nodeId: 'n4', laneId: 'lane-1', quote: 'Milestone evidence', relevance: 'primary' }] }],
      risks: [{ heading: 'Unified Risk', content: ['Combined risk'], evidence: [{ nodeId: 'n5', laneId: 'lane-2', quote: 'Risk evidence', relevance: 'supporting' }] }],
      nextActions: [{ heading: 'Unified Action', content: ['Next step'], evidence: [{ nodeId: 'n6', laneId: 'lane-3', quote: 'Action evidence', relevance: 'primary' }] }],
    },
    conflictsResolved: [
      {
        description: 'Scope disagreement between expansive and pragmatic',
        laneAId: 'lane-1',
        laneBId: 'lane-3',
        resolution: 'Adopted a phased approach',
        tradeoff: 'Slower initial rollout but broader final coverage',
      },
    ],
    unresolvedQuestions: [
      'How to handle edge case X?',
      'What budget constraints apply?',
    ],
    evidence: [{ nodeId: 'n1', laneId: 'lane-1', quote: 'Top-level evidence', relevance: 'primary' }],
    revision: 1,
    createdAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SynthesisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Disabled state ---

  it('shows disabled state with progress when fewer than 3 lane plans', () => {
    const plans = [makeLanePlan()];

    render(
      <SynthesisPanel
        status="lane_planning"
        lanePlans={plans}
        unifiedPlan={null}
      />,
    );

    expect(screen.getByText('Generate at least 3 lane plans to enable synthesis')).toBeDefined();
    expect(screen.getByText('1 of 3 lane plans ready')).toBeDefined();
  });

  it('shows 0 of 3 when no lane plans exist', () => {
    render(
      <SynthesisPanel
        status="lane_planning"
        lanePlans={[]}
        unifiedPlan={null}
      />,
    );

    expect(screen.getByText('0 of 3 lane plans ready')).toBeDefined();
  });

  it('shows 2 of 3 progress for two lane plans', () => {
    const plans = [
      makeLanePlan({ id: 'p1', title: 'Plan A' }),
      makeLanePlan({ id: 'p2', title: 'Plan B' }),
    ];

    render(
      <SynthesisPanel
        status="lane_planning"
        lanePlans={plans}
        unifiedPlan={null}
      />,
    );

    expect(screen.getByText('2 of 3 lane plans ready')).toBeDefined();
  });

  // --- Ready state ---

  it('shows "Synthesize Plans" button when synthesis_ready', () => {
    const plans = [
      makeLanePlan({ id: 'p1', title: 'Plan A' }),
      makeLanePlan({ id: 'p2', title: 'Plan B' }),
      makeLanePlan({ id: 'p3', title: 'Plan C' }),
    ];

    render(
      <SynthesisPanel
        status="synthesis_ready"
        lanePlans={plans}
        unifiedPlan={null}
      />,
    );

    expect(screen.getByText('Synthesize Plans')).toBeDefined();
  });

  it('shows plan count and names in the summary', () => {
    const plans = [
      makeLanePlan({ id: 'p1', title: 'Plan A' }),
      makeLanePlan({ id: 'p2', title: 'Plan B' }),
      makeLanePlan({ id: 'p3', title: 'Plan C' }),
    ];

    render(
      <SynthesisPanel
        status="synthesis_ready"
        lanePlans={plans}
        unifiedPlan={null}
      />,
    );

    expect(screen.getByText('3 lane plans ready: Plan A, Plan B, Plan C')).toBeDefined();
  });

  it('calls onSynthesize when the button is clicked', async () => {
    const handleSynthesize = vi.fn().mockResolvedValue(undefined);
    const plans = [
      makeLanePlan({ id: 'p1' }),
      makeLanePlan({ id: 'p2' }),
      makeLanePlan({ id: 'p3' }),
    ];

    render(
      <SynthesisPanel
        status="synthesis_ready"
        lanePlans={plans}
        unifiedPlan={null}
        onSynthesize={handleSynthesize}
      />,
    );

    fireEvent.click(screen.getByText('Synthesize Plans'));

    await waitFor(() => {
      expect(handleSynthesize).toHaveBeenCalledTimes(1);
    });
  });

  // --- Unified plan display ---

  it('shows unified plan title when plan exists', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Unified Strategic Plan')).toBeDefined();
  });

  it('renders unified plan sections', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Unified Goal')).toBeDefined();
    expect(screen.getByText('Combined objective')).toBeDefined();
    expect(screen.getByText('Unified Strategy')).toBeDefined();
    expect(screen.getByText('Merged approach')).toBeDefined();
  });

  it('shows conflictsResolved with descriptions and trade-offs', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Conflicts Resolved')).toBeDefined();
    expect(screen.getByText('Scope disagreement between expansive and pragmatic')).toBeDefined();
    expect(screen.getByText('Resolution: Adopted a phased approach')).toBeDefined();
    expect(screen.getByText('Trade-off: Slower initial rollout but broader final coverage')).toBeDefined();
  });

  it('shows unresolvedQuestions as a list', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Unresolved Questions')).toBeDefined();
    expect(screen.getByText('How to handle edge case X?')).toBeDefined();
    expect(screen.getByText('What budget constraints apply?')).toBeDefined();
  });

  it('shows Re-synthesize button when plan exists and status is synthesis_ready', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesis_ready"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Re-synthesize')).toBeDefined();
  });

  it('does not show Re-synthesize when status is synthesized', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
        lanePlans={[]}
        unifiedPlan={plan}
      />,
    );

    expect(screen.queryByText('Re-synthesize')).toBeNull();
  });
});
