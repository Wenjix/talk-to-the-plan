import { create } from 'zustand';
import type { SemanticNode, SemanticEdge } from '../core/types';
import { calculateTreeLayout } from '../utils/layout';

export interface ViewNodeState {
  semanticId: string;
  position: { x: number; y: number };
  isCollapsed: boolean;
  isAnswerVisible: boolean;
  isNew: boolean;
  spawnIndex: number;
}

/**
 * Collect all descendant node IDs from the given node using BFS on edges.
 */
export function getDescendantIds(nodeId: string, edges: SemanticEdge[]): string[] {
  // Build a quick children lookup from edges
  const childrenOf = new Map<string, string[]>();
  for (const edge of edges) {
    const children = childrenOf.get(edge.sourceNodeId) ?? [];
    children.push(edge.targetNodeId);
    childrenOf.set(edge.sourceNodeId, children);
  }

  const descendants: string[] = [];
  const queue: string[] = [...(childrenOf.get(nodeId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    descendants.push(current);
    const children = childrenOf.get(current) ?? [];
    for (const child of children) {
      queue.push(child);
    }
  }

  return descendants;
}

interface ViewState {
  viewNodes: Map<string, ViewNodeState>;
  activeNodeId: string | null;
  streamBuffers: Map<string, string>;
  dialoguePanelNodeId: string | null;
  terminalOpen: boolean;
  terminalHeightPx: number;

  setActiveNode: (id: string | null) => void;
  setViewNode: (id: string, state: ViewNodeState) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
  toggleCollapse: (id: string) => void;
  appendStream: (nodeId: string, chunk: string) => void;
  clearStream: (nodeId: string) => void;
  openDialoguePanel: (nodeId: string) => void;
  closeDialoguePanel: () => void;
  relayoutTree: (nodes: SemanticNode[], edges: SemanticEdge[]) => void;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (px: number) => void;
  clear: () => void;
}

const TERMINAL_MIN_HEIGHT = 200;
const TERMINAL_MAX_HEIGHT = 520;

export const useViewStore = create<ViewState>()((set) => ({
  viewNodes: new Map(),
  activeNodeId: null,
  streamBuffers: new Map(),
  dialoguePanelNodeId: null,
  terminalOpen: false,
  terminalHeightPx: 280,

  setActiveNode: (id) => set({ activeNodeId: id }),
  setViewNode: (id, state) => set((s) => {
    const next = new Map(s.viewNodes);
    next.set(id, state);
    return { viewNodes: next };
  }),
  updatePosition: (id, position) => set((s) => {
    const current = s.viewNodes.get(id);
    if (!current) return s;
    const next = new Map(s.viewNodes);
    next.set(id, { ...current, position });
    return { viewNodes: next };
  }),
  toggleCollapse: (id) => set((s) => {
    const current = s.viewNodes.get(id);
    if (!current) return s;
    const next = new Map(s.viewNodes);
    next.set(id, { ...current, isCollapsed: !current.isCollapsed });
    return { viewNodes: next };
  }),
  appendStream: (nodeId, chunk) => set((s) => {
    const next = new Map(s.streamBuffers);
    const current = next.get(nodeId) ?? '';
    next.set(nodeId, current + chunk);
    return { streamBuffers: next };
  }),
  clearStream: (nodeId) => set((s) => {
    const next = new Map(s.streamBuffers);
    next.delete(nodeId);
    return { streamBuffers: next };
  }),
  openDialoguePanel: (nodeId) => set({ dialoguePanelNodeId: nodeId }),
  closeDialoguePanel: () => set({ dialoguePanelNodeId: null }),
  relayoutTree: (nodes, edges) => set((s) => {
    const positions = calculateTreeLayout(nodes, edges);
    const next = new Map(s.viewNodes);
    for (const [nodeId, pos] of positions) {
      const current = next.get(nodeId);
      if (current) {
        next.set(nodeId, { ...current, position: pos });
      }
    }
    return { viewNodes: next };
  }),
  setTerminalOpen: (open) => set({ terminalOpen: open }),
  toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
  setTerminalHeight: (px) =>
    set({ terminalHeightPx: Math.max(TERMINAL_MIN_HEIGHT, Math.min(TERMINAL_MAX_HEIGHT, px)) }),
  clear: () =>
    set({
      viewNodes: new Map(),
      activeNodeId: null,
      streamBuffers: new Map(),
      dialoguePanelNodeId: null,
      terminalOpen: false,
      // Preserve terminalHeightPx — user preference survives session clear
    }),
}));
