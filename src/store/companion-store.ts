import { create } from 'zustand';

export type CompanionStatus = 'off' | 'starting' | 'listening' | 'reconnecting' | 'error';
export type ListenerActivity = 'idle' | 'thinking';

interface CompanionState {
  status: CompanionStatus;
  error: string | null;
  listenerActivity: ListenerActivity;
  lastFireAt: number | null;
  intentsFiredCount: number;
  queuedIntentCount: number;
  lastFocusedNodeId: string | null;

  setStatus(status: CompanionStatus, error?: string | null): void;
  setListenerActivity(activity: ListenerActivity): void;
  setListenerError(message: string): void;
  noteListenerFire(intentCount: number): void;
  setQueuedIntentCount(count: number): void;
  setLastFocusedNodeId(nodeId: string | null): void;
  reset(): void;
}

export const useCompanionStore = create<CompanionState>()((set) => ({
  status: 'off',
  error: null,
  listenerActivity: 'idle',
  lastFireAt: null,
  intentsFiredCount: 0,
  queuedIntentCount: 0,
  lastFocusedNodeId: null,

  setStatus: (status, error = null) => set({ status, error }),
  setListenerActivity: (activity) => set({ listenerActivity: activity }),
  setListenerError: (message) => set({ status: 'error', error: message, listenerActivity: 'idle' }),
  noteListenerFire: (intentCount) => set((s) => ({
    lastFireAt: Date.now(),
    intentsFiredCount: s.intentsFiredCount + intentCount,
  })),
  setQueuedIntentCount: (count) => set({ queuedIntentCount: count }),
  setLastFocusedNodeId: (nodeId) => set({ lastFocusedNodeId: nodeId }),
  reset: () => set({
    status: 'off',
    error: null,
    listenerActivity: 'idle',
    lastFireAt: null,
    intentsFiredCount: 0,
    queuedIntentCount: 0,
    lastFocusedNodeId: null,
  }),
}));
