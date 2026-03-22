import type { GenerationProvider } from './types';

// ---------------------------------------------------------------------------
// Demo response templates — richer and more realistic than MockProvider
// ---------------------------------------------------------------------------

const DEMO_ANSWERS: Record<string, { summary: string; bullets: string[] }> = {
  default: {
    summary: 'This topic involves several interconnected dimensions that merit careful exploration. The core challenge lies in balancing competing priorities while maintaining a coherent strategy.',
    bullets: [
      'The primary driver is the need to reconcile short-term constraints with long-term objectives.',
      'Stakeholder alignment is critical, particularly around risk tolerance and resource allocation.',
      'Evidence suggests that iterative approaches tend to outperform big-bang transformations.',
      'Measuring progress requires both leading indicators (process metrics) and lagging indicators (outcome metrics).',
    ],
  },
  technology: {
    summary: 'The technical landscape offers multiple viable architectures, each with distinct tradeoffs in scalability, maintainability, and developer experience.',
    bullets: [
      'A modular architecture with clear boundaries supports both independent deployment and team autonomy.',
      'Event-driven patterns reduce coupling but introduce complexity in debugging and consistency guarantees.',
      'The choice between build-vs-buy should weigh total cost of ownership, not just initial implementation effort.',
      'Observability (logs, metrics, traces) must be a first-class design concern, not an afterthought.',
    ],
  },
  strategy: {
    summary: 'Effective strategy requires a clear theory of change: what specific actions, in what sequence, will move the organization from its current state to the desired future state.',
    bullets: [
      'Start by identifying the smallest set of decisions that would have the largest impact on outcomes.',
      'Competitive advantage often comes from operational excellence rather than novel positioning.',
      'Resource allocation signals strategic priority more reliably than mission statements do.',
      'Build explicit feedback loops so the strategy can adapt as conditions change.',
    ],
  },
};

function pickAnswer(prompt: string): { summary: string; bullets: string[] } {
  const lower = prompt.toLowerCase();
  if (lower.includes('tech') || lower.includes('software') || lower.includes('system') || lower.includes('architecture')) {
    return DEMO_ANSWERS.technology;
  }
  if (lower.includes('strategy') || lower.includes('business') || lower.includes('market') || lower.includes('compete')) {
    return DEMO_ANSWERS.strategy;
  }
  return DEMO_ANSWERS.default;
}

function buildPathQuestions(prompt: string): object {
  const topic = extractTopicHint(prompt);
  return {
    paths: {
      'clarify': `What specific aspects of ${topic} need further clarification before we can proceed?`,
      'go-deeper': `What are the underlying mechanisms that make ${topic} work the way it does?`,
      'challenge': `What assumptions about ${topic} might be wrong or incomplete?`,
      'apply': `How would ${topic} play out in a real-world scenario with resource constraints?`,
      'connect': `How does ${topic} relate to adjacent fields or parallel developments?`,
      'surprise': `What if the conventional wisdom about ${topic} is fundamentally backwards?`,
    },
  };
}

function buildBranches(prompt: string): object {
  const topic = extractTopicHint(prompt);
  return {
    branches: [
      { question: `How do we measure the real-world impact of ${topic} beyond surface metrics?`, pathType: 'go-deeper', quality: { novelty: 0.8, specificity: 0.7, challenge: 0.5 } },
      { question: `What are the strongest counterarguments to the current approach on ${topic}?`, pathType: 'challenge', quality: { novelty: 0.7, specificity: 0.8, challenge: 0.9 } },
      { question: `How might ${topic} evolve over the next 3-5 years given current trends?`, pathType: 'connect', quality: { novelty: 0.9, specificity: 0.6, challenge: 0.4 } },
    ],
  };
}

function buildDialogueTurn(_prompt: string): object {
  return {
    content: 'That is an interesting perspective, but I think there is a crucial dimension you may be overlooking. The interaction between these factors creates emergent behavior that a purely analytical frame might miss.',
    turnType: 'challenge',
    suggestedResponses: [
      { text: 'Can you be more specific about what emergent behavior you mean?', intent: 'deepen' },
      { text: 'You raise a fair point — let me reconsider my framing.', intent: 'concede' },
      { text: 'I think the analytical frame already accounts for that through...', intent: 'defend' },
    ],
  };
}

function buildStructuredPlan(_prompt: string): object {
  const fakeNodeId = '00000000-0000-4000-a000-000000000001';
  const fakeLaneId = '00000000-0000-4000-a000-000000000002';
  const evidence = [{ nodeId: fakeNodeId, laneId: fakeLaneId, quote: 'Demo evidence from exploration', relevance: 'primary' }];

  return {
    goals: [{ heading: 'Primary Objective', content: ['Establish a clear, actionable plan that addresses the core challenge while managing key risks.'], evidence }],
    assumptions: [{ heading: 'Key Assumptions', content: ['Stakeholders are aligned on the general direction, and resources are available within the proposed timeline.'], evidence }],
    strategy: [{ heading: 'Approach', content: ['Adopt an iterative approach: validate assumptions through small experiments before committing to large-scale implementation.'], evidence }],
    milestones: [{ heading: 'Phase 1 — Foundation (Weeks 1-4)', content: ['Complete initial assessment, stakeholder interviews, and first experiment design.'], evidence }],
    risks: [{ heading: 'Execution Risk', content: ['Team capacity constraints could delay the timeline. Mitigation: identify and reserve critical resources early.'], evidence }],
    nextActions: [{ heading: 'Immediate Next Steps', content: ['Schedule kickoff meeting, draft experiment brief, identify success metrics.'], evidence }],
  };
}

function buildPlanReflection(_prompt: string): object {
  const fakeId = () => crypto.randomUUID();
  return {
    understanding: 'The user is questioning whether the current risk mitigation strategy is sufficient, particularly around team capacity and timeline assumptions. They suggest the milestones may be too aggressive given the resource constraints discussed.',
    gapCards: [
      {
        id: fakeId(),
        sectionKey: 'risks',
        severity: 'high',
        title: 'Insufficient capacity planning',
        description: 'The current risk section mentions team capacity but does not quantify the gap or propose concrete mitigation beyond "identify and reserve early."',
        evidenceFromTranscript: ['User noted that capacity constraints are more severe than initially assumed.'],
        rationale: 'Without specific numbers on required vs. available capacity, the risk remains unactionable.',
      },
      {
        id: fakeId(),
        sectionKey: 'milestones',
        severity: 'medium',
        title: 'Timeline may be too aggressive',
        description: 'The 4-week Phase 1 timeline assumes full team availability, which conflicts with the capacity concerns raised.',
        evidenceFromTranscript: ['User questioned whether weeks 1-4 is realistic given competing priorities.'],
        rationale: 'A more conservative timeline with explicit dependency mapping would reduce schedule risk.',
      },
    ],
    proposedEdits: [
      {
        id: fakeId(),
        sectionKey: 'risks',
        operation: 'update_section',
        targetHeading: 'Execution Risk',
        draftHeading: 'Execution Risk — Capacity & Timeline',
        draftContent: [
          'Team capacity constraints could delay the timeline by 2-3 weeks. Mitigation: conduct a capacity audit in week 1, identify critical-path resources, and establish a resource escalation process.',
          'Competing priorities from other projects may reduce effective availability to 60%. Mitigation: secure executive sponsorship for dedicated allocation.',
        ],
        confidence: 0.85,
        reason: 'The user raised specific concerns about capacity that warrant a more detailed risk description with quantified mitigations.',
        approved: false,
      },
      {
        id: fakeId(),
        sectionKey: 'milestones',
        operation: 'update_content_bullet',
        targetHeading: 'Phase 1 — Foundation (Weeks 1-4)',
        draftContent: [
          'Week 1: Capacity audit and resource allocation confirmation.',
          'Weeks 2-3: Initial assessment and stakeholder interviews.',
          'Week 4: First experiment design and success criteria definition.',
        ],
        confidence: 0.7,
        reason: 'Breaking Phase 1 into weekly deliverables adds accountability and makes the timeline more realistic.',
        approved: false,
      },
    ],
    unresolvedQuestions: [
      'What is the actual team availability percentage given current commitments?',
      'Are there external dependencies (vendor timelines, regulatory approvals) that could further constrain the schedule?',
    ],
  };
}

function extractTopicHint(prompt: string): string {
  // Try to pull a topic from common prompt patterns
  const match = prompt.match(/topic[:\s]+"([^"]+)"/i)
    ?? prompt.match(/question[:\s]+"([^"]+)"/i)
    ?? prompt.match(/about[:\s]+(.{10,60}?)[.\n"]/i);
  return match ? match[1] : 'this topic';
}

function detectJobType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('path_questions') || lower.includes('conversation compass')) return 'path_questions';
  if (lower.includes('follow-up questions') || lower.includes('"branches"')) return 'branch';
  if (lower.includes('dialogue_turn') || lower.includes('dialogue turn') || lower.includes('dialectic')) return 'dialogue_turn';
  if (lower.includes('unified_plan') || (lower.includes('unified') && lower.includes('plan'))) return 'unified_plan';
  if (lower.includes('plan reflection') || lower.includes('plan_reflection') || lower.includes('reflection transcript')) return 'plan_reflection';
  return 'answer';
}

function generateResponseForType(jobType: string, prompt: string): string {
  switch (jobType) {
    case 'path_questions':
      return JSON.stringify(buildPathQuestions(prompt));
    case 'branch':
      return JSON.stringify(buildBranches(prompt));
    case 'dialogue_turn':
      return JSON.stringify(buildDialogueTurn(prompt));
    case 'lane_plan':
    case 'unified_plan':
      return JSON.stringify(buildStructuredPlan(prompt));
    case 'plan_reflection':
      return JSON.stringify(buildPlanReflection(prompt));
    default:
      return JSON.stringify(pickAnswer(prompt));
  }
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export class DemoProvider implements GenerationProvider {
  async generate(prompt: string): Promise<string> {
    await this.simulateDelay();
    const jobType = detectJobType(prompt);
    return generateResponseForType(jobType, prompt);
  }

  async generateStream(prompt: string, onChunk: (delta: string) => void): Promise<string> {
    const full = await this.generate(prompt);
    const chunks = chunkText(full, 20);
    for (const chunk of chunks) {
      await new Promise<void>(r => setTimeout(r, 50));
      onChunk(chunk);
    }
    return full;
  }

  private async simulateDelay(): Promise<void> {
    await new Promise<void>(r => setTimeout(r, 300 + Math.random() * 700));
  }
}
