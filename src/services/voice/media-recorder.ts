export class MicPermissionError extends Error {
  constructor() {
    super('Microphone permission denied');
    this.name = 'MicPermissionError';
  }
}

/** Pick a mime type the browser supports for MediaRecorder. */
export function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return ''; // browser default
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Captures raw PCM 16-bit audio at 16kHz for streaming to WebSocket STT.
 * Uses AudioContext + AudioWorkletNode for off-main-thread processing.
 */
export class PCMRecorder {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private onChunk: ((pcmBase64: string) => void) | null = null;
  private startedAt = 0;

  async start(onChunk: (pcmBase64: string) => void): Promise<void> {
    this.onChunk = onChunk;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new MicPermissionError();
    }

    this.context = new AudioContext({ sampleRate: 16000 });
    await this.context.audioWorklet.addModule('/pcm-processor.js');

    this.source = this.context.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');

    this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      const base64 = arrayBufferToBase64(e.data);
      this.onChunk?.(base64);
    };

    this.source.connect(this.workletNode);
    this.workletNode.connect(this.context.destination);
    this.startedAt = Date.now();
  }

  getElapsedMs(): number {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.source?.disconnect();
    this.onChunk = null;
  }

  destroy(): void {
    this.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.context?.state !== 'closed') {
      this.context?.close().catch(() => {});
    }
    this.context = null;
    this.source = null;
    this.workletNode = null;
    this.stream = null;
    this.startedAt = 0;
  }
}

export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  /** Start mic capture. Throws MicPermissionError on denial. */
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new MicPermissionError();
    }

    this.chunks = [];
    const mimeType = getSupportedMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
    this.startedAt = Date.now();
  }

  /** Stop recording and return the captured audio blob. */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }
      this.recorder.onstop = () => {
        const mime = this.recorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        this.chunks = [];
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  getElapsedMs(): number {
    if (!this.startedAt || !this.isRecording()) return 0;
    return Date.now() - this.startedAt;
  }

  /** Release the mic stream. Call this when done. */
  destroy(): void {
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
  }
}
