import { describe, it, expect, beforeEach } from 'vitest';
import type { SemanticNode, SemanticEdge } from '../../core/types';
import {
  getCachedAdjacencyIndex,
  invalidateAdjacencyCache,
} from '../../store/adjacency-cache';

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'Test question',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEdge(
  sourceNodeId: string,
  targetNodeId: string,
  overrides?: Partial<SemanticEdge>,
): SemanticEdge {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    sourceNodeId,
    targetNodeId,
    createdAt: now,
    ...overrides,
  };
}

describe('adjacency-cache', () => {
  beforeEach(() => {
    invalidateAdjacencyCache();
  });

  it('returns the same reference for the same inputs', () => {
    const nodes = [makeNode()];
    const edges: SemanticEdge[] = [];

    const index1 = getCachedAdjacencyIndex(nodes, edges);
    const index2 = getCachedAdjacencyIndex(nodes, edges);

    expect(index1).toBe(index2); // Same reference
  });

  it('rebuilds on new node array reference', () => {
    const node = makeNode();
    const nodes1 = [node];
    const edges: SemanticEdge[] = [];

    const index1 = getCachedAdjacencyIndex(nodes1, edges);

    // New array with the same content but different reference
    const nodes2 = [node];
    const index2 = getCachedAdjacencyIndex(nodes2, edges);

    expect(index1).not.toBe(index2); // Different reference = rebuild
  });

  it('rebuilds on new edge array reference', () => {
    const nodes = [makeNode()];
    const edges1: SemanticEdge[] = [];

    const index1 = getCachedAdjacencyIndex(nodes, edges1);

    const edges2: SemanticEdge[] = [];
    const index2 = getCachedAdjacencyIndex(nodes, edges2);

    expect(index1).not.toBe(index2); // Different reference = rebuild
  });

  it('invalidateAdjacencyCache forces a rebuild on next call', () => {
    const nodes = [makeNode()];
    const edges: SemanticEdge[] = [];

    const index1 = getCachedAdjacencyIndex(nodes, edges);

    invalidateAdjacencyCache();

    const index2 = getCachedAdjacencyIndex(nodes, edges);

    // Same arrays but cache was invalidated, so should be a new object
    expect(index1).not.toBe(index2);
  });

  it('index contains correct children and parents', () => {
    const parent = makeNode({ id: 'parent-1' });
    const child1 = makeNode({ id: 'child-1', parentId: 'parent-1' });
    const child2 = makeNode({ id: 'child-2', parentId: 'parent-1' });

    const nodes = [parent, child1, child2];
    const edges = [
      makeEdge('parent-1', 'child-1'),
      makeEdge('parent-1', 'child-2'),
    ];

    const index = getCachedAdjacencyIndex(nodes, edges);

    expect(index.childrenOf.get('parent-1')).toEqual(['child-1', 'child-2']);
    expect(index.parentOf.get('child-1')).toBe('parent-1');
    expect(index.parentOf.get('child-2')).toBe('parent-1');
    expect(index.parentOf.get('parent-1')).toBeUndefined();
  });
});
