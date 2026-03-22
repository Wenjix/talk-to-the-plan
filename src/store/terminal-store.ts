import { create } from 'zustand';
import type { TerminalConnectionState } from '../services/terminal-backend';
import type { TerminalToolStatus, TerminalToolingState } from '../services/terminal-tool-types';
import { createDefaultToolStatus } from '../services/terminal-tool-types';

interface TerminalState {
  connectionState: TerminalConnectionState;
  terminalSessionId: string | null;
  lastExit: { exitCode: number | null; signal: string | null } | null;
  errorMessage: string | null;
  tooling: TerminalToolingState;
  toolProbeInProgress: boolean;

  setConnectionState: (state: TerminalConnectionState) => void;
  setTerminalSessionId: (id: string | null) => void;
  setLastExit: (exit: { exitCode: number | null; signal: string | null } | null) => void;
  setErrorMessage: (msg: string | null) => void;
  setToolStatus: (tool: string, status: TerminalToolStatus) => void;
  setToolProbeInProgress: (inProgress: boolean) => void;
  clear: () => void;
}

function createDefaultTooling(): TerminalToolingState {
  return { mistralVibe: createDefaultToolStatus() };
}

export const useTerminalStore = create<TerminalState>()((set) => ({
  connectionState: 'disconnected',
  terminalSessionId: null,
  lastExit: null,
  errorMessage: null,
  tooling: createDefaultTooling(),
  toolProbeInProgress: false,

  setConnectionState: (connectionState) => set({ connectionState }),
  setTerminalSessionId: (terminalSessionId) => set({ terminalSessionId }),
  setLastExit: (lastExit) => set({ lastExit }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setToolStatus: (tool, status) =>
    set((s) => ({
      tooling: { ...s.tooling, [tool]: status },
    })),
  setToolProbeInProgress: (toolProbeInProgress) => set({ toolProbeInProgress }),
  clear: () =>
    set({
      connectionState: 'disconnected',
      terminalSessionId: null,
      lastExit: null,
      errorMessage: null,
      tooling: createDefaultTooling(),
      toolProbeInProgress: false,
    }),
}));
