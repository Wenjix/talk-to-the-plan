import { create } from 'zustand';
import type { NodeFSMState } from '../core/types/node';

export type VoiceState = 'idle' | 'recording' | 'processing' | 'success' | 'error';

interface RadialMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  targetNodeId: string | null;
  targetFsmState: NodeFSMState | null;
  voiceState: VoiceState;
  open: (nodeId: string, fsmState: NodeFSMState, x: number, y: number) => void;
  close: () => void;
  setVoiceState: (state: VoiceState) => void;
}

export const useRadialMenuStore = create<RadialMenuState>()((set) => ({
  isOpen: false,
  position: { x: 0, y: 0 },
  targetNodeId: null,
  targetFsmState: null,
  voiceState: 'idle',

  open: (nodeId, fsmState, x, y) =>
    set({ isOpen: true, position: { x, y }, targetNodeId: nodeId, targetFsmState: fsmState, voiceState: 'idle' }),

  close: () =>
    set({ isOpen: false, targetNodeId: null, targetFsmState: null, voiceState: 'idle' }),

  setVoiceState: (voiceState) => set({ voiceState }),
}));
