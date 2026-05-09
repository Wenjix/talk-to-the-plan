import { MicPermissionError } from './media-recorder';
import { CARTESIA_VERSION, CartesiaAuthError, mintStreamingStttToken } from './cartesia-client';

export type TranscriberEventType =
  | 'interim'
  | 'final'
  | 'open'
  | 'close'
  | 'reconnecting'
  | 'fatal'
  | 'warn';

export interface TranscriberEvent {
  type: TranscriberEventType;
  text?: string;
  startMs?: number;
  endMs?: number;
  error?: string;
}

export interface StreamingTranscriberOptions {
  apiKey: string;
  language?: 'English' | 'Chinese';
  maxSilenceSec?: number;
  onEvent: (event: TranscriberEvent) => void;
}

const SAMPLE_RATE = 16000;
const CARTESIA_WS_BASE = 'wss://api.cartesia.ai/stt/websocket';
const MAX_RECONNECT_DELAY_MS = 8000;
const MAX_RECONNECT_ATTEMPTS = 6;

function buildWsUrl(language: 'English' | 'Chinese', token: string, maxSilenceSec: number): string {
  const params = new URLSearchParams({
    model: 'ink-whisper',
    language: language === 'Chinese' ? 'zh' : 'en',
    encoding: 'pcm_s16le',
    sample_rate: String(SAMPLE_RATE),
    cartesia_version: CARTESIA_VERSION,
    max_silence_duration_secs: String(maxSilenceSec),
    access_token: token,
  });
  return `${CARTESIA_WS_BASE}?${params.toString()}`;
}

// Close codes we treat as authentication / authorization failures.
const AUTH_CLOSE_CODES = new Set([1008, 4001, 4003, 4401]);

/**
 * Streams mic audio to Cartesia Ink-Whisper via WebSocket.
 * Emits transcript events. Reconnects on transient errors up to a ceiling.
 * Differentiates transient warn events from fatal ones that stop the session.
 */
export class StreamingTranscriber {
  private apiKey: string;
  private language: 'English' | 'Chinese';
  private maxSilenceSec: number;
  private onEvent: (event: TranscriberEvent) => void;

  private ws: WebSocket | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;

  private cachedToken: string | null = null;
  private cachedTokenExpiresAt = 0;
  private reconnectAttempt = 0;
  private stopped = false;
  private hasEverConnected = false;
  private startedAt = 0;

  constructor(options: StreamingTranscriberOptions) {
    this.apiKey = options.apiKey;
    this.language = options.language ?? 'English';
    this.maxSilenceSec = options.maxSilenceSec ?? 1.0;
    this.onEvent = options.onEvent;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.startedAt = Date.now();
    this.hasEverConnected = false;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new MicPermissionError();
    }

    try {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      await this.context.audioWorklet.addModule('/pcm-processor.js');
      this.source = this.context.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');

      this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(e.data);
      };

      this.source.connect(this.workletNode);
      // Do NOT connect workletNode to destination — this is capture-only;
      // connecting to destination would play mic audio through speakers.

      await this.openSocket();
    } catch (err) {
      this.releaseMedia();
      throw err;
    }
  }

  stop(): void {
    this.stopped = true;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send('done');
      } catch {
        // ignore
      }
    }
    this.ws?.close();
    this.ws = null;

    this.releaseMedia();
  }

  isRunning(): boolean {
    return !this.stopped && this.ws !== null;
  }

  private releaseMedia(): void {
    this.workletNode?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.source = null;
    this.workletNode = null;
    this.stream = null;
  }

  private async ensureToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedTokenExpiresAt) {
      return this.cachedToken;
    }
    const minted = await mintStreamingStttToken(this.apiKey);
    this.cachedToken = minted.token;
    this.cachedTokenExpiresAt = minted.expiresAt;
    return minted.token;
  }

  private invalidateToken(): void {
    this.cachedToken = null;
    this.cachedTokenExpiresAt = 0;
  }

  private async openSocket(): Promise<void> {
    if (this.stopped) return;

    let token: string;
    try {
      token = await this.ensureToken();
    } catch (err) {
      this.stopped = true;
      const isAuth = err instanceof CartesiaAuthError;
      this.onEvent({
        type: 'fatal',
        error: err instanceof Error ? err.message : 'Token mint failed',
      });
      if (isAuth) this.invalidateToken();
      this.releaseMedia();
      return;
    }

    const url = buildWsUrl(this.language, token, this.maxSilenceSec);
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.hasEverConnected = true;
      this.onEvent({ type: 'open' });
    };

    ws.onmessage = (event) => this.handleMessage(event);

    ws.onerror = () => {
      this.onEvent({ type: 'warn', error: 'WebSocket error' });
    };

    ws.onclose = (event) => {
      this.ws = null;
      this.onEvent({ type: 'close', error: event.reason || undefined });

      if (this.stopped) return;

      if (AUTH_CLOSE_CODES.has(event.code)) {
        this.invalidateToken();
      }

      // Immediate close-on-connect (never opened): fatal — do not spin.
      if (!this.hasEverConnected) {
        this.stopped = true;
        this.onEvent({
          type: 'fatal',
          error: `Could not connect to Cartesia (code ${event.code})`,
        });
        this.releaseMedia();
        return;
      }

      this.scheduleReconnect();
    };
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }

    const msg = parsed as {
      type?: string;
      is_final?: boolean;
      text?: string;
      duration?: number;
      words?: Array<{ start?: number; end?: number }>;
    };

    if (msg.type === 'transcript') {
      const text = msg.text ?? '';
      if (!text) return;

      const firstWord = msg.words?.[0];
      const lastWord = msg.words?.[msg.words.length - 1];
      const startMs = firstWord?.start != null
        ? Math.round(firstWord.start * 1000)
        : undefined;
      const endMs = lastWord?.end != null
        ? Math.round(lastWord.end * 1000)
        : (msg.duration != null ? Math.round(msg.duration * 1000) : undefined);

      this.onEvent({
        type: msg.is_final ? 'final' : 'interim',
        text,
        startMs,
        endMs,
      });
      return;
    }

    if (msg.type === 'error') {
      const errMsg = msg as { message?: string };
      this.onEvent({ type: 'warn', error: errMsg.message ?? 'Cartesia error' });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      this.stopped = true;
      this.onEvent({
        type: 'fatal',
        error: `Reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`,
      });
      this.releaseMedia();
      return;
    }

    this.reconnectAttempt += 1;
    const delay = Math.min(500 * 2 ** (this.reconnectAttempt - 1), MAX_RECONNECT_DELAY_MS);
    this.onEvent({ type: 'reconnecting', error: `attempt ${this.reconnectAttempt}` });
    window.setTimeout(() => {
      if (this.stopped) return;
      void this.openSocket();
    }, delay);
  }

  getElapsedMs(): number {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }
}
