import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from '../../store/terminal-store';
import { createDefaultToolStatus } from '../../services/terminal-tool-types';
import type { TerminalToolStatus } from '../../services/terminal-tool-types';

describe('terminal-store tooling state', () => {
  beforeEach(() => {
    useTerminalStore.getState().clear();
  });

  it('initial tooling state has default (unknown) status', () => {
    const { tooling } = useTerminalStore.getState();
    expect(tooling.mistralVibe.available).toBe(false);
    expect(tooling.mistralVibe.command).toBeNull();
    expect(tooling.mistralVibe.installRequired).toBe(true);
    expect(tooling.mistralVibe.apiKeyConfigured).toBe(false);
  });

  it('setToolStatus updates the specific tool', () => {
    const readyStatus: TerminalToolStatus = {
      ...createDefaultToolStatus(),
      available: true,
      command: 'vibe',
      version: '1.2.3',
      installRequired: false,
      apiKeyConfigured: true,
      lastCheckedAt: new Date().toISOString(),
    };

    useTerminalStore.getState().setToolStatus('mistralVibe', readyStatus);

    const { tooling } = useTerminalStore.getState();
    expect(tooling.mistralVibe.available).toBe(true);
    expect(tooling.mistralVibe.command).toBe('vibe');
    expect(tooling.mistralVibe.version).toBe('1.2.3');
    expect(tooling.mistralVibe.apiKeyConfigured).toBe(true);
  });

  it('setToolProbeInProgress toggles the flag', () => {
    expect(useTerminalStore.getState().toolProbeInProgress).toBe(false);

    useTerminalStore.getState().setToolProbeInProgress(true);
    expect(useTerminalStore.getState().toolProbeInProgress).toBe(true);

    useTerminalStore.getState().setToolProbeInProgress(false);
    expect(useTerminalStore.getState().toolProbeInProgress).toBe(false);
  });

  it('clear() resets tooling to defaults', () => {
    const readyStatus: TerminalToolStatus = {
      ...createDefaultToolStatus(),
      available: true,
      command: 'vibe',
      version: '1.0.0',
      installRequired: false,
      apiKeyConfigured: true,
    };

    useTerminalStore.getState().setToolStatus('mistralVibe', readyStatus);
    useTerminalStore.getState().setToolProbeInProgress(true);

    useTerminalStore.getState().clear();

    const state = useTerminalStore.getState();
    expect(state.tooling.mistralVibe.available).toBe(false);
    expect(state.tooling.mistralVibe.command).toBeNull();
    expect(state.tooling.mistralVibe.installRequired).toBe(true);
    expect(state.toolProbeInProgress).toBe(false);
  });
});
