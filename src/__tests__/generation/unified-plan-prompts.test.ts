import { describe, it, expect } from 'vitest'
import {
  buildPairwiseMapPrompt,
  buildReducePrompt,
  buildFormatPrompt,
} from '../../generation/prompts/unified-plan'
import type { PairwiseReport, LanePlanSummary } from '../../generation/prompts/unified-plan'
import type { LanePlan, ConflictResolution } from '../../core/types'
import { PLANNER_PREAMBLE } from '../../generation/prompts/system-preambles'
import { parseAndValidate } from '../../core/validation/schema-gates'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneAId = '00000000-0000-4000-a000-000000000001'
const laneBId = '00000000-0000-4000-a000-000000000002'
const laneCId = '00000000-0000-4000-a000-000000000003'
const nodeId1 = '00000000-0000-4000-a000-000000000010'
const nodeId2 = '00000000-0000-4000-a000-000000000020'

function makeEvidence(nodeId: string, laneId: string) {
  return { nodeId, laneId, quote: 'sample quote', relevance: 'primary' as const }
}

function makeSection(heading: string, nodeId: string, laneId: string) {
  return {
    heading,
    content: ['Detail item'],
    evidence: [makeEvidence(nodeId, laneId)],
  }
}

function makeLanePlan(overrides: Partial<LanePlan> & { laneId: string; title: string }): LanePlan {
  return {
    id: '00000000-0000-4000-a000-000000000090',
    sessionId,
    laneId: overrides.laneId,
    title: overrides.title,
    sections: {
      goals: [makeSection('Goal 1', nodeId1, overrides.laneId)],
      assumptions: [makeSection('Assumption 1', nodeId1, overrides.laneId)],
      strategy: [makeSection('Strategy 1', nodeId1, overrides.laneId)],
      milestones: [makeSection('Milestone 1', nodeId1, overrides.laneId)],
      risks: [makeSection('Risk 1', nodeId1, overrides.laneId)],
      nextActions: [makeSection('Next Action 1', nodeId1, overrides.laneId)],
    },
    sourcePromotionIds: ['00000000-0000-4000-a000-000000000050'],
    confidence: 0.8,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const planA = makeLanePlan({ laneId: laneAId, title: 'Expansive Plan' })
const planB = makeLanePlan({ laneId: laneBId, title: 'Analytical Plan' })
const planC = makeLanePlan({ laneId: laneCId, title: 'Pragmatic Plan' })

describe('buildPairwiseMapPrompt', () => {
  it('returns a non-empty string', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result.length).toBeGreaterThan(100)
  })

  it('includes the planner preamble', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('Strategic Planner')
  })

  it('contains both lane labels', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('Plan A: Expansive')
    expect(result).toContain('Plan B: Analytical')
  })

  it('contains plan titles', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('Expansive Plan')
    expect(result).toContain('Analytical Plan')
  })

  it('contains plan section content', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('Goal 1')
    expect(result).toContain('Strategy 1')
    expect(result).toContain('Risk 1')
  })

  it('requests the expected JSON output shape', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('"contradictions"')
    expect(result).toContain('"synergies"')
    expect(result).toContain('"gaps"')
    expect(result).toContain('"planAPosition"')
    expect(result).toContain('"planBPosition"')
    expect(result).toContain('"sharedInsight"')
    expect(result).toContain('"coveredBy"')
    expect(result).toContain('"missingFrom"')
  })

  it('contains SYSTEM and TASK markers', () => {
    const result = buildPairwiseMapPrompt(planA, planB, 'Expansive', 'Analytical')
    expect(result).toContain('[SYSTEM]')
    expect(result).toContain('[TASK]')
  })
})

describe('buildReducePrompt', () => {
  const pairwiseReports: PairwiseReport[] = [
    {
      laneALabel: 'Expansive',
      laneBLabel: 'Analytical',
      contradictions: [
        {
          description: 'Timeline disagreement',
          planAPosition: '6 months for MVP',
          planBPosition: '3 months for MVP',
        },
      ],
      synergies: [
        {
          description: 'Both recommend microservices',
          sharedInsight: 'Service decomposition is essential',
        },
      ],
      gaps: [
        {
          description: 'Security analysis',
          coveredBy: 'planB',
          missingFrom: 'planA',
        },
      ],
    },
  ]

  it('returns a non-empty string', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result.length).toBeGreaterThan(100)
  })

  it('includes the planner preamble', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('Strategic Planner')
  })

  it('contains pairwise report data', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('Timeline disagreement')
    expect(result).toContain('6 months for MVP')
    expect(result).toContain('3 months for MVP')
  })

  it('contains synergies from reports', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('Both recommend microservices')
    expect(result).toContain('Service decomposition is essential')
  })

  it('contains gaps from reports', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('Security analysis')
  })

  it('references lane plan titles and IDs', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('Expansive Plan')
    expect(result).toContain(laneAId)
    expect(result).toContain(laneBId)
  })

  it('requests conflict resolution JSON schema', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('"conflictsResolved"')
    expect(result).toContain('"unresolvedQuestions"')
    expect(result).toContain('"resolution"')
    expect(result).toContain('"tradeoff"')
  })

  it('contains SYSTEM and TASK markers', () => {
    const result = buildReducePrompt(pairwiseReports, [planA, planB])
    expect(result).toContain('[SYSTEM]')
    expect(result).toContain('[TASK]')
  })
})

describe('buildFormatPrompt', () => {
  const conflictResolutions: ConflictResolution[] = [
    {
      description: 'Timeline conflict resolved',
      laneAId,
      laneBId,
      resolution: 'Use 4-month timeline as compromise',
      tradeoff: 'Slightly slower but more thorough',
    },
  ]

  const synergies = [
    {
      description: 'Microservices agreement',
      sharedInsight: 'All lanes agree on service decomposition',
    },
  ]

  const summaries: LanePlanSummary[] = [
    {
      laneId: laneAId,
      label: 'Expansive',
      title: 'Expansive Plan',
      goalHeadings: ['Goal 1'],
      strategyHeadings: ['Strategy 1'],
    },
    {
      laneId: laneBId,
      label: 'Analytical',
      title: 'Analytical Plan',
      goalHeadings: ['Goal A'],
      strategyHeadings: ['Strategy A'],
    },
  ]

  it('returns a non-empty string', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result.length).toBeGreaterThan(100)
  })

  it('includes the planner preamble', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('Strategic Planner')
  })

  it('contains session topic', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('Build a SaaS product')
  })

  it('contains conflict resolutions', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('Timeline conflict resolved')
    expect(result).toContain('Use 4-month timeline as compromise')
    expect(result).toContain('Slightly slower but more thorough')
  })

  it('contains synergies', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('Microservices agreement')
    expect(result).toContain('All lanes agree on service decomposition')
  })

  it('contains lane plan summaries', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('Expansive')
    expect(result).toContain('Analytical')
    expect(result).toContain('Goal 1')
    expect(result).toContain('Strategy A')
  })

  it('requests the StructuredPlan JSON schema with evidence', () => {
    const result = buildFormatPrompt(conflictResolutions, synergies, summaries, 'Build a SaaS product')
    expect(result).toContain('"goals"')
    expect(result).toContain('"assumptions"')
    expect(result).toContain('"strategy"')
    expect(result).toContain('"milestones"')
    expect(result).toContain('"risks"')
    expect(result).toContain('"nextActions"')
    expect(result).toContain('"nodeId"')
    expect(result).toContain('"laneId"')
    expect(result).toContain('"relevance"')
    expect(result).toContain('"conflictsResolved"')
    expect(result).toContain('"unresolvedQuestions"')
  })
})

describe('PairwiseMapResponseSchema via parseAndValidate', () => {
  it('accepts a valid pairwise map response', () => {
    const valid = JSON.stringify({
      contradictions: [
        { description: 'Timeline mismatch', planAPosition: '6 months', planBPosition: '3 months' },
      ],
      synergies: [
        { description: 'Agree on microservices', sharedInsight: 'Both recommend decomposition' },
      ],
      gaps: [
        { description: 'Security analysis', coveredBy: 'planB', missingFrom: 'planA' },
      ],
    })
    const result = parseAndValidate('pairwise_map', valid)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('accepts empty arrays for all fields', () => {
    const valid = JSON.stringify({
      contradictions: [],
      synergies: [],
      gaps: [],
    })
    const result = parseAndValidate('pairwise_map', valid)
    expect(result.success).toBe(true)
  })

  it('rejects missing contradictions field', () => {
    const invalid = JSON.stringify({
      synergies: [],
      gaps: [],
    })
    const result = parseAndValidate('pairwise_map', invalid)
    expect(result.success).toBe(false)
    expect(result.feedback).toContain('schema')
  })

  it('rejects empty description in contradiction', () => {
    const invalid = JSON.stringify({
      contradictions: [{ description: '', planAPosition: 'pos', planBPosition: 'pos' }],
      synergies: [],
      gaps: [],
    })
    const result = parseAndValidate('pairwise_map', invalid)
    expect(result.success).toBe(false)
  })

  it('rejects invalid coveredBy value in gaps', () => {
    const invalid = JSON.stringify({
      contradictions: [],
      synergies: [],
      gaps: [{ description: 'gap', coveredBy: 'planC', missingFrom: 'planA' }],
    })
    const result = parseAndValidate('pairwise_map', invalid)
    expect(result.success).toBe(false)
  })
})

describe('ReduceResponseSchema via parseAndValidate', () => {
  it('accepts a valid reduce response', () => {
    const valid = JSON.stringify({
      conflictsResolved: [
        {
          description: 'Timeline resolved',
          laneAId: laneAId,
          laneBId: laneBId,
          resolution: 'Use 4 months',
          tradeoff: 'Slower but thorough',
        },
      ],
      unresolvedQuestions: ['What about team capacity?'],
    })
    const result = parseAndValidate('reduce', valid)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })

  it('accepts empty arrays', () => {
    const valid = JSON.stringify({
      conflictsResolved: [],
      unresolvedQuestions: [],
    })
    const result = parseAndValidate('reduce', valid)
    expect(result.success).toBe(true)
  })

  it('rejects missing conflictsResolved', () => {
    const invalid = JSON.stringify({
      unresolvedQuestions: [],
    })
    const result = parseAndValidate('reduce', invalid)
    expect(result.success).toBe(false)
  })

  it('rejects empty string in unresolvedQuestions', () => {
    const invalid = JSON.stringify({
      conflictsResolved: [],
      unresolvedQuestions: [''],
    })
    const result = parseAndValidate('reduce', invalid)
    expect(result.success).toBe(false)
  })
})

describe('unified_plan job type still works', () => {
  it('validates against StructuredPlanSchema', () => {
    const validPlan = JSON.stringify({
      goals: [{ heading: 'G1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
      assumptions: [{ heading: 'A1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
      strategy: [{ heading: 'S1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
      milestones: [{ heading: 'M1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
      risks: [{ heading: 'R1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
      nextActions: [{ heading: 'N1', content: ['c'], evidence: [{ nodeId: nodeId1, laneId: laneAId, quote: 'q', relevance: 'primary' }] }],
    })
    const result = parseAndValidate('unified_plan', validPlan)
    expect(result.success).toBe(true)
  })
})
