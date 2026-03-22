export type VibeCommand = 'vibe' | 'mistral-vibe';
export type InstallScope = 'host' | 'container';
export type ToolReadinessState = 'ready' | 'install_required' | 'setup_required' | 'probing' | 'unknown';

export interface TerminalToolStatus {
  available: boolean;
  command: VibeCommand | null;
  version: string | null;
  installRequired: boolean;
  installScope: InstallScope | null;
  pythonVersion: string | null;
  uvAvailable: boolean;
  apiKeyConfigured: boolean;
  setupRequired: boolean;
  vibeHome: string | null;
  lastCheckedAt: string | null;
}

export interface TerminalToolingState {
  mistralVibe: TerminalToolStatus;
}

export function createDefaultToolStatus(): TerminalToolStatus {
  return {
    available: false,
    command: null,
    version: null,
    installRequired: true,
    installScope: null,
    pythonVersion: null,
    uvAvailable: false,
    apiKeyConfigured: false,
    setupRequired: false,
    vibeHome: null,
    lastCheckedAt: null,
  };
}

export function deriveReadinessState(status: TerminalToolStatus): ToolReadinessState {
  if (status.available && status.apiKeyConfigured) return 'ready';
  if (status.installRequired) return 'install_required';
  if (status.setupRequired || !status.apiKeyConfigured) return 'setup_required';
  return 'unknown';
}
