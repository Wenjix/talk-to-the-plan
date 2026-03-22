import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynthesisPanel } from '../../components/SynthesisPanel/SynthesisPanel';
import type { UnifiedPlan } from '../../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

function makeUnifiedPlan(overrides?: Partial<UnifiedPlan>): UnifiedPlan {
  return {
    id: 'unified-1',
    sessionId: 'session-1',
    sourcePlanIds: [],
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

  it('shows unified plan title when plan exists', () => {
    const plan = makeUnifiedPlan();

    render(
      <SynthesisPanel
        status="synthesized"
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
        unifiedPlan={plan}
      />,
    );

    expect(screen.getByText('Unresolved Questions')).toBeDefined();
    expect(screen.getByText('How to handle edge case X?')).toBeDefined();
    expect(screen.getByText('What budget constraints apply?')).toBeDefined();
  });

  it('shows Talk to Plan button when callback provided', () => {
    const plan = makeUnifiedPlan();
    const handleTalkToPlan = vi.fn();

    render(
      <SynthesisPanel
        status="synthesized"
        unifiedPlan={plan}
        onTalkToPlan={handleTalkToPlan}
      />,
    );

    expect(screen.getByText('Talk to Plan')).toBeDefined();
  });
});
