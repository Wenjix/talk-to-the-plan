import { create } from 'zustand';
import type { PlanningSession, ChallengeDepth } from '../core/types';

export type UIMode = 'topic_input' | 'compass' | 'exploring' | 'workspace';
export type LayoutMode = 'single' | 'quadrant';

interface SessionState {
  session: PlanningSession | null;
  activeLaneId: string | null;
  challengeDepth: ChallengeDepth;
  uiMode: UIMode;
  layoutMode: LayoutMode;
  focusedLaneId: string | null;
  planPanelOpen: boolean;

  setSession: (session: PlanningSession | null) => void;
  setActiveLane: (laneId: string | null) => void;
  setChallengeDepth: (depth: ChallengeDepth) => void;
  setUIMode: (mode: UIMode) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setFocusedLaneId: (laneId: string | null) => void;
  setPlanPanelOpen: (open: boolean) => void;
  togglePlanPanel: () => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: null,
  activeLaneId: null,
  challengeDepth: 'balanced',
  uiMode: 'topic_input',
  layoutMode: 'single',
  focusedLaneId: null,
  planPanelOpen: false,

  setSession: (session) => set({ session }),
  setActiveLane: (laneId) => set({ activeLaneId: laneId }),
  setChallengeDepth: (depth) => set({ challengeDepth: depth }),
  setUIMode: (mode) => set({ uiMode: mode }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setFocusedLaneId: (laneId) => set({ focusedLaneId: laneId }),
  setPlanPanelOpen: (open) => set({ planPanelOpen: open }),
  togglePlanPanel: () => set((state) => ({ planPanelOpen: !state.planPanelOpen })),
  clear: () => set({ session: null, activeLaneId: null, challengeDepth: 'balanced', uiMode: 'topic_input', layoutMode: 'single', focusedLaneId: null, planPanelOpen: false }),
}));
