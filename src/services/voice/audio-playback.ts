export class AudioPlayback {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private endCallback: (() => void) | null = null;
  private boundOnEnded: (() => void) | null = null;
  private boundOnError: (() => void) | null = null;

  async play(audioBlob: Blob): Promise<void> {
    this.stop();

    this.objectUrl = URL.createObjectURL(audioBlob);
    this.audio = new Audio(this.objectUrl);

    this.boundOnEnded = () => {
      const cb = this.endCallback;
      this.cleanup();
      cb?.();
    };
    this.boundOnError = () => {
      const cb = this.endCallback;
      this.cleanup();
      cb?.();
    };

    this.audio.addEventListener('ended', this.boundOnEnded);
    this.audio.addEventListener('error', this.boundOnError);

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
    if (this.audio) {
      if (this.boundOnEnded) this.audio.removeEventListener('ended', this.boundOnEnded);
      if (this.boundOnError) this.audio.removeEventListener('error', this.boundOnError);
    }
    this.boundOnEnded = null;
    this.boundOnError = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.audio = null;
  }
}

export const audioPlayback = new AudioPlayback();
