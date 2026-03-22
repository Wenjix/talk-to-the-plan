import type { DialecticMode, DialogueTurn, CompiledContext, ChallengeDepth } from '../../core/types'

// Mode-specific system instructions
const MODE_INSTRUCTIONS: Record<DialecticMode, string> = {
  socratic: `You are a Socratic questioner. ONLY ask questions — never state opinions or make claims.
Your goal is to surface contradictions, unstated assumptions, and gaps in reasoning.
Techniques: reductio ad absurdum, maieutic questioning, definitional probing.
Never say "Good point" or validate — always push deeper with another question.`,

  devil_advocate: `You are a Devil's Advocate. Your role is to argue the opposite of whatever the user says.
Find counterpoints, counterexamples, and edge cases for every claim.
If the user changes position, switch sides to argue against their new position.
Be intellectually honest — argue the strongest version of the opposing view.`,

  steelman: `You are a Steelman advocate. Take the user's WEAKEST argument and make them stronger.
Fill in missing evidence, suggest better framings, and connect to supporting research.
When the user makes a claim, ask "What's the strongest version of this argument?"
Help them build the most defensible version of their position.`,

  collaborative: `You are a Collaborative planner. Your role is to build on the user's ideas constructively.
Add structure to unstructured thinking. Find gaps and suggest how to fill them.
When the user is stuck, offer 2-3 concrete next steps.
Balance between validation and gentle course-correction.`,
}

// Challenge depth instructions
const DEPTH_INSTRUCTIONS: Record<ChallengeDepth, string> = {
  gentle: `Tone: Supportive and exploratory. Gently probe assumptions. Use phrases like "I wonder if...", "Have you considered..."
Concede frequently (every 2-3 turns). Accept first answers. Probe only explicit assumptions.`,

  balanced: `Tone: Direct but respectful. Challenge directly but respectfully. Use phrases like "That claim needs support", "What evidence..."
Expect the user to defend claims. Probe unstated assumptions too.`,

  intense: `Tone: Rigorous and demanding. Rigorously interrogate every claim. Use phrases like "That's unfounded. Show me the data."
Accept nothing at face value. Demand evidence for every claim. 2-3 follow-ups per point.
Only concede when cornered by strong evidence. Probe meta-assumptions.`,
}

function formatHistory(history: DialogueTurn[]): string {
  if (history.length === 0) return 'No previous dialogue.'

  return history
    .map((turn) => {
      const speaker = turn.speaker === 'user' ? 'User' : 'AI'
      return `${speaker}: ${turn.content}`
    })
    .join('\n')
}

export function buildDialoguePrompt(
  mode: DialecticMode,
  history: DialogueTurn[],
  compiledContext: CompiledContext,
  challengeDepth: ChallengeDepth,
): string {
  const sections: string[] = []

  // 1. System preamble with mode
  sections.push('[SYSTEM]')
  sections.push(MODE_INSTRUCTIONS[mode])
  sections.push('')
  sections.push('[CHALLENGE DEPTH]')
  sections.push(DEPTH_INSTRUCTIONS[challengeDepth])

  // 2. Graph context
  sections.push('')
  sections.push(compiledContext.formatted)

  // 3. Dialogue history
  sections.push('')
  sections.push('[DIALOGUE HISTORY]')
  sections.push(formatHistory(history))

  // 4. Task instruction with JSON schema
  sections.push('')
  sections.push('[TASK]')
  sections.push(`Respond to the user's latest message in the ${mode.replace('_', ' ')} style.
Classify your response with a turnType and suggest 2-3 follow-up responses the user might give.

Return JSON matching this exact schema:
{
  "content": "Your response text",
  "turnType": "challenge | pushback | reframe | probe | concede | synthesize",
  "suggestedResponses": [
    { "text": "Response text", "intent": "defend | concede | redirect | deepen | conclude" }
  ]
}

Ensure JSON is valid and complete. Do not include markdown formatting or code fences.`)

  return sections.join('\n')
}

/**
 * Build a synthesis prompt that summarizes dialogue insights into an enriched answer.
 */
export function buildConcludeSynthesisPrompt(
  history: DialogueTurn[],
  compiledContext: CompiledContext,
  originalAnswer: { summary: string; bullets: string[] },
): string {
  const sections: string[] = []

  sections.push('[SYSTEM]')
  sections.push('You are synthesizing a Socratic dialogue into an enriched answer.')
  sections.push('Integrate the key insights, challenges, and resolutions from the dialogue.')
  sections.push('The result should be strictly better than the original answer — more specific,')
  sections.push('more nuanced, and addressing the challenges raised.')

  sections.push('')
  sections.push(compiledContext.formatted)

  sections.push('')
  sections.push('[ORIGINAL ANSWER]')
  sections.push(`Summary: ${originalAnswer.summary}`)
  for (const bullet of originalAnswer.bullets) {
    sections.push(`- ${bullet}`)
  }

  sections.push('')
  sections.push('[DIALOGUE]')
  for (const turn of history) {
    const speaker = turn.speaker === 'user' ? 'User' : 'AI'
    sections.push(`${speaker}: ${turn.content}`)
  }

  sections.push('')
  sections.push(`[TASK]
Synthesize the dialogue into an enriched answer that incorporates the insights gained.
Keep what was strong in the original. Add nuance from the dialogue. Address challenges raised.

Return JSON matching this exact schema:
{
  "summary": "A 1-2 sentence synthesis (max 200 chars)",
  "bullets": ["3-8 specific points, each a complete thought"]
}

Ensure JSON is valid and complete. Do not include markdown formatting or code fences.`)

  return sections.join('\n')
}
