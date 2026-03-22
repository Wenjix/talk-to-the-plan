import { compileContext } from '../../core/graph/context-compiler';
import { formatToolsForPrompt } from './canvas-tools';
import type { SemanticNode, SemanticEdge } from '../../core/types';

export function buildVoiceSystemPrompt(
  nodeId: string,
  nodes: SemanticNode[],
  edges: SemanticEdge[],
  sessionTopic: string,
): string {
  const node = nodes.find((n) => n.id === nodeId);
  const context = compileContext(nodeId, nodes, edges);

  const lines = [
    'You are a voice-driven planning assistant for the Parallax exploration canvas.',
    'The user is examining a specific node and speaking a command.',
    '',
    `Session topic: ${sessionTopic}`,
    '',
    'Current Node:',
  ];

  if (node) {
    lines.push(`- Question: ${node.question}`);
    lines.push(`- Answer: ${node.answer?.summary ?? '(no answer yet)'}`);
    lines.push(`- Depth: ${node.depth}`);
    lines.push(`- State: ${node.fsmState}`);
  }

  lines.push('');
  lines.push(context.formatted);
  lines.push('');
  lines.push('Based on what the user says, choose ONE tool call.');
  lines.push('');
  lines.push('PATH TYPE MAPPING — match the user\'s spoken intent to one of these:');
  lines.push('- Clarifying, refining, sharpening the question → path_type: "clarify"');
  lines.push('- Going deeper, digging in, wanting specifics/details → path_type: "go-deeper"');
  lines.push('- Challenging, pushing back, questioning assumptions → path_type: "challenge"');
  lines.push('- Making actionable, applying, practical steps → path_type: "apply"');
  lines.push('- Connecting ideas, linking, cross-referencing → path_type: "connect"');
  lines.push('- Unexpected angle, creative pivot, surprise → path_type: "surprise"');
  lines.push('');
  lines.push('TOOL SELECTION:');
  lines.push('- Explore further → branch_exploration (use the path type mapping above)');
  lines.push('- Mark important → promote_insight');
  lines.push('- Discuss/debate → start_dialogue');
  lines.push('- None of the above → voice_response');
  lines.push('');
  lines.push('INSTRUCTIONS:');
  lines.push('- For branch_exploration, formulate a genuine exploration QUESTION that captures');
  lines.push('  the user\'s intent. Do NOT parrot their speech — transform it into a clear question.');
  lines.push('- If the user\'s intent doesn\'t perfectly match a path type, choose the closest one.');
  lines.push('  Example: "what if we tried a totally different approach?" → "surprise"');
  lines.push('  Example: "is this actually true?" → "challenge"');
  lines.push('- Always pick the best-fit path type rather than falling back to voice_response.');
  lines.push('');
  lines.push('EXAMPLE:');
  lines.push('<tool_call>{"name": "branch_exploration", "arguments": {"path_type": "go-deeper", "question": "How does X specifically impact Y?"}}</tool_call>');
  lines.push('');
  lines.push(formatToolsForPrompt());

  return lines.join('\n');
}
