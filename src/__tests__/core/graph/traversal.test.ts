import { describe, it, expect, vi } from 'vitest'
import { buildAdjacencyIndex, getAncestorChain, getSiblings } from '../../../core/graph/traversal'
import type { SemanticNode, SemanticEdge } from '../../../core/types'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'

function makeNode(id: string, parentId: string | null = null): SemanticNode {
  return {
    id,
    sessionId,
    laneId,
    parentId,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: `Question for ${id}`,
    fsmState: 'resolved',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function makeEdge(sourceNodeId: string, targetNodeId: string): SemanticEdge {
  return {
    id: `${sourceNodeId}->${targetNodeId}`,
    sessionId,
    laneId,
    sourceNodeId,
    targetNodeId,
    createdAt: now,
  }
}

// Tree structure for tests:
//       A
//      / \
//     B   C
//    /|    \
//   D  E    F

const nodes = [
  makeNode('A', null),
  makeNode('B', 'A'),
  makeNode('C', 'A'),
  makeNode('D', 'B'),
  makeNode('E', 'B'),
  makeNode('F', 'C'),
]

const edges = [
  makeEdge('A', 'B'),
  makeEdge('A', 'C'),
  makeEdge('B', 'D'),
  makeEdge('B', 'E'),
  makeEdge('C', 'F'),
]

const nodeMap = new Map(nodes.map((n) => [n.id, n]))

describe('buildAdjacencyIndex', () => {
  it('builds childrenOf map from edges', () => {
    const index = buildAdjacencyIndex(nodes, edges)
    expect(index.childrenOf.get('A')).toEqual(['B', 'C'])
    expect(index.childrenOf.get('B')).toEqual(['D', 'E'])
    expect(index.childrenOf.get('C')).toEqual(['F'])
  })

  it('builds parentOf map from edges', () => {
    const index = buildAdjacencyIndex(nodes, edges)
    expect(index.parentOf.get('B')).toBe('A')
    expect(index.parentOf.get('C')).toBe('A')
    expect(index.parentOf.get('D')).toBe('B')
    expect(index.parentOf.get('E')).toBe('B')
    expect(index.parentOf.get('F')).toBe('C')
  })

  it('root has no parent', () => {
    const index = buildAdjacencyIndex(nodes, edges)
    expect(index.parentOf.get('A')).toBeUndefined()
  })

  it('leaves have no children', () => {
    const index = buildAdjacencyIndex(nodes, edges)
    expect(index.childrenOf.get('D')).toBeUndefined()
    expect(index.childrenOf.get('E')).toBeUndefined()
    expect(index.childrenOf.get('F')).toBeUndefined()
  })

  it('handles empty inputs', () => {
    const index = buildAdjacencyIndex([], [])
    expect(index.childrenOf.size).toBe(0)
    expect(index.parentOf.size).toBe(0)
  })
})

describe('getAncestorChain', () => {
  const index = buildAdjacencyIndex(nodes, edges)

  it('returns ancestors from nearest to root', () => {
    const chain = getAncestorChain('D', nodeMap, index)
    expect(chain.map((n) => n.id)).toEqual(['B', 'A'])
  })

  it('returns parent only for depth-1 node', () => {
    const chain = getAncestorChain('B', nodeMap, index)
    expect(chain.map((n) => n.id)).toEqual(['A'])
  })

  it('returns empty array for root node', () => {
    const chain = getAncestorChain('A', nodeMap, index)
    expect(chain).toEqual([])
  })

  it('returns empty array for unknown node', () => {
    const chain = getAncestorChain('Z', nodeMap, index)
    expect(chain).toEqual([])
  })

  it('detects cycles and breaks', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cyclicEdges = [makeEdge('X', 'Y'), makeEdge('Y', 'X')]
    const cyclicNodes = [makeNode('X'), makeNode('Y')]
    const cyclicMap = new Map(cyclicNodes.map((n) => [n.id, n]))
    const cyclicIndex = buildAdjacencyIndex(cyclicNodes, cyclicEdges)

    const chain = getAncestorChain('Y', cyclicMap, cyclicIndex)
    // Should stop when cycle detected, returning X only
    expect(chain.length).toBeLessThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('Cycle detected in ancestor chain', expect.any(Object))

    warnSpy.mockRestore()
  })
})

describe('getSiblings', () => {
  const index = buildAdjacencyIndex(nodes, edges)

  it('returns siblings excluding self', () => {
    const siblings = getSiblings('B', nodeMap, index)
    expect(siblings.map((n) => n.id)).toEqual(['C'])
  })

  it('returns siblings from other side', () => {
    const siblings = getSiblings('D', nodeMap, index)
    expect(siblings.map((n) => n.id)).toEqual(['E'])
  })

  it('returns empty array for root (no parent)', () => {
    const siblings = getSiblings('A', nodeMap, index)
    expect(siblings).toEqual([])
  })

  it('returns empty array for only child', () => {
    const siblings = getSiblings('F', nodeMap, index)
    expect(siblings).toEqual([])
  })

  it('returns empty array for unknown node', () => {
    const siblings = getSiblings('Z', nodeMap, index)
    expect(siblings).toEqual([])
  })

  it('skips siblings not in node map', () => {
    const partialMap = new Map([['D', nodeMap.get('D')!]])
    const siblings = getSiblings('D', partialMap, index)
    // E is a sibling but not in the partial map
    expect(siblings).toEqual([])
  })
})
