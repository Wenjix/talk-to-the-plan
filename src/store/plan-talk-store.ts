import { create } from 'zustand';
import type { PlanTalkTurn, PlanTalkTurnState, ProposedPlanEdit, PlanGapCard } from '../core/types';

interface PlanTalkState {
  isOpen: boolean;
  turnState: PlanTalkTurnState;
  turns: PlanTalkTurn[];
  pendingEdits: ProposedPlanEdit[];
  currentUnderstanding: string;
  gapCards: PlanGapCard[];
  unresolvedQuestions: string[];
  error: string | null;
  partialTranscript: string;
  streamingResponse: string;
  ttsAudioBlobs: Record<string, Blob>;
  ttsTurnStatus: Record<string, 'loading' | 'ready' | 'failed'>;

  open: () => void;
  close: () => void;
  setTurnState: (state: PlanTalkTurnState) => void;
  addTurn: (turn: PlanTalkTurn) => void;
  setPendingEdits: (edits: ProposedPlanEdit[]) => void;
  setGapCards: (cards: PlanGapCard[]) => void;
  setUnderstanding: (text: string) => void;
  setUnresolvedQuestions: (questions: string[]) => void;
  updateEditStatus: (editId: string, approved: boolean) => void;
  setError: (error: string | null) => void;
  setPartialTranscript: (text: string) => void;
  setStreamingResponse: (text: string) => void;
  setTtsBlob: (turnId: string, blob: Blob) => void;
  setTtsTurnStatus: (turnId: string, status: 'loading' | 'ready' | 'failed') => void;
  clear: () => void;
  loadTurns: (turns: PlanTalkTurn[]) => void;
}

export const usePlanTalkStore = create<PlanTalkState>()((set) => ({
  isOpen: false,
  turnState: 'idle',
  turns: [],
  pendingEdits: [],
  currentUnderstanding: '',
  gapCards: [],
  unresolvedQuestions: [],
  error: null,
  partialTranscript: '',
  streamingResponse: '',
  ttsAudioBlobs: {},
  ttsTurnStatus: {},

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setTurnState: (turnState) => set({ turnState }),
  addTurn: (turn) => set((s) => ({ turns: [...s.turns, { ...turn, turnIndex: s.turns.length }] })),
  setPendingEdits: (edits) => set({ pendingEdits: edits }),
  setGapCards: (cards) => set({ gapCards: cards }),
  setUnderstanding: (text) => set({ currentUnderstanding: text }),
  setUnresolvedQuestions: (questions) => set({ unresolvedQuestions: questions }),
  updateEditStatus: (editId, approved) =>
    set((s) => ({
      pendingEdits: s.pendingEdits.map((e) =>
        e.id === editId ? { ...e, approved } : e,
      ),
    })),
  setError: (error) => set({ error }),
  setPartialTranscript: (partialTranscript) => set({ partialTranscript }),
  setStreamingResponse: (streamingResponse) => set({ streamingResponse }),
  setTtsBlob: (turnId, blob) =>
    set((s) => ({ ttsAudioBlobs: { ...s.ttsAudioBlobs, [turnId]: blob } })),
  setTtsTurnStatus: (turnId, status) =>
    set((s) => ({ ttsTurnStatus: { ...s.ttsTurnStatus, [turnId]: status } })),
  clear: () =>
    set({
      turnState: 'idle',
      turns: [],
      pendingEdits: [],
      currentUnderstanding: '',
      gapCards: [],
      unresolvedQuestions: [],
      error: null,
      partialTranscript: '',
      streamingResponse: '',
      ttsAudioBlobs: {},
      ttsTurnStatus: {},
    }),
  loadTurns: (turns) => set({ turns }),
}));
