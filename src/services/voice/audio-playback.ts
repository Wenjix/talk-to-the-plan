export class AudioPlayback {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private endCallback: (() => void) | null = null;

  async play(audioBlob: Blob): Promise<void> {
    this.stop();

    this.objectUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(this.objectUrl);

    this.audio.addEventListener('ended', () => {
      const cb = this.endCallback;
      this.cleanup();
      cb?.();
    });

    this.audio.addEventListener('error', () => {
      this.cleanup();
    });

    try {
      await this.audio.play();
    } catch (err) {
      this.cleanup();
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        throw new Error('Browser blocked audio playback -- user interaction is required first');
      }
      throw err;
    }
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
    }
    this.cleanup();
  }

  isPlaying(): boolean {
    return this.audio !== null && !this.audio.paused && !this.audio.ended;
  }

  onEnd(callback: (() => void) | null): void {
    this.endCallback = callback;
  }

  private cleanup(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.audio = null;
  }
}

export const audioPlayback = new AudioPlayback();
