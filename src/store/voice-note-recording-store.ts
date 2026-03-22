import { create } from 'zustand';

interface VoiceNoteRecordingState {
  isRecording: boolean;
  targetNodeId: string | null;
  elapsedMs: number;
  isTranscribing: boolean;

  startRecording: (nodeId: string) => void;
  stopRecording: () => void;
  setElapsed: (ms: number) => void;
  setTranscribing: (v: boolean) => void;
  clear: () => void;
}

export const useVoiceNoteRecordingStore = create<VoiceNoteRecordingState>()((set) => ({
  isRecording: false,
  targetNodeId: null,
  elapsedMs: 0,
  isTranscribing: false,

  startRecording: (nodeId) =>
    set({ isRecording: true, targetNodeId: nodeId, elapsedMs: 0 }),

  stopRecording: () =>
    set({ isRecording: false }),

  setElapsed: (ms) =>
    set({ elapsedMs: ms }),

  setTranscribing: (v) =>
    set({ isTranscribing: v }),

  clear: () =>
    set({ isRecording: false, targetNodeId: null, elapsedMs: 0, isTranscribing: false }),
}));
