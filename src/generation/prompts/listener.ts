import type { SemanticNode } from '../../core/types';

export interface ListenerPromptContext {
  topic: string;
  transcriptWindow: string;
  focusedNode: SemanticNode | null;
  recentNodes: Array<{ id: string; question: string; pathType: string }>;
  recentlyCreated: string[]; // seed questions submitted in the last 60s, to avoid duplicates
  language: 'English' | 'Chinese';
}

export function buildListenerPrompt(ctx: ListenerPromptContext): string {
  const lines = [
    'You are a silent listening companion for a brainstorming canvas.',
    'The user is thinking out loud. A visual graph of their ideas is being built as they speak.',
    'Your job: decide if the latest speech suggests NEW branches to add to the graph, and if so, emit them.',
    '',
    `Session topic: ${ctx.topic || '(not set)'}`,
    '',
    'Recent transcript (oldest → newest):',
    ctx.transcriptWindow || '(nothing yet)',
    '',
  ];

  if (ctx.focusedNode) {
    lines.push('Current focus node:');
    lines.push(`- id: ${ctx.focusedNode.id}`);
    lines.push(`- question: ${ctx.focusedNode.question}`);
    if (ctx.focusedNode.answer?.summary) {
      lines.push(`- answer summary: ${ctx.focusedNode.answer.summary.slice(0, 300)}`);
    }
    lines.push('');
  }

  if (ctx.recentNodes.length > 0) {
    lines.push('Other nearby nodes on the canvas:');
    for (const n of ctx.recentNodes.slice(0, 8)) {
      lines.push(`- ${n.id} [${n.pathType}]: ${n.question.slice(0, 120)}`);
    }
    lines.push('');
  }

  if (ctx.recentlyCreated.length > 0) {
    lines.push('Branches ALREADY created in the last minute (do NOT repeat these):');
    for (const q of ctx.recentlyCreated.slice(0, 10)) {
      lines.push(`- ${q.slice(0, 140)}`);
    }
    lines.push('');
  }

  lines.push('PATH TYPE MAPPING:');
  lines.push('- clarify: user is refining / sharpening a concept');
  lines.push('- go-deeper: user wants specifics, details, or to dig further');
  lines.push('- challenge: user is questioning an assumption or pushing back');
  lines.push('- apply: user wants to make something actionable or practical');
  lines.push('- connect: user is linking ideas or cross-referencing');
  lines.push('- surprise: user takes an unexpected angle or pivot');
  lines.push('');
  lines.push('RULES:');
  lines.push('- Emit 0 to 3 intents per call. Prefer 0 over low-confidence fires.');
  lines.push('- Only emit when the user has expressed a reasonably complete thought that adds something new.');
  lines.push('- NEVER emit an intent whose seed question is semantically equivalent to any "already created" item above.');
  lines.push('- The seed question must be a real exploration QUESTION, not a paraphrase of the user\'s speech.');
  lines.push('- If the user is just meandering or filler-talking, return an empty intents array.');
  lines.push('- "anchorHint" (optional): a short phrase from the transcript that identifies which existing node to branch from. If the user clearly means the current focus, leave anchorHint empty.');
  lines.push('- confidence: 0.6+ to fire. Below 0.6 means do not include that intent.');
  lines.push('');
  lines.push('Respond with JSON exactly matching:');
  lines.push('{"intents": [{"anchorHint"?: string, "pathType": "clarify"|"go-deeper"|"challenge"|"apply"|"connect"|"surprise", "seedQuestion": string, "confidence": number, "rationale"?: string}]}');
  lines.push('');
  lines.push('Return ONLY the JSON object, no markdown, no commentary.');

  if (ctx.language === 'Chinese') {
    lines.push('');
    lines.push('The user may speak in Mandarin Chinese. Understand intent regardless of language.');
    lines.push('Seed questions should be in the same language the user is speaking.');
    lines.push('JSON keys and pathType values must remain in English.');
  }

  return lines.join('\n');
}
