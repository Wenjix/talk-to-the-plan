import type { LanePlan, ConflictResolution } from '../../core/types';
import { PLANNER_PREAMBLE } from './system-preambles';

export interface PairwiseReport {
  laneALabel: string;
  laneBLabel: string;
  contradictions: Array<{ description: string; planAPosition: string; planBPosition: string }>;
  synergies: Array<{ description: string; sharedInsight: string }>;
  gaps: Array<{ description: string; coveredBy: 'planA' | 'planB'; missingFrom: 'planA' | 'planB' }>;
}

export interface LanePlanSummary {
  laneId: string;
  label: string;
  title: string;
  goalHeadings: string[];
  strategyHeadings: string[];
}

function formatPlanSections(plan: LanePlan): string {
  const lines: string[] = [];
  lines.push(`Title: ${plan.title}`);
  lines.push(`Lane ID: ${plan.laneId}`);
  lines.push(`Confidence: ${plan.confidence}`);
  lines.push('');

  for (const [sectionName, sections] of Object.entries(plan.sections)) {
    lines.push(`### ${sectionName}`);
    for (const section of sections) {
      lines.push(`- ${section.heading}`);
      for (const item of section.content) {
        lines.push(`  - ${item}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function buildPairwiseMapPrompt(
  planA: LanePlan,
  planB: LanePlan,
  laneALabel: string,
  laneBLabel: string,
): string {
  const sections: string[] = [];

  sections.push('[SYSTEM]');
  sections.push(PLANNER_PREAMBLE);
  sections.push('');

  sections.push('[PAIRWISE COMPARISON]');
  sections.push(`Compare the following two lane plans and identify contradictions, synergies, and gaps.`);
  sections.push('');

  sections.push(`--- Plan A: ${laneALabel} ---`);
  sections.push(formatPlanSections(planA));

  sections.push(`--- Plan B: ${laneBLabel} ---`);
  sections.push(formatPlanSections(planB));

  sections.push('[TASK]');
  sections.push(`Analyze the two plans above and produce a pairwise comparison report.

For each finding, be specific — reference concrete plan elements, not vague generalities.

- **Contradictions**: Where the two plans recommend opposite or incompatible actions.
- **Synergies**: Where the two plans reinforce or complement each other.
- **Gaps**: Where one plan covers a topic the other ignores entirely.

Return JSON matching this exact schema:
{
  "contradictions": [{ "description": "...", "planAPosition": "...", "planBPosition": "..." }],
  "synergies": [{ "description": "...", "sharedInsight": "..." }],
  "gaps": [{ "description": "...", "coveredBy": "planA|planB", "missingFrom": "planA|planB" }]
}

Ensure JSON is valid. Use "planA" for ${laneALabel} and "planB" for ${laneBLabel} in coveredBy/missingFrom fields.`);

  return sections.join('\n');
}

export function buildReducePrompt(
  pairwiseReports: PairwiseReport[],
  lanePlans: LanePlan[],
): string {
  const sections: string[] = [];

  sections.push('[SYSTEM]');
  sections.push(PLANNER_PREAMBLE);
  sections.push('');

  sections.push('[CONTEXT]');
  sections.push(`You have ${lanePlans.length} lane plans and ${pairwiseReports.length} pairwise comparison reports.`);
  sections.push('');

  sections.push('## Lane Plans Overview');
  for (const plan of lanePlans) {
    sections.push(`- Lane "${plan.title}" (${plan.laneId}): confidence ${plan.confidence}`);
    const goalHeadings = plan.sections.goals.map((g) => g.heading).join(', ');
    sections.push(`  Goals: ${goalHeadings}`);
  }
  sections.push('');

  sections.push('## Pairwise Comparison Reports');
  for (let i = 0; i < pairwiseReports.length; i++) {
    const report = pairwiseReports[i];
    sections.push(`--- Report ${i + 1}: ${report.laneALabel} vs ${report.laneBLabel} ---`);

    if (report.contradictions.length > 0) {
      sections.push('Contradictions:');
      for (const c of report.contradictions) {
        sections.push(`  - ${c.description}`);
        sections.push(`    Plan A position: ${c.planAPosition}`);
        sections.push(`    Plan B position: ${c.planBPosition}`);
      }
    }

    if (report.synergies.length > 0) {
      sections.push('Synergies:');
      for (const s of report.synergies) {
        sections.push(`  - ${s.description}: ${s.sharedInsight}`);
      }
    }

    if (report.gaps.length > 0) {
      sections.push('Gaps:');
      for (const g of report.gaps) {
        sections.push(`  - ${g.description} (covered by ${g.coveredBy}, missing from ${g.missingFrom})`);
      }
    }
    sections.push('');
  }

  sections.push('[TASK]');
  sections.push(`Resolve the conflicts found across all pairwise comparisons.

For each contradiction:
1. Decide which position is stronger and why
2. What trade-off is being made
3. What the resolution is

Also identify any questions that remain unresolved — topics where the evidence is insufficient to decide.

Return JSON matching this exact schema:
{
  "conflictsResolved": [{
    "description": "...",
    "laneAId": "...",
    "laneBId": "...",
    "resolution": "...",
    "tradeoff": "..."
  }],
  "unresolvedQuestions": ["..."]
}

Use the actual lane IDs from the plans above. Ensure JSON is valid.`);

  return sections.join('\n');
}

export function buildFormatPrompt(
  conflictResolutions: ConflictResolution[],
  synergies: Array<{ description: string; sharedInsight: string }>,
  lanePlanSummaries: LanePlanSummary[],
  sessionTopic: string,
): string {
  const sections: string[] = [];

  sections.push('[SYSTEM]');
  sections.push(PLANNER_PREAMBLE);
  sections.push('');

  sections.push('[SYNTHESIS CONTEXT]');
  sections.push(`Session Topic: ${sessionTopic}`);
  sections.push(`Source Lane Plans: ${lanePlanSummaries.length}`);
  sections.push('');

  sections.push('## Lane Plan Summaries');
  for (const summary of lanePlanSummaries) {
    sections.push(`- ${summary.label} (${summary.laneId}): "${summary.title}"`);
    sections.push(`  Goals: ${summary.goalHeadings.join(', ')}`);
    sections.push(`  Strategy: ${summary.strategyHeadings.join(', ')}`);
  }
  sections.push('');

  if (conflictResolutions.length > 0) {
    sections.push('## Conflict Resolutions');
    for (const cr of conflictResolutions) {
      sections.push(`- ${cr.description}`);
      sections.push(`  Lanes: ${cr.laneAId} vs ${cr.laneBId}`);
      sections.push(`  Resolution: ${cr.resolution}`);
      sections.push(`  Trade-off: ${cr.tradeoff}`);
    }
    sections.push('');
  }

  if (synergies.length > 0) {
    sections.push('## Cross-Lane Synergies');
    for (const s of synergies) {
      sections.push(`- ${s.description}: ${s.sharedInsight}`);
    }
    sections.push('');
  }

  sections.push('[TASK]');
  sections.push(`Produce the final unified plan by synthesizing all lane plans, conflict resolutions, and synergies.

Every section item MUST include evidence citations (EvidenceRef) tracing back to specific exploration nodes.

Return JSON matching this exact schema:
{
  "sections": {
    "goals": [{ "heading": "...", "content": ["..."], "evidence": [{ "nodeId": "...", "laneId": "...", "quote": "...", "relevance": "primary|supporting" }] }],
    "assumptions": [{ "heading": "...", "content": ["..."], "evidence": [...] }],
    "strategy": [{ "heading": "...", "content": ["..."], "evidence": [...] }],
    "milestones": [{ "heading": "...", "content": ["..."], "evidence": [...] }],
    "risks": [{ "heading": "...", "content": ["..."], "evidence": [...] }],
    "nextActions": [{ "heading": "...", "content": ["..."], "evidence": [...] }]
  },
  "conflictsResolved": [{ "description": "...", "laneAId": "...", "laneBId": "...", "resolution": "...", "tradeoff": "..." }],
  "unresolvedQuestions": ["..."]
}

Ensure JSON is valid. Every section must have at least one evidence citation with a valid nodeId and laneId.`);

  return sections.join('\n');
}
