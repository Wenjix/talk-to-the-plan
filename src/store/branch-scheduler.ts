import type { BranchIntent } from '../services/voice/listener-schema';
import type { SemanticNode } from '../core/types';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useCompanionStore } from './companion-store';
import { exploreFromVoice, MAX_BRANCH_DEPTH } from './actions';

interface QueuedIntent extends BranchIntent {
  queuedAt: number;
  retryAfter: number; // epoch ms; don't dispatch before this
  retries: number;
}

interface SubmissionRecord {
  seedQuestion: string;
  anchorNodeId: string;
  pathType: string;
  at: number;
}

const MAX_CONCURRENT = 3;
const MINUTE_MS = 60_000;
const DRAIN_INTERVAL_MS = 500;
const ANCHOR_RETRY_BACKOFF_MS = 1500;
// Extended so cold-start (waiting for the root node to resolve) doesn't
// silently drop the first voice intents. Typical root generation is 3-10s
// but slow providers or retries can push beyond that.
const ANCHOR_RETRY_MAX_AGE_MS = 45_000;

let queue: QueuedIntent[] = [];
let submissions: SubmissionRecord[] = [];
// Track individual in-flight dispatches by monotonic token so a mid-drain
// clearSchedulerQueue can't drive a shared counter negative.
let nextToken = 1;
let inFlightTokens = new Set<number>();
let generation = 0;
let drainTimer: number | null = null;
let perMinuteCap = 8;

function nowMs(): number {
  return Date.now();
}

function pruneSubmissions(): void {
  const cutoff = nowMs() - MINUTE_MS;
  submissions = submissions.filter((s) => s.at >= cutoff);
}

function submissionsInLastMinute(): number {
  pruneSubmissions();
  return submissions.length;
}

export function configureScheduler(config: { perMinuteCap: number }): void {
  perMinuteCap = Math.max(1, Math.min(60, config.perMinuteCap));
}

export function enqueueIntent(intent: BranchIntent): void {
  if (isDuplicateInRecentSubmissions(intent.seedQuestion)) return;
  if (queue.some((q) => q.seedQuestion === intent.seedQuestion)) return;

  queue.push({
    ...intent,
    queuedAt: nowMs(),
    retryAfter: 0,
    retries: 0,
  });
  useCompanionStore.getState().setQueuedIntentCount(queue.length);
  startDrainLoop();
}

export function clearSchedulerQueue(): void {
  queue = [];
  submissions = [];
  // Bump generation so any in-flight drain promise knows not to touch state.
  generation += 1;
  inFlightTokens = new Set<number>();
  useCompanionStore.getState().setQueuedIntentCount(0);
  stopDrainLoop();
}

export function getRecentlySubmittedQuestions(windowMs: number = MINUTE_MS): string[] {
  const cutoff = nowMs() - windowMs;
  return submissions.filter((s) => s.at >= cutoff).map((s) => s.seedQuestion);
}

export function getQueueDepth(): number {
  return queue.length;
}

function isDuplicateInRecentSubmissions(seedQuestion: string): boolean {
  pruneSubmissions();
  const q = seedQuestion.trim().toLowerCase();
  return submissions.some((s) => s.seedQuestion.trim().toLowerCase() === q);
}

function startDrainLoop(): void {
  if (drainTimer !== null) return;
  drainTimer = window.setInterval(drainTick, DRAIN_INTERVAL_MS);
}

function stopDrainLoop(): void {
  if (drainTimer !== null) {
    window.clearInterval(drainTimer);
    drainTimer = null;
  }
}

async function drainTick(): Promise<void> {
  if (queue.length === 0 && inFlightTokens.size === 0) {
    stopDrainLoop();
    return;
  }
  if (inFlightTokens.size >= MAX_CONCURRENT) return;
  if (submissionsInLastMinute() >= perMinuteCap) return;

  // Find first intent whose retryAfter has elapsed.
  const now = nowMs();
  const idx = queue.findIndex((q) => q.retryAfter <= now);
  if (idx < 0) return;

  const next = queue[idx];
  queue.splice(idx, 1);
  useCompanionStore.getState().setQueuedIntentCount(queue.length);

  const anchor = resolveAnchor(next);
  if (!anchor) {
    // Requeue with a cooldown, or drop if we've exceeded the age window.
    if (now - next.queuedAt >= ANCHOR_RETRY_MAX_AGE_MS) return;
    queue.push({
      ...next,
      retryAfter: now + ANCHOR_RETRY_BACKOFF_MS,
      retries: next.retries + 1,
    });
    useCompanionStore.getState().setQueuedIntentCount(queue.length);
    return;
  }

  const token = nextToken++;
  const gen = generation;
  inFlightTokens.add(token);

  try {
    await exploreFromVoice(anchor.id, next.pathType, next.seedQuestion);
    // Success: record submission so the listener's dedupe list will see it.
    if (gen === generation) {
      submissions.push({
        seedQuestion: next.seedQuestion,
        anchorNodeId: anchor.id,
        pathType: next.pathType,
        at: nowMs(),
      });
    }
  } catch (err) {
    console.warn(
      '[branch-scheduler] exploreFromVoice failed:',
      err instanceof Error ? err.message : err,
    );
    // Do NOT record submission on failure — keeps the listener's "already
    // created" dedupe list accurate so real branches aren't blocked.
  } finally {
    // Only decrement if the scheduler is still on the same generation; a
    // mid-flight clearSchedulerQueue already rebuilt inFlightTokens.
    if (gen === generation) {
      inFlightTokens.delete(token);
    }
  }
}

function resolveAnchor(intent: QueuedIntent): SemanticNode | null {
  const semantic = useSemanticStore.getState();
  const session = useSessionStore.getState().session;
  if (!session) return null;

  const eligible = semantic.nodes.filter(
    (n) =>
      n.sessionId === session.id &&
      n.fsmState === 'resolved' &&
      n.depth < MAX_BRANCH_DEPTH,
  );
  if (eligible.length === 0) return null;

  const hint = intent.anchorHint?.trim().toLowerCase();
  if (hint) {
    const match = eligible.find((n) => n.question.toLowerCase().includes(hint));
    if (match) return match;
  }

  const focusedId = useCompanionStore.getState().lastFocusedNodeId;
  if (focusedId) {
    const focused = eligible.find((n) => n.id === focusedId);
    if (focused) return focused;
  }

  return eligible.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
}

/** Exposed for tests. */
export function __resetSchedulerForTest(): void {
  clearSchedulerQueue();
  perMinuteCap = 8;
  nextToken = 1;
}

export function __inFlightCountForTest(): number {
  return inFlightTokens.size;
}
