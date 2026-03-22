export class EigenSTTError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EigenSTTError';
    this.status = status;
  }
}

export class EigenTTSError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EigenTTSError';
    this.status = status;
  }
}

export const DEFAULT_VOICE = 'Linda';

const EIGEN_API_URL = 'https://api-web.eigenai.com/api/v1/generate';

export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const form = new FormData();
    form.append('model', 'higgs_asr_3');
    form.append(
      'file',
      new File([audioBlob], 'recording.webm', { type: audioBlob.type }),
    );
    form.append('language', 'English');

    const res = await fetch(EIGEN_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new EigenSTTError('Invalid Eigen AI API key', 401);
      }
      if (res.status === 429) {
        throw new EigenSTTError('Eigen AI rate limit exceeded — try again shortly', 429);
      }
      throw new EigenSTTError(`ASR request failed (${res.status})`, res.status);
    }

    const data: { text: string } = await res.json();
    return data.text;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new EigenSTTError('Transcription timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function textToSpeech(
  text: string,
  apiKey: string,
  voiceId?: string,
): Promise<Blob> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const form = new FormData();
    form.append('model', 'higgs2p5');
    form.append('text', text);
    form.append('voice', voiceId || DEFAULT_VOICE);
    form.append('stream', 'false');
    form.append(
      'sampling',
      JSON.stringify({ temperature: 0.85, top_p: 0.95, top_k: 50 }),
    );

    const res = await fetch(EIGEN_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new EigenTTSError('Invalid Eigen AI API key', 401);
      }
      if (res.status === 429) {
        throw new EigenTTSError('Eigen AI rate limit exceeded — try again shortly', 429);
      }
      throw new EigenTTSError(`TTS request failed (${res.status})`, res.status);
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new EigenTTSError('Speech synthesis timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
