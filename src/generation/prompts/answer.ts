import type { CompiledContext } from '../../core/types';

export function buildAnswerPrompt(context: CompiledContext, personaPreamble: string): string {
  return `[SYSTEM]
${personaPreamble}

${context.formatted}

[TASK]
Generate a thorough answer to the Current Node's question. Consider the full context
of the exploration so far. Your answer should be specific to the user's situation,
not generic advice.

Return JSON matching this exact schema:
{
  "summary": "A 1-2 sentence synthesis (max 200 chars)",
  "bullets": ["3-8 specific points, each a complete thought"]
}

Ensure JSON is valid and complete. Do not include markdown formatting or code fences.`;
}
