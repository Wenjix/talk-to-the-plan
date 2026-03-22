import { create } from 'zustand';
import type { VoiceNote } from '../core/types';

interface VoiceNoteState {
  notes: VoiceNote[];
  addNote: (note: VoiceNote) => void;
  updateNote: (id: string, updates: Partial<VoiceNote>) => void;
  removeNote: (id: string) => void;
  getNotesForNode: (nodeId: string) => VoiceNote[];
  loadNotes: (notes: VoiceNote[]) => void;
  clear: () => void;
}

export const useVoiceNoteStore = create<VoiceNoteState>()((set, get) => ({
  notes: [],

  addNote: (note) =>
    set((s) => ({ notes: [...s.notes, note] })),

  updateNote: (id, updates) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    })),

  removeNote: (id) =>
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

  getNotesForNode: (nodeId) =>
    get().notes.filter((n) => n.nodeId === nodeId),

  loadNotes: (notes) =>
    set({ notes }),

  clear: () =>
    set({ notes: [] }),
}));
