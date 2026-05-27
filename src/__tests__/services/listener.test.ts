import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PlanningSession, SemanticNode } from '../../core/types';

// Mock the anthropic provider BEFORE importing listener/scheduler so module-level imports capture the mock.
const mockProviderGenerate = vi.fn<(prompt: string) => Promise<string>>();
vi.mock('../../generation/providers', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '../../generation/providers',
  );
  return {
    ...actual,
    getProviderById: () => ({
      generate: (prompt: string) => mockProviderGenerate(prompt),
      generateStream: async () => '',
    }),
  };
});

// Mock branchFromNode to avoid touching the real generate() pipeline.
const mockBranchFromNode = vi.fn<
  (nodeId: string, pathType: string, question?: string) => Promise<void>
>();
vi.mock('../../store/actions', () => ({
  exploreFromVoice: (nodeId: string, pathType: string, seedQuestion: string) =>
    mockBranchFromNode(nodeId, pathType, seedQuestion),
  MAX_BRANCH_DEPTH: 15,
}));

import { useTranscriptStore } from '../../store/transcript-store';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useCompanionStore } from '../../store/companion-store';
import {
  startListener,
  stopListener,
  __resetListenerForTest,
} from '../../services/voice/listener';
import {
  __resetSchedulerForTest,
  getRecentlySubmittedQuestions,
} from '../../store/branch-scheduler';

function makeSession(): PlanningSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    topic: 'Audio-native brainstorming',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: crypto.randomUUID(),
    status: 'exploring',
    version: 'fuda_v1',
  };
}

function makeNode(sessionId: string): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId,
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'What shape should the companion listener take?',
    fsmState: 'resolved',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
  };
}

describe('listener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockProviderGenerate.mockReset();
    mockBranchFromNode.mockReset();
    mockBranchFromNode.mockResolvedValue(undefined);
    __resetListenerForTest();
    __resetSchedulerForTest();
    useTranscriptStore.getState().clear();
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    useCompanionStore.getState().reset();
  });

  afterEach(() => {
    stopListener();
    __resetSchedulerForTest();
    vi.useRealTimers();
  });

  it('fires after a final transcript segment and enqueues valid high-confidence intents', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const anchor = makeNode(session.id);
    useSemanticStore.getState().addNode(anchor);
    useCompanionStore.getState().setLastFocusedNodeId(anchor.id);

    mockProviderGenerate.mockResolvedValue(
      JSON.stringify({
        intents: [
          {
            pathType: 'go-deeper',
            seedQuestion: 'How does the listener debounce partial transcripts effectively?',
            confidence: 0.82,
            rationale: 'User expressed curiosity about timing.',
          },
          {
            pathType: 'challenge',
            seedQuestion: 'Low confidence probe (should be filtered)',
            confidence: 0.4,
          },
        ],
      }),
    );

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'I think the listener should only fire when the user finishes a thought — maybe a short silence threshold.',
      startMs: 0,
      endMs: 4000,
    });

    await vi.advanceTimersByTimeAsync(300);
    // allow the async Haiku call to resolve + scheduler drain
    await vi.advanceTimersByTimeAsync(600);

    expect(mockProviderGenerate).toHaveBeenCalledTimes(1);
    expect(mockBranchFromNode).toHaveBeenCalledTimes(1);
    expect(mockBranchFromNode).toHaveBeenCalledWith(
      anchor.id,
      'go-deeper',
      'How does the listener debounce partial transcripts effectively?',
    );
    expect(getRecentlySubmittedQuestions()).toContain(
      'How does the listener debounce partial transcripts effectively?',
    );
  });

  it('does not fire for short transcripts below the 20-char threshold', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'hmm.',
      startMs: 0,
      endMs: 400,
    });

    await vi.advanceTimersByTimeAsync(600);

    expect(mockProviderGenerate).not.toHaveBeenCalled();
    expect(mockBranchFromNode).not.toHaveBeenCalled();
  });

  it('extracts JSON from a narrated Haiku response (prose before the object)', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const anchor = makeNode(session.id);
    useSemanticStore.getState().addNode(anchor);
    useCompanionStore.getState().setLastFocusedNodeId(anchor.id);

    mockProviderGenerate.mockResolvedValue(
      'Here is the analysis of what the user is saying: {"intents":[{"pathType":"challenge","seedQuestion":"Is this assumption actually backed by evidence or intuition?","confidence":0.78}]}',
    );

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'I keep saying X is true but I never really checked that claim — it might be bogus.',
      startMs: 0,
      endMs: 4000,
    });

    await vi.advanceTimersByTimeAsync(900);

    expect(mockBranchFromNode).toHaveBeenCalledWith(
      anchor.id,
      'challenge',
      'Is this assumption actually backed by evidence or intuition?',
    );
  });

  it('fires via hard maxDeferral when interims keep streaming without a final', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    const anchor = makeNode(session.id);
    useSemanticStore.getState().addNode(anchor);

    mockProviderGenerate.mockResolvedValue(
      JSON.stringify({
        intents: [
          {
            pathType: 'go-deeper',
            seedQuestion: 'What are the concrete constraints we have been ignoring?',
            confidence: 0.75,
          },
        ],
      }),
    );

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 500,
      interimIdleMs: 1500,
      maxDeferralMs: 2000,
    });

    // Simulate continuous interim updates that keep arriving every 400ms
    // — the idle timer would normally be pushed forever, but maxDeferralMs
    // should force a fire within ~2s.
    for (let i = 0; i < 8; i++) {
      useTranscriptStore.getState().appendInterim(
        `The user is rambling on and on about some idea number ${i} that keeps evolving`,
      );
      await vi.advanceTimersByTimeAsync(400);
    }

    await vi.advanceTimersByTimeAsync(600);

    expect(mockProviderGenerate).toHaveBeenCalledTimes(1);
    expect(mockBranchFromNode).toHaveBeenCalled();
  });

  it('listener errors do not permanently move companion status to error', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    mockProviderGenerate.mockRejectedValueOnce(new Error('transient 429'));

    useCompanionStore.getState().setStatus('listening');

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'Speaking enough to fire the listener that will reject with a rate-limit error.',
      startMs: 0,
      endMs: 3000,
    });

    await vi.advanceTimersByTimeAsync(600);

    expect(useCompanionStore.getState().status).toBe('listening');
  });

  it('does not call Haiku before any resolved anchor exists in the session', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    // Only a generating root — no resolved anchor yet.
    const root = makeNode(session.id);
    root.fsmState = 'generating';
    useSemanticStore.getState().addNode(root);

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 500,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'This is a reasonably long utterance spoken before the root has resolved.',
      startMs: 0,
      endMs: 4000,
    });

    await vi.advanceTimersByTimeAsync(1500);

    expect(mockProviderGenerate).not.toHaveBeenCalled();

    // When the root resolves, a subsequent re-poll fires.
    useSemanticStore
      .getState()
      .updateNode(root.id, { fsmState: 'resolved' });
    await vi.advanceTimersByTimeAsync(1200);

    expect(mockProviderGenerate).toHaveBeenCalled();
  });

  it('gracefully handles a malformed listener JSON response', async () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSemanticStore.getState().addNode(makeNode(session.id));

    mockProviderGenerate.mockResolvedValue('this is not JSON at all');

    startListener({
      anthropicKey: 'sk-ant-test',
      model: 'claude-haiku-4-5',
      language: 'English',
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });

    useTranscriptStore.getState().commitFinal({
      text: 'Speaking long enough to trigger the listener call with junk output.',
      startMs: 0,
      endMs: 3000,
    });

    await vi.advanceTimersByTimeAsync(600);

    expect(mockProviderGenerate).toHaveBeenCalledTimes(1);
    expect(mockBranchFromNode).not.toHaveBeenCalled();
    expect(useCompanionStore.getState().status).not.toBe('error');
  });
});
