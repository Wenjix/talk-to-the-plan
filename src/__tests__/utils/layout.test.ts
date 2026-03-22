import { describe, it, expect } from 'vitest';
import { calculateTreeLayout, getNewChildPosition } from '../../utils/layout';
import type { SemanticNode, SemanticEdge } from '../../core/types';

// ---------------------------------------------------------------------------
// Helpers to build minimal node/edge objects for layout testing
// ---------------------------------------------------------------------------

function makeLayoutNode(overrides: {
  id: string;
  parentId?: string | null;
  depth?: number;
}): SemanticNode {
  const ts = new Date().toISOString();
  return {
    id: overrides.id,
    sessionId: 'session-1',
    laneId: 'lane-1',
    parentId: overrides.parentId ?? null,
    nodeType: 'exploration',
    pathType: 'clarify',
    question: 'test',
    fsmState: 'idle',
    promoted: false,
    depth: overrides.depth ?? 0,
    createdAt: ts,
    updatedAt: ts,
  };
}

function makeLayoutEdge(source: string, target: string): SemanticEdge {
  const ts = new Date().toISOString();
  return {
    id: `edge-${source}-${target}`,
    sessionId: 'session-1',
    laneId: 'lane-1',
    sourceNodeId: source,
    targetNodeId: target,
    createdAt: ts,
  };
}

// ---------------------------------------------------------------------------
// calculateTreeLayout tests
// ---------------------------------------------------------------------------

describe('calculateTreeLayout', () => {
  // -------------------------------------------------------------------------
  // 1. Empty nodes returns empty map
  // -------------------------------------------------------------------------
  it('returns an empty map for empty nodes', () => {
    const result = calculateTreeLayout([], []);
    expect(result.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Single root node positioned at origin area
  // -------------------------------------------------------------------------
  it('places a single root node at the origin area', () => {
    const root = makeLayoutNode({ id: 'root', depth: 0 });

    const result = calculateTreeLayout([root], []);

    expect(result.size).toBe(1);
    expect(result.has('root')).toBe(true);

    const pos = result.get('root')!;
    // A single node: its subtree width is NODE_WIDTH (320).
    // positionNode is called with x = 0 + 320/2 = 160, y = 0
    expect(pos.x).toBe(160);
    expect(pos.y).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Root with 2 children: children below parent, evenly spaced
  // -------------------------------------------------------------------------
  it('positions two children below the root and evenly spaced', () => {
    const root = makeLayoutNode({ id: 'root', depth: 0 });
    const child1 = makeLayoutNode({
      id: 'child1',
      parentId: 'root',
      depth: 1,
    });
    const child2 = makeLayoutNode({
      id: 'child2',
      parentId: 'root',
      depth: 1,
    });

    const edges = [
      makeLayoutEdge('root', 'child1'),
      makeLayoutEdge('root', 'child2'),
    ];

    const result = calculateTreeLayout([root, child1, child2], edges);

    expect(result.size).toBe(3);

    const rootPos = result.get('root')!;
    const child1Pos = result.get('child1')!;
    const child2Pos = result.get('child2')!;

    // Children should be below the root (higher y value)
    expect(child1Pos.y).toBeGreaterThan(rootPos.y);
    expect(child2Pos.y).toBeGreaterThan(rootPos.y);

    // Both children at the same depth should be at the same y
    expect(child1Pos.y).toBe(child2Pos.y);

    // Children should be horizontally spaced (different x values)
    expect(child1Pos.x).not.toBe(child2Pos.x);

    // The root should be horizontally centered between the two children
    const childCenterX = (child1Pos.x + child2Pos.x) / 2;
    expect(rootPos.x).toBeCloseTo(childCenterX, 5);
  });

  // -------------------------------------------------------------------------
  // 4. Deep chain: each level deeper in Y
  // -------------------------------------------------------------------------
  it('positions a deep chain with each level progressively deeper in Y', () => {
    const nodeA = makeLayoutNode({ id: 'A', depth: 0 });
    const nodeB = makeLayoutNode({ id: 'B', parentId: 'A', depth: 1 });
    const nodeC = makeLayoutNode({ id: 'C', parentId: 'B', depth: 2 });
    const nodeD = makeLayoutNode({ id: 'D', parentId: 'C', depth: 3 });

    const edges = [
      makeLayoutEdge('A', 'B'),
      makeLayoutEdge('B', 'C'),
      makeLayoutEdge('C', 'D'),
    ];

    const result = calculateTreeLayout(
      [nodeA, nodeB, nodeC, nodeD],
      edges,
    );

    expect(result.size).toBe(4);

    const posA = result.get('A')!;
    const posB = result.get('B')!;
    const posC = result.get('C')!;
    const posD = result.get('D')!;

    // Each level should be deeper in Y
    expect(posB.y).toBeGreaterThan(posA.y);
    expect(posC.y).toBeGreaterThan(posB.y);
    expect(posD.y).toBeGreaterThan(posC.y);

    // Y increments should be consistent (NODE_HEIGHT + VERTICAL_GAP = 280)
    const dy1 = posB.y - posA.y;
    const dy2 = posC.y - posB.y;
    const dy3 = posD.y - posC.y;
    expect(dy1).toBe(dy2);
    expect(dy2).toBe(dy3);
    expect(dy1).toBe(280); // 200 (NODE_HEIGHT) + 80 (VERTICAL_GAP)

    // In a chain, all nodes should be at the same X (since each has one child)
    expect(posA.x).toBe(posB.x);
    expect(posB.x).toBe(posC.x);
    expect(posC.x).toBe(posD.x);
  });

  // -------------------------------------------------------------------------
  // Additional: multiple roots are laid out side by side
  // -------------------------------------------------------------------------
  it('lays out multiple root nodes side by side', () => {
    const root1 = makeLayoutNode({ id: 'r1', depth: 0 });
    const root2 = makeLayoutNode({ id: 'r2', depth: 0 });

    const result = calculateTreeLayout([root1, root2], []);

    expect(result.size).toBe(2);

    const pos1 = result.get('r1')!;
    const pos2 = result.get('r2')!;

    // Both at the same y (top)
    expect(pos1.y).toBe(0);
    expect(pos2.y).toBe(0);

    // Different x positions (side by side)
    expect(pos2.x).toBeGreaterThan(pos1.x);
  });
});

// ---------------------------------------------------------------------------
// getNewChildPosition tests
// ---------------------------------------------------------------------------

describe('getNewChildPosition', () => {
  it('positions a single child directly below parent', () => {
    const parentPos = { x: 200, y: 100 };
    const result = getNewChildPosition(parentPos, 1, 0);

    // Single child: totalWidth = 1 * (320 + 40) - 40 = 320
    // startX = 200 - 320/2 = 40
    // x = 40 + 0 * 360 = 40
    // y = 100 + 200 + 80 = 380
    expect(result.x).toBe(40);
    expect(result.y).toBe(380);
  });

  it('positions two children symmetrically below parent', () => {
    const parentPos = { x: 300, y: 0 };

    const child0 = getNewChildPosition(parentPos, 2, 0);
    const child1 = getNewChildPosition(parentPos, 2, 1);

    // Both at the same y
    expect(child0.y).toBe(child1.y);

    // Child 0 is to the left, child 1 is to the right
    expect(child0.x).toBeLessThan(child1.x);

    // They are spaced apart by NODE_WIDTH + HORIZONTAL_GAP = 360
    expect(child1.x - child0.x).toBe(360);
  });
});
