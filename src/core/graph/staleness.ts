import type { SemanticNode, SemanticEdge, Promotion, UnifiedPlan } from '../types'
import { buildAdjacencyIndex } from './traversal'

export function propagateStaleness(
  changedNodeId: string,
  nodes: SemanticNode[],
  edges: SemanticEdge[],
): string[] {
  const index = buildAdjacencyIndex(nodes, edges)
  const staleIds: string[] = []
  const visited = new Set<string>()
  const queue = [...(index.childrenOf.get(changedNodeId) ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) {
      console.warn('Cycle detected in staleness propagation', { changedNodeId, current })
      continue
    }
    visited.add(current)
    staleIds.push(current)
    const children = index.childrenOf.get(current) ?? []
    queue.push(...children)
  }

  return staleIds
}

export interface CrossLayerStalenessResult {
  staleNodeIds: string[]
  unifiedPlanStale: boolean
}

/**
 * Propagate staleness across layers: node -> promoted -> unified plan.
 * When a node becomes stale, check if it (or any downstream stale node) is promoted.
 * If so, the unified plan referencing that evidence is stale.
 */
export function propagateCrossLayerStaleness(
  changedNodeId: string,
  nodes: SemanticNode[],
  edges: SemanticEdge[],
  promotions: Promotion[],
  unifiedPlan: UnifiedPlan | null,
): CrossLayerStalenessResult {
  // 1. BFS downstream staleness on node graph
  const staleNodeIds = propagateStaleness(changedNodeId, nodes, edges)
  // Include the changed node itself
  const allAffectedNodeIds = new Set([changedNodeId, ...staleNodeIds])

  // 2. Check if any promoted node is affected
  const hasStalePromotion = promotions.some(p => allAffectedNodeIds.has(p.nodeId))

  // 3. Unified plan is stale if any promoted node it references is stale
  let unifiedPlanStale = false
  if (unifiedPlan && hasStalePromotion) {
    unifiedPlanStale = unifiedPlan.evidence.some(
      (ev) => allAffectedNodeIds.has(ev.nodeId),
    )
  }

  return {
    staleNodeIds,
    unifiedPlanStale,
  }
}
