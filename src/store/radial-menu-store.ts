import { create } from 'zustand';
import type { NodeFSMState } from '../core/types/node';

interface RadialMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  targetNodeId: string | null;
  targetFsmState: NodeFSMState | null;
  open: (nodeId: string, fsmState: NodeFSMState, x: number, y: number) => void;
  close: () => void;
}

export const useRadialMenuStore = create<RadialMenuState>()((set) => ({
  isOpen: false,
  position: { x: 0, y: 0 },
  targetNodeId: null,
  targetFsmState: null,

  open: (nodeId, fsmState, x, y) =>
    set({ isOpen: true, position: { x, y }, targetNodeId: nodeId, targetFsmState: fsmState }),

  close: () =>
    set({ isOpen: false, targetNodeId: null, targetFsmState: null }),
}));
