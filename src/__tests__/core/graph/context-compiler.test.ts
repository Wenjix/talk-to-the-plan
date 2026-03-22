import { describe, it, expect } from 'vitest'
import { compileContext } from '../../../core/graph/context-compiler'
import type { SemanticNode, SemanticEdge } from '../../../core/types'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'

function makeNode(
  id: string,
  parentId: string | null = null,
  answer?: { summary: string; bullets: string[] },
  fsmState: SemanticNode['fsmState'] = 'resolved',
): SemanticNode {
  return {
    id,
    sessionId,
    laneId,
    parentId,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: `Question for ${id}`,
    answer,
    fsmState,
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

// Tree:
//        A (root, with answer)
//       / \
//      B   C  (B has answer, C has answer)
//     / \   \
//    D   E   F  (D is target, E is sibling, F is cousin)

const answerA = { summary: 'Summary A', bullets: ['Bullet A1', 'Bullet A2'] }
const answerB = { summary: 'Summary B', bullets: ['Bullet B1'] }
const answerC = { summary: 'Summary C', bullets: ['Bullet C1'] }

const nodes: SemanticNode[] = [
  makeNode('A', null, answerA),
  makeNode('B', 'A', answerB),
  makeNode('C', 'A', answerC),
  makeNode('D', 'B'),
  makeNode('E', 'B', undefined, 'idle'),
  makeNode('F', 'C'),
]

const edges: SemanticEdge[] = [
  makeEdge('A', 'B'),
  makeEdge('A', 'C'),
  makeEdge('B', 'D'),
  makeEdge('B', 'E'),
  makeEdge('C', 'F'),
]

describe('compileContext', () => {
  it('includes ancestors in order nearest-first in entries', () => {
    const ctx = compileContext('D', nodes, edges)
    const ancestorIds = ctx.entries.filter((e) => e.role === 'ancestor').map((e) => e.nodeId)
    expect(ancestorIds).toEqual(['B', 'A'])
  })

  it('sets correct distanceFromTarget for ancestors', () => {
    const ctx = compileContext('D', nodes, edges)
    const ancestors = ctx.entries.filter((e) => e.role === 'ancestor')
    expect(ancestors[0].distanceFromTarget).toBe(1) // B
    expect(ancestors[1].distanceFromTarget).toBe(2) // A
  })

  it('includes siblings', () => {
    const ctx = compileContext('D', nodes, edges)
    const siblingIds = ctx.entries.filter((e) => e.role === 'sibling').map((e) => e.nodeId)
    expect(siblingIds).toEqual(['E'])
  })

  it('includes cousins with question-only content', () => {
    const ctx = compileContext('D', nodes, edges)
    const cousins = ctx.entries.filter((e) => e.role === 'cousin')
    expect(cousins.length).toBe(1)
    expect(cousins[0].nodeId).toBe('F')
    // Cousin content is question-only (no answer)
    expect(cousins[0].content).toBe('Question for F')
  })

  it('ancestor content includes answer when present', () => {
    const ctx = compileContext('D', nodes, edges)
    const bEntry = ctx.entries.find((e) => e.nodeId === 'B')!
    expect(bEntry.content).toContain('Question for B')
    expect(bEntry.content).toContain('Summary B')
    expect(bEntry.content).toContain('Bullet B1')
  })

  it('tracks total token estimate', () => {
    const ctx = compileContext('D', nodes, edges)
    const sum = ctx.entries.reduce((acc, e) => acc + e.tokenEstimate, 0)
    expect(ctx.totalTokenEstimate).toBe(sum)
    expect(ctx.totalTokenEstimate).toBeGreaterThan(0)
  })

  it('sets targetNodeId', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.targetNodeId).toBe('D')
  })

  it('respects token budget — excludes entries that exceed budget', () => {
    // Very tight budget: should include at most a few entries
    const ctx = compileContext('D', nodes, edges, 10)
    expect(ctx.totalTokenEstimate).toBeLessThanOrEqual(10)
    expect(ctx.entries.length).toBeLessThan(4)
  })

  it('returns empty entries for root node (no ancestors/siblings)', () => {
    const ctx = compileContext('A', nodes, edges)
    const ancestors = ctx.entries.filter((e) => e.role === 'ancestor')
    const siblings = ctx.entries.filter((e) => e.role === 'sibling')
    expect(ancestors).toEqual([])
    expect(siblings).toEqual([])
  })

  it('returns empty entries for unknown node', () => {
    const ctx = compileContext('Z', nodes, edges)
    expect(ctx.entries).toEqual([])
    expect(ctx.totalTokenEstimate).toBe(0)
  })

  it('prioritizes ancestors over siblings over cousins', () => {
    const ctx = compileContext('D', nodes, edges)
    const roles = ctx.entries.map((e) => e.role)
    const lastAncestorIdx = roles.lastIndexOf('ancestor')
    const firstSiblingIdx = roles.indexOf('sibling')
    const firstCousinIdx = roles.indexOf('cousin')

    if (firstSiblingIdx !== -1) {
      expect(lastAncestorIdx).toBeLessThan(firstSiblingIdx)
    }
    if (firstCousinIdx !== -1 && firstSiblingIdx !== -1) {
      expect(firstSiblingIdx).toBeLessThan(firstCousinIdx)
    }
  })
})

describe('formatContextForPrompt (via compileContext)', () => {
  it('starts with [GRAPH CONTEXT]', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toMatch(/^\[GRAPH CONTEXT\]/)
  })

  it('labels root ancestor as Root', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toContain('- Root (depth 2)')
  })

  it('labels non-root ancestor as Ancestor', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toContain('- Ancestor (depth 1)')
  })

  it('shows ancestors root-first in formatted output', () => {
    const ctx = compileContext('D', nodes, edges)
    const rootIdx = ctx.formatted.indexOf('Root (depth 2)')
    const ancestorIdx = ctx.formatted.indexOf('Ancestor (depth 1)')
    expect(rootIdx).toBeLessThan(ancestorIdx)
  })

  it('labels resolved siblings as Explored', () => {
    // E is idle, so should be Unexplored
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toContain('Sibling (Unexplored)')
  })

  it('includes cousin entries as question only', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toContain('Cousin (question only)')
  })

  it('includes current node at the end', () => {
    const ctx = compileContext('D', nodes, edges)
    expect(ctx.formatted).toContain('- Current Node: "Question for D"')
    // Current node should be the last line
    const lines = ctx.formatted.split('\n')
    expect(lines[lines.length - 1]).toContain('Current Node')
  })
})
