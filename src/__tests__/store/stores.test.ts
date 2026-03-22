import { describe, it, expect, beforeEach } from 'vitest';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useJobStore } from '../../store/job-store';
import type { SemanticNode, SemanticEdge, Promotion, PlanningSession, GenerationJob } from '../../core/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'What are the key trade-offs?',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEdge(overrides?: Partial<SemanticEdge>): SemanticEdge {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    sourceNodeId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    createdAt: now,
    ...overrides,
  };
}

function makePromotion(overrides?: Partial<Promotion>): Promotion {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    nodeId: crypto.randomUUID(),
    reason: 'insightful_reframe',
    createdAt: now,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<PlanningSession>): PlanningSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    topic: 'How to build a sustainable startup from scratch',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: crypto.randomUUID(),
    status: 'exploring',
    version: 'fuda_v1',
    ...overrides,
  };
}

function makeJob(overrides?: Partial<GenerationJob>): GenerationJob {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    jobType: 'answer',
    fsmState: 'queued',
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: `idem-${crypto.randomUUID()}`,
    createdAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// semantic-store
// ---------------------------------------------------------------------------

describe('semantic-store', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
  });

  it('addNode adds a node to the store', () => {
    const node = makeNode();
    useSemanticStore.getState().addNode(node);

    expect(useSemanticStore.getState().nodes).toHaveLength(1);
    expect(useSemanticStore.getState().nodes[0]).toEqual(node);
  });

  it('updateNode merges partial updates', () => {
    const node = makeNode();
    useSemanticStore.getState().addNode(node);

    useSemanticStore.getState().updateNode(node.id, { fsmState: 'generating', promoted: true });

    const updated = useSemanticStore.getState().nodes[0];
    expect(updated.fsmState).toBe('generating');
    expect(updated.promoted).toBe(true);
    // Unchanged fields preserved
    expect(updated.question).toBe(node.question);
    expect(updated.id).toBe(node.id);
  });

  it('updateNode does nothing for a non-existent id', () => {
    const node = makeNode();
    useSemanticStore.getState().addNode(node);

    useSemanticStore.getState().updateNode('non-existent-id', { fsmState: 'failed' });

    expect(useSemanticStore.getState().nodes).toHaveLength(1);
    expect(useSemanticStore.getState().nodes[0].fsmState).toBe(node.fsmState);
  });

  it('getNode returns the node by id', () => {
    const node = makeNode();
    useSemanticStore.getState().addNode(node);

    const found = useSemanticStore.getState().getNode(node.id);
    expect(found).toEqual(node);
  });

  it('getNode returns undefined for a non-existent id', () => {
    const found = useSemanticStore.getState().getNode('does-not-exist');
    expect(found).toBeUndefined();
  });

  it('addEdge adds an edge to the store', () => {
    const edge = makeEdge();
    useSemanticStore.getState().addEdge(edge);

    expect(useSemanticStore.getState().edges).toHaveLength(1);
    expect(useSemanticStore.getState().edges[0]).toEqual(edge);
  });

  it('addPromotion adds a promotion to the store', () => {
    const promo = makePromotion();
    useSemanticStore.getState().addPromotion(promo);

    expect(useSemanticStore.getState().promotions).toHaveLength(1);
    expect(useSemanticStore.getState().promotions[0]).toEqual(promo);
  });

  it('removePromotion removes a promotion by id', () => {
    const promo1 = makePromotion();
    const promo2 = makePromotion();
    useSemanticStore.getState().addPromotion(promo1);
    useSemanticStore.getState().addPromotion(promo2);

    useSemanticStore.getState().removePromotion(promo1.id);

    expect(useSemanticStore.getState().promotions).toHaveLength(1);
    expect(useSemanticStore.getState().promotions[0].id).toBe(promo2.id);
  });

  it('removePromotion does nothing for a non-existent id', () => {
    const promo = makePromotion();
    useSemanticStore.getState().addPromotion(promo);

    useSemanticStore.getState().removePromotion('non-existent-id');

    expect(useSemanticStore.getState().promotions).toHaveLength(1);
  });

  it('loadSession replaces all data in bulk', () => {
    // Add some initial data
    useSemanticStore.getState().addNode(makeNode());
    useSemanticStore.getState().addEdge(makeEdge());

    const newNodes = [makeNode(), makeNode()];
    const newEdges = [makeEdge()];
    const newPromotions = [makePromotion()];

    useSemanticStore.getState().loadSession({
      nodes: newNodes,
      edges: newEdges,
      promotions: newPromotions,
      lanes: [],
      lanePlans: [],
      unifiedPlan: null,
      dialogueTurns: [],
    });

    expect(useSemanticStore.getState().nodes).toEqual(newNodes);
    expect(useSemanticStore.getState().edges).toEqual(newEdges);
    expect(useSemanticStore.getState().promotions).toEqual(newPromotions);
    expect(useSemanticStore.getState().lanePlans).toEqual([]);
    expect(useSemanticStore.getState().unifiedPlan).toBeNull();
  });

  it('clear resets all state', () => {
    useSemanticStore.getState().addNode(makeNode());
    useSemanticStore.getState().addEdge(makeEdge());
    useSemanticStore.getState().addPromotion(makePromotion());

    useSemanticStore.getState().clear();

    const state = useSemanticStore.getState();
    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.promotions).toEqual([]);
    expect(state.lanePlans).toEqual([]);
    expect(state.unifiedPlan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// session-store
// ---------------------------------------------------------------------------

describe('session-store', () => {
  beforeEach(() => {
    useSessionStore.getState().clear();
  });

  it('setSession stores a session', () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);

    expect(useSessionStore.getState().session).toEqual(session);
  });

  it('setSession can set to null', () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setSession(null);

    expect(useSessionStore.getState().session).toBeNull();
  });

  it('setActiveLane stores the lane id', () => {
    const laneId = crypto.randomUUID();
    useSessionStore.getState().setActiveLane(laneId);

    expect(useSessionStore.getState().activeLaneId).toBe(laneId);
  });

  it('setActiveLane can set to null', () => {
    useSessionStore.getState().setActiveLane(crypto.randomUUID());
    useSessionStore.getState().setActiveLane(null);

    expect(useSessionStore.getState().activeLaneId).toBeNull();
  });

  it('setChallengeDepth updates the depth', () => {
    useSessionStore.getState().setChallengeDepth('intense');
    expect(useSessionStore.getState().challengeDepth).toBe('intense');

    useSessionStore.getState().setChallengeDepth('gentle');
    expect(useSessionStore.getState().challengeDepth).toBe('gentle');
  });

  it('setUIMode updates the mode', () => {
    useSessionStore.getState().setUIMode('compass');
    expect(useSessionStore.getState().uiMode).toBe('compass');

    useSessionStore.getState().setUIMode('exploring');
    expect(useSessionStore.getState().uiMode).toBe('exploring');
  });

  it('clear resets all state to defaults', () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setActiveLane(crypto.randomUUID());
    useSessionStore.getState().setChallengeDepth('intense');
    useSessionStore.getState().setUIMode('exploring');

    useSessionStore.getState().clear();

    const state = useSessionStore.getState();
    expect(state.session).toBeNull();
    expect(state.activeLaneId).toBeNull();
    expect(state.challengeDepth).toBe('balanced');
    expect(state.uiMode).toBe('topic_input');
  });
});

// ---------------------------------------------------------------------------
// job-store
// ---------------------------------------------------------------------------

describe('job-store', () => {
  beforeEach(() => {
    useJobStore.getState().clear();
  });

  it('addJob adds a job to the store', () => {
    const job = makeJob();
    useJobStore.getState().addJob(job);

    expect(useJobStore.getState().jobs).toHaveLength(1);
    expect(useJobStore.getState().jobs[0]).toEqual(job);
  });

  it('getJob returns the job by id', () => {
    const job = makeJob();
    useJobStore.getState().addJob(job);

    const found = useJobStore.getState().getJob(job.id);
    expect(found).toEqual(job);
  });

  it('getJob returns undefined for a non-existent id', () => {
    const found = useJobStore.getState().getJob('does-not-exist');
    expect(found).toBeUndefined();
  });

  it('getJobsByNode returns all jobs for a given node', () => {
    const nodeId = crypto.randomUUID();
    const job1 = makeJob({ targetNodeId: nodeId });
    const job2 = makeJob({ targetNodeId: nodeId });
    const job3 = makeJob(); // different node

    useJobStore.getState().addJob(job1);
    useJobStore.getState().addJob(job2);
    useJobStore.getState().addJob(job3);

    const results = useJobStore.getState().getJobsByNode(nodeId);
    expect(results).toHaveLength(2);
    const ids = results.map(j => j.id).sort();
    expect(ids).toEqual([job1.id, job2.id].sort());
  });

  it('getJobsByNode returns empty array when no jobs match', () => {
    useJobStore.getState().addJob(makeJob());

    const results = useJobStore.getState().getJobsByNode('non-existent-node');
    expect(results).toEqual([]);
  });

  describe('updateJobState FSM transitions', () => {
    it('START: queued -> running', () => {
      const job = makeJob({ fsmState: 'queued' });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('running');
    });

    it('SUCCEED: running -> succeeded, sets resolvedAt', () => {
      const job = makeJob({ fsmState: 'queued' });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });
      useJobStore.getState().updateJobState(job.id, { type: 'SUCCEED' });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('succeeded');
      expect(updated.resolvedAt).toBeDefined();
    });

    it('FAIL with canRetry:true: running -> retrying, sets resolvedAt undefined', () => {
      const job = makeJob({ fsmState: 'queued' });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });
      useJobStore.getState().updateJobState(job.id, { type: 'FAIL', canRetry: true });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('retrying');
      // retrying is not a terminal state, so resolvedAt should not be set
      expect(updated.resolvedAt).toBeUndefined();
    });

    it('FAIL with canRetry:false: running -> failed, sets resolvedAt', () => {
      const job = makeJob({ fsmState: 'queued' });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });
      useJobStore.getState().updateJobState(job.id, { type: 'FAIL', canRetry: false });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('failed');
      expect(updated.resolvedAt).toBeDefined();
    });

    it('RETRY: retrying -> running, increments attempts', () => {
      const job = makeJob({ fsmState: 'queued', attempts: 0 });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });
      useJobStore.getState().updateJobState(job.id, { type: 'FAIL', canRetry: true });
      useJobStore.getState().updateJobState(job.id, { type: 'RETRY' });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('running');
      expect(updated.attempts).toBe(1);
    });

    it('invalid transition does not change state', () => {
      const job = makeJob({ fsmState: 'queued' });
      useJobStore.getState().addJob(job);

      // SUCCEED is not valid from queued
      useJobStore.getState().updateJobState(job.id, { type: 'SUCCEED' });

      const updated = useJobStore.getState().getJob(job.id)!;
      expect(updated.fsmState).toBe('queued');
    });

    it('full lifecycle: queued -> running -> retrying -> running -> succeeded', () => {
      const job = makeJob({ fsmState: 'queued', attempts: 0 });
      useJobStore.getState().addJob(job);

      useJobStore.getState().updateJobState(job.id, { type: 'START' });
      expect(useJobStore.getState().getJob(job.id)!.fsmState).toBe('running');

      useJobStore.getState().updateJobState(job.id, { type: 'FAIL', canRetry: true });
      expect(useJobStore.getState().getJob(job.id)!.fsmState).toBe('retrying');

      useJobStore.getState().updateJobState(job.id, { type: 'RETRY' });
      const afterRetry = useJobStore.getState().getJob(job.id)!;
      expect(afterRetry.fsmState).toBe('running');
      expect(afterRetry.attempts).toBe(1);

      useJobStore.getState().updateJobState(job.id, { type: 'SUCCEED' });
      const final = useJobStore.getState().getJob(job.id)!;
      expect(final.fsmState).toBe('succeeded');
      expect(final.resolvedAt).toBeDefined();
    });
  });

  it('clear resets all jobs', () => {
    useJobStore.getState().addJob(makeJob());
    useJobStore.getState().addJob(makeJob());

    useJobStore.getState().clear();

    expect(useJobStore.getState().jobs).toEqual([]);
  });
});
