import type { Node, Edge } from '@xyflow/react';
import type { SemanticNode, SemanticEdge, NodeType } from '../core/types';
import type { ViewNodeState } from './view-store';
import { getDescendantIds } from './view-store';

export type ExplorationCardNode = Node<SemanticNode, 'explorationCard'>;
export type PlanCardNode = Node<SemanticNode, 'planCard'>;
export type RFNode = ExplorationCardNode | PlanCardNode;
export type RFEdge = Edge<Record<string, never>>;

export function getComponentType(nodeType: NodeType): string {
  switch (nodeType) {
    case 'root':
    case 'exploration':
      return 'explorationCard';
    case 'lane_plan':
    case 'unified_plan':
      return 'planCard';
  }
}

export function projectToReactFlow(
  semanticNodes: SemanticNode[],
  semanticEdges: SemanticEdge[],
  viewStates: Map<string, ViewNodeState>,
  activeLaneId: string
): { nodes: RFNode[]; edges: RFEdge[] } {
  const laneNodes = semanticNodes.filter(n => n.laneId === activeLaneId);
  const laneEdges = semanticEdges.filter(e => e.laneId === activeLaneId);

  // Collect all descendant IDs from collapsed nodes to hide them
  const hiddenIds = new Set<string>();
  for (const sn of laneNodes) {
    const view = viewStates.get(sn.id);
    if (view?.isCollapsed) {
      const descendants = getDescendantIds(sn.id, laneEdges);
      for (const descendantId of descendants) {
        hiddenIds.add(descendantId);
      }
    }
  }

  // Count hidden descendants per collapsed node (for the "+N" badge)
  const hiddenCountMap = new Map<string, number>();
  for (const sn of laneNodes) {
    const view = viewStates.get(sn.id);
    if (view?.isCollapsed) {
      const descendants = getDescendantIds(sn.id, laneEdges);
      hiddenCountMap.set(sn.id, descendants.length);
    }
  }

  const nodes: RFNode[] = laneNodes
    .filter(sn => !hiddenIds.has(sn.id))
    .map(sn => {
      const view = viewStates.get(sn.id);
      const hiddenCount = hiddenCountMap.get(sn.id) ?? 0;
      return {
        id: sn.id,
        type: getComponentType(sn.nodeType),
        position: view?.position ?? { x: 0, y: 0 },
        data: {
          ...sn,
          // Attach hidden descendant count for collapsed nodes
          _hiddenDescendants: hiddenCount,
        },
      } as RFNode;
    });

  const edges: RFEdge[] = laneEdges
    .filter(se => !hiddenIds.has(se.sourceNodeId) && !hiddenIds.has(se.targetNodeId))
    .map(se => ({
      id: se.id,
      source: se.sourceNodeId,
      target: se.targetNodeId,
      type: 'fudaConnector',
    }));

  return { nodes, edges };
}
