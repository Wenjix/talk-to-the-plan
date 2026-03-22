import { create } from 'zustand';

export interface PaneSize {
  /** Percentage width (0-100) */
  widthPct: number;
  /** Percentage height (0-100) */
  heightPct: number;
}

export interface QuadrantPane {
  laneId: string;
  /** Grid position: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right */
  index: number;
  /** Whether this pane has been manually resized (pinned) */
  pinned: boolean;
}

interface QuadrantState {
  /** Column split position: percentage for left column width (default 50) */
  colSplit: number;
  /** Row split position: percentage for top row height (default 50) */
  rowSplit: number;
  /** Pane assignments: maps grid index (0-3) to lane info */
  panes: QuadrantPane[];
  /** Whether auto-resize is enabled */
  autoResize: boolean;

  setColSplit: (pct: number) => void;
  setRowSplit: (pct: number) => void;
  setPanes: (panes: QuadrantPane[]) => void;
  setPinned: (index: number, pinned: boolean) => void;
  setAutoResize: (enabled: boolean) => void;
  resetSplits: () => void;
  clear: () => void;
}

export const useQuadrantStore = create<QuadrantState>()((set) => ({
  colSplit: 50,
  rowSplit: 50,
  panes: [],
  autoResize: true,

  setColSplit: (pct) => set({ colSplit: Math.max(15, Math.min(85, pct)) }),
  setRowSplit: (pct) => set({ rowSplit: Math.max(15, Math.min(85, pct)) }),
  setPanes: (panes) => set({ panes }),
  setPinned: (index, pinned) =>
    set((state) => ({
      panes: state.panes.map((p) =>
        p.index === index ? { ...p, pinned } : p,
      ),
    })),
  setAutoResize: (enabled) => set({ autoResize: enabled }),
  resetSplits: () => set({ colSplit: 50, rowSplit: 50 }),
  clear: () => set({ colSplit: 50, rowSplit: 50, panes: [], autoResize: true }),
}));
