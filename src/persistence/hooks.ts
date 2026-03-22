import { useSemanticStore } from '../store/semantic-store';
import { useSessionStore } from '../store/session-store';
import { usePlanTalkStore } from '../store/plan-talk-store';
import { putEntity, loadSessionEnvelope } from './repository';
import {
  PlanningSessionSchema,
  ModelLaneSchema,
  SemanticNodeSchema,
  SemanticEdgeSchema,
  PromotionSchema,
  LanePlanSchema,
  UnifiedPlanSchema,
  DialogueTurnSchema,
  PlanTalkTurnSchema,
} from '../core/types';
import type { z } from 'zod';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save current session state to IDB.
 * Writes all entities from the semantic and session stores.
 */
export async function saveSession(): Promise<void> {
  const session = useSessionStore.getState().session;
  if (!session) return;

  const { nodes, edges, promotions, lanes, lanePlans, unifiedPlan, dialogueTurns } = useSemanticStore.getState();

  // Save session
  await putEntity('sessions', session);

  // Save all entities in parallel
  await Promise.all([
    ...lanes.map(l => putEntity('lanes', l)),
    ...nodes.map(n => putEntity('nodes', n)),
    ...edges.map(e => putEntity('edges', e)),
    ...promotions.map(p => putEntity('promotions', p)),
    ...lanePlans.map(lp => putEntity('lanePlans', lp)),
    ...(unifiedPlan ? [putEntity('unifiedPlans', unifiedPlan)] : []),
    ...dialogueTurns.map(dt => putEntity('dialogueTurns', dt)),
    ...usePlanTalkStore.getState().turns.map(t => putEntity('planTalkTurns', t)),
  ]);
}

/**
 * Trigger a debounced save (500ms trailing edge).
 */
export function debouncedSave(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveSession().catch(err => console.warn('Auto-save failed:', err));
  }, 500);
}

/**
 * Subscribe to store changes for auto-save.
 * Returns an unsubscribe function.
 */
export function startAutoSave(): () => void {
  const unsub1 = useSemanticStore.subscribe(debouncedSave);
  const unsub2 = useSessionStore.subscribe(debouncedSave);
  const unsub3 = usePlanTalkStore.subscribe(debouncedSave);
  return () => {
    unsub1();
    unsub2();
    unsub3();
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

/**
 * Validate an array of entities against a Zod schema.
 * Returns only valid entities; logs warnings for invalid ones.
 */
function validateEntities<T>(
  entities: unknown[],
  schema: z.ZodType<T>,
  entityName: string,
): T[] {
  const valid: T[] = [];
  for (const entity of entities) {
    const result = schema.safeParse(entity);
    if (result.success) {
      valid.push(result.data);
    } else {
      const id = (entity as Record<string, unknown>)?.id ?? 'unknown';
      console.warn(
        `Invalid ${entityName} (id=${id}) loaded from IDB, skipping:`,
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
  }
  return valid;
}

/**
 * Load a session from IDB and hydrate the stores.
 * Returns true if successfully loaded, false if session not found.
 * Validates all entities with Zod schemas (graceful degradation: invalid entities are skipped).
 */
export async function restoreSession(sessionId: string): Promise<boolean> {
  try {
    const envelope = await loadSessionEnvelope(sessionId);

    // Validate session entity
    const sessionResult = PlanningSessionSchema.safeParse(envelope.session);
    if (!sessionResult.success) {
      console.warn('Invalid session data from IDB:', sessionResult.error.issues);
      return false;
    }
    const session = sessionResult.data;

    // Validate all entity arrays with Zod (graceful degradation)
    const lanes = validateEntities(envelope.lanes, ModelLaneSchema, 'lane');
    const nodes = validateEntities(envelope.nodes, SemanticNodeSchema, 'node');
    const edges = validateEntities(envelope.edges, SemanticEdgeSchema, 'edge');
    const promotions = validateEntities(envelope.promotions, PromotionSchema, 'promotion');
    const lanePlans = validateEntities(envelope.lanePlans, LanePlanSchema, 'lanePlan');
    const unifiedPlans = validateEntities(envelope.unifiedPlans, UnifiedPlanSchema, 'unifiedPlan');
    const dialogueTurns = validateEntities(envelope.dialogueTurns, DialogueTurnSchema, 'dialogueTurn');
    const planTalkTurns = validateEntities(envelope.planTalkTurns, PlanTalkTurnSchema, 'planTalkTurn');

    // Hydrate session store
    useSessionStore.getState().setSession(session);
    useSessionStore.getState().setActiveLane(session.activeLaneId);
    useSessionStore.getState().setUIMode('exploring');

    // Auto-open plan panel for sessions that were in planning states
    const status = session.status;
    if (status === 'lane_planning' || status === 'synthesis_ready' || status === 'synthesized') {
      useSessionStore.getState().setPlanPanelOpen(true);
    }

    // Hydrate semantic store
    useSemanticStore.getState().loadSession({
      nodes,
      edges,
      promotions,
      lanes,
      lanePlans,
      unifiedPlan: unifiedPlans[0] ?? null,
      dialogueTurns,
    });

    // Hydrate plan talk store with persisted transcript turns
    usePlanTalkStore.getState().loadTurns(planTalkTurns);

    return true;
  } catch {
    return false;
  }
}

/**
 * List all saved sessions from IDB (for session picker).
 */
export async function listSavedSessions(): Promise<Array<{ id: string; topic: string; updatedAt: string }>> {
  const { getDB } = await import('./repository');
  const db = await getDB();
  const sessions = await db.getAll('sessions');
  return sessions.map(s => ({
    id: s.id,
    topic: s.topic,
    updatedAt: s.updatedAt,
  }));
}
