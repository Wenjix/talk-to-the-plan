import { describe, it, expect, beforeEach } from 'vitest';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useJobStore } from '../../store/job-store';
import type {
  SemanticNode,
  SemanticEdge,
  Promotion,
  PlanningSession,
  GenerationJob,
} from '../../core/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'clarify',
    question: 'What are the key trade-offs?',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeEdge(overrides?: Partial<SemanticEdge>): SemanticEdge {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    sourceNodeId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    createdAt: ts,
    ...overrides,
  };
}

function makePromotion(overrides?: Partial<Promotion>): Promotion {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    nodeId: crypto.randomUUID(),
    reason: 'insightful_reframe',
    createdAt: ts,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<PlanningSession>): PlanningSession {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    topic: 'How to build a sustainable startup from scratch',
    createdAt: ts,
    updatedAt: ts,
    challengeDepth: 'balanced',
    activeLaneId: crypto.randomUUID(),
    status: 'exploring',
    version: 'fuda_v1',
    ...overrides,
  };
}

function makeJob(overrides?: Partial<GenerationJob>): GenerationJob {
  const ts = now();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    targetNodeId: crypto.randomUUID(),
    jobType: 'answer',
    fsmState: 'queued',
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: `idem-${crypto.randomUUID()}`,
    createdAt: ts,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 0 integration tests
// ---------------------------------------------------------------------------

describe('Phase 0 Integration', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    useJobStore.getState().clear();
  });

  // -------------------------------------------------------------------------
  // 1. Create a session and verify store state
  // -------------------------------------------------------------------------
  it('creates a session and reflects it in session-store', () => {
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setUIMode('compass');

    const state = useSessionStore.getState();
    expect(state.session).toEqual(session);
    expect(state.session!.id).toBe(session.id);
    expect(state.session!.topic).toBe(session.topic);
    expect(state.uiMode).toBe('compass');
  });

  // -------------------------------------------------------------------------
  // 2. Add nodes and edges, verify semantic store
  // -------------------------------------------------------------------------
  it('adds multiple nodes with parent-child edges and verifies they are stored', () => {
    const sessionId = crypto.randomUUID();
    const laneId = crypto.randomUUID();

    const root = makeNode({
      sessionId,
      laneId,
      parentId: null,
      nodeType: 'root',
      depth: 0,
      question: 'Root question',
    });

    const child1 = makeNode({
      sessionId,
      laneId,
      parentId: root.id,
      depth: 1,
      question: 'Child 1 question',
    });

    const child2 = makeNode({
      sessionId,
      laneId,
      parentId: root.id,
      depth: 1,
      question: 'Child 2 question',
    });

    const edge1 = makeEdge({
      sessionId,
      laneId,
      sourceNodeId: root.id,
      targetNodeId: child1.id,
    });

    const edge2 = makeEdge({
      sessionId,
      laneId,
      sourceNodeId: root.id,
      targetNodeId: child2.id,
    });

    const store = useSemanticStore.getState();
    store.addNode(root);
    store.addNode(child1);
    store.addNode(child2);
    store.addEdge(edge1);
    store.addEdge(edge2);

    const state = useSemanticStore.getState();
    expect(state.nodes).toHaveLength(3);
    expect(state.edges).toHaveLength(2);

    // Verify root is retrievable
    const foundRoot = state.getNode(root.id);
    expect(foundRoot).toBeDefined();
    expect(foundRoot!.parentId).toBeNull();
    expect(foundRoot!.nodeType).toBe('root');

    // Verify children
    const foundChild1 = state.getNode(child1.id);
    expect(foundChild1).toBeDefined();
    expect(foundChild1!.parentId).toBe(root.id);

    const foundChild2 = state.getNode(child2.id);
    expect(foundChild2).toBeDefined();
    expect(foundChild2!.parentId).toBe(root.id);

    // Verify edges link correctly
    const edgesFromRoot = state.edges.filter(e => e.sourceNodeId === root.id);
    expect(edgesFromRoot).toHaveLength(2);

    const targetIds = edgesFromRoot.map(e => e.targetNodeId).sort();
    expect(targetIds).toEqual([child1.id, child2.id].sort());
  });

  // -------------------------------------------------------------------------
  // 3. Node FSM transitions update store
  // -------------------------------------------------------------------------
  it('node FSM transitions are reflected in the semantic store', () => {
    const node = makeNode({ fsmState: 'idle' });
    useSemanticStore.getState().addNode(node);

    // idle -> generating
    useSemanticStore.getState().updateNode(node.id, {
      fsmState: 'generating',
      updatedAt: now(),
    });

    let updated = useSemanticStore.getState().getNode(node.id)!;
    expect(updated.fsmState).toBe('generating');

    // generating -> resolved with answer
    const answer = {
      summary: 'Key insight about trade-offs',
      bullets: ['Point A', 'Point B', 'Point C'],
    };
    useSemanticStore.getState().updateNode(node.id, {
      fsmState: 'resolved',
      answer,
      updatedAt: now(),
    });

    updated = useSemanticStore.getState().getNode(node.id)!;
    expect(updated.fsmState).toBe('resolved');
    expect(updated.answer).toEqual(answer);
    expect(updated.answer!.summary).toBe('Key insight about trade-offs');
    expect(updated.answer!.bullets).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 4. Job lifecycle in job store
  // -------------------------------------------------------------------------
  it('job transitions through queued -> running -> succeeded and sets resolvedAt', () => {
    const job = makeJob({ fsmState: 'queued' });
    useJobStore.getState().addJob(job);

    // queued -> running
    useJobStore.getState().updateJobState(job.id, { type: 'START' });
    let current = useJobStore.getState().getJob(job.id)!;
    expect(current.fsmState).toBe('running');
    expect(current.resolvedAt).toBeUndefined();

    // running -> succeeded
    useJobStore.getState().updateJobState(job.id, { type: 'SUCCEED' });
    current = useJobStore.getState().getJob(job.id)!;
    expect(current.fsmState).toBe('succeeded');
    expect(current.resolvedAt).toBeDefined();

    // Verify resolvedAt is a valid ISO timestamp
    const resolvedDate = new Date(current.resolvedAt!);
    expect(resolvedDate.getTime()).not.toBeNaN();
  });

  // -------------------------------------------------------------------------
  // 5. Session + semantic store clear
  // -------------------------------------------------------------------------
  it('clearing session and semantic stores resets all state', () => {
    // Populate session store
    const session = makeSession();
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setActiveLane(crypto.randomUUID());
    useSessionStore.getState().setUIMode('exploring');
    useSessionStore.getState().setChallengeDepth('intense');

    // Populate semantic store
    useSemanticStore.getState().addNode(makeNode());
    useSemanticStore.getState().addNode(makeNode());
    useSemanticStore.getState().addEdge(makeEdge());
    useSemanticStore.getState().addPromotion(makePromotion());

    // Populate job store
    useJobStore.getState().addJob(makeJob());

    // Pre-conditions: all populated
    expect(useSessionStore.getState().session).not.toBeNull();
    expect(useSemanticStore.getState().nodes).toHaveLength(2);
    expect(useSemanticStore.getState().edges).toHaveLength(1);
    expect(useSemanticStore.getState().promotions).toHaveLength(1);
    expect(useJobStore.getState().jobs).toHaveLength(1);

    // Clear all stores
    useSessionStore.getState().clear();
    useSemanticStore.getState().clear();
    useJobStore.getState().clear();

    // Verify session store is reset to defaults
    const sessionState = useSessionStore.getState();
    expect(sessionState.session).toBeNull();
    expect(sessionState.activeLaneId).toBeNull();
    expect(sessionState.uiMode).toBe('topic_input');
    expect(sessionState.challengeDepth).toBe('balanced');

    // Verify semantic store is empty
    const semanticState = useSemanticStore.getState();
    expect(semanticState.nodes).toEqual([]);
    expect(semanticState.edges).toEqual([]);
    expect(semanticState.promotions).toEqual([]);
    expect(semanticState.unifiedPlan).toBeNull();

    // Verify job store is empty
    expect(useJobStore.getState().jobs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 6. Load session bulk data
  // -------------------------------------------------------------------------
  it('loadSession bulk-loads nodes, edges, and promotions into semantic store', () => {
    const sessionId = crypto.randomUUID();
    const laneId = crypto.randomUUID();

    const nodes = [
      makeNode({ sessionId, laneId, parentId: null, nodeType: 'root', depth: 0 }),
      makeNode({ sessionId, laneId, depth: 1 }),
      makeNode({ sessionId, laneId, depth: 1 }),
      makeNode({ sessionId, laneId, depth: 2 }),
    ];

    // Wire up parent references
    nodes[1] = { ...nodes[1], parentId: nodes[0].id };
    nodes[2] = { ...nodes[2], parentId: nodes[0].id };
    nodes[3] = { ...nodes[3], parentId: nodes[1].id };

    const edges = [
      makeEdge({ sessionId, laneId, sourceNodeId: nodes[0].id, targetNodeId: nodes[1].id }),
      makeEdge({ sessionId, laneId, sourceNodeId: nodes[0].id, targetNodeId: nodes[2].id }),
      makeEdge({ sessionId, laneId, sourceNodeId: nodes[1].id, targetNodeId: nodes[3].id }),
    ];

    const promotions = [
      makePromotion({ sessionId, laneId, nodeId: nodes[1].id }),
      makePromotion({ sessionId, laneId, nodeId: nodes[2].id, reason: 'risk_identification' }),
    ];

    // Add some initial junk data that should be replaced
    useSemanticStore.getState().addNode(makeNode());
    useSemanticStore.getState().addEdge(makeEdge());

    // Bulk load
    useSemanticStore.getState().loadSession({
      nodes,
      edges,
      promotions,
      lanes: [],
      unifiedPlan: null,
      dialogueTurns: [],
    });

    const state = useSemanticStore.getState();

    // Verify all loaded
    expect(state.nodes).toHaveLength(4);
    expect(state.edges).toHaveLength(3);
    expect(state.promotions).toHaveLength(2);
    expect(state.unifiedPlan).toBeNull();

    // Verify individual nodes are correct
    expect(state.getNode(nodes[0].id)!.nodeType).toBe('root');
    expect(state.getNode(nodes[0].id)!.parentId).toBeNull();
    expect(state.getNode(nodes[1].id)!.parentId).toBe(nodes[0].id);
    expect(state.getNode(nodes[3].id)!.parentId).toBe(nodes[1].id);
    expect(state.getNode(nodes[3].id)!.depth).toBe(2);

    // Verify promotions
    expect(state.promotions[0].nodeId).toBe(nodes[1].id);
    expect(state.promotions[1].reason).toBe('risk_identification');
  });
});
