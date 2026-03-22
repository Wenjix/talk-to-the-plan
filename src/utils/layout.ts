import type { SemanticNode, SemanticEdge } from '../core/types';

export const NODE_WIDTH = 320;
export const NODE_HEIGHT = 200;
export const HORIZONTAL_GAP = 40;
export const VERTICAL_GAP = 80;

export interface LayoutPosition {
  x: number;
  y: number;
}

/**
 * Calculate tree layout positions for nodes.
 * Uses a simple top-down tree layout where:
 * - Root is at top center
 * - Children are evenly spaced below their parent
 * - Subtrees don't overlap
 */
export function calculateTreeLayout(
  nodes: SemanticNode[],
  edges: SemanticEdge[]
): Map<string, LayoutPosition> {
  const positions = new Map<string, LayoutPosition>();

  if (nodes.length === 0) return positions;

  // Build parent-child adjacency
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const edge of edges) {
    const children = childrenOf.get(edge.sourceNodeId) ?? [];
    children.push(edge.targetNodeId);
    childrenOf.set(edge.sourceNodeId, children);
    parentOf.set(edge.targetNodeId, edge.sourceNodeId);
  }

  // Find root nodes (no parent)
  const nodeIds = new Set(nodes.map(n => n.id));
  const roots = nodes.filter(n => !parentOf.has(n.id));

  if (roots.length === 0) {
    // Fallback: treat first node as root
    roots.push(nodes[0]);
  }

  // Calculate subtree widths (bottom-up)
  function getSubtreeWidth(nodeId: string): number {
    const children = (childrenOf.get(nodeId) ?? []).filter(id => nodeIds.has(id));
    if (children.length === 0) return NODE_WIDTH;

    const childWidths = children.map(getSubtreeWidth);
    const totalWidth = childWidths.reduce((sum, w) => sum + w, 0)
      + (children.length - 1) * HORIZONTAL_GAP;
    return Math.max(NODE_WIDTH, totalWidth);
  }

  // Position nodes (top-down)
  function positionNode(nodeId: string, x: number, y: number): void {
    positions.set(nodeId, { x, y });

    const children = (childrenOf.get(nodeId) ?? []).filter(id => nodeIds.has(id));
    if (children.length === 0) return;

    const childWidths = children.map(getSubtreeWidth);
    const totalWidth = childWidths.reduce((sum, w) => sum + w, 0)
      + (children.length - 1) * HORIZONTAL_GAP;

    let currentX = x - totalWidth / 2;

    for (let i = 0; i < children.length; i++) {
      const childWidth = childWidths[i];
      const childX = currentX + childWidth / 2;
      const childY = y + NODE_HEIGHT + VERTICAL_GAP;

      positionNode(children[i], childX, childY);
      currentX += childWidth + HORIZONTAL_GAP;
    }
  }

  // Layout each root tree
  let rootX = 0;
  for (const root of roots) {
    const width = getSubtreeWidth(root.id);
    positionNode(root.id, rootX + width / 2, 0);
    rootX += width + HORIZONTAL_GAP * 2;
  }

  return positions;
}

/**
 * Calculate the position for a single new child node based on its parent
 * and existing siblings.
 */
export function getNewChildPosition(
  parentPosition: LayoutPosition,
  siblingCount: number,
  siblingIndex: number
): LayoutPosition {
  const totalWidth = siblingCount * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
  const startX = parentPosition.x - totalWidth / 2;

  return {
    x: startX + siblingIndex * (NODE_WIDTH + HORIZONTAL_GAP),
    y: parentPosition.y + NODE_HEIGHT + VERTICAL_GAP,
  };
}
