export class ElevenLabsSTTError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ElevenLabsSTTError';
    this.status = status;
  }
}

export class ElevenLabsTTSError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ElevenLabsTTSError';
    this.status = status;
  }
}

/**
 * Transcribe audio using ElevenLabs Speech-to-Text API.
 * Returns the transcript text.
 */
export async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<string> {
  if (!audioBlob || audioBlob.size === 0) {
    throw new ElevenLabsSTTError('No audio recorded');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    form.append('model_id', 'scribe_v1');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody?.detail?.message ?? errBody?.detail ?? JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => '');
      }
      if (res.status === 401) throw new ElevenLabsSTTError('Invalid ElevenLabs API key', 401);
      if (res.status === 429) throw new ElevenLabsSTTError('Rate limit exceeded, try again shortly', 429);
      throw new ElevenLabsSTTError(`ElevenLabs STT error (${res.status}): ${detail}`, res.status);
    }

    const data: { text: string } = await res.json();
    if (!data.text?.trim()) throw new ElevenLabsSTTError('Empty transcription returned');
    return data.text.trim();
  } catch (err) {
    if (err instanceof ElevenLabsSTTError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ElevenLabsSTTError('Transcription request timed out');
    }
    throw new ElevenLabsSTTError('Network error, check your connection');
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel

/**
 * Convert text to speech using ElevenLabs Text-to-Speech API.
 * Returns an audio/mpeg Blob.
 */
export async function textToSpeech(
  text: string,
  apiKey: string,
  voiceId?: string,
): Promise<Blob> {
  const voice = voiceId || DEFAULT_VOICE_ID;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody?.detail?.message ?? errBody?.detail ?? JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => '');
      }
      if (res.status === 401) throw new ElevenLabsTTSError('Invalid ElevenLabs API key', 401);
      if (res.status === 429) throw new ElevenLabsTTSError('Rate limit exceeded, try again shortly', 429);
      throw new ElevenLabsTTSError(`ElevenLabs TTS error (${res.status}): ${detail}`, res.status);
    }

    return await res.blob();
  } catch (err) {
    if (err instanceof ElevenLabsTTSError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new ElevenLabsTTSError('TTS request timed out');
    }
    throw new ElevenLabsTTSError('Network error, check your connection');
  } finally {
    clearTimeout(timeout);
  }
}
