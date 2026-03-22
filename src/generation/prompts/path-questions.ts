import type { CompiledContext } from '../../core/types';

export function buildPathQuestionsPrompt(context: CompiledContext, personaPreamble: string): string {
  return `[SYSTEM]
${personaPreamble}

${context.formatted}

[TASK]
Generate exactly 6 follow-up questions for the Current Node, one for each direction of the Conversation Compass. Each question should be specific to the exploration context above.

Return JSON matching this exact schema:
{
  "paths": {
    "clarify": "A question that clarifies ambiguity or definitions",
    "go-deeper": "A question that digs deeper into the current topic",
    "challenge": "A question that challenges assumptions or conclusions",
    "apply": "A question about real-world application or consequences",
    "connect": "A question that connects to adjacent domains or concepts",
    "surprise": "A question that reframes or introduces an unexpected angle"
  }
}

Ensure JSON is valid and complete. Do not include markdown formatting or code fences.`;
}
