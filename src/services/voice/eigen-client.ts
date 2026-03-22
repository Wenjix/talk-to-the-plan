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

const EIGEN_API_URL = '/api/eigen/api/v1/generate';

const log = (tag: string, ...args: unknown[]) =>
  console.log(`[Eigen:${tag}]`, ...args);
const warn = (tag: string, ...args: unknown[]) =>
  console.warn(`[Eigen:${tag}]`, ...args);

export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string,
  language: string = 'English',
): Promise<string> {
  log('ASR', `starting — blob size=${audioBlob.size} type=${audioBlob.type} lang=${language} keyLen=${apiKey.length}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    warn('ASR', '45s timeout reached — aborting');
    controller.abort();
  }, 45_000);

  try {
    const form = new FormData();
    form.append('model', 'higgs_asr_3');
    form.append(
      'file',
      new File([audioBlob], 'recording.webm', { type: audioBlob.type }),
    );
    form.append('language', language);

    log('ASR', `POST ${EIGEN_API_URL} model=higgs_asr_3`);
    const t0 = performance.now();

    const res = await fetch(EIGEN_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    const elapsed = Math.round(performance.now() - t0);
    log('ASR', `response status=${res.status} in ${elapsed}ms`);

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      warn('ASR', `error body: ${body}`);
      if (res.status === 401) {
        throw new EigenSTTError('Invalid Eigen AI API key', 401);
      }
      if (res.status === 429) {
        throw new EigenSTTError('Eigen AI rate limit exceeded — try again shortly', 429);
      }
      throw new EigenSTTError(`ASR request failed (${res.status})`, res.status);
    }

    const data = await res.json();
    log('ASR', 'raw response:', JSON.stringify(data).slice(0, 300));

    // Eigen higgs_asr_3 returns { transcription: "..." }
    const transcript: string | undefined = data.transcription ?? data.text;
    if (!transcript) {
      warn('ASR', `unexpected response shape — keys: ${Object.keys(data).join(', ')}`);
      throw new EigenSTTError(`ASR returned no transcript (keys: ${Object.keys(data).join(', ')})`);
    }

    log('ASR', `transcript (${transcript.length} chars): "${transcript.slice(0, 120)}"`);
    return transcript;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      warn('ASR', 'aborted (timeout)');
      throw new EigenSTTError('Transcription timed out');
    }
    if (!(err instanceof EigenSTTError)) {
      warn('ASR', `error: ${err instanceof Error ? err.message : err}`);
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
  const voice = voiceId || DEFAULT_VOICE;
  log('TTS', `starting — text=${text.length} chars, voice=${voice}, keyLen=${apiKey.length}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    warn('TTS', '45s timeout reached — aborting');
    controller.abort();
  }, 45_000);

  try {
    const form = new FormData();
    form.append('model', 'higgs2p5');
    form.append('text', text);
    form.append('voice', voice);
    form.append('stream', 'false');
    form.append(
      'sampling',
      JSON.stringify({ temperature: 0.85, top_p: 0.95, top_k: 50 }),
    );

    log('TTS', `POST ${EIGEN_API_URL} model=higgs2p5`);
    const t0 = performance.now();

    const res = await fetch(EIGEN_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    const elapsed = Math.round(performance.now() - t0);
    log('TTS', `response status=${res.status} contentType=${res.headers.get('content-type')} in ${elapsed}ms`);

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      warn('TTS', `error body: ${body}`);
      if (res.status === 401) {
        throw new EigenTTSError('Invalid Eigen AI API key', 401);
      }
      if (res.status === 429) {
        throw new EigenTTSError('Eigen AI rate limit exceeded — try again shortly', 429);
      }
      throw new EigenTTSError(`TTS request failed (${res.status})`, res.status);
    }

    const blob = await res.blob();
    log('TTS', `audio blob size=${blob.size} type=${blob.type}`);
    return blob;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      warn('TTS', 'aborted (timeout)');
      throw new EigenTTSError('Speech synthesis timed out');
    }
    warn('TTS', `error: ${err instanceof Error ? err.message : err}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
