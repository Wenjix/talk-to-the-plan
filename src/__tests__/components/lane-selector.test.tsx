import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSessionStore } from '../../store/session-store';
import { useSemanticStore } from '../../store/semantic-store';
import { LaneSelector } from '../../components/LaneSelector/LaneSelector';
import type { ModelLane } from '../../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLanes(): ModelLane[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'lane-expansive',
      sessionId: 'session-1',
      label: 'Expansive',
      personaId: 'expansive',
      colorToken: '#7B4FBF',
      sortOrder: 0,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'lane-analytical',
      sessionId: 'session-1',
      label: 'Analytical',
      personaId: 'analytical',
      colorToken: '#4A90D9',
      sortOrder: 1,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'lane-pragmatic',
      sessionId: 'session-1',
      label: 'Pragmatic',
      personaId: 'pragmatic',
      colorToken: '#3DAA6D',
      sortOrder: 2,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'lane-socratic',
      sessionId: 'session-1',
      label: 'Socratic',
      personaId: 'socratic',
      colorToken: '#D94F4F',
      sortOrder: 3,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// ---------------------------------------------------------------------------
// Session store: lane switching
// ---------------------------------------------------------------------------

describe('session-store lane switching', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
  });

  it('setActiveLane stores the given lane id', () => {
    useSessionStore.getState().setActiveLane('lane-expansive');
    expect(useSessionStore.getState().activeLaneId).toBe('lane-expansive');
  });

  it('setActiveLane can switch between lanes', () => {
    useSessionStore.getState().setActiveLane('lane-expansive');
    expect(useSessionStore.getState().activeLaneId).toBe('lane-expansive');

    useSessionStore.getState().setActiveLane('lane-analytical');
    expect(useSessionStore.getState().activeLaneId).toBe('lane-analytical');

    useSessionStore.getState().setActiveLane('lane-pragmatic');
    expect(useSessionStore.getState().activeLaneId).toBe('lane-pragmatic');

    useSessionStore.getState().setActiveLane('lane-socratic');
    expect(useSessionStore.getState().activeLaneId).toBe('lane-socratic');
  });

  it('clear resets activeLaneId to null', () => {
    useSessionStore.getState().setActiveLane('lane-expansive');
    useSessionStore.getState().clear();
    expect(useSessionStore.getState().activeLaneId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Semantic store: lanes storage
// ---------------------------------------------------------------------------

describe('semantic-store lanes', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
  });

  it('starts with empty lanes array', () => {
    expect(useSemanticStore.getState().lanes).toEqual([]);
  });

  it('setLanes stores lanes in the semantic store', () => {
    const lanes = makeLanes();
    useSemanticStore.getState().setLanes(lanes);

    expect(useSemanticStore.getState().lanes).toHaveLength(4);
    expect(useSemanticStore.getState().lanes[0].personaId).toBe('expansive');
    expect(useSemanticStore.getState().lanes[1].personaId).toBe('analytical');
    expect(useSemanticStore.getState().lanes[2].personaId).toBe('pragmatic');
    expect(useSemanticStore.getState().lanes[3].personaId).toBe('socratic');
  });

  it('setLanes replaces previous lanes', () => {
    const lanes = makeLanes();
    useSemanticStore.getState().setLanes(lanes);
    expect(useSemanticStore.getState().lanes).toHaveLength(4);

    const singleLane = [lanes[0]];
    useSemanticStore.getState().setLanes(singleLane);
    expect(useSemanticStore.getState().lanes).toHaveLength(1);
    expect(useSemanticStore.getState().lanes[0].id).toBe('lane-expansive');
  });

  it('clear resets lanes to empty array', () => {
    useSemanticStore.getState().setLanes(makeLanes());
    expect(useSemanticStore.getState().lanes).toHaveLength(4);

    useSemanticStore.getState().clear();
    expect(useSemanticStore.getState().lanes).toEqual([]);
  });

  it('loadSession includes lanes', () => {
    const lanes = makeLanes();
    useSemanticStore.getState().loadSession({
      nodes: [],
      edges: [],
      promotions: [],
      lanes,
      unifiedPlan: null,
      dialogueTurns: [],
    });

    expect(useSemanticStore.getState().lanes).toHaveLength(4);
    expect(useSemanticStore.getState().lanes).toEqual(lanes);
  });
});

// ---------------------------------------------------------------------------
// LaneSelector component
// ---------------------------------------------------------------------------

describe('LaneSelector component', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
  });

  it('renders 4 tab buttons for 4 lanes', () => {
    const lanes = makeLanes();
    useSessionStore.getState().setActiveLane(lanes[0].id);

    render(<LaneSelector lanes={lanes} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
  });

  it('displays lane labels', () => {
    const lanes = makeLanes();
    useSessionStore.getState().setActiveLane(lanes[0].id);

    render(<LaneSelector lanes={lanes} />);

    expect(screen.getByText('Expansive')).toBeDefined();
    expect(screen.getByText('Analytical')).toBeDefined();
    expect(screen.getByText('Pragmatic')).toBeDefined();
    expect(screen.getByText('Socratic')).toBeDefined();
  });

  it('clicking a tab changes activeLaneId in the session store', () => {
    const lanes = makeLanes();
    useSessionStore.getState().setActiveLane(lanes[0].id);

    render(<LaneSelector lanes={lanes} />);

    // Click on the Analytical tab
    const analyticalButton = screen.getByText('Analytical').closest('button')!;
    fireEvent.click(analyticalButton);

    expect(useSessionStore.getState().activeLaneId).toBe('lane-analytical');
  });

  it('renders with no lanes gracefully', () => {
    render(<LaneSelector lanes={[]} />);

    const tabs = screen.queryAllByRole('tab');
    expect(tabs).toHaveLength(0);
  });
});
