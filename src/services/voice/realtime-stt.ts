export interface RealtimeSTTCallbacks {
  onPartialTranscript: (text: string) => void;
  onCommittedTranscript: (text: string) => void;
  onError: (error: string) => void;
  onSessionStarted: () => void;
}

type WSMessage =
  | { message_type: 'session_started' }
  | { message_type: 'transcript'; channel: { alternatives: { transcript: string }[] }; is_final: boolean }
  | { message_type: 'partial_transcript'; text: string }
  | { message_type: 'committed_transcript'; text: string }
  | { message_type: 'scribe_error'; message: string }
  | { message_type: 'scribe_auth_error'; message: string }
  | { message_type: 'scribe_rate_limited_error'; message: string };

/**
 * ElevenLabs Realtime WebSocket STT client.
 * Opens a WebSocket for streaming audio chunks and receiving live transcripts.
 */
export class RealtimeSTTClient {
  private ws: WebSocket | null = null;
  private committedText = '';
  private closed = false;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private apiKey: string,
    private callbacks: RealtimeSTTCallbacks,
  ) {}

  connect(): Promise<void> {
    this.closed = false;
    this.committedText = '';

    const params = new URLSearchParams({
      model_id: 'scribe_v2_realtime',
      language_code: 'en',
      sample_rate: '16000',
      encoding: 'pcm_s16le',
      token: this.apiKey,
    });

    const url = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`;

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);

      // Connection timeout: if session not started within 10s, treat as error
      this.connectTimeout = setTimeout(() => {
        const msg = 'WebSocket connection timed out';
        this.callbacks.onError(msg);
        this.close();
        reject(new Error(msg));
      }, 10_000);

      this.ws.onopen = () => {
        // Auth is handled via the token query param — no post-connection message needed
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data as string);
          if (msg.message_type === 'session_started') {
            if (this.connectTimeout) {
              clearTimeout(this.connectTimeout);
              this.connectTimeout = null;
            }
            this.callbacks.onSessionStarted();
            resolve();
          }
          this.handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onerror = () => {
        if (!this.closed) {
          const msg = 'WebSocket connection error';
          this.callbacks.onError(msg);
          reject(new Error(msg));
        }
      };

      this.ws.onclose = (event) => {
        if (this.connectTimeout) {
          clearTimeout(this.connectTimeout);
          this.connectTimeout = null;
        }
        if (!this.closed && event.code !== 1000) {
          const msg = `WebSocket closed unexpectedly (code ${event.code})`;
          this.callbacks.onError(msg);
          reject(new Error(msg));
        }
      };
    });
  }

  private handleMessage(msg: WSMessage): void {
    switch (msg.message_type) {
      case 'session_started':
        // Already handled in connect() promise resolution
        break;

      case 'partial_transcript':
        this.callbacks.onPartialTranscript(msg.text);
        break;

      case 'committed_transcript':
        this.committedText += (this.committedText ? ' ' : '') + msg.text;
        this.callbacks.onCommittedTranscript(this.committedText);
        break;

      // Some ElevenLabs WS implementations use a generic "transcript" message
      case 'transcript': {
        const alt = msg.channel?.alternatives?.[0];
        if (alt) {
          if (msg.is_final) {
            this.committedText += (this.committedText ? ' ' : '') + alt.transcript;
            this.callbacks.onCommittedTranscript(this.committedText);
          } else {
            this.callbacks.onPartialTranscript(alt.transcript);
          }
        }
        break;
      }

      case 'scribe_error':
      case 'scribe_auth_error':
      case 'scribe_rate_limited_error':
        this.callbacks.onError(msg.message || `STT error: ${msg.message_type}`);
        break;
    }
  }

  sendAudioChunk(pcmBase64: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        message_type: 'input_audio_chunk',
        audio_base_64: pcmBase64,
        sample_rate: 16000,
      }));
    }
  }

  commit(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ message_type: 'commit' }));
    }
  }

  getCommittedText(): string {
    return this.committedText;
  }

  close(): void {
    this.closed = true;
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000);
      }
      this.ws = null;
    }
  }
}
