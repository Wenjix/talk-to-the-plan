import type { SemanticNode } from '../../core/types';

/**
 * Compute an "activity score" for a lane based on its nodes.
 * Higher score = more active exploration.
 */
export function computeLaneScore(nodes: SemanticNode[], laneId: string): number {
  const laneNodes = nodes.filter(n => n.laneId === laneId);
  if (laneNodes.length === 0) return 0;

  let score = 0;
  for (const node of laneNodes) {
    // Base weight per node
    score += 1;
    // Generating nodes get extra weight (active work)
    if (node.fsmState === 'generating') score += 3;
    // Resolved nodes add value
    if (node.fsmState === 'resolved') score += 0.5;
    // Deeper nodes indicate active exploration
    score += node.depth * 0.2;
  }
  return score;
}

/**
 * Compute balanced split percentages from lane scores.
 * Returns [colSplit, rowSplit] where colSplit is the left column width %
 * and rowSplit is the top row height %.
 *
 * Bounded: no pane shrinks below MIN_PCT or grows above MAX_PCT.
 */
const MIN_PCT = 20;
const MAX_PCT = 80;

export function computeAutoSplits(
  scores: [number, number, number, number],
): { colSplit: number; rowSplit: number } {
  // scores: [top-left, top-right, bottom-left, bottom-right]
  const [tl, tr, bl, br] = scores;

  // Column split: left vs right
  const leftScore = tl + bl;
  const rightScore = tr + br;
  const totalH = leftScore + rightScore;
  const colSplit = totalH > 0
    ? clamp(MIN_PCT, (leftScore / totalH) * 100, MAX_PCT)
    : 50;

  // Row split: top vs bottom
  const topScore = tl + tr;
  const bottomScore = bl + br;
  const totalV = topScore + bottomScore;
  const rowSplit = totalV > 0
    ? clamp(MIN_PCT, (topScore / totalV) * 100, MAX_PCT)
    : 50;

  return { colSplit, rowSplit };
}

function clamp(min: number, val: number, max: number): number {
  return Math.max(min, Math.min(val, max));
}
