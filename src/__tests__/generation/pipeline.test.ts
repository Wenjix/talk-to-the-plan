import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../generation/prompts'
import { buildPathQuestionsPrompt } from '../../generation/prompts/path-questions'
import { buildAnswerPrompt } from '../../generation/prompts/answer'
import { buildBranchPrompt } from '../../generation/prompts/branch'
import { getPersonaPreamble, PLANNER_PREAMBLE } from '../../generation/prompts/system-preambles'
import type { CompiledContext, PlanningSession, JobType } from '../../core/types'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'
const targetNodeId = '00000000-0000-4000-a000-000000000002'

const mockContext: CompiledContext = {
  entries: [
    {
      nodeId: '00000000-0000-4000-a000-000000000010',
      role: 'ancestor',
      distanceFromTarget: 1,
      content: 'Q: What is the main goal?\nA: Summary: Build a planning tool.\n- Bullet 1\n- Bullet 2',
      tokenEstimate: 30,
    },
    {
      nodeId: targetNodeId,
      role: 'sibling',
      distanceFromTarget: 0,
      content: 'Q: How should we prioritize features?',
      tokenEstimate: 10,
    },
  ],
  totalTokenEstimate: 40,
  targetNodeId,
  formatted: `[GRAPH CONTEXT]
Ancestors:
- Root (depth 1): Q: What is the main goal? A: Build a planning tool.
Siblings:
- Sibling (Unexplored): Q: How should we prioritize features?
- Current Node: "How should we handle technical debt?"`,
}

const mockSession: PlanningSession = {
  id: sessionId,
  topic: 'Planning a software project roadmap',
  createdAt: now,
  updatedAt: now,
  challengeDepth: 'balanced',
  activeLaneId: laneId,
  status: 'exploring',
  version: 'fuda_v1',
}

// ---------------------------------------------------------------------------
// Individual prompt builder tests
// ---------------------------------------------------------------------------

describe('buildPathQuestionsPrompt', () => {
  const preamble = getPersonaPreamble('analytical')

  it('produces a non-empty string', () => {
    const result = buildPathQuestionsPrompt(mockContext, preamble)
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains the context formatted content', () => {
    const result = buildPathQuestionsPrompt(mockContext, preamble)
    expect(result).toContain(mockContext.formatted)
  })

  it('contains persona preamble content', () => {
    const result = buildPathQuestionsPrompt(mockContext, preamble)
    expect(result).toContain('Analytical Planner')
  })

  it('contains the SYSTEM and TASK markers', () => {
    const result = buildPathQuestionsPrompt(mockContext, preamble)
    expect(result).toContain('[SYSTEM]')
    expect(result).toContain('[TASK]')
  })

  it('requests 6 follow-up questions for the Conversation Compass', () => {
    const result = buildPathQuestionsPrompt(mockContext, preamble)
    expect(result).toContain('6 follow-up questions')
    expect(result).toContain('Conversation Compass')
  })
})

describe('buildAnswerPrompt', () => {
  const preamble = getPersonaPreamble('analytical')

  it('produces a non-empty string', () => {
    const result = buildAnswerPrompt(mockContext, preamble)
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains the context formatted content', () => {
    const result = buildAnswerPrompt(mockContext, preamble)
    expect(result).toContain(mockContext.formatted)
  })

  it('contains persona preamble content', () => {
    const result = buildAnswerPrompt(mockContext, preamble)
    expect(result).toContain('Analytical Planner')
  })

  it('requests a thorough answer', () => {
    const result = buildAnswerPrompt(mockContext, preamble)
    expect(result).toContain('thorough answer')
  })

  it('specifies the expected JSON schema with summary and bullets', () => {
    const result = buildAnswerPrompt(mockContext, preamble)
    expect(result).toContain('"summary"')
    expect(result).toContain('"bullets"')
  })
})

describe('buildBranchPrompt', () => {
  const preamble = getPersonaPreamble('expansive')

  it('produces a non-empty string', () => {
    const result = buildBranchPrompt(mockContext, preamble)
    expect(result.length).toBeGreaterThan(0)
  })

  it('contains the context formatted content', () => {
    const result = buildBranchPrompt(mockContext, preamble)
    expect(result).toContain(mockContext.formatted)
  })

  it('contains persona preamble content', () => {
    const result = buildBranchPrompt(mockContext, preamble)
    expect(result).toContain('Expansive Planner')
  })

  it('requests 3 follow-up questions that branch', () => {
    const result = buildBranchPrompt(mockContext, preamble)
    expect(result).toContain('3 follow-up questions')
    expect(result).toContain('branch')
  })

  it('specifies quality metrics in the schema', () => {
    const result = buildBranchPrompt(mockContext, preamble)
    expect(result).toContain('"novelty"')
    expect(result).toContain('"specificity"')
    expect(result).toContain('"challenge"')
  })
})

// ---------------------------------------------------------------------------
// buildPrompt dispatcher tests
// ---------------------------------------------------------------------------

describe('buildPrompt', () => {
  it('dispatches path_questions to buildPathQuestionsPrompt', () => {
    const result = buildPrompt('path_questions', mockContext, mockSession)
    // path_questions prompt mentions "6 follow-up questions" and "Conversation Compass"
    expect(result).toContain('6 follow-up questions')
    expect(result).toContain('Conversation Compass')
  })

  it('dispatches answer to buildAnswerPrompt', () => {
    const result = buildPrompt('answer', mockContext, mockSession)
    expect(result).toContain('thorough answer')
    expect(result).toContain('"summary"')
  })

  it('dispatches branch to buildBranchPrompt', () => {
    const result = buildPrompt('branch', mockContext, mockSession)
    expect(result).toContain('3 follow-up questions')
    expect(result).toContain('"branches"')
  })

  it('dispatches dialogue_turn to dialogue prompt builder', () => {
    const result = buildPrompt('dialogue_turn', mockContext, mockSession)
    // dialogue_turn uses buildDialoguePrompt with socratic defaults
    expect(result).toContain('[SYSTEM]')
    expect(result).toContain('[DIALOGUE HISTORY]')
    expect(result).toContain('ONLY ask questions')
  })

  it('dispatches lane_plan to answer builder with planner preamble', () => {
    const result = buildPrompt('lane_plan', mockContext, mockSession)
    expect(result).toContain('Strategic Planner')
  })

  it('dispatches unified_plan to answer builder with planner preamble', () => {
    const result = buildPrompt('unified_plan', mockContext, mockSession)
    expect(result).toContain('Strategic Planner')
  })

  it('always includes context formatted content regardless of jobType', () => {
    const jobTypes: JobType[] = [
      'path_questions',
      'answer',
      'branch',
      'dialogue_turn',
      'lane_plan',
      'unified_plan',
    ]
    for (const jobType of jobTypes) {
      const result = buildPrompt(jobType, mockContext, mockSession)
      expect(result).toContain(mockContext.formatted)
    }
  })

  it('always includes persona preamble content regardless of jobType', () => {
    const jobTypes: JobType[] = [
      'path_questions',
      'answer',
      'branch',
      'dialogue_turn',
      'lane_plan',
      'unified_plan',
    ]
    for (const jobType of jobTypes) {
      const result = buildPrompt(jobType, mockContext, mockSession)
      // All prompts should contain [SYSTEM] marker and some preamble text
      expect(result).toContain('[SYSTEM]')
      expect(result.length).toBeGreaterThan(100)
    }
  })

  it('produces non-empty output for every jobType', () => {
    const jobTypes: JobType[] = [
      'path_questions',
      'answer',
      'branch',
      'dialogue_turn',
      'lane_plan',
      'unified_plan',
    ]
    for (const jobType of jobTypes) {
      const result = buildPrompt(jobType, mockContext, mockSession)
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Persona preamble tests
// ---------------------------------------------------------------------------

describe('getPersonaPreamble', () => {
  it('returns non-empty preamble for each persona', () => {
    const personas = ['expansive', 'analytical', 'pragmatic', 'socratic'] as const
    for (const persona of personas) {
      const preamble = getPersonaPreamble(persona)
      expect(preamble.length).toBeGreaterThan(0)
    }
  })

  it('PLANNER_PREAMBLE is non-empty and mentions Strategic Planner', () => {
    expect(PLANNER_PREAMBLE.length).toBeGreaterThan(0)
    expect(PLANNER_PREAMBLE).toContain('Strategic Planner')
  })
})
