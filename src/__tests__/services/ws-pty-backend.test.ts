import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebSocketPtyBackend } from '../../services/ws-pty-backend';
import type { TerminalBackendEvents, TerminalConnectionState } from '../../services/terminal-backend';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

// Track all constructed MockWebSocket instances
let mockWsInstances: MockWebSocket[] = [];
let lastMockWs: MockWebSocket | null = null;

// Install mock WebSocket globally
const OriginalWebSocket = globalThis.WebSocket;
beforeEach(() => {
  lastMockWs = null;
  mockWsInstances = [];
  (globalThis as unknown as Record<string, unknown>).WebSocket = class extends MockWebSocket {
    constructor() {
      super();
      lastMockWs = this;
      mockWsInstances.push(this);
    }
  };
  // Copy static constants
  Object.assign(globalThis.WebSocket, {
    CONNECTING: MockWebSocket.CONNECTING,
    OPEN: MockWebSocket.OPEN,
    CLOSING: MockWebSocket.CLOSING,
    CLOSED: MockWebSocket.CLOSED,
  });
});

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function createMockEvents() {
  const output: string[] = [];
  const states: TerminalConnectionState[] = [];
  const exits: Array<{ exitCode: number | null; signal: string | null }> = [];
  const toolStatuses: Array<{ tool: string; status: unknown }> = [];

  const events: TerminalBackendEvents = {
    onOutput: (data) => output.push(data),
    onStateChange: (state) => states.push(state),
    onExit: (exitCode, signal) => exits.push({ exitCode, signal }),
    onToolStatus: (tool, status) => toolStatuses.push({ tool, status }),
  };

  return { events, output, states, exits, toolStatuses };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketPtyBackend', () => {
  let backend: WebSocketPtyBackend;
  let mocks: ReturnType<typeof createMockEvents>;

  beforeEach(() => {
    backend = new WebSocketPtyBackend('ws://localhost:3001/ws/pty');
    mocks = createMockEvents();
  });

  it('starts in disconnected state', () => {
    expect(backend.getState()).toBe('disconnected');
  });

  it('transitions through connecting → ready on successful connect', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });

    // Should be connecting immediately
    expect(mocks.states).toContain('connecting');

    // Simulate WebSocket open
    lastMockWs!.simulateOpen();
    await connectPromise;

    expect(backend.getState()).toBe('ready');
    expect(mocks.states).toEqual(['connecting', 'ready']);
  });

  it('sends spawn message on connect', async () => {
    const connectPromise = backend.connect({ cols: 120, rows: 40, cwd: '/tmp', events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    const sent = JSON.parse(lastMockWs!.sent[0]);
    expect(sent).toEqual({ type: 'spawn', cols: 120, rows: 40, cwd: '/tmp' });
  });

  it('transitions to error on WebSocket error', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateError();

    await expect(connectPromise).rejects.toThrow('WebSocket connection failed');
    expect(backend.getState()).toBe('error');
  });

  it('sends data message on write', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    backend.write('ls -la\r');

    const sent = JSON.parse(lastMockWs!.sent[1]); // [0] is spawn
    expect(sent).toEqual({ type: 'data', data: 'ls -la\r' });
  });

  it('ignores write when disconnected', () => {
    // Should not throw
    backend.write('hello');
    expect(lastMockWs).toBeNull();
  });

  it('sends resize message', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    backend.resize(120, 40);

    const sent = JSON.parse(lastMockWs!.sent[1]);
    expect(sent).toEqual({ type: 'resize', cols: 120, rows: 40 });
  });

  it('dispatches data messages to onOutput', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    lastMockWs!.simulateMessage({ type: 'data', data: 'hello world\r\n' });

    expect(mocks.output).toEqual(['hello world\r\n']);
  });

  it('dispatches exit messages and transitions to disconnected', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    lastMockWs!.simulateMessage({ type: 'exit', exitCode: 0, signal: null });

    expect(mocks.exits).toEqual([{ exitCode: 0, signal: null }]);
    expect(backend.getState()).toBe('disconnected');
  });

  it('disconnect closes WebSocket and transitions to disconnected', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    backend.disconnect();

    expect(backend.getState()).toBe('disconnected');
  });

  it('rejects double-connect when already connected', async () => {
    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    await expect(
      backend.connect({ cols: 80, rows: 24, events: mocks.events }),
    ).rejects.toThrow('Already connected or connecting');
  });

  it('rejects double-connect when connecting', async () => {
    // First connect (not yet open)
    backend.connect({ cols: 80, rows: 24, events: mocks.events }).catch(() => {});

    await expect(
      backend.connect({ cols: 80, rows: 24, events: mocks.events }),
    ).rejects.toThrow('Already connected or connecting');
  });

  it('stale onclose from old WebSocket does not affect new connection', async () => {
    // First connect + error
    const connectPromise1 = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    const firstWs = lastMockWs!;
    firstWs.simulateError();
    await expect(connectPromise1).rejects.toThrow();

    // State is now 'error', disconnect to reset
    backend.disconnect();
    expect(backend.getState()).toBe('disconnected');

    // Second connect
    const connectPromise2 = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    const secondWs = lastMockWs!;
    secondWs.simulateOpen();
    await connectPromise2;

    expect(backend.getState()).toBe('ready');

    // Old WebSocket fires onclose — should NOT affect the new connection
    firstWs.onclose?.();

    expect(backend.getState()).toBe('ready'); // still ready, not disconnected
  });

  it('transitions to error on server error message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
    lastMockWs!.simulateOpen();
    await connectPromise;

    lastMockWs!.simulateMessage({ type: 'error', message: 'PTY already spawned' });

    expect(backend.getState()).toBe('error');
    expect(mocks.states).toContain('error');
    expect(consoleSpy).toHaveBeenCalledWith('[PTY] Server error:', 'PTY already spawned');

    consoleSpy.mockRestore();
  });

  describe('probeTool', () => {
    it('sends probe message with probeId and resolves on probeResult', async () => {
      const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
      lastMockWs!.simulateOpen();
      await connectPromise;

      const probePromise = backend.probeTool('vibe');

      // Verify probe message was sent with a probeId
      const sent = JSON.parse(lastMockWs!.sent[1]);
      expect(sent.type).toBe('probe');
      expect(sent.tool).toBe('vibe');
      expect(sent.probeId).toBeDefined();

      // Simulate server response echoing probeId
      const mockStatus = {
        available: true,
        command: 'vibe',
        version: '1.0.0',
        installRequired: false,
        installScope: null,
        pythonVersion: '3.11.0',
        uvAvailable: true,
        apiKeyConfigured: true,
        setupRequired: false,
        vibeHome: '/home/user/.vibe',
        lastCheckedAt: '2026-03-01T00:00:00.000Z',
      };
      lastMockWs!.simulateMessage({
        type: 'probeResult',
        tool: 'vibe',
        probeId: sent.probeId,
        status: mockStatus,
      });

      const result = await probePromise;
      expect(result).toEqual(mockStatus);
      expect(mocks.toolStatuses).toHaveLength(1);
      expect(mocks.toolStatuses[0].tool).toBe('vibe');
    });

    it('handles concurrent probes for the same tool independently', async () => {
      const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
      lastMockWs!.simulateOpen();
      await connectPromise;

      const probe1 = backend.probeTool('vibe');
      const probe2 = backend.probeTool('vibe');

      // Two probe messages should have been sent with different probeIds
      const sent1 = JSON.parse(lastMockWs!.sent[1]);
      const sent2 = JSON.parse(lastMockWs!.sent[2]);
      expect(sent1.probeId).not.toBe(sent2.probeId);

      const status1 = { available: true, command: 'vibe', version: '1.0', installRequired: false, installScope: null, pythonVersion: null, uvAvailable: false, apiKeyConfigured: true, setupRequired: false, vibeHome: null, lastCheckedAt: null };
      const status2 = { ...status1, version: '2.0' };

      // Resolve them in reverse order
      lastMockWs!.simulateMessage({ type: 'probeResult', tool: 'vibe', probeId: sent2.probeId, status: status2 });
      lastMockWs!.simulateMessage({ type: 'probeResult', tool: 'vibe', probeId: sent1.probeId, status: status1 });

      expect(await probe1).toEqual(status1);
      expect(await probe2).toEqual(status2);
    });

    it('rejects on timeout', async () => {
      vi.useFakeTimers();

      const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
      lastMockWs!.simulateOpen();
      await connectPromise;

      const probePromise = backend.probeTool('vibe');

      // Advance past timeout
      vi.advanceTimersByTime(10_001);

      await expect(probePromise).rejects.toThrow('Probe timed out for tool: vibe');

      vi.useRealTimers();
    });

    it('rejects when not connected', async () => {
      await expect(backend.probeTool('vibe')).rejects.toThrow('Not connected');
    });

    it('rejects pending probes and clears timers on disconnect', async () => {
      vi.useFakeTimers();

      const connectPromise = backend.connect({ cols: 80, rows: 24, events: mocks.events });
      lastMockWs!.simulateOpen();
      await connectPromise;

      const probePromise = backend.probeTool('vibe');
      backend.disconnect();

      await expect(probePromise).rejects.toThrow('Disconnected');

      // Advancing timers should not cause any additional rejections
      // (timer was cleared on disconnect)
      vi.advanceTimersByTime(15_000);

      vi.useRealTimers();
    });
  });
});
