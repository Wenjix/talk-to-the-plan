import { useSemanticStore } from '../store/semantic-store';
import { useSessionStore } from '../store/session-store';
import { usePlanTalkStore } from '../store/plan-talk-store';
import { useVoiceNoteStore } from '../store/voice-note-store';
import { putEntity, deleteEntity, loadSessionEnvelope, getAllByIndex } from './repository';
import {
  PlanningSessionSchema,
  ModelLaneSchema,
  SemanticNodeSchema,
  SemanticEdgeSchema,
  PromotionSchema,
  UnifiedPlanSchema,
  DialogueTurnSchema,
  PlanTalkTurnSchema,
  VoiceNoteSchema,
} from '../core/types';
import type { z } from 'zod';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save current session state to IDB.
 * Writes all entities from the semantic and session stores.
 * Removes stale entities that were deleted from in-memory stores.
 */
export async function saveSession(): Promise<void> {
  const session = useSessionStore.getState().session;
  if (!session) return;

  const { nodes, edges, promotions, lanes, unifiedPlan, dialogueTurns } = useSemanticStore.getState();
  const planTalkTurns = usePlanTalkStore.getState().turns;
  const voiceNotes = useVoiceNoteStore.getState().notes;

  // Build sets of current entity IDs for stale-deletion
  const currentNodeIds = new Set(nodes.map(n => n.id));
  const currentEdgeIds = new Set(edges.map(e => e.id));
  const currentLaneIds = new Set(lanes.map(l => l.id));
  const currentPromotionIds = new Set(promotions.map(p => p.id));
  const currentDialogueTurnIds = new Set(dialogueTurns.map(dt => dt.id));
  const currentPlanTalkTurnIds = new Set(planTalkTurns.map(t => t.id));
  const currentVoiceNoteIds = new Set(voiceNotes.map(n => n.id));

  // Load persisted entities to detect stale ones
  const [
    persistedNodes, persistedEdges, persistedLanes, persistedPromotions,
    persistedDialogueTurns, persistedPlanTalkTurns, persistedVoiceNotes,
    persistedVoiceNoteBlobs,
  ] = await Promise.all([
    getAllByIndex('nodes', 'by-session', session.id),
    getAllByIndex('edges', 'by-session', session.id),
    getAllByIndex('lanes', 'by-session', session.id),
    getAllByIndex('promotions', 'by-session', session.id),
    getAllByIndex('dialogueTurns', 'by-session', session.id),
    getAllByIndex('planTalkTurns', 'by-session', session.id),
    getAllByIndex('voiceNotes', 'by-session', session.id),
    getAllByIndex('voiceNoteBlobs', 'by-session', session.id),
  ]);

  // Delete stale entities
  const staleDeletions = [
    ...persistedNodes.filter(n => !currentNodeIds.has(n.id)).map(n => deleteEntity('nodes', n.id)),
    ...persistedEdges.filter(e => !currentEdgeIds.has(e.id)).map(e => deleteEntity('edges', e.id)),
    ...persistedLanes.filter(l => !currentLaneIds.has(l.id)).map(l => deleteEntity('lanes', l.id)),
    ...persistedPromotions.filter(p => !currentPromotionIds.has(p.id)).map(p => deleteEntity('promotions', p.id)),
    ...persistedDialogueTurns.filter(dt => !currentDialogueTurnIds.has(dt.id)).map(dt => deleteEntity('dialogueTurns', dt.id)),
    ...persistedPlanTalkTurns.filter(t => !currentPlanTalkTurnIds.has(t.id)).map(t => deleteEntity('planTalkTurns', t.id)),
    ...persistedVoiceNotes.filter(n => !currentVoiceNoteIds.has(n.id)).map(n => deleteEntity('voiceNotes', n.id)),
    ...persistedVoiceNoteBlobs.filter(b => !currentVoiceNoteIds.has(b.id)).map(b => deleteEntity('voiceNoteBlobs', b.id)),
  ];

  // Save session
  await putEntity('sessions', session);

  // Upsert all current entities + delete stale ones
  await Promise.all([
    ...lanes.map(l => putEntity('lanes', l)),
    ...nodes.map(n => putEntity('nodes', n)),
    ...edges.map(e => putEntity('edges', e)),
    ...promotions.map(p => putEntity('promotions', p)),
    ...(unifiedPlan ? [putEntity('unifiedPlans', unifiedPlan)] : []),
    ...dialogueTurns.map(dt => putEntity('dialogueTurns', dt)),
    ...planTalkTurns.map(t => putEntity('planTalkTurns', t)),
    ...voiceNotes.map(n => putEntity('voiceNotes', n)),
    ...staleDeletions,
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
  const unsub4 = useVoiceNoteStore.subscribe(debouncedSave);

  // Best-effort flush of pending debounced save when the page is going away.
  // `pagehide` is the spec-recommended event for this (more reliable than
  // `beforeunload` and fires for bfcache transitions too); but neither event
  // can guarantee an async IDB write completes — browsers may suspend the
  // page before microtasks drain. The 1s autosave debounce keeps the worst-
  // case loss small enough that this best-effort save is acceptable.
  const handlePageHide = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      saveSession().catch(err => console.warn('Flush-on-pagehide save failed:', err));
    }
  };
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
    window.removeEventListener('pagehide', handlePageHide);
    // Flush any pending debounced save instead of discarding it
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      saveSession().catch(err => console.warn('Flush-on-unsubscribe save failed:', err));
    }
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
    const unifiedPlans = validateEntities(envelope.unifiedPlans, UnifiedPlanSchema, 'unifiedPlan');
    const dialogueTurns = validateEntities(envelope.dialogueTurns, DialogueTurnSchema, 'dialogueTurn');
    const planTalkTurns = validateEntities(envelope.planTalkTurns, PlanTalkTurnSchema, 'planTalkTurn');
    const voiceNotes = validateEntities(envelope.voiceNotes, VoiceNoteSchema, 'voiceNote');

    // Hydrate session store
    useSessionStore.getState().setSession(session);
    // Only set active lane if it still exists in the validated lanes
    const validLaneId = lanes.some(l => l.id === session.activeLaneId)
      ? session.activeLaneId
      : (lanes[0]?.id ?? null);
    useSessionStore.getState().setActiveLane(validLaneId);
    useSessionStore.getState().setUIMode('exploring');

    // Auto-open plan panel for sessions that have a synthesized plan
    if (session.status === 'synthesized') {
      useSessionStore.getState().setPlanPanelOpen(true);
    }

    // Hydrate semantic store
    useSemanticStore.getState().loadSession({
      nodes,
      edges,
      promotions,
      lanes,
      unifiedPlan: unifiedPlans[0] ?? null,
      dialogueTurns,
    });

    // Hydrate plan talk store with persisted transcript turns
    usePlanTalkStore.getState().loadTurns(planTalkTurns);

    // Hydrate voice note store
    useVoiceNoteStore.getState().loadNotes(voiceNotes);

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
