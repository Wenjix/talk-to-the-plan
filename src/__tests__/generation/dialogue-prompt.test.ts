import { describe, it, expect } from 'vitest'
import { buildDialoguePrompt, buildConcludeSynthesisPrompt } from '../../generation/prompts/dialogue'
import type { DialogueTurn, CompiledContext, DialecticMode, ChallengeDepth } from '../../core/types'

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const nodeId = '00000000-0000-4000-a000-000000000010'

const mockContext: CompiledContext = {
  entries: [
    {
      nodeId: '00000000-0000-4000-a000-000000000020',
      role: 'ancestor',
      distanceFromTarget: 1,
      content: 'Q: What is the core problem?\nA: Complex deployment coupling.',
      tokenEstimate: 20,
    },
  ],
  totalTokenEstimate: 20,
  targetNodeId: nodeId,
  formatted: `[GRAPH CONTEXT]
- Root (depth 1): "What is the core problem?"
  → "Complex deployment coupling."
- Current Node: "How should we handle the migration?"`,
}

const makeTurn = (speaker: 'user' | 'ai', content: string, index: number): DialogueTurn => ({
  id: `00000000-0000-4000-a000-00000000000${index}`,
  sessionId,
  nodeId,
  turnIndex: index,
  speaker,
  dialecticMode: 'socratic',
  content,
  createdAt: now,
})

const history: DialogueTurn[] = [
  makeTurn('user', 'I think we should do a big-bang migration.', 0),
  makeTurn('ai', 'What evidence suggests a big-bang approach would succeed here?', 1),
  makeTurn('user', 'Our team has done it before with similar systems.', 2),
]

describe('buildDialoguePrompt', () => {
  describe('mode instructions', () => {
    it.each([
      ['socratic', 'ONLY ask questions'],
      ['devil_advocate', 'argue the opposite'],
      ['steelman', 'make them stronger'],
      ['collaborative', 'build on'],
    ] as [DialecticMode, string][])('includes %s mode instruction', (mode, expected) => {
      const result = buildDialoguePrompt(mode, history, mockContext, 'balanced')
      expect(result).toContain(expected)
    })
  })

  describe('challenge depth modulation', () => {
    it.each([
      ['gentle', 'Gently probe assumptions'],
      ['balanced', 'Challenge directly'],
      ['intense', 'Rigorously interrogate'],
    ] as [ChallengeDepth, string][])('includes %s depth instruction', (depth, expected) => {
      const result = buildDialoguePrompt('socratic', history, mockContext, depth)
      expect(result).toContain(expected)
    })
  })

  describe('prompt structure', () => {
    it('contains SYSTEM marker', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('[SYSTEM]')
    })

    it('contains DIALOGUE HISTORY marker', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('[DIALOGUE HISTORY]')
    })

    it('contains TASK marker', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('[TASK]')
    })

    it('includes graph context', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain(mockContext.formatted)
    })

    it('includes JSON schema in task section', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('"content"')
      expect(result).toContain('"turnType"')
      expect(result).toContain('"suggestedResponses"')
    })
  })

  describe('dialogue history formatting', () => {
    it('formats user turns with User prefix', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('User: I think we should do a big-bang migration.')
    })

    it('formats ai turns with AI prefix', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      expect(result).toContain('AI: What evidence suggests')
    })

    it('preserves turn order', () => {
      const result = buildDialoguePrompt('socratic', history, mockContext, 'balanced')
      const userIdx = result.indexOf('User: I think')
      const aiIdx = result.indexOf('AI: What evidence')
      const user2Idx = result.indexOf('User: Our team')
      expect(userIdx).toBeLessThan(aiIdx)
      expect(aiIdx).toBeLessThan(user2Idx)
    })

    it('handles empty history', () => {
      const result = buildDialoguePrompt('socratic', [], mockContext, 'balanced')
      expect(result).toContain('No previous dialogue')
    })
  })

  describe('all mode/depth combinations', () => {
    const modes: DialecticMode[] = ['socratic', 'devil_advocate', 'steelman', 'collaborative']
    const depths: ChallengeDepth[] = ['gentle', 'balanced', 'intense']

    it('produces non-empty output for all 12 combinations', () => {
      for (const mode of modes) {
        for (const depth of depths) {
          const result = buildDialoguePrompt(mode, history, mockContext, depth)
          expect(result.length).toBeGreaterThan(100)
        }
      }
    })
  })
})

describe('buildConcludeSynthesisPrompt', () => {
  const originalAnswer = {
    summary: 'Big-bang migration is risky but faster.',
    bullets: [
      'Reduces deployment coupling immediately',
      'Requires extensive testing before cutover',
    ],
  }

  it('contains SYSTEM marker', () => {
    const result = buildConcludeSynthesisPrompt(history, mockContext, originalAnswer)
    expect(result).toContain('[SYSTEM]')
  })

  it('contains the original answer', () => {
    const result = buildConcludeSynthesisPrompt(history, mockContext, originalAnswer)
    expect(result).toContain('[ORIGINAL ANSWER]')
    expect(result).toContain(originalAnswer.summary)
    expect(result).toContain(originalAnswer.bullets[0])
  })

  it('contains dialogue history', () => {
    const result = buildConcludeSynthesisPrompt(history, mockContext, originalAnswer)
    expect(result).toContain('[DIALOGUE]')
    expect(result).toContain('User: I think we should do a big-bang migration.')
  })

  it('contains graph context', () => {
    const result = buildConcludeSynthesisPrompt(history, mockContext, originalAnswer)
    expect(result).toContain(mockContext.formatted)
  })

  it('requests JSON output matching answer schema', () => {
    const result = buildConcludeSynthesisPrompt(history, mockContext, originalAnswer)
    expect(result).toContain('"summary"')
    expect(result).toContain('"bullets"')
  })
})
