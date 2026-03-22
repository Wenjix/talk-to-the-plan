import { z } from 'zod';
import type { UnifiedPlan, ModelLane, PlanSection } from '../core/types';
import type { PlanningSession, SemanticNode, SemanticEdge, Promotion, DialogueTurn } from '../core/types';
import { PlanningSessionSchema } from '../core/types/session';
import { SemanticNodeSchema } from '../core/types/node';
import { SemanticEdgeSchema } from '../core/types/edge';
import { PromotionSchema } from '../core/types/promotion';
import { ModelLaneSchema } from '../core/types/lane';
import { UnifiedPlanSchema } from '../core/types/unified-plan';
import { DialogueTurnSchema } from '../core/types/dialogue';

// ---------------------------------------------------------------------------
// Session Export schema
// ---------------------------------------------------------------------------

export const SessionExportSchema = z.object({
  version: z.literal('fuda_v1'),
  exportedAt: z.string().datetime({ offset: true }),
  session: PlanningSessionSchema,
  nodes: z.array(SemanticNodeSchema),
  edges: z.array(SemanticEdgeSchema),
  promotions: z.array(PromotionSchema),
  lanes: z.array(ModelLaneSchema),
  unifiedPlan: UnifiedPlanSchema.nullable(),
  dialogueTurns: z.array(DialogueTurnSchema),
});
export type SessionExport = z.infer<typeof SessionExportSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function laneLabel(lanes: ModelLane[], laneId: string): string {
  return lanes.find((l) => l.id === laneId)?.label ?? laneId;
}

function renderSections(sections: PlanSection[], lanes: ModelLane[]): string[] {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`### ${section.heading}`);
    for (const bullet of section.content) {
      lines.push(`- ${bullet}`);
    }
    for (const ev of section.evidence) {
      lines.push(`*Evidence: "${ev.quote}" (from ${laneLabel(lanes, ev.laneId)})*`);
    }
    lines.push('');
  }
  return lines;
}

function renderCategory(heading: string, sections: PlanSection[], lanes: ModelLane[]): string[] {
  return [`## ${heading}`, '', ...renderSections(sections, lanes)];
}

// ---------------------------------------------------------------------------
// Markdown exporters
// ---------------------------------------------------------------------------

export function exportUnifiedPlanMarkdown(plan: UnifiedPlan, lanes: ModelLane[]): string {
  const lines: string[] = [
    '# Plan',
    '',
    ...renderCategory('Goals', plan.sections.goals, lanes),
    ...renderCategory('Assumptions', plan.sections.assumptions, lanes),
    ...renderCategory('Strategy', plan.sections.strategy, lanes),
    ...renderCategory('Milestones', plan.sections.milestones, lanes),
    ...renderCategory('Risks', plan.sections.risks, lanes),
    ...renderCategory('Next Actions', plan.sections.nextActions, lanes),
  ];

  if (plan.conflictsResolved.length > 0) {
    lines.push('## Conflicts Resolved', '');
    for (const c of plan.conflictsResolved) {
      lines.push(`### ${c.description}`);
      lines.push(`- **Resolution:** ${c.resolution}`);
      lines.push(`- **Trade-off:** ${c.tradeoff}`);
      lines.push(`- **Lanes:** ${laneLabel(lanes, c.laneAId)} vs ${laneLabel(lanes, c.laneBId)}`);
      lines.push('');
    }
  }

  if (plan.unresolvedQuestions.length > 0) {
    lines.push('## Unresolved Questions', '');
    for (const q of plan.unresolvedQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON export / import
// ---------------------------------------------------------------------------

export function exportSessionJSON(
  session: PlanningSession,
  semanticState: {
    nodes: SemanticNode[];
    edges: SemanticEdge[];
    promotions: Promotion[];
    lanes: ModelLane[];
    unifiedPlan: UnifiedPlan | null;
    dialogueTurns: DialogueTurn[];
  },
): string {
  const payload: SessionExport = {
    version: 'fuda_v1',
    exportedAt: new Date().toISOString(),
    session,
    nodes: semanticState.nodes,
    edges: semanticState.edges,
    promotions: semanticState.promotions,
    lanes: semanticState.lanes,
    unifiedPlan: semanticState.unifiedPlan,
    dialogueTurns: semanticState.dialogueTurns,
  };
  return JSON.stringify(payload, null, 2);
}

export function importSessionJSON(json: string): SessionExport {
  const raw: unknown = JSON.parse(json);
  return SessionExportSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
