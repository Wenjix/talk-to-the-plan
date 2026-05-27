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
    try {
      const mimeType = getSupportedMimeType();
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start();
      this.startedAt = Date.now();
    } catch (err) {
      this.destroy();
      throw err;
    }
  }

  /** Stop recording and return the captured audio blob. */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }
      const currentRecorder = this.recorder;
      currentRecorder.onstop = () => {
        const mime = currentRecorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        this.chunks = [];
        resolve(blob);
      };
      currentRecorder.stop();
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

/**
 * Accumulates PCM audio into a single Float32Array buffer at 16kHz via
 * AudioWorklet, collecting all chunks for batch processing (e.g. chunkPcmBuffer).
 */
export class BufferedPCMRecorder {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Int16Array[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new MicPermissionError();
    }

    this.chunks = [];
    try {
      this.context = new AudioContext({ sampleRate: 16000 });
      await this.context.audioWorklet.addModule('/pcm-processor.js');

      this.source = this.context.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');

      this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        this.chunks.push(new Int16Array(e.data));
      };

      this.source.connect(this.workletNode);
      // Do NOT connect workletNode to destination — this is capture-only
      this.startedAt = Date.now();
    } catch (err) {
      this.releaseResources();
      throw err;
    }
  }

  stop(): Float32Array {
    let totalSamples = 0;
    for (const chunk of this.chunks) {
      totalSamples += chunk.length;
    }

    const buffer = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      for (let i = 0; i < chunk.length; i++) {
        buffer[offset++] = chunk[i] / 0x7fff;
      }
    }

    // Fully release mic, audio nodes, and AudioContext so stop() leaves the
    // recorder in a clean state without requiring a follow-up destroy() call.
    this.releaseResources();
    return buffer;
  }

  getElapsedMs(): number {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }

  destroy(): void {
    this.releaseResources();
  }

  private releaseResources(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
    }
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
    this.chunks = [];
    this.startedAt = 0;
  }
}
