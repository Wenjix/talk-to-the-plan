import type { CompiledContext } from '../../core/types';

export function buildBranchPrompt(context: CompiledContext, personaPreamble: string): string {
  return `[SYSTEM]
${personaPreamble}

${context.formatted}

[TASK]
Generate 3 follow-up questions that branch from the Current Node. Each should explore
a different direction and provide a quality assessment.

Return JSON matching this exact schema:
{
  "branches": [
    {
      "question": "The follow-up question text",
      "pathType": "one of: clarify, go-deeper, challenge, apply, connect, surprise",
      "quality": { "novelty": 0.0-1.0, "specificity": 0.0-1.0, "challenge": 0.0-1.0 }
    }
  ]
}

Ensure JSON is valid and complete. Do not include markdown formatting or code fences.`;
}
