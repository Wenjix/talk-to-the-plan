import { describe, it, expect } from 'vitest'
import { buildDirectPlanPrompt } from '../../generation/prompts/lane-plan'
import type { SemanticNode, Promotion } from '../../core/types'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'

function makeNode(id: string, question: string, summary?: string, bullets?: string[]): SemanticNode {
  return {
    id,
    sessionId,
    laneId,
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question,
    answer: summary ? { summary, bullets: bullets ?? ['bullet 1'] } : undefined,
    fsmState: 'resolved',
    promoted: true,
    depth: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function makePromotion(id: string, nodeId: string, reason: 'actionable_detail' | 'risk_identification', note?: string): Promotion {
  return {
    id,
    sessionId,
    laneId,
    nodeId,
    reason,
    note,
    createdAt: now,
  }
}

const node1 = makeNode(
  '00000000-0000-4000-a000-000000000010',
  'What are the deployment risks?',
  'Deployment coupling is the main risk.',
  ['Zero-downtime deploys require blue-green setup', 'Rollback strategy needed'],
)

const node2 = makeNode(
  '00000000-0000-4000-a000-000000000020',
  'How should we handle data migration?',
  'Incremental migration with dual-write.',
  ['Dual-write pattern minimizes downtime', 'Schema versioning required'],
)

const promotion1 = makePromotion(
  '00000000-0000-4000-a000-000000000030',
  node1.id,
  'risk_identification',
  'Critical deployment risk',
)

const promotion2 = makePromotion(
  '00000000-0000-4000-a000-000000000040',
  node2.id,
  'actionable_detail',
)

const promotedNodes = [
  { node: node1, promotion: promotion1 },
  { node: node2, promotion: promotion2 },
]

const sessionTopic = 'Migrating monolith to microservices architecture'

describe('buildDirectPlanPrompt', () => {
  it('produces non-empty output', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result.length).toBeGreaterThan(100)
  })

  it('contains SYSTEM marker', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('[SYSTEM]')
  })

  it('contains PLANNING CONTEXT marker', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('[PLANNING CONTEXT]')
  })

  it('contains TASK marker', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('[TASK]')
  })

  it('contains session topic', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain(sessionTopic)
  })

  it('contains promoted node questions', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain(node1.question)
    expect(result).toContain(node2.question)
  })

  it('contains answer summaries from promoted nodes', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('Deployment coupling is the main risk.')
    expect(result).toContain('Incremental migration with dual-write.')
  })

  it('contains answer bullets from promoted nodes', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('Zero-downtime deploys require blue-green setup')
    expect(result).toContain('Dual-write pattern minimizes downtime')
  })

  it('contains promotion reason', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('risk_identification')
    expect(result).toContain('actionable_detail')
  })

  it('contains promotion note when present', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('Critical deployment risk')
  })

  it('contains node IDs for evidence referencing', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain(node1.id)
    expect(result).toContain(node2.id)
  })

  it('requests JSON schema in output', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('"goals"')
    expect(result).toContain('"assumptions"')
    expect(result).toContain('"strategy"')
    expect(result).toContain('"milestones"')
    expect(result).toContain('"risks"')
    expect(result).toContain('"nextActions"')
    expect(result).toContain('"nodeId"')
    expect(result).toContain('"relevance"')
  })

  it('includes promoted node count', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('Promoted Evidence (2 nodes from all lanes)')
  })

  it('uses strategic planner preamble', () => {
    const result = buildDirectPlanPrompt(promotedNodes, sessionTopic)
    expect(result).toContain('Strategic Planner')
  })

  it('handles nodes without answers', () => {
    const nodeNoAnswer = makeNode(
      '00000000-0000-4000-a000-000000000050',
      'What about testing strategy?',
    )
    const promo = makePromotion(
      '00000000-0000-4000-a000-000000000060',
      nodeNoAnswer.id,
      'actionable_detail',
    )
    const result = buildDirectPlanPrompt(
      [{ node: nodeNoAnswer, promotion: promo }],
      sessionTopic,
    )
    expect(result).toContain('What about testing strategy?')
    expect(result).not.toContain('Summary:')
  })

  it('handles single promoted node', () => {
    const result = buildDirectPlanPrompt(
      [{ node: node1, promotion: promotion1 }],
      sessionTopic,
    )
    expect(result).toContain('Promoted Evidence (1 nodes from all lanes)')
    expect(result).toContain(node1.question)
    expect(result).not.toContain(node2.question)
  })
})
