import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SemanticNode, PlanningSession } from '../../core/types';

// Mock exploreFromVoice BEFORE importing the scheduler so the module graph picks it up.
const mockExploreFromVoice = vi.fn<
  (nodeId: string, pathType: string, seedQuestion: string) => Promise<void>
>();
vi.mock('../../store/actions', () => ({
  exploreFromVoice: (nodeId: string, pathType: string, seedQuestion: string) =>
    mockExploreFromVoice(nodeId, pathType, seedQuestion),
  MAX_BRANCH_DEPTH: 15,
}));

import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useCompanionStore } from '../../store/companion-store';
import {
  enqueueIntent,
  clearSchedulerQueue,
  configureScheduler,
  getRecentlySubmittedQuestions,
  getQueueDepth,
  __resetSchedulerForTest,
  __inFlightCountForTest,
} from '../../store/branch-scheduler';

function makeSession(): PlanningSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    topic: 'How to design a companion mode',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: crypto.randomUUID(),
    status: 'exploring',
    version: 'fuda_v1',
  };
}

function makeNode(sessionId: string, overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId,
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'Parent question',
    fsmState: 'resolved',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function flush(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('branch-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExploreFromVoice.mockReset();
    mockExploreFromVoice.mockResolvedValue(undefined);
    __resetSchedulerForTest();
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    useCompanionStore.getState().reset();
  });

  afterEach(() => {
    __resetSchedulerForTest();
    vi.useRealTimers();
  });

  it('drains an intent to branchFromNode with the resolved fallback anchor', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const anchor = makeNode(session.id, { fsmState: 'resolved' });
    useSemanticStore.getState().addNode(anchor);

    enqueueIntent({
      pathType: 'challenge',
      seedQuestion: 'But what if the assumption is wrong?',
      confidence: 0.8,
    });

    await flush(600);

    expect(mockExploreFromVoice).toHaveBeenCalledTimes(1);
    expect(mockExploreFromVoice).toHaveBeenCalledWith(
      anchor.id,
      'challenge',
      'But what if the assumption is wrong?',
    );
  });

  it('dedupes an intent whose seed was just submitted', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'How does the pricing model actually work?',
      confidence: 0.8,
    });
    await flush(600);
    expect(mockExploreFromVoice).toHaveBeenCalledTimes(1);

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'How does the pricing model actually work?',
      confidence: 0.8,
    });
    await flush(600);
    expect(mockExploreFromVoice).toHaveBeenCalledTimes(1);
  });

  it('respects per-minute submission cap', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    configureScheduler({ perMinuteCap: 2 });

    for (let i = 0; i < 5; i++) {
      enqueueIntent({
        pathType: 'go-deeper',
        seedQuestion: `Unique exploration question number ${i}?`,
        confidence: 0.75,
      });
    }

    await flush(3000);

    expect(mockExploreFromVoice).toHaveBeenCalledTimes(2);
    // remaining intents should still be queued, awaiting next window
    expect(getQueueDepth()).toBeGreaterThan(0);
  });

  it('records submitted questions and exposes them via getRecentlySubmittedQuestions', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    enqueueIntent({
      pathType: 'clarify',
      seedQuestion: 'What specifically distinguishes our offer from competitors?',
      confidence: 0.9,
    });

    await flush(600);

    const recent = getRecentlySubmittedQuestions(60_000);
    expect(recent).toContain('What specifically distinguishes our offer from competitors?');
  });

  it('uses anchorHint to pick a resolved node whose question contains the hint', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const pricingNode = makeNode(session.id, {
      question: 'How should we structure pricing for SMB customers?',
      fsmState: 'resolved',
    });
    const otherNode = makeNode(session.id, {
      question: 'What channels should we use for distribution?',
      fsmState: 'resolved',
      createdAt: new Date(Date.now() + 1000).toISOString(),
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    useSemanticStore.getState().addNode(pricingNode);
    useSemanticStore.getState().addNode(otherNode);

    enqueueIntent({
      anchorHint: 'pricing',
      pathType: 'challenge',
      seedQuestion: 'Is the SMB pricing actually defensible vs. open-source alternatives?',
      confidence: 0.85,
    });

    await flush(600);

    expect(mockExploreFromVoice).toHaveBeenCalledWith(
      pricingNode.id,
      'challenge',
      'Is the SMB pricing actually defensible vs. open-source alternatives?',
    );
  });

  it('does not record submission when branchFromNode rejects (dedupe list stays clean)', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));
    mockExploreFromVoice.mockRejectedValueOnce(new Error('depth limit'));

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'A question that will fail to branch',
      confidence: 0.8,
    });

    await flush(600);

    expect(mockExploreFromVoice).toHaveBeenCalledTimes(1);
    expect(getRecentlySubmittedQuestions()).not.toContain(
      'A question that will fail to branch',
    );
  });

  it('drops the intent after the 45s anchor-retry window', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    // Only generating node — not eligible as anchor.
    useSemanticStore.getState().addNode(
      makeNode(session.id, { fsmState: 'generating' }),
    );

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'Question with no anchor available',
      confidence: 0.8,
    });

    // Walk past the 45s retry ceiling.
    await flush(47_000);

    expect(mockExploreFromVoice).not.toHaveBeenCalled();
    expect(getQueueDepth()).toBe(0);
  });

  it('lands the intent as soon as the root resolves within the retry window', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const pending = makeNode(session.id, { fsmState: 'generating' });
    useSemanticStore.getState().addNode(pending);

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'Spoken early — should land once root resolves',
      confidence: 0.8,
    });

    // Sit in retry for 6s while the root finishes generating.
    await flush(6000);
    expect(mockExploreFromVoice).not.toHaveBeenCalled();

    // Root resolves. Next drain tick should pick the intent up.
    useSemanticStore.getState().updateNode(pending.id, { fsmState: 'resolved' });
    await flush(2000);

    expect(mockExploreFromVoice).toHaveBeenCalledTimes(1);
    expect(mockExploreFromVoice).toHaveBeenCalledWith(
      pending.id,
      'go-deeper',
      'Spoken early — should land once root resolves',
    );
  });

  it('filters anchors at MAX_BRANCH_DEPTH', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const deepNode = makeNode(session.id, {
      fsmState: 'resolved',
      depth: 15, // at the limit — should NOT be picked
    });
    useSemanticStore.getState().addNode(deepNode);

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'Probe that would overflow depth',
      confidence: 0.8,
    });

    await flush(12_000);

    expect(mockExploreFromVoice).not.toHaveBeenCalled();
  });

  it('clearSchedulerQueue during a drain keeps inFlight non-negative', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    let resolveBranch: (() => void) = () => {};
    mockExploreFromVoice.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveBranch = resolve;
        }),
    );

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'Intent mid-drain when clear fires',
      confidence: 0.8,
    });

    await flush(600);
    expect(__inFlightCountForTest()).toBe(1);

    // User hits Stop while the branchFromNode promise is still pending.
    clearSchedulerQueue();
    expect(__inFlightCountForTest()).toBe(0);

    // Resolve the original promise — the finally block must NOT push into
    // a cleared generation.
    resolveBranch();
    await flush(10);
    expect(__inFlightCountForTest()).toBe(0);
  });

  it('clearSchedulerQueue empties queue and submissions', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    enqueueIntent({
      pathType: 'go-deeper',
      seedQuestion: 'Queued for clearing',
      confidence: 0.7,
    });
    clearSchedulerQueue();

    expect(getQueueDepth()).toBe(0);
    expect(getRecentlySubmittedQuestions()).toHaveLength(0);
  });
});
