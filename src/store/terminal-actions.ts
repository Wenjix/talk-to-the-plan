import type { ITerminalBackend, TerminalBackendEvents } from '../services/terminal-backend';
import type { TerminalToolStatus } from '../services/terminal-tool-types';
import { createDefaultToolStatus } from '../services/terminal-tool-types';
import { createTerminalBackend } from '../services/terminal-factory';
import { useTerminalStore } from './terminal-store';
import { useViewStore } from './view-store';
import { useSemanticStore } from './semantic-store';
import { generateId } from '../utils/ids';

// Module-level backend reference (not in Zustand — avoids serialization)
let activeBackend: ITerminalBackend | null = null;

export function getActiveBackend(): ITerminalBackend | null {
  return activeBackend;
}

export function setActiveBackend(backend: ITerminalBackend | null): void {
  activeBackend = backend;
}

/**
 * Prepare the terminal drawer for opening. Creates a fresh backend and session
 * but does NOT connect — the caller provides events and connects.
 * Always creates a fresh backend so the caller can wire its own events.
 */
export function prepareTerminal(): ITerminalBackend {
  useViewStore.getState().setTerminalOpen(true);

  // Always clean up any existing backend so the caller
  // can connect with its own events (e.g. xterm output wiring)
  if (activeBackend) {
    activeBackend.disconnect();
    activeBackend = null;
  }

  const backend = createTerminalBackend();
  activeBackend = backend;

  const sessionId = generateId();
  useTerminalStore.getState().setTerminalSessionId(sessionId);

  return backend;
}

/**
 * Open the terminal drawer with default event wiring.
 * For components that need custom events (e.g. TerminalDrawer with xterm),
 * use prepareTerminal() + backend.connect() directly instead.
 */
export function openTerminal(cols: number, rows: number, events?: TerminalBackendEvents): ITerminalBackend {
  // If already connected, return existing backend (idempotent)
  if (activeBackend && useTerminalStore.getState().connectionState === 'ready') {
    return activeBackend;
  }

  const backend = prepareTerminal();

  backend.connect({
    cols,
    rows,
    events: events ?? {
      onOutput: () => {},
      onStateChange: (state) => {
        useTerminalStore.getState().setConnectionState(state);
      },
      onExit: (exitCode, signal) => {
        useTerminalStore.getState().setLastExit({ exitCode, signal });
        useTerminalStore.getState().setConnectionState('disconnected');
        activeBackend = null;
      },
    },
  });

  return backend;
}

/**
 * Close/collapse the terminal drawer. Does NOT kill the running process.
 */
export function closeTerminal(): void {
  useViewStore.getState().setTerminalOpen(false);
}

/**
 * Toggle terminal open/closed.
 * Does NOT create or connect a backend — TerminalDrawer handles that.
 */
export function toggleTerminal(): void {
  const { terminalOpen } = useViewStore.getState();
  if (terminalOpen) {
    closeTerminal();
  } else {
    useViewStore.getState().setTerminalOpen(true);
  }
}

/**
 * End the terminal session — disconnects backend and clears state.
 */
export function endTerminalSession(): void {
  if (activeBackend) {
    activeBackend.disconnect();
    activeBackend = null;
  }
  useTerminalStore.getState().clear();
}

/**
 * Send a node's content to Mistral Vibe in the terminal.
 */
export function sendNodeToVibe(nodeId: string): void {
  const node = useSemanticStore.getState().getNode(nodeId);
  if (!node?.answer) return;

  const lines = [
    node.question, '',
    node.answer.summary,
    ...node.answer.bullets.map(b => `- ${b}`),
  ];
  const content = lines.join('\n');

  useViewStore.getState().setTerminalOpen(true);

  const backend = getActiveBackend();
  if (backend?.getState() === 'ready') {
    writeVibeCommand(backend, content);
  } else {
    const unsub = useTerminalStore.subscribe((state) => {
      if (state.connectionState === 'ready') {
        unsub();
        const b = getActiveBackend();
        if (b) writeVibeCommand(b, content);
      }
    });
  }
}

function writeVibeCommand(backend: ITerminalBackend, content: string): void {
  const escaped = content.replace(/'/g, "'\\''");
  backend.write(`echo '${escaped}' | vibe\r`);
}

/**
 * Probe Mistral Vibe tool status via the active backend.
 * Falls back to a simulated "not available" status in local-echo mode.
 */
export async function probeVibeToolStatus(): Promise<TerminalToolStatus> {
  const backend = getActiveBackend();
  const store = useTerminalStore.getState();

  store.setToolProbeInProgress(true);

  try {
    let status: TerminalToolStatus;

    if (backend?.probeTool) {
      status = await backend.probeTool('vibe');
    } else {
      // Frontend-only mode: no real shell, report install_required
      status = createDefaultToolStatus();
      status.installRequired = true;
      status.installScope = 'host';
      status.lastCheckedAt = new Date().toISOString();
    }

    store.setToolStatus('mistralVibe', status);
    return status;
  } catch (err) {
    useTerminalStore.getState().setErrorMessage(
      err instanceof Error ? err.message : 'Vibe tool probe failed',
    );
    throw err;
  } finally {
    useTerminalStore.getState().setToolProbeInProgress(false);
  }
}
