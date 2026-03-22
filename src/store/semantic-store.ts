import { create } from 'zustand';
import type { SemanticNode, SemanticEdge, Promotion, LanePlan, UnifiedPlan, DialogueTurn, ModelLane, PersonaId } from '../core/types';

interface SemanticState {
  nodes: SemanticNode[];
  edges: SemanticEdge[];
  promotions: Promotion[];
  lanes: ModelLane[];
  lanePlans: LanePlan[];
  unifiedPlan: UnifiedPlan | null;
  dialogueTurns: DialogueTurn[];

  // Node CRUD
  addNode: (node: SemanticNode) => void;
  updateNode: (id: string, updates: Partial<SemanticNode>) => void;
  getNode: (id: string) => SemanticNode | undefined;

  // Edge CRUD
  addEdge: (edge: SemanticEdge) => void;

  // Lane storage
  setLanes: (lanes: ModelLane[]) => void;
  updateLanePersona: (laneId: string, personaId: PersonaId) => void;

  // Promotion
  addPromotion: (promotion: Promotion) => void;
  removePromotion: (id: string) => void;

  // Plans
  addLanePlan: (plan: LanePlan) => void;
  setUnifiedPlan: (plan: UnifiedPlan | null) => void;

  // Dialogue turns
  addDialogueTurn: (turn: DialogueTurn) => void;
  getDialogueTurnsByNode: (nodeId: string) => DialogueTurn[];
  clearDialogueTurns: (nodeId: string) => void;

  // Bulk
  loadSession: (data: {
    nodes: SemanticNode[];
    edges: SemanticEdge[];
    promotions: Promotion[];
    lanes: ModelLane[];
    lanePlans: LanePlan[];
    unifiedPlan: UnifiedPlan | null;
    dialogueTurns: DialogueTurn[];
  }) => void;
  clear: () => void;
}

export const useSemanticStore = create<SemanticState>()((set, get) => ({
  nodes: [],
  edges: [],
  promotions: [],
  lanes: [],
  lanePlans: [],
  unifiedPlan: null,
  dialogueTurns: [],

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  updateNode: (id, updates) => set((s) => ({
    nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
  })),
  getNode: (id) => get().nodes.find((n) => n.id === id),
  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),
  setLanes: (lanes) => set({ lanes }),
  updateLanePersona: (laneId, personaId) => set((s) => ({
    lanes: s.lanes.map((l) => (l.id === laneId ? { ...l, personaId } : l)),
  })),
  addPromotion: (promotion) => set((s) => ({ promotions: [...s.promotions, promotion] })),
  removePromotion: (id) => set((s) => ({ promotions: s.promotions.filter((p) => p.id !== id) })),
  addLanePlan: (plan) => set((s) => ({ lanePlans: [...s.lanePlans, plan] })),
  setUnifiedPlan: (plan) => set({ unifiedPlan: plan }),
  addDialogueTurn: (turn) => set((s) => ({ dialogueTurns: [...s.dialogueTurns, turn] })),
  getDialogueTurnsByNode: (nodeId) => get().dialogueTurns.filter((t) => t.nodeId === nodeId),
  clearDialogueTurns: (nodeId) => set((s) => ({
    dialogueTurns: s.dialogueTurns.filter((t) => t.nodeId !== nodeId),
  })),
  loadSession: (data) => set(data),
  clear: () => set({ nodes: [], edges: [], promotions: [], lanes: [], lanePlans: [], unifiedPlan: null, dialogueTurns: [] }),
}));
