import type { SemanticNode, SemanticEdge } from '../core/types';
import type { AdjacencyIndex } from '../core/graph/traversal';
import { buildAdjacencyIndex } from '../core/graph/traversal';

// Memoized adjacency index that rebuilds only when nodes/edges change
let cachedNodes: SemanticNode[] = [];
let cachedEdges: SemanticEdge[] = [];
let cachedIndex: AdjacencyIndex | null = null;

export function getCachedAdjacencyIndex(
  nodes: SemanticNode[],
  edges: SemanticEdge[],
): AdjacencyIndex {
  if (nodes === cachedNodes && edges === cachedEdges && cachedIndex) {
    return cachedIndex;
  }
  cachedIndex = buildAdjacencyIndex(nodes, edges);
  cachedNodes = nodes;
  cachedEdges = edges;
  return cachedIndex;
}

export function invalidateAdjacencyCache(): void {
  cachedIndex = null;
}
