import { branchFromNode } from '../../store/actions';
import { promoteNode } from '../../store/promotion-actions';
import { addUserTurn, generateDialogueResponse } from '../../store/dialogue-actions';
import { PathTypeSchema } from '../../core/types/primitives';
import { PromotionReasonSchema } from '../../core/types/promotion';
import { DialecticModeSchema } from '../../core/types/dialogue';
import type { PathType } from '../../core/types/primitives';
import type { PromotionReason } from '../../core/types/promotion';
import type { DialecticMode } from '../../core/types/dialogue';
import { CANVAS_TOOLS } from './canvas-tools';

const PATH_TYPE_ALIASES: Record<string, string> = {
  // go-deeper aliases
  'deeper': 'go-deeper', 'deep': 'go-deeper', 'deepen': 'go-deeper',
  'go_deeper': 'go-deeper', 'dig-deeper': 'go-deeper',
  // clarify aliases
  'clarification': 'clarify', 'explain': 'clarify', 'sharpen': 'clarify',
  // challenge aliases
  'push-back': 'challenge', 'push_back': 'challenge', 'question': 'challenge',
  // apply aliases
  'practical': 'apply', 'actionable': 'apply', 'implement': 'apply',
  // connect aliases
  'link': 'connect', 'relate': 'connect', 'cross-reference': 'connect',
  // surprise aliases
  'unexpected': 'surprise', 'creative': 'surprise', 'pivot': 'surprise',
};

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  message: string;
}

interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

function parseToolCall(responseText: string): ParsedToolCall | null {
  // Try XML-wrapped format first
  const match = responseText.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  const jsonStr = match
    ? match[1].trim()
    : responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.name !== 'string') return null;

    // Support both OpenAI-style { name, arguments: {...} } and flat-field
    // format { name, field1, field2, ... } that Boson may return
    if (parsed.arguments && typeof parsed.arguments === 'object') {
      return { name: parsed.name, arguments: parsed.arguments };
    }
    const { name: _name, ...rest } = parsed;
    return { name: _name, arguments: rest };
  } catch {
    return null;
  }
}

function validateRequired(
  toolName: string,
  args: Record<string, unknown>,
): void {
  const tool = CANVAS_TOOLS.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  for (const param of tool.parameters) {
    if (param.required && (args[param.name] === undefined || args[param.name] === null)) {
      throw new Error(`Missing required argument: ${param.name}`);
    }
    if (param.enum && args[param.name] !== undefined) {
      const value = String(args[param.name]);
      if (!param.enum.includes(value)) {
        throw new Error(`Invalid value for ${param.name}: "${value}". Expected one of: ${param.enum.join(', ')}`);
      }
    }
  }
}

export async function executeToolCall(
  responseText: string,
  nodeId: string,
): Promise<ToolCallResult> {
  const toolCall = parseToolCall(responseText);

  // Fallback: no tool_call tag → treat as voice_response
  if (!toolCall) {
    const cleaned = responseText
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim();
    return {
      toolName: 'voice_response',
      success: true,
      message: cleaned || 'I understood your request.',
    };
  }

  const { name, arguments: args } = toolCall;

  try {
    validateRequired(name, args);

    switch (name) {
      case 'branch_exploration': {
        const rawPathType = String(args.path_type).toLowerCase().trim();
        const normalizedPathType = PATH_TYPE_ALIASES[rawPathType] ?? rawPathType;
        const pathType = PathTypeSchema.parse(normalizedPathType) as PathType;
        const question = typeof args.question === 'string' ? args.question : undefined;
        await branchFromNode(nodeId, pathType, question);
        return {
          toolName: name,
          success: true,
          message: `Created ${pathType} branch`,
        };
      }

      case 'promote_insight': {
        const reason = PromotionReasonSchema.parse(args.reason) as PromotionReason;
        const note = typeof args.note === 'string' ? args.note : undefined;
        promoteNode(nodeId, reason, note);
        return {
          toolName: name,
          success: true,
          message: `Node promoted as ${reason.replace(/_/g, ' ')}`,
        };
      }

      case 'start_dialogue': {
        const mode = DialecticModeSchema.parse(args.mode) as DialecticMode;
        const opening = typeof args.opening === 'string' ? args.opening : 'Let us explore this further.';
        addUserTurn(nodeId, opening, mode);
        await generateDialogueResponse(nodeId, mode);
        return {
          toolName: name,
          success: true,
          message: `Started ${mode.replace(/_/g, ' ')} dialogue`,
        };
      }

      case 'voice_response': {
        const message = typeof args.message === 'string' ? args.message : 'I understood your request.';
        return {
          toolName: name,
          success: true,
          message,
        };
      }

      default:
        return {
          toolName: name,
          success: false,
          message: `Unknown tool: ${name}`,
        };
    }
  } catch (err) {
    return {
      toolName: name,
      success: false,
      message: err instanceof Error ? err.message : 'Tool execution failed',
    };
  }
}
