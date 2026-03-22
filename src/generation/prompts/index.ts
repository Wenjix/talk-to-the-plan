import type { JobType, CompiledContext, PlanningSession, PersonaId } from '../../core/types';
import { getPersonaPreamble, PLANNER_PREAMBLE } from './system-preambles';
import { buildPathQuestionsPrompt } from './path-questions';
import { buildAnswerPrompt } from './answer';
import { buildBranchPrompt } from './branch';
import { buildDialoguePrompt, buildConcludeSynthesisPrompt } from './dialogue';
import { buildLanePlanPrompt } from './lane-plan';

export { buildDialoguePrompt, buildConcludeSynthesisPrompt };
export { buildLanePlanPrompt };
export { buildPairwiseMapPrompt, buildReducePrompt, buildFormatPrompt } from './unified-plan';
export { buildPlanReflectionPrompt } from './plan-reflection';

export function buildPrompt(
  jobType: JobType,
  context: CompiledContext,
  session: PlanningSession,
  personaId: PersonaId = 'analytical',
): string {
  const preamble = getPersonaPreamble(personaId);

  switch (jobType) {
    case 'path_questions':
      return buildPathQuestionsPrompt(context, preamble);
    case 'answer':
      return buildAnswerPrompt(context, preamble);
    case 'branch':
      return buildBranchPrompt(context, preamble);
    case 'dialogue_turn':
      // Phase 2: Use dialogue prompt with session defaults.
      // For full dialogue control (mode, history), callers should use
      // buildDialoguePrompt directly.
      return buildDialoguePrompt('socratic', [], context, session.challengeDepth);
    case 'lane_plan':
      // Phase 3: Lane plan prompt requires promoted nodes, not generic context.
      // Callers should use buildLanePlanPrompt directly (see plan-actions.ts).
      // Fallback to planner preamble for generic pipeline calls.
      return buildAnswerPrompt(context, PLANNER_PREAMBLE);
    case 'unified_plan':
      return buildAnswerPrompt(context, PLANNER_PREAMBLE);
    case 'pairwise_map':
    case 'reduce':
      // Phase 4: These job types require specialized inputs (lane plans,
      // pairwise reports) that don't fit the generic buildPrompt signature.
      // Use buildPairwiseMapPrompt / buildReducePrompt directly.
      throw new Error(`Job type "${jobType}" requires specialized prompt builders. Use buildPairwiseMapPrompt or buildReducePrompt directly.`);
  }
}
