import type { TerminalToolStatus } from './terminal-tool-types';

export type TerminalConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error';

export interface TerminalBackendEvents {
  onOutput: (data: string) => void;
  onStateChange: (state: TerminalConnectionState) => void;
  onExit: (exitCode: number | null, signal: string | null) => void;
  onToolStatus?: (tool: string, status: TerminalToolStatus) => void;
}

export interface ITerminalBackend {
  connect(opts: { cols: number; rows: number; cwd?: string; events: TerminalBackendEvents }): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  disconnect(): void;
  getState(): TerminalConnectionState;
  probeTool?(tool: string): Promise<TerminalToolStatus>;
}
