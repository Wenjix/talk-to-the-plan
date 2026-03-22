import { create } from 'zustand';

export interface VoiceCommandResult {
  toolName: string;
  success: boolean;
  message: string;
}

interface VoiceCommandState {
  isRecording: boolean;
  isProcessing: boolean;
  targetNodeId: string | null;
  lastResult: VoiceCommandResult | null;
  error: string | null;

  startRecording: (nodeId: string) => void;
  stopRecording: () => void;
  setProcessing: (processing: boolean) => void;
  setResult: (result: VoiceCommandResult) => void;
  setError: (error: string) => void;
  clear: () => void;
}

export const useVoiceCommandStore = create<VoiceCommandState>()((set) => ({
  isRecording: false,
  isProcessing: false,
  targetNodeId: null,
  lastResult: null,
  error: null,

  startRecording: (nodeId) =>
    set({ isRecording: true, targetNodeId: nodeId, error: null, lastResult: null }),

  stopRecording: () =>
    set({ isRecording: false }),

  setProcessing: (processing) =>
    set({ isProcessing: processing }),

  setResult: (result) =>
    set({ lastResult: result, isProcessing: false }),

  setError: (error) =>
    set({ error, isProcessing: false }),

  clear: () =>
    set({ isRecording: false, isProcessing: false, targetNodeId: null, lastResult: null, error: null }),
}));
