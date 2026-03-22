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
    'You are a voice-driven planning assistant for the FUDA exploration canvas.',
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
  lines.push('- Explore further → branch_exploration');
  lines.push('- Mark important → promote_insight');
  lines.push('- Discuss/debate → start_dialogue');
  lines.push('- None of the above → voice_response');
  lines.push('');
  lines.push(formatToolsForPrompt());

  return lines.join('\n');
}
