import type { SemanticNode, SemanticEdge, Promotion, LanePlan, UnifiedPlan } from '../types'
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
  staleLanePlanIds: string[]
  unifiedPlanStale: boolean
}

/**
 * Propagate staleness across layers: node -> promoted -> lane plan -> unified plan.
 * When a node becomes stale, check if it (or any downstream stale node) is promoted.
 * If so, any lane plan referencing that promotion is stale.
 * If any lane plan is stale, the unified plan is stale.
 */
export function propagateCrossLayerStaleness(
  changedNodeId: string,
  nodes: SemanticNode[],
  edges: SemanticEdge[],
  promotions: Promotion[],
  lanePlans: LanePlan[],
  unifiedPlan: UnifiedPlan | null,
): CrossLayerStalenessResult {
  // 1. BFS downstream staleness on node graph
  const staleNodeIds = propagateStaleness(changedNodeId, nodes, edges)
  // Include the changed node itself
  const allAffectedNodeIds = new Set([changedNodeId, ...staleNodeIds])

  // 2. Find promotions that reference any stale node
  const stalePromotionIds = new Set<string>()
  for (const promotion of promotions) {
    if (allAffectedNodeIds.has(promotion.nodeId)) {
      stalePromotionIds.add(promotion.id)
    }
  }

  // 3. Find lane plans that reference any stale promotion
  const staleLanePlanIds: string[] = []
  for (const plan of lanePlans) {
    const hasStaleSource = plan.sourcePromotionIds.some(
      (pid) => stalePromotionIds.has(pid),
    )
    if (hasStaleSource) {
      staleLanePlanIds.push(plan.id)
    }
  }

  // 4. Unified plan is stale if any of its source lane plans are stale
  let unifiedPlanStale = false
  if (unifiedPlan && staleLanePlanIds.length > 0) {
    const stalePlanSet = new Set(staleLanePlanIds)
    unifiedPlanStale = unifiedPlan.sourcePlanIds.some(
      (pid) => stalePlanSet.has(pid),
    )
  }

  return {
    staleNodeIds,
    staleLanePlanIds,
    unifiedPlanStale,
  }
}
