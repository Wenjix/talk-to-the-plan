import type {
  ITerminalBackend,
  TerminalBackendEvents,
  TerminalConnectionState,
} from './terminal-backend';
import type { TerminalToolStatus } from './terminal-tool-types';

interface PendingProbe {
  resolve: (status: TerminalToolStatus) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let probeIdCounter = 0;

/**
 * Terminal backend that connects to a PTY server over WebSocket.
 * Implements the same ITerminalBackend interface as LocalEchoBackend,
 * enabling seamless swapping via the terminal factory.
 */
export class WebSocketPtyBackend implements ITerminalBackend {
  private state: TerminalConnectionState = 'disconnected';
  private ws: WebSocket | null = null;
  private events: TerminalBackendEvents | null = null;
  private pendingProbes = new Map<string, PendingProbe>();
  private connectReject: ((err: Error) => void) | null = null;
  private url: string;

  constructor(url?: string) {
    this.url = url ?? `ws://${location.host}/ws/pty`;
  }

  async connect(opts: {
    cols: number;
    rows: number;
    cwd?: string;
    events: TerminalBackendEvents;
  }): Promise<void> {
    if (this.state === 'connecting' || this.state === 'ready') {
      throw new Error('Already connected or connecting');
    }

    this.events = opts.events;
    this.setState('connecting');

    return new Promise<void>((resolve, reject) => {
      this.connectReject = reject;
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.connectReject = null;
        ws.send(JSON.stringify({
          type: 'spawn',
          cols: opts.cols,
          rows: opts.rows,
          cwd: opts.cwd,
        }));
        this.setState('ready');
        resolve();
      };

      ws.onmessage = (event) => {
        if (this.ws === ws) {
          this.handleMessage(event);
        }
      };

      ws.onerror = () => {
        if (this.ws === ws) {
          this.connectReject = null;
          this.setState('error');
          reject(new Error('WebSocket connection failed'));
        }
        // If this.ws !== ws, disconnect() already rejected via connectReject
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          if (this.state !== 'error') {
            this.setState('disconnected');
          }
          this.ws = null;
        }
      };
    });
  }

  write(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'data', data }));
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  disconnect(): void {
    // Reject pending connect promise if still in progress
    if (this.connectReject) {
      this.connectReject(new Error('Disconnected'));
      this.connectReject = null;
    }

    // Clear all pending probes
    for (const [, pending] of this.pendingProbes) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingProbes.clear();

    if (this.ws) {
      // Null the ref BEFORE closing so onerror/onclose handlers
      // see a stale WS and don't fire state transitions
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
    this.setState('disconnected');
    this.events = null;
  }

  getState(): TerminalConnectionState {
    return this.state;
  }

  async probeTool(tool: string): Promise<TerminalToolStatus> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const probeId = `${tool}-${++probeIdCounter}`;

    return new Promise<TerminalToolStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProbes.delete(probeId);
        reject(new Error(`Probe timed out for tool: ${tool}`));
      }, 10_000);

      this.pendingProbes.set(probeId, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ type: 'probe', tool, probeId }));
    });
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private setState(state: TerminalConnectionState): void {
    this.state = state;
    this.events?.onStateChange(state);
  }

  private handleMessage(event: MessageEvent): void {
    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'data':
        this.events?.onOutput(msg.data as string);
        break;

      case 'exit':
        this.events?.onExit(
          (msg.exitCode as number | null) ?? null,
          (msg.signal as string | null) ?? null,
        );
        this.setState('disconnected');
        break;

      case 'probeResult': {
        const tool = msg.tool as string;
        const probeId = msg.probeId as string | undefined;
        const status = msg.status as TerminalToolStatus;

        // Resolve by probeId if present, fall back to tool name for backward compat
        const key = probeId ?? tool;
        const pending = this.pendingProbes.get(key);
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve(status);
          this.pendingProbes.delete(key);
        }
        this.events?.onToolStatus?.(tool, status);
        break;
      }

      case 'error':
        console.error('[PTY] Server error:', msg.message);
        this.setState('error');
        break;
    }
  }
}
