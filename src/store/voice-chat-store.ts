import { create } from 'zustand';
import { generateId } from '../utils/ids';

export interface VoiceChatTurn {
  id: string;
  nodeId: string;
  speaker: 'user' | 'ai';
  text: string;
  toolName?: string;
  createdAt: string;
}

interface VoiceChatState {
  turnsByNode: Record<string, VoiceChatTurn[]>;
  ttsBlobs: Record<string, Blob>;
  ttsTurnStatus: Record<string, 'loading' | 'ready' | 'failed'>;
  activePanelNodeId: string | null;

  addTurn(turn: Omit<VoiceChatTurn, 'id' | 'createdAt'>): string;
  setTtsBlob(turnId: string, blob: Blob): void;
  setTtsTurnStatus(turnId: string, status: 'loading' | 'ready' | 'failed'): void;
  openPanel(nodeId: string): void;
  closePanel(): void;
  clearNodeHistory(nodeId: string): void;
}

const MAX_TURNS_PER_NODE = 50;

export const useVoiceChatStore = create<VoiceChatState>()((set) => ({
  turnsByNode: {},
  ttsBlobs: {},
  ttsTurnStatus: {},
  activePanelNodeId: null,

  addTurn: (partial) => {
    const id = generateId();
    const turn: VoiceChatTurn = { ...partial, id, createdAt: new Date().toISOString() };
    set((s) => {
      const existing = s.turnsByNode[turn.nodeId] ?? [];
      const updated = [...existing, turn].slice(-MAX_TURNS_PER_NODE);
      return { turnsByNode: { ...s.turnsByNode, [turn.nodeId]: updated } };
    });
    return id;
  },

  setTtsBlob: (turnId, blob) =>
    set((s) => ({ ttsBlobs: { ...s.ttsBlobs, [turnId]: blob } })),

  setTtsTurnStatus: (turnId, status) =>
    set((s) => ({ ttsTurnStatus: { ...s.ttsTurnStatus, [turnId]: status } })),

  openPanel: (nodeId) => set({ activePanelNodeId: nodeId }),

  closePanel: () => set({ activePanelNodeId: null }),

  clearNodeHistory: (nodeId) =>
    set((s) => {
      const { [nodeId]: _, ...rest } = s.turnsByNode;
      return { turnsByNode: rest };
    }),
}));
