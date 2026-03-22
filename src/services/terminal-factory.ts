import type { ITerminalBackend } from './terminal-backend';
import { LocalEchoBackend } from './local-echo-backend';
import { WebSocketPtyBackend } from './ws-pty-backend';

export type TerminalRuntimeMode = 'local' | 'container' | 'host';

export interface TerminalFactoryConfig {
  runtimeMode: TerminalRuntimeMode;
  vibeBin: 'auto' | 'vibe' | 'mistral-vibe';
  vibeHome: string;
}

function runtimeModeFromEnv(): TerminalRuntimeMode {
  try {
    // In test mode, always default to 'local' to avoid real WebSocket connections
    if (import.meta.env?.MODE === 'test') return 'local';
    const mode = import.meta.env?.VITE_TERMINAL_MODE;
    if (mode === 'host' || mode === 'container' || mode === 'local') return mode;
  } catch { /* env not available */ }
  return 'local';
}

const DEFAULT_CONFIG: TerminalFactoryConfig = {
  runtimeMode: runtimeModeFromEnv(),
  vibeBin: 'auto',
  vibeHome: '/home/parallax/.vibe',
};

/**
 * Factory for creating terminal backends.
 * Uses VITE_TERMINAL_MODE env var to select the default runtime mode.
 * Set VITE_TERMINAL_MODE=host to use real PTY via WebSocket backend.
 */
export function createTerminalBackend(
  config: Partial<TerminalFactoryConfig> = {},
): ITerminalBackend {
  const resolved = { ...DEFAULT_CONFIG, ...config };

  switch (resolved.runtimeMode) {
    case 'host':
      return new WebSocketPtyBackend();
    case 'container':
      // Future: return new ContainerPtyBackend(resolved)
      return new LocalEchoBackend();
    case 'local':
    default:
      return new LocalEchoBackend();
  }
}
