import type { PlanTalkTurn, UnifiedPlan, StructuredPlan, PlanSection } from '../../core/types';
import { PLANNER_PREAMBLE } from './system-preambles';

function formatPlanForContext(plan: UnifiedPlan): string {
  const lines: string[] = [];
  lines.push(`Title: ${plan.title}`);
  lines.push(`Revision: ${plan.revision ?? 1}`);
  lines.push('');

  const sectionOrder: (keyof StructuredPlan)[] = [
    'goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions',
  ];

  for (const key of sectionOrder) {
    const items: PlanSection[] = plan.sections[key];
    if (!items || items.length === 0) continue;

    lines.push(`### ${key}`);
    for (const section of items) {
      lines.push(`- **${section.heading}**`);
      for (const item of section.content) {
        lines.push(`  - ${item}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatTranscript(turns: PlanTalkTurn[]): string {
  return turns
    .map((t) => `[${t.speaker.toUpperCase()}] ${t.transcriptText}`)
    .join('\n\n');
}

export function buildPlanReflectionPrompt(
  transcriptTurns: PlanTalkTurn[],
  plan: UnifiedPlan,
  sessionTopic: string,
): string {
  const sections: string[] = [];

  sections.push('[SYSTEM]');
  sections.push(PLANNER_PREAMBLE);
  sections.push('');

  sections.push('[PLAN REFLECTION CONTEXT]');
  sections.push(`Session Topic: ${sessionTopic}`);
  sections.push('');

  sections.push('## Current Unified Plan');
  sections.push(formatPlanForContext(plan));

  sections.push('## Reflection Transcript');
  sections.push(formatTranscript(transcriptTurns));
  sections.push('');

  sections.push('[TASK]');
  sections.push(`Analyze the user's reflection against the current unified plan.

1. **Understanding**: Summarize what the user is saying and what aspects of the plan they're reflecting on.
2. **Gap Cards**: Identify gaps, weaknesses, or missing considerations in the plan based on the user's observations. Each gap must reference a specific plan section.
3. **Proposed Edits**: Suggest concrete edits to the plan sections. Use operations: add_section (new PlanSection), update_section (modify heading/content), remove_section (delete a PlanSection), update_content_bullet (change specific bullets).
4. **Unresolved Questions**: List any open questions the user raised that can't be answered from available evidence.

For proposed edits:
- targetHeading identifies which PlanSection to modify (by its heading text)
- draftHeading provides a new heading (for add/update operations)
- draftContent provides new content bullets
- confidence is 0-1 indicating how confident you are this edit improves the plan

Return JSON matching this exact schema:
{
  "understanding": "...",
  "gapCards": [{
    "sectionKey": "goals|assumptions|strategy|milestones|risks|nextActions",
    "severity": "high|medium|low",
    "title": "...",
    "description": "...",
    "evidenceFromTranscript": ["..."],
    "rationale": "..."
  }],
  "proposedEdits": [{
    "sectionKey": "goals|assumptions|strategy|milestones|risks|nextActions",
    "operation": "add_section|update_section|remove_section|update_content_bullet",
    "targetHeading": "...",
    "draftHeading": "...",
    "draftContent": ["..."],
    "confidence": 0.0-1.0,
    "reason": "...",
    "approved": false
  }],
  "unresolvedQuestions": ["..."]
}

IMPORTANT: In your JSON response, output the "understanding" field FIRST before gapCards and proposedEdits.

Ensure JSON is valid. Every gap card must reference a real sectionKey from the plan.`);

  return sections.join('\n');
}
