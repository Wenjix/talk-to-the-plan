import { describe, it, expect, beforeEach } from 'vitest';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import {
  promoteNode,
  unpromoteNode,
  getNodePromotion,
  getLanePromotions,
} from '../../store/promotion-actions';
import type { SemanticNode, PlanningSession } from '../../core/types';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('promotion-actions', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
  });

  describe('promoteNode', () => {
    it('succeeds on a resolved node', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const node = makeNode({ fsmState: 'resolved', sessionId: session.id });
      useSemanticStore.getState().addNode(node);

      const promotion = promoteNode(node.id, 'insightful_reframe', 'Great insight');

      expect(promotion).toBeDefined();
      expect(promotion.nodeId).toBe(node.id);
      expect(promotion.reason).toBe('insightful_reframe');
      expect(promotion.note).toBe('Great insight');
      expect(promotion.laneId).toBe(node.laneId);
      expect(promotion.sessionId).toBe(session.id);

      // Node should be marked as promoted in the store
      const updatedNode = useSemanticStore.getState().getNode(node.id);
      expect(updatedNode?.promoted).toBe(true);

      // Promotion should be in the store
      expect(useSemanticStore.getState().promotions).toHaveLength(1);
      expect(useSemanticStore.getState().promotions[0].id).toBe(promotion.id);
    });

    it('fails on an idle node (canPromote guard)', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const node = makeNode({ fsmState: 'idle', sessionId: session.id });
      useSemanticStore.getState().addNode(node);

      expect(() => promoteNode(node.id, 'actionable_detail')).toThrow(
        'Cannot promote node in state: idle',
      );

      // Node should remain unpromoted
      const unchangedNode = useSemanticStore.getState().getNode(node.id);
      expect(unchangedNode?.promoted).toBe(false);

      // No promotions should exist
      expect(useSemanticStore.getState().promotions).toHaveLength(0);
    });

    it('fails on an already promoted node', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const node = makeNode({ fsmState: 'resolved', sessionId: session.id });
      useSemanticStore.getState().addNode(node);

      // First promotion succeeds
      promoteNode(node.id, 'risk_identification');

      // Second promotion fails
      expect(() => promoteNode(node.id, 'cross_domain_link')).toThrow(
        'Node is already promoted',
      );

      // Still only one promotion
      expect(useSemanticStore.getState().promotions).toHaveLength(1);
    });

    it('fails when node does not exist', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      expect(() => promoteNode('nonexistent-id', 'actionable_detail')).toThrow(
        'Node not found: nonexistent-id',
      );
    });

    it('fails when no active session', () => {
      const node = makeNode({ fsmState: 'resolved' });
      useSemanticStore.getState().addNode(node);

      expect(() => promoteNode(node.id, 'actionable_detail')).toThrow(
        'No active session',
      );
    });
  });

  describe('unpromoteNode', () => {
    it('removes promotion and updates node.promoted', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const node = makeNode({ fsmState: 'resolved', sessionId: session.id });
      useSemanticStore.getState().addNode(node);

      promoteNode(node.id, 'assumption_challenge');
      expect(useSemanticStore.getState().promotions).toHaveLength(1);
      expect(useSemanticStore.getState().getNode(node.id)?.promoted).toBe(true);

      unpromoteNode(node.id);

      expect(useSemanticStore.getState().promotions).toHaveLength(0);
      expect(useSemanticStore.getState().getNode(node.id)?.promoted).toBe(false);
    });

    it('is a no-op on a non-promoted node', () => {
      const node = makeNode({ fsmState: 'resolved' });
      useSemanticStore.getState().addNode(node);

      // Should not throw
      unpromoteNode(node.id);

      expect(useSemanticStore.getState().promotions).toHaveLength(0);
      expect(useSemanticStore.getState().getNode(node.id)?.promoted).toBe(false);
    });
  });

  describe('getNodePromotion', () => {
    it('returns the promotion for a promoted node', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const node = makeNode({ fsmState: 'resolved', sessionId: session.id });
      useSemanticStore.getState().addNode(node);

      const promotion = promoteNode(node.id, 'cross_domain_link');
      const found = getNodePromotion(node.id);

      expect(found).toEqual(promotion);
    });

    it('returns undefined for a non-promoted node', () => {
      const found = getNodePromotion('some-node-id');
      expect(found).toBeUndefined();
    });
  });

  describe('getLanePromotions', () => {
    it('filters promotions by lane', () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      const laneA = crypto.randomUUID();
      const laneB = crypto.randomUUID();

      const nodeA1 = makeNode({ fsmState: 'resolved', sessionId: session.id, laneId: laneA });
      const nodeA2 = makeNode({ fsmState: 'resolved', sessionId: session.id, laneId: laneA });
      const nodeB1 = makeNode({ fsmState: 'resolved', sessionId: session.id, laneId: laneB });

      useSemanticStore.getState().addNode(nodeA1);
      useSemanticStore.getState().addNode(nodeA2);
      useSemanticStore.getState().addNode(nodeB1);

      promoteNode(nodeA1.id, 'insightful_reframe');
      promoteNode(nodeA2.id, 'actionable_detail');
      promoteNode(nodeB1.id, 'risk_identification');

      const laneAPromotions = getLanePromotions(laneA);
      expect(laneAPromotions).toHaveLength(2);
      expect(laneAPromotions.every(p => p.laneId === laneA)).toBe(true);

      const laneBPromotions = getLanePromotions(laneB);
      expect(laneBPromotions).toHaveLength(1);
      expect(laneBPromotions[0].laneId).toBe(laneB);
    });

    it('returns empty array for lane with no promotions', () => {
      const result = getLanePromotions('nonexistent-lane');
      expect(result).toEqual([]);
    });
  });
});
