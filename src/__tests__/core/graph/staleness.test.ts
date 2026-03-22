import { describe, it, expect, vi } from 'vitest'
import { propagateStaleness, propagateCrossLayerStaleness } from '../../../core/graph/staleness'
import type { SemanticNode, SemanticEdge, Promotion, LanePlan, UnifiedPlan } from '../../../core/types'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'

function makeNode(id: string): SemanticNode {
  return {
    id,
    sessionId,
    laneId,
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: `Q ${id}`,
    fsmState: 'resolved',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function makeEdge(src: string, tgt: string): SemanticEdge {
  return {
    id: `${src}->${tgt}`,
    sessionId,
    laneId,
    sourceNodeId: src,
    targetNodeId: tgt,
    createdAt: now,
  }
}

describe('propagateStaleness', () => {
  // Tree:  A -> B -> D
  //        A -> C -> E
  //                   \-> F
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F'].map(makeNode)
  const edges = [
    makeEdge('A', 'B'),
    makeEdge('A', 'C'),
    makeEdge('B', 'D'),
    makeEdge('C', 'E'),
    makeEdge('C', 'F'),
  ]

  it('marks direct children as stale', () => {
    const stale = propagateStaleness('A', nodes, edges)
    expect(stale).toContain('B')
    expect(stale).toContain('C')
  })

  it('propagates to all descendants (BFS)', () => {
    const stale = propagateStaleness('A', nodes, edges)
    expect(stale).toContain('D')
    expect(stale).toContain('E')
    expect(stale).toContain('F')
    expect(stale.length).toBe(5) // B, C, D, E, F
  })

  it('does not include the changed node itself', () => {
    const stale = propagateStaleness('A', nodes, edges)
    expect(stale).not.toContain('A')
  })

  it('propagates from mid-tree node', () => {
    const stale = propagateStaleness('C', nodes, edges)
    expect(stale).toEqual(['E', 'F'])
  })

  it('returns empty array for leaf node', () => {
    const stale = propagateStaleness('D', nodes, edges)
    expect(stale).toEqual([])
  })

  it('returns empty array for unknown node', () => {
    const stale = propagateStaleness('Z', nodes, edges)
    expect(stale).toEqual([])
  })

  it('handles diamond graph (two paths to same node)', () => {
    // Diamond:  A -> B -> D
    //           A -> C -> D
    const diamondNodes = ['A', 'B', 'C', 'D'].map(makeNode)
    const diamondEdges = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'D'),
      makeEdge('C', 'D'),
    ]
    const stale = propagateStaleness('A', diamondNodes, diamondEdges)
    // D should appear only once
    expect(stale.filter((id) => id === 'D').length).toBe(1)
    expect(stale.length).toBe(3) // B, C, D
  })

  it('detects cycles and does not infinite loop', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cyclicNodes = ['X', 'Y', 'Z'].map(makeNode)
    const cyclicEdges = [makeEdge('X', 'Y'), makeEdge('Y', 'Z'), makeEdge('Z', 'Y')]

    const stale = propagateStaleness('X', cyclicNodes, cyclicEdges)
    expect(stale).toContain('Y')
    expect(stale).toContain('Z')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('propagateCrossLayerStaleness', () => {
  // Tree:  A -> B -> D
  //        A -> C
  const nodes = ['A', 'B', 'C', 'D'].map(makeNode)
  const edges = [
    makeEdge('A', 'B'),
    makeEdge('A', 'C'),
    makeEdge('B', 'D'),
  ]

  function makePromotion(id: string, nodeId: string): Promotion {
    return {
      id,
      sessionId,
      laneId,
      nodeId,
      reason: 'insightful_reframe',
      createdAt: now,
    }
  }

  function makeLanePlan(id: string, sourcePromotionIds: string[]): LanePlan {
    return {
      id,
      sessionId,
      laneId,
      title: `Plan ${id}`,
      sections: {
        goals: [{ heading: 'G', content: ['g1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        assumptions: [{ heading: 'A', content: ['a1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        strategy: [{ heading: 'S', content: ['s1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        milestones: [{ heading: 'M', content: ['m1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        risks: [{ heading: 'R', content: ['r1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        nextActions: [{ heading: 'N', content: ['n1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
      },
      sourcePromotionIds,
      confidence: 0.8,
      createdAt: now,
      updatedAt: now,
    }
  }

  function makeUnifiedPlan(sourcePlanIds: string[]): UnifiedPlan {
    return {
      id: 'unified-1',
      sessionId,
      sourcePlanIds,
      title: 'Unified Plan',
      sections: {
        goals: [{ heading: 'G', content: ['g1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        assumptions: [{ heading: 'A', content: ['a1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        strategy: [{ heading: 'S', content: ['s1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        milestones: [{ heading: 'M', content: ['m1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        risks: [{ heading: 'R', content: ['r1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
        nextActions: [{ heading: 'N', content: ['n1'], evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }] }],
      },
      conflictsResolved: [],
      unresolvedQuestions: [],
      evidence: [{ nodeId: 'A', laneId, quote: 'q', relevance: 'primary' }],
      revision: 1,
      createdAt: now,
    }
  }

  it('marks lane plans stale when promoted node is affected', () => {
    const promotions = [makePromotion('promo-B', 'B')]
    const lanePlans = [makeLanePlan('plan-1', ['promo-B'])]

    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, null)

    expect(result.staleNodeIds).toContain('B')
    expect(result.staleLanePlanIds).toContain('plan-1')
  })

  it('marks unified plan stale when a source lane plan is stale', () => {
    const promotions = [makePromotion('promo-B', 'B')]
    const lanePlans = [makeLanePlan('plan-1', ['promo-B'])]
    const unified = makeUnifiedPlan(['plan-1', 'plan-2', 'plan-3'])

    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, unified)

    expect(result.staleLanePlanIds).toContain('plan-1')
    expect(result.unifiedPlanStale).toBe(true)
  })

  it('does not mark lane plans stale when no promoted nodes are affected', () => {
    const promotions = [makePromotion('promo-C', 'C')]
    const lanePlans = [makeLanePlan('plan-1', ['promo-C'])]

    // Change node B - C is a sibling, not downstream of B
    const result = propagateCrossLayerStaleness('B', nodes, edges, promotions, lanePlans, null)

    // B's downstream is only D; C is not affected
    expect(result.staleNodeIds).toContain('D')
    expect(result.staleNodeIds).not.toContain('C')
    expect(result.staleLanePlanIds).toEqual([])
  })

  it('includes changed node itself in promotion check', () => {
    // Promoted node IS the changed node
    const promotions = [makePromotion('promo-A', 'A')]
    const lanePlans = [makeLanePlan('plan-1', ['promo-A'])]

    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, null)

    expect(result.staleLanePlanIds).toContain('plan-1')
  })

  it('does not mark unified plan stale when no lane plans are stale', () => {
    const promotions: Promotion[] = []
    const lanePlans: LanePlan[] = []
    const unified = makeUnifiedPlan(['plan-1', 'plan-2', 'plan-3'])

    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, unified)

    expect(result.staleLanePlanIds).toEqual([])
    expect(result.unifiedPlanStale).toBe(false)
  })

  it('returns false for unifiedPlanStale when no unified plan exists', () => {
    const promotions = [makePromotion('promo-B', 'B')]
    const lanePlans = [makeLanePlan('plan-1', ['promo-B'])]

    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, null)

    expect(result.staleLanePlanIds).toContain('plan-1')
    expect(result.unifiedPlanStale).toBe(false)
  })

  it('handles multiple promotions across plans', () => {
    const promotions = [
      makePromotion('promo-B', 'B'),
      makePromotion('promo-D', 'D'),
      makePromotion('promo-C', 'C'),
    ]
    const lanePlans = [
      makeLanePlan('plan-1', ['promo-B', 'promo-D']),
      makeLanePlan('plan-2', ['promo-C']),
    ]

    // Change A: B, C, D are all downstream
    const result = propagateCrossLayerStaleness('A', nodes, edges, promotions, lanePlans, null)

    expect(result.staleLanePlanIds).toContain('plan-1')
    expect(result.staleLanePlanIds).toContain('plan-2')
  })
})
