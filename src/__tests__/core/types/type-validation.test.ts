import { describe, it, expect } from 'vitest'
import {
  UUIDSchema,
  ISODateTimeSchema,
  PathTypeSchema,
  ChallengeDepthSchema,
} from '../../../core/types/primitives'
import { PlanningSessionSchema } from '../../../core/types/session'
import { SemanticNodeSchema } from '../../../core/types/node'
import { SemanticEdgeSchema } from '../../../core/types/edge'
import { DialogueTurnSchema } from '../../../core/types/dialogue'
import { PromotionSchema } from '../../../core/types/promotion'
import {
  EvidenceRefSchema,
  PlanSectionSchema,
  StructuredPlanSchema,
  LanePlanSchema,
} from '../../../core/types/plan'
import { GenerationJobSchema } from '../../../core/types/job'
import { CompiledContextSchema } from '../../../core/types/context'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001'
const VALID_UUID_3 = '770e8400-e29b-41d4-a716-446655440002'
const VALID_UUID_4 = '880e8400-e29b-41d4-a716-446655440003'
const VALID_ISO = '2025-01-01T00:00:00+00:00'
const VALID_ISO_2 = '2025-01-02T12:30:00+00:00'

// ─── Primitives ───────────────────────────────────────────────

describe('UUIDSchema', () => {
  it('parses a valid UUID', () => {
    expect(UUIDSchema.parse(VALID_UUID)).toBe(VALID_UUID)
  })

  it('rejects a random string', () => {
    expect(() => UUIDSchema.parse('not-a-uuid')).toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => UUIDSchema.parse('')).toThrow()
  })
})

describe('ISODateTimeSchema', () => {
  it('parses a valid ISO datetime with offset', () => {
    expect(ISODateTimeSchema.parse(VALID_ISO)).toBe(VALID_ISO)
  })

  it('parses Z-suffix datetime', () => {
    const zdt = '2025-06-15T08:30:00Z'
    expect(ISODateTimeSchema.parse(zdt)).toBe(zdt)
  })

  it('rejects an invalid string', () => {
    expect(() => ISODateTimeSchema.parse('not-a-date')).toThrow()
  })

  it('rejects a plain date without time', () => {
    expect(() => ISODateTimeSchema.parse('2025-01-01')).toThrow()
  })
})

describe('PathTypeSchema', () => {
  it.each(['clarify', 'go-deeper', 'challenge', 'apply', 'connect', 'surprise'] as const)(
    'accepts valid value "%s"',
    (value) => {
      expect(PathTypeSchema.parse(value)).toBe(value)
    },
  )

  it('rejects an invalid enum value', () => {
    expect(() => PathTypeSchema.parse('invalid')).toThrow()
  })
})

describe('ChallengeDepthSchema', () => {
  it.each(['gentle', 'balanced', 'intense'] as const)(
    'accepts valid value "%s"',
    (value) => {
      expect(ChallengeDepthSchema.parse(value)).toBe(value)
    },
  )

  it('rejects "extreme"', () => {
    expect(() => ChallengeDepthSchema.parse('extreme')).toThrow()
  })
})

// ─── Session ──────────────────────────────────────────────────

describe('PlanningSessionSchema', () => {
  const validSession = {
    id: VALID_UUID,
    topic: 'A sufficiently long topic for the session',
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
    activeLaneId: VALID_UUID_2,
    version: 'fuda_v1' as const,
  }

  it('parses a valid session with all required fields', () => {
    const result = PlanningSessionSchema.parse(validSession)
    expect(result.id).toBe(VALID_UUID)
    expect(result.topic).toBe(validSession.topic)
    expect(result.version).toBe('fuda_v1')
  })

  it('applies default values for challengeDepth and status', () => {
    const result = PlanningSessionSchema.parse(validSession)
    expect(result.challengeDepth).toBe('balanced')
    expect(result.status).toBe('exploring')
  })

  it('rejects a session with topic shorter than 10 chars', () => {
    expect(() =>
      PlanningSessionSchema.parse({ ...validSession, topic: 'short' }),
    ).toThrow()
  })

  it('accepts explicit challengeDepth and status', () => {
    const result = PlanningSessionSchema.parse({
      ...validSession,
      challengeDepth: 'intense',
      status: 'synthesis_ready',
    })
    expect(result.challengeDepth).toBe('intense')
    expect(result.status).toBe('synthesis_ready')
  })
})

// ─── Node ─────────────────────────────────────────────────────

describe('SemanticNodeSchema', () => {
  const validNode = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    laneId: VALID_UUID_3,
    parentId: null,
    nodeType: 'root' as const,
    pathType: 'clarify' as const,
    question: 'What is the core problem?',
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO,
  }

  it('parses a valid node', () => {
    const result = SemanticNodeSchema.parse(validNode)
    expect(result.id).toBe(VALID_UUID)
    expect(result.question).toBe('What is the core problem?')
  })

  it('applies default values for fsmState, promoted, and depth', () => {
    const result = SemanticNodeSchema.parse(validNode)
    expect(result.fsmState).toBe('idle')
    expect(result.promoted).toBe(false)
    expect(result.depth).toBe(0)
  })

  it('accepts optional answer and quality fields', () => {
    const result = SemanticNodeSchema.parse({
      ...validNode,
      answer: { summary: 'A summary', bullets: ['Point one'] },
      quality: { novelty: 0.8, specificity: 0.6, challenge: 0.7 },
    })
    expect(result.answer!.summary).toBe('A summary')
    expect(result.quality!.novelty).toBe(0.8)
  })

  it('rejects node with empty question', () => {
    expect(() =>
      SemanticNodeSchema.parse({ ...validNode, question: '' }),
    ).toThrow()
  })
})

// ─── Edge ─────────────────────────────────────────────────────

describe('SemanticEdgeSchema', () => {
  const validEdge = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    laneId: VALID_UUID_3,
    sourceNodeId: VALID_UUID_4,
    targetNodeId: VALID_UUID,
    createdAt: VALID_ISO,
  }

  it('parses a valid edge', () => {
    const result = SemanticEdgeSchema.parse(validEdge)
    expect(result.id).toBe(VALID_UUID)
    expect(result.sourceNodeId).toBe(VALID_UUID_4)
    expect(result.targetNodeId).toBe(VALID_UUID)
  })

  it('accepts optional label', () => {
    const result = SemanticEdgeSchema.parse({ ...validEdge, label: 'explores' })
    expect(result.label).toBe('explores')
  })

  it('rejects edge with missing required fields', () => {
    const { sourceNodeId: _sourceNodeId, ...incomplete } = validEdge
    expect(() => SemanticEdgeSchema.parse(incomplete)).toThrow()
  })
})

// ─── Dialogue ─────────────────────────────────────────────────

describe('DialogueTurnSchema', () => {
  const validTurn = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    nodeId: VALID_UUID_3,
    turnIndex: 0,
    speaker: 'user' as const,
    dialecticMode: 'socratic' as const,
    content: 'I think the approach should be incremental.',
    createdAt: VALID_ISO,
  }

  it('parses a valid dialogue turn', () => {
    const result = DialogueTurnSchema.parse(validTurn)
    expect(result.id).toBe(VALID_UUID)
    expect(result.speaker).toBe('user')
    expect(result.dialecticMode).toBe('socratic')
    expect(result.content).toBe('I think the approach should be incremental.')
  })

  it('accepts optional turnType and suggestedResponses', () => {
    const result = DialogueTurnSchema.parse({
      ...validTurn,
      speaker: 'ai',
      turnType: 'challenge',
      suggestedResponses: [
        { text: 'I agree but...', intent: 'defend' },
      ],
    })
    expect(result.turnType).toBe('challenge')
    expect(result.suggestedResponses).toHaveLength(1)
  })

  it('rejects empty content', () => {
    expect(() =>
      DialogueTurnSchema.parse({ ...validTurn, content: '' }),
    ).toThrow()
  })
})

// ─── Promotion ────────────────────────────────────────────────

describe('PromotionSchema', () => {
  const validPromotion = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    laneId: VALID_UUID_3,
    nodeId: VALID_UUID_4,
    reason: 'insightful_reframe' as const,
    createdAt: VALID_ISO,
  }

  it('parses a valid promotion', () => {
    const result = PromotionSchema.parse(validPromotion)
    expect(result.id).toBe(VALID_UUID)
    expect(result.reason).toBe('insightful_reframe')
  })

  it('accepts optional note', () => {
    const result = PromotionSchema.parse({
      ...validPromotion,
      note: 'This reframe changed the direction of the discussion.',
    })
    expect(result.note).toBe('This reframe changed the direction of the discussion.')
  })

  it('rejects invalid promotion reason', () => {
    expect(() =>
      PromotionSchema.parse({ ...validPromotion, reason: 'invalid_reason' }),
    ).toThrow()
  })
})

// ─── Plan ─────────────────────────────────────────────────────

const makeEvidence = () => ({
  nodeId: VALID_UUID,
  laneId: VALID_UUID_2,
  quote: 'Key finding from exploration',
  relevance: 'primary' as const,
})

const makeSection = () => ({
  heading: 'Section Heading',
  content: ['First point of the section'],
  evidence: [makeEvidence()],
})

const makeStructuredPlan = () => ({
  goals: [makeSection()],
  assumptions: [makeSection()],
  strategy: [makeSection()],
  milestones: [makeSection()],
  risks: [makeSection()],
  nextActions: [makeSection()],
})

describe('EvidenceRefSchema', () => {
  it('parses valid evidence', () => {
    const result = EvidenceRefSchema.parse(makeEvidence())
    expect(result.nodeId).toBe(VALID_UUID)
    expect(result.relevance).toBe('primary')
  })

  it('accepts supporting relevance', () => {
    const result = EvidenceRefSchema.parse({ ...makeEvidence(), relevance: 'supporting' })
    expect(result.relevance).toBe('supporting')
  })

  it('rejects empty quote', () => {
    expect(() =>
      EvidenceRefSchema.parse({ ...makeEvidence(), quote: '' }),
    ).toThrow()
  })
})

describe('PlanSectionSchema', () => {
  it('parses a valid section', () => {
    const result = PlanSectionSchema.parse(makeSection())
    expect(result.heading).toBe('Section Heading')
    expect(result.content).toHaveLength(1)
    expect(result.evidence).toHaveLength(1)
  })

  it('rejects section with empty content array', () => {
    expect(() =>
      PlanSectionSchema.parse({ ...makeSection(), content: [] }),
    ).toThrow()
  })

  it('rejects section with empty evidence array', () => {
    expect(() =>
      PlanSectionSchema.parse({ ...makeSection(), evidence: [] }),
    ).toThrow()
  })
})

describe('StructuredPlanSchema', () => {
  it('parses a valid structured plan', () => {
    const result = StructuredPlanSchema.parse(makeStructuredPlan())
    expect(result.goals).toHaveLength(1)
    expect(result.risks).toHaveLength(1)
  })

  it('rejects plan missing a required section group', () => {
    const { risks: _risks, ...incomplete } = makeStructuredPlan()
    expect(() => StructuredPlanSchema.parse(incomplete)).toThrow()
  })
})

describe('LanePlanSchema', () => {
  const validLanePlan = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    laneId: VALID_UUID_3,
    title: 'Lane Plan Title',
    sections: makeStructuredPlan(),
    sourcePromotionIds: [VALID_UUID_4],
    confidence: 0.85,
    createdAt: VALID_ISO,
    updatedAt: VALID_ISO_2,
  }

  it('parses a valid lane plan', () => {
    const result = LanePlanSchema.parse(validLanePlan)
    expect(result.title).toBe('Lane Plan Title')
    expect(result.confidence).toBe(0.85)
    expect(result.sourcePromotionIds).toHaveLength(1)
  })

  it('rejects confidence out of range', () => {
    expect(() =>
      LanePlanSchema.parse({ ...validLanePlan, confidence: 1.5 }),
    ).toThrow()
  })

  it('rejects empty sourcePromotionIds', () => {
    expect(() =>
      LanePlanSchema.parse({ ...validLanePlan, sourcePromotionIds: [] }),
    ).toThrow()
  })
})

// ─── Job ──────────────────────────────────────────────────────

describe('GenerationJobSchema', () => {
  const validJob = {
    id: VALID_UUID,
    sessionId: VALID_UUID_2,
    targetNodeId: VALID_UUID_3,
    jobType: 'answer' as const,
    idempotencyKey: 'answer-550e8400',
    createdAt: VALID_ISO,
  }

  it('parses a valid job', () => {
    const result = GenerationJobSchema.parse(validJob)
    expect(result.id).toBe(VALID_UUID)
    expect(result.jobType).toBe('answer')
    expect(result.idempotencyKey).toBe('answer-550e8400')
  })

  it('applies default values for fsmState, attempts, and maxAttempts', () => {
    const result = GenerationJobSchema.parse(validJob)
    expect(result.fsmState).toBe('queued')
    expect(result.attempts).toBe(0)
    expect(result.maxAttempts).toBe(3)
  })

  it('accepts optional error and resolvedAt', () => {
    const result = GenerationJobSchema.parse({
      ...validJob,
      fsmState: 'failed',
      error: 'Rate limit exceeded',
      resolvedAt: VALID_ISO_2,
    })
    expect(result.error).toBe('Rate limit exceeded')
    expect(result.resolvedAt).toBe(VALID_ISO_2)
  })

  it('rejects empty idempotencyKey', () => {
    expect(() =>
      GenerationJobSchema.parse({ ...validJob, idempotencyKey: '' }),
    ).toThrow()
  })
})

// ─── Context ──────────────────────────────────────────────────

describe('CompiledContextSchema', () => {
  const validContext = {
    entries: [
      {
        nodeId: VALID_UUID,
        role: 'ancestor' as const,
        distanceFromTarget: 1,
        content: 'Parent node content',
        tokenEstimate: 50,
      },
    ],
    totalTokenEstimate: 50,
    targetNodeId: VALID_UUID_2,
    formatted: '## Context\n\nParent node content',
  }

  it('parses a valid compiled context', () => {
    const result = CompiledContextSchema.parse(validContext)
    expect(result.entries).toHaveLength(1)
    expect(result.totalTokenEstimate).toBe(50)
    expect(result.targetNodeId).toBe(VALID_UUID_2)
  })

  it('parses context with empty entries', () => {
    const result = CompiledContextSchema.parse({
      ...validContext,
      entries: [],
      totalTokenEstimate: 0,
      formatted: '',
    })
    expect(result.entries).toHaveLength(0)
  })

  it('accepts all context roles', () => {
    const entries = (['ancestor', 'sibling', 'cousin'] as const).map((role, i) => ({
      nodeId: VALID_UUID,
      role,
      distanceFromTarget: i,
      content: `${role} content`,
      tokenEstimate: 10,
    }))
    const result = CompiledContextSchema.parse({
      ...validContext,
      entries,
      totalTokenEstimate: 30,
    })
    expect(result.entries).toHaveLength(3)
  })

  it('rejects invalid context role', () => {
    expect(() =>
      CompiledContextSchema.parse({
        ...validContext,
        entries: [
          {
            nodeId: VALID_UUID,
            role: 'unknown',
            distanceFromTarget: 0,
            content: 'test',
            tokenEstimate: 5,
          },
        ],
      }),
    ).toThrow()
  })
})
