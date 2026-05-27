import type { SessionStatus } from '../core/types/session';
import { saveSession, restoreSession, listSavedSessions, flushPendingSave } from '../persistence/hooks';
import { deleteEntity, getAllByIndex } from '../persistence/repository';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useViewStore } from './view-store';
import { useJobStore } from './job-store';
import { useVoiceNoteStore } from './voice-note-store';
import { usePlanTalkStore } from './plan-talk-store';
import { useVoiceChatStore } from './voice-chat-store';
import { useCompanionStore } from './companion-store';
import { useQuadrantStore } from './quadrant-store';
import { useTranscriptStore } from './transcript-store';
import { useTerminalStore } from './terminal-store';
import { useVoiceNoteRecordingStore } from './voice-note-recording-store';
import { useVoiceCommandStore } from './voice-command-store';
import { clearDialogueTtsCache } from './dialogue-actions';
import { clearSchedulerQueue } from './branch-scheduler';
import { stopCompanionMode } from './companion-actions';
import { audioPlayback } from '../services/voice/audio-playback';
import { cancelVoiceNoteRecording } from './voice-note-actions';
import { cancelVoiceCommand } from './voice-command-actions';

// ---------------------------------------------------------------------------
// Concurrency guard — serializes session mutations to prevent interleaving
// ---------------------------------------------------------------------------
let _opLock: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = _opLock.then(fn, fn); // run even if prior op failed
  _opLock = next.then(() => {}, () => {}); // swallow to keep chain alive
  return next;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  topic: string;
  status: SessionStatus;
  createdAt: string;
  nodeCount: number;
}

// ---------------------------------------------------------------------------
// Full store cleanup — clears all stores and cancels in-flight operations
// ---------------------------------------------------------------------------

function clearAllStores(): void {
  // Cancel in-flight async operations first
  try { stopCompanionMode(); } catch { /* companion may not be running */ }
  try { cancelVoiceNoteRecording(); } catch { /* no active recording */ }
  try { cancelVoiceCommand(); } catch { /* no active command */ }
  try { audioPlayback.stop(); } catch { /* no audio playing */ }
  try { clearSchedulerQueue(); } catch { /* scheduler may be empty */ }

  // Clear Zustand stores
  useSemanticStore.getState().clear();
  useViewStore.getState().clear();
  useJobStore.getState().clear();
  useSessionStore.getState().clear();
  useVoiceNoteStore.getState().clear();
  usePlanTalkStore.getState().clear();
  useVoiceChatStore.getState().clear();
  useCompanionStore.getState().reset();
  useQuadrantStore.getState().clear();
  useTranscriptStore.getState().clear();
  useTerminalStore.getState().clear();
  useVoiceNoteRecordingStore.getState().clear();
  useVoiceCommandStore.getState().clear();
  clearDialogueTtsCache();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Switch from the current session to a different one.
 *
 * 1. Save the current session (if any)
 * 2. Clear all in-memory stores
 * 3. Restore the target session from IDB
 */
export async function switchSession(sessionId: string): Promise<void> {
  return serialized(async () => {
    // Save whatever we have in memory first
    const current = useSessionStore.getState().session;
    if (current) {
      await saveSession();
    }

    // Clear all stores and cancel in-flight operations
    clearAllStores();

    // Restore the target session (this replaces semantic + session store contents)
    const ok = await restoreSession(sessionId);
    if (!ok) {
      throw new Error(`Failed to restore session: ${sessionId}`);
    }

    // Terminal sessions are ephemeral — always start closed on session restore
    useViewStore.getState().setTerminalOpen(false);
  });
}

/**
 * Delete a session and its related entities from IDB.
 *
 * If the deleted session is the currently active one, all stores are cleared.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  return serialized(async () => {
    const current = useSessionStore.getState().session;

    // If deleting the active session, clear all stores and in-flight operations
    if (current && current.id === sessionId) {
      // Wait for any in-flight save (with a stale snapshot) to finish
      // BEFORE clearing/deleting. Otherwise its Promise.all of writes can
      // resurrect entities after the IDB deletions below run.
      await flushPendingSave();
      clearAllStores();
    }

    // Delete the session envelope from IDB
    const storeNames = [
      'lanes',
      'nodes',
      'edges',
      'promotions',
      'unifiedPlans',
      'dialogueTurns',
      'jobs',
      'planTalkTurns',
      'voiceNotes',
    ] as const;

    const deletions = storeNames.map(async (storeName) => {
      const entities = await getAllByIndex(storeName, 'by-session', sessionId);
      return Promise.all(
        entities.map((e) => deleteEntity(storeName, (e as { id: string }).id)),
      );
    });

    await Promise.all(deletions);

    // Delete voice note blobs (now indexed by session)
    const voiceNoteBlobs = await getAllByIndex('voiceNoteBlobs', 'by-session', sessionId);
    await Promise.all(
      voiceNoteBlobs.map((b) => deleteEntity('voiceNoteBlobs', (b as { id: string }).id)),
    );

    // Finally delete the session itself
    await deleteEntity('sessions', sessionId);
  });
}

/**
 * List all saved sessions with summary information.
 *
 * Loads session records from IDB and augments them with entity counts.
 */
export async function listSessions(): Promise<SessionSummary[]> {
  const savedSessions = await listSavedSessions();

  const summaries = await Promise.all(
    savedSessions.map(async (s) => {
      const nodes = await getAllByIndex('nodes', 'by-session', s.id);

      // We need to get the full session to read status; listSavedSessions
      // only returns { id, topic, updatedAt }. We fetch the session entity.
      const { getEntity } = await import('../persistence/repository');
      const fullSession = await getEntity('sessions', s.id);

      return {
        id: s.id,
        topic: s.topic,
        status: (fullSession?.status ?? 'exploring') as SessionStatus,
        createdAt: fullSession?.createdAt ?? s.updatedAt,
        nodeCount: nodes.length,
      };
    }),
  );

  // Sort by most recently updated
  return summaries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
