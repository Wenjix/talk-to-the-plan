import { describe, it, expect, beforeEach } from 'vitest';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useJobStore } from '../../store/job-store';
import { useViewStore } from '../../store/view-store';
import type {
  SemanticNode,
  SemanticEdge,
  Promotion,
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

// ---------------------------------------------------------------------------
// Actions integration tests
// ---------------------------------------------------------------------------

describe('Actions integration', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    useJobStore.getState().clear();
    useViewStore.getState().clear();
  });

  // -------------------------------------------------------------------------
  // 1. createSession creates session and sets stores
  // -------------------------------------------------------------------------
  describe('createSession action', () => {
    it('creates session, sets stores, and switches uiMode to compass', async () => {
      // Import createSession dynamically to avoid module-level side effects
      const { createSession } = await import('../../store/actions');

      const session = await createSession(
        'How to build a sustainable startup from scratch',
      );

      // Session is set in session-store
      const sessionState = useSessionStore.getState();
      expect(sessionState.session).not.toBeNull();
      expect(sessionState.session!.id).toBe(session.id);
      expect(sessionState.session!.topic).toBe(
        'How to build a sustainable startup from scratch',
      );

      // uiMode is set to compass
      expect(sessionState.uiMode).toBe('compass');

      // activeLaneId is set
      expect(sessionState.activeLaneId).toBeDefined();
      expect(sessionState.activeLaneId).not.toBeNull();

      // Session object has the right shape
      expect(session.version).toBe('fuda_v1');
      expect(session.status).toBe('exploring');
      expect(session.challengeDepth).toBe('balanced');

      // Semantic store was cleared (no leftover data)
      expect(useSemanticStore.getState().nodes).toEqual([]);
      expect(useSemanticStore.getState().edges).toEqual([]);

      // Job store was cleared
      expect(useJobStore.getState().jobs).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // 2. createSession rejects short topics
    // -----------------------------------------------------------------------
    it('rejects topics shorter than 10 characters', async () => {
      const { createSession } = await import('../../store/actions');

      await expect(createSession('short')).rejects.toThrow(
        'Topic must be at least 10 characters',
      );

      await expect(createSession('')).rejects.toThrow(
        'Topic must be at least 10 characters',
      );

      await expect(createSession('123456789')).rejects.toThrow(
        'Topic must be at least 10 characters',
      );

      // Exactly 10 chars should succeed
      const session = await createSession('1234567890');
      expect(session).toBeDefined();
      expect(session.topic).toBe('1234567890');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Store getNode returns correct node
  // -------------------------------------------------------------------------
  it('getNode returns the correct node among multiple', () => {
    const sessionId = crypto.randomUUID();
    const laneId = crypto.randomUUID();

    const nodeA = makeNode({
      sessionId,
      laneId,
      question: 'Node A question',
    });
    const nodeB = makeNode({
      sessionId,
      laneId,
      question: 'Node B question',
    });
    const nodeC = makeNode({
      sessionId,
      laneId,
      question: 'Node C question',
    });

    useSemanticStore.getState().addNode(nodeA);
    useSemanticStore.getState().addNode(nodeB);
    useSemanticStore.getState().addNode(nodeC);

    expect(useSemanticStore.getState().nodes).toHaveLength(3);

    const foundA = useSemanticStore.getState().getNode(nodeA.id);
    expect(foundA).toBeDefined();
    expect(foundA!.question).toBe('Node A question');
    expect(foundA!.id).toBe(nodeA.id);

    const foundB = useSemanticStore.getState().getNode(nodeB.id);
    expect(foundB).toBeDefined();
    expect(foundB!.question).toBe('Node B question');

    const foundC = useSemanticStore.getState().getNode(nodeC.id);
    expect(foundC).toBeDefined();
    expect(foundC!.question).toBe('Node C question');

    // Non-existent node returns undefined
    expect(useSemanticStore.getState().getNode('nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 4. Multiple nodes with edges form a tree
  // -------------------------------------------------------------------------
  it('multiple nodes with edges form a correct tree structure', () => {
    const sessionId = crypto.randomUUID();
    const laneId = crypto.randomUUID();

    const root = makeNode({
      sessionId,
      laneId,
      parentId: null,
      nodeType: 'root',
      question: 'Root: What is the main goal?',
      depth: 0,
    });

    const child1 = makeNode({
      sessionId,
      laneId,
      parentId: root.id,
      question: 'Child 1: How to achieve it?',
      depth: 1,
    });

    const child2 = makeNode({
      sessionId,
      laneId,
      parentId: root.id,
      question: 'Child 2: What are the risks?',
      depth: 1,
    });

    const edgeRootToChild1 = makeEdge({
      sessionId,
      laneId,
      sourceNodeId: root.id,
      targetNodeId: child1.id,
    });

    const edgeRootToChild2 = makeEdge({
      sessionId,
      laneId,
      sourceNodeId: root.id,
      targetNodeId: child2.id,
    });

    const store = useSemanticStore.getState();
    store.addNode(root);
    store.addNode(child1);
    store.addNode(child2);
    store.addEdge(edgeRootToChild1);
    store.addEdge(edgeRootToChild2);

    const state = useSemanticStore.getState();

    // Verify tree structure via edges
    const edgesFromRoot = state.edges.filter(
      (e) => e.sourceNodeId === root.id,
    );
    expect(edgesFromRoot).toHaveLength(2);

    // Both edges originate from root
    edgesFromRoot.forEach((e) => {
      expect(e.sourceNodeId).toBe(root.id);
    });

    // Edges target the two children
    const targets = edgesFromRoot.map((e) => e.targetNodeId).sort();
    expect(targets).toEqual([child1.id, child2.id].sort());

    // Each child references root as parent
    expect(state.getNode(child1.id)!.parentId).toBe(root.id);
    expect(state.getNode(child2.id)!.parentId).toBe(root.id);

    // No edges from children (they are leaves)
    const edgesFromChild1 = state.edges.filter(
      (e) => e.sourceNodeId === child1.id,
    );
    expect(edgesFromChild1).toHaveLength(0);

    const edgesFromChild2 = state.edges.filter(
      (e) => e.sourceNodeId === child2.id,
    );
    expect(edgesFromChild2).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. Promotion add/remove round trip
  // -------------------------------------------------------------------------
  it('adds and removes promotions in a round trip', () => {
    const sessionId = crypto.randomUUID();
    const laneId = crypto.randomUUID();
    const nodeId = crypto.randomUUID();

    const promo = makePromotion({
      sessionId,
      laneId,
      nodeId,
      reason: 'actionable_detail',
      note: 'This is highly actionable',
    });

    // Add the promotion
    useSemanticStore.getState().addPromotion(promo);

    let state = useSemanticStore.getState();
    expect(state.promotions).toHaveLength(1);
    expect(state.promotions[0].id).toBe(promo.id);
    expect(state.promotions[0].reason).toBe('actionable_detail');
    expect(state.promotions[0].note).toBe('This is highly actionable');
    expect(state.promotions[0].nodeId).toBe(nodeId);

    // Add a second promotion
    const promo2 = makePromotion({
      sessionId,
      laneId,
      nodeId: crypto.randomUUID(),
      reason: 'risk_identification',
    });
    useSemanticStore.getState().addPromotion(promo2);

    state = useSemanticStore.getState();
    expect(state.promotions).toHaveLength(2);

    // Remove the first promotion
    useSemanticStore.getState().removePromotion(promo.id);

    state = useSemanticStore.getState();
    expect(state.promotions).toHaveLength(1);
    expect(state.promotions[0].id).toBe(promo2.id);

    // Remove the second promotion
    useSemanticStore.getState().removePromotion(promo2.id);

    state = useSemanticStore.getState();
    expect(state.promotions).toHaveLength(0);

    // Removing a non-existent promotion is a no-op
    useSemanticStore.getState().removePromotion('does-not-exist');
    expect(useSemanticStore.getState().promotions).toHaveLength(0);
  });
});
