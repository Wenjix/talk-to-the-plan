import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTerminalStore } from '../../store/terminal-store';
import { useViewStore } from '../../store/view-store';
import {
  openTerminal,
  closeTerminal,
  toggleTerminal,
  endTerminalSession,
  probeVibeToolStatus,
  getActiveBackend,
  setActiveBackend,
} from '../../store/terminal-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the LocalEchoBackend's simulated connection delay (50ms) + margin */
function waitForConnect(): Promise<void> {
  return new Promise((r) => setTimeout(r, 80));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Terminal workflow integration', () => {
  beforeEach(() => {
    // Fully tear down any prior backend
    const backend = getActiveBackend();
    if (backend) {
      backend.disconnect();
      setActiveBackend(null);
    }
    useTerminalStore.getState().clear();
    useViewStore.getState().clear();
  });

  // -------------------------------------------------------------------------
  // 1. openTerminal creates backend, sets terminalOpen, transitions to ready
  // -------------------------------------------------------------------------
  it('openTerminal creates backend and transitions to ready', async () => {
    const backend = openTerminal(80, 24);

    // Terminal drawer should be open immediately
    expect(useViewStore.getState().terminalOpen).toBe(true);

    // Backend should exist
    expect(backend).toBeDefined();
    expect(getActiveBackend()).toBe(backend);

    // Session ID should be set
    expect(useTerminalStore.getState().terminalSessionId).not.toBeNull();

    // Wait for connect to complete (LocalEchoBackend has 50ms simulated delay)
    await waitForConnect();

    expect(useTerminalStore.getState().connectionState).toBe('ready');
  });

  // -------------------------------------------------------------------------
  // 2. endTerminalSession disconnects and clears state
  // -------------------------------------------------------------------------
  it('endTerminalSession disconnects and clears state', async () => {
    openTerminal(80, 24);
    await waitForConnect();

    expect(useTerminalStore.getState().connectionState).toBe('ready');

    endTerminalSession();

    expect(useTerminalStore.getState().connectionState).toBe('disconnected');
    expect(useTerminalStore.getState().terminalSessionId).toBeNull();
    expect(getActiveBackend()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. toggleTerminal opens when closed, closes when open
  // -------------------------------------------------------------------------
  it('toggleTerminal opens when closed and closes when open', () => {
    // Initially closed
    expect(useViewStore.getState().terminalOpen).toBe(false);

    // Toggle open — only sets terminalOpen, does NOT create backend
    toggleTerminal();
    expect(useViewStore.getState().terminalOpen).toBe(true);

    // Toggle closed
    toggleTerminal();
    expect(useViewStore.getState().terminalOpen).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. probeVibeToolStatus sets tooling state in store
  // -------------------------------------------------------------------------
  it('probeVibeToolStatus sets tool status in store', async () => {
    openTerminal(80, 24);
    await waitForConnect();

    const status = await probeVibeToolStatus();

    // Status should be returned
    expect(status).toBeDefined();
    expect(status.installRequired).toBe(true);
    expect(status.lastCheckedAt).toBeDefined();

    // Store should reflect the probed status
    const { tooling } = useTerminalStore.getState();
    expect(tooling.mistralVibe.installRequired).toBe(true);
    expect(tooling.mistralVibe.lastCheckedAt).toBeDefined();

    // Probe should no longer be in progress
    expect(useTerminalStore.getState().toolProbeInProgress).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 5. openTerminal reuses existing ready backend
  // -------------------------------------------------------------------------
  it('openTerminal reuses existing ready backend', async () => {
    const backend1 = openTerminal(80, 24);
    await waitForConnect();

    expect(useTerminalStore.getState().connectionState).toBe('ready');

    // Call openTerminal again — should return the same backend
    const backend2 = openTerminal(80, 24);
    expect(backend2).toBe(backend1);
  });

  // -------------------------------------------------------------------------
  // 6. Session restart via endTerminalSession + openTerminal
  // -------------------------------------------------------------------------
  it('session restart produces clean state transition', async () => {
    // Open and connect
    const backend1 = openTerminal(80, 24);
    await waitForConnect();
    const sessionId1 = useTerminalStore.getState().terminalSessionId;

    // End session
    endTerminalSession();
    expect(useTerminalStore.getState().connectionState).toBe('disconnected');
    expect(getActiveBackend()).toBeNull();

    // Reopen — should get a new backend with a new session ID
    const backend2 = openTerminal(80, 24);
    await waitForConnect();

    expect(backend2).not.toBe(backend1);
    expect(useTerminalStore.getState().connectionState).toBe('ready');
    expect(useTerminalStore.getState().terminalSessionId).not.toBe(sessionId1);
    expect(useTerminalStore.getState().terminalSessionId).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 7. probeVibeToolStatus surfaces error in store
  // -------------------------------------------------------------------------
  it('probeVibeToolStatus surfaces error in store on failure', async () => {
    // No backend is active — probe should still work via fallback path
    // But let's test with a backend that throws
    const failingBackend = {
      connect: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      disconnect: vi.fn(),
      getState: vi.fn().mockReturnValue('ready' as const),
      probeTool: vi.fn().mockRejectedValue(new Error('probe failed')),
    };

    setActiveBackend(failingBackend);
    useTerminalStore.getState().setConnectionState('ready');

    await expect(probeVibeToolStatus()).rejects.toThrow('probe failed');

    expect(useTerminalStore.getState().errorMessage).toBe('probe failed');
    expect(useTerminalStore.getState().toolProbeInProgress).toBe(false);
  });
});
