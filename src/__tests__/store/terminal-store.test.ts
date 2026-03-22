import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from '../../store/terminal-store';

describe('terminal-store', () => {
  beforeEach(() => {
    useTerminalStore.getState().clear();
  });

  it('has correct initial state', () => {
    const state = useTerminalStore.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.terminalSessionId).toBeNull();
    expect(state.lastExit).toBeNull();
    expect(state.errorMessage).toBeNull();
  });

  it('setConnectionState updates connectionState', () => {
    useTerminalStore.getState().setConnectionState('connecting');
    expect(useTerminalStore.getState().connectionState).toBe('connecting');

    useTerminalStore.getState().setConnectionState('ready');
    expect(useTerminalStore.getState().connectionState).toBe('ready');
  });

  it('setTerminalSessionId sets session id', () => {
    useTerminalStore.getState().setTerminalSessionId('test-session-1');
    expect(useTerminalStore.getState().terminalSessionId).toBe('test-session-1');
  });

  it('setLastExit records exit info', () => {
    useTerminalStore.getState().setLastExit({ exitCode: 0, signal: null });
    expect(useTerminalStore.getState().lastExit).toEqual({ exitCode: 0, signal: null });
  });

  it('setErrorMessage sets and clears error', () => {
    useTerminalStore.getState().setErrorMessage('connection failed');
    expect(useTerminalStore.getState().errorMessage).toBe('connection failed');

    useTerminalStore.getState().setErrorMessage(null);
    expect(useTerminalStore.getState().errorMessage).toBeNull();
  });

  it('clear() resets all fields', () => {
    useTerminalStore.getState().setConnectionState('ready');
    useTerminalStore.getState().setTerminalSessionId('session-abc');
    useTerminalStore.getState().setLastExit({ exitCode: 1, signal: 'SIGTERM' });
    useTerminalStore.getState().setErrorMessage('some error');

    useTerminalStore.getState().clear();

    const state = useTerminalStore.getState();
    expect(state.connectionState).toBe('disconnected');
    expect(state.terminalSessionId).toBeNull();
    expect(state.lastExit).toBeNull();
    expect(state.errorMessage).toBeNull();
  });
});
