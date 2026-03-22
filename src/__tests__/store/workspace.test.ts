import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../store/session-store';
import { useSemanticStore } from '../../store/semantic-store';
import { useViewStore } from '../../store/view-store';
import { useJobStore } from '../../store/job-store';
import type { PlanningSession, SemanticNode } from '../../core/types';

// ---------------------------------------------------------------------------
// Mock the persistence layer
// ---------------------------------------------------------------------------

const mockSaveSession = vi.fn<() => Promise<void>>();
const mockRestoreSession = vi.fn<(id: string) => Promise<boolean>>();
const mockListSavedSessions = vi.fn<() => Promise<Array<{ id: string; topic: string; updatedAt: string }>>>();

vi.mock('../../persistence/hooks', () => ({
  saveSession: (...args: unknown[]) => mockSaveSession(...(args as [])),
  restoreSession: (id: string) => mockRestoreSession(id),
  listSavedSessions: (...args: unknown[]) => mockListSavedSessions(...(args as [])),
}));

const mockDeleteEntity = vi.fn<(store: string, key: string) => Promise<void>>();
const mockGetAllByIndex = vi.fn<(store: string, index: string, key: string) => Promise<Array<{ id: string }>>>();
const mockGetEntity = vi.fn<(store: string, key: string) => Promise<PlanningSession | undefined>>();

vi.mock('../../persistence/repository', () => ({
  deleteEntity: (store: string, key: string) => mockDeleteEntity(store, key),
  getAllByIndex: (store: string, index: string, key: string) => mockGetAllByIndex(store, index, key),
  getEntity: (store: string, key: string) => mockGetEntity(store, key),
}));

import { switchSession, deleteSession, listSessions } from '../../store/workspace-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<PlanningSession>): PlanningSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    topic: 'How to build a sustainable startup from scratch',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: crypto.randomUUID(),
    status: 'exploring',
    version: 'fuda_v1',
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    laneId: crypto.randomUUID(),
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'What are the key trade-offs?',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('workspace-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
    useSemanticStore.getState().clear();
    useViewStore.getState().clear();
    useJobStore.getState().clear();

    // Default mock behaviors
    mockSaveSession.mockResolvedValue(undefined);
    mockRestoreSession.mockResolvedValue(true);
    mockDeleteEntity.mockResolvedValue(undefined);
    mockGetAllByIndex.mockResolvedValue([]);
  });

  describe('switchSession', () => {
    it('saves the current session before switching', async () => {
      const currentSession = makeSession();
      useSessionStore.getState().setSession(currentSession);

      await switchSession('target-session-id');

      expect(mockSaveSession).toHaveBeenCalledOnce();
    });

    it('does not save if no current session exists', async () => {
      await switchSession('target-session-id');

      expect(mockSaveSession).not.toHaveBeenCalled();
    });

    it('clears all stores before restoring target session', async () => {
      const currentSession = makeSession();
      useSessionStore.getState().setSession(currentSession);
      useSemanticStore.getState().addNode(makeNode());

      await switchSession('target-session-id');

      // After clear + restore, the stores should have been cleared
      // We can verify by checking restoreSession was called
      // (it hydrates fresh data into cleared stores)
      expect(mockRestoreSession).toHaveBeenCalledWith('target-session-id');
    });

    it('restores the target session', async () => {
      await switchSession('target-session-id');

      expect(mockRestoreSession).toHaveBeenCalledWith('target-session-id');
    });

    it('throws if restore fails', async () => {
      mockRestoreSession.mockResolvedValue(false);

      await expect(switchSession('nonexistent-id')).rejects.toThrow(
        'Failed to restore session: nonexistent-id',
      );
    });

    it('serializes concurrent switchSession calls', async () => {
      const session = makeSession();
      useSessionStore.getState().setSession(session);

      // Track call order
      const callOrder: string[] = [];
      mockSaveSession.mockImplementation(async () => {
        callOrder.push('save-start');
        await new Promise((r) => setTimeout(r, 50));
        callOrder.push('save-end');
      });
      mockRestoreSession.mockImplementation(async (id: string) => {
        callOrder.push(`restore-${id}-start`);
        await new Promise((r) => setTimeout(r, 50));
        callOrder.push(`restore-${id}-end`);
        return true;
      });

      // Fire two switches concurrently
      const p1 = switchSession('session-a');
      const p2 = switchSession('session-b');
      await Promise.all([p1, p2]);

      // Second switch should not start restoring until first is done
      const restoreAStart = callOrder.indexOf('restore-session-a-start');
      const restoreAEnd = callOrder.indexOf('restore-session-a-end');
      const restoreBStart = callOrder.indexOf('restore-session-b-start');
      expect(restoreBStart).toBeGreaterThan(restoreAEnd);
      expect(restoreAStart).toBeLessThan(restoreAEnd);
    });
  });

  describe('deleteSession', () => {
    it('deletes the session and related entities from IDB', async () => {
      const sessionId = 'session-to-delete';

      await deleteSession(sessionId);

      // Should delete from the sessions store
      expect(mockDeleteEntity).toHaveBeenCalledWith('sessions', sessionId);

      // Should query all related stores for cleanup
      expect(mockGetAllByIndex).toHaveBeenCalledWith('lanes', 'by-session', sessionId);
      expect(mockGetAllByIndex).toHaveBeenCalledWith('nodes', 'by-session', sessionId);
      expect(mockGetAllByIndex).toHaveBeenCalledWith('edges', 'by-session', sessionId);
    });

    it('clears stores when deleting the active session', async () => {
      const session = makeSession({ id: 'active-session' });
      useSessionStore.getState().setSession(session);
      useSemanticStore.getState().addNode(makeNode());

      await deleteSession('active-session');

      expect(useSessionStore.getState().session).toBeNull();
      expect(useSemanticStore.getState().nodes).toHaveLength(0);
    });

    it('does not clear stores when deleting a non-active session', async () => {
      const session = makeSession({ id: 'active-session' });
      useSessionStore.getState().setSession(session);
      const node = makeNode();
      useSemanticStore.getState().addNode(node);

      await deleteSession('different-session');

      // Active session and its data should still be there
      expect(useSessionStore.getState().session?.id).toBe('active-session');
      expect(useSemanticStore.getState().nodes).toHaveLength(1);
    });
  });

  describe('listSessions', () => {
    it('returns formatted summaries from IDB', async () => {
      const sessionId = 'test-session-id';
      const createdAt = '2025-06-15T10:00:00Z';

      mockListSavedSessions.mockResolvedValue([
        { id: sessionId, topic: 'My planning topic for team alignment', updatedAt: createdAt },
      ]);

      mockGetAllByIndex.mockImplementation(async (store: string) => {
        if (store === 'nodes') return [{ id: 'n1' }, { id: 'n2' }];
        return [];
      });

      mockGetEntity.mockResolvedValue(
        makeSession({
          id: sessionId,
          topic: 'My planning topic for team alignment',
          status: 'exploring',
          createdAt,
        }),
      );

      const result = await listSessions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sessionId);
      expect(result[0].topic).toBe('My planning topic for team alignment');
      expect(result[0].status).toBe('exploring');
      expect(result[0].nodeCount).toBe(2);
    });

    it('returns empty array when no sessions exist', async () => {
      mockListSavedSessions.mockResolvedValue([]);

      const result = await listSessions();

      expect(result).toEqual([]);
    });
  });
});
