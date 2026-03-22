import { PathTypeSchema } from '../../core/types/primitives';
import { PromotionReasonSchema } from '../../core/types/promotion';
import { DialecticModeSchema } from '../../core/types/dialogue';

export interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  enum?: readonly string[];
  description?: string;
}

export interface CanvasTool {
  name: string;
  description: string;
  parameters: ToolParam[];
}

export const CANVAS_TOOLS: CanvasTool[] = [
  {
    name: 'branch_exploration',
    description: 'Create a new exploration branch on the canvas with a question.',
    parameters: [
      {
        name: 'path_type',
        type: 'string',
        required: true,
        enum: PathTypeSchema.options,
        description: 'The type of exploration path to take.',
      },
      {
        name: 'question',
        type: 'string',
        required: true,
        description: 'The question to explore along this branch.',
      },
    ],
  },
  {
    name: 'promote_insight',
    description: 'Promote the current insight to a higher visibility level.',
    parameters: [
      {
        name: 'reason',
        type: 'string',
        required: true,
        enum: PromotionReasonSchema.options,
        description: 'The reason for promoting this insight.',
      },
      {
        name: 'note',
        type: 'string',
        required: false,
        description: 'Optional note to attach to the promotion.',
      },
    ],
  },
  {
    name: 'start_dialogue',
    description: 'Start a dialectic dialogue on the canvas.',
    parameters: [
      {
        name: 'mode',
        type: 'string',
        required: true,
        enum: DialecticModeSchema.options,
        description: 'The dialectic mode for the dialogue.',
      },
      {
        name: 'opening',
        type: 'string',
        required: false,
        description: 'Optional opening statement for the dialogue.',
      },
    ],
  },
  {
    name: 'voice_response',
    description: 'Respond with a spoken message when no canvas action is appropriate.',
    parameters: [
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'The message to speak back to the user.',
      },
    ],
  },
];

export function formatToolsForPrompt(): string {
  const toolsXml = CANVAS_TOOLS.map((tool) => JSON.stringify(tool)).join('\n');
  return `<tools>\n${toolsXml}\n</tools>`;
}
