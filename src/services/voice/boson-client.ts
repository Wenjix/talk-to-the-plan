import type { AudioChunk } from './audio-chunker';

export class BosonAUError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'BosonAUError';
    this.status = status;
  }
}

export interface BosonAudioRequest {
  audioChunks: AudioChunk[];
  systemPrompt: string;
  userText?: string;
  model?: string;
}

const BOSON_BASE_URL = 'https://hackathon.boson.ai/v1/chat/completions';
const PROXY_URL = '/api/boson/v1/chat/completions';
const MODEL_PRIMARY = 'higgs-audio-understanding-v3.5-Hackathon';
const MODEL_FALLBACK = 'higgs-audio-understanding-v3-Hackathon';
const STOP_SEQUENCES = ['<|eot_id|>', '<|endoftext|>', '<|audio_eos|>', '<|im_end|>'];
// Boson docs show "extra_body": {"skip_special_tokens": false} in the JSON payload.
// In the OpenAI Python SDK, extra_body is a client abstraction that merges into the
// top-level body, but for direct fetch calls we nest it as the docs specify.
const EXTRA_BODY = { extra_body: { skip_special_tokens: false } };

interface BosonMessage {
  role: string;
  content: string | BosonContentPart[];
}

type BosonContentPart =
  | { type: 'text'; text: string }
  | { type: 'audio_url'; audio_url: { url: string } };

function buildMessages(request: BosonAudioRequest): BosonMessage[] {
  const userContent: BosonContentPart[] = [];

  if (request.userText) {
    userContent.push({ type: 'text', text: request.userText });
  }

  for (const chunk of request.audioChunks) {
    userContent.push({ type: 'audio_url', audio_url: { url: chunk.dataUrl } });
  }

  return [
    { role: 'system', content: request.systemPrompt },
    { role: 'user', content: userContent },
  ];
}

function buildPayload(request: BosonAudioRequest, model: string) {
  return {
    model,
    temperature: 0.2,
    top_p: 0.9,
    max_tokens: 2048,
    stop: STOP_SEQUENCES,
    ...EXTRA_BODY,
    messages: buildMessages(request),
  };
}

async function fetchCompletion(
  url: string,
  apiKey: string,
  payload: ReturnType<typeof buildPayload>,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new BosonAUError('Invalid Boson AI API key', 401);
    }
    if (res.status === 429) {
      throw new BosonAUError('Boson AI rate limit exceeded — try again shortly', 429);
    }
    throw new BosonAUError(`Audio understanding request failed (${res.status})`, res.status);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

export async function audioUnderstand(
  request: BosonAudioRequest,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const model = request.model ?? MODEL_PRIMARY;
  const payload = buildPayload(request, model);

  try {
    // Determine which URL to use: try browser-direct first, fall back to Vite proxy on CORS error
    let baseUrl = BOSON_BASE_URL;
    try {
      return await fetchCompletion(baseUrl, apiKey, payload, controller.signal);
    } catch (err) {
      // CORS block manifests as TypeError — switch to proxy for this and any retries
      if (err instanceof TypeError) {
        baseUrl = PROXY_URL;
        try {
          return await fetchCompletion(baseUrl, apiKey, payload, controller.signal);
        } catch (proxyErr) {
          // Fall through to 5xx retry logic below using proxy URL
          if (proxyErr instanceof BosonAUError && proxyErr.status && proxyErr.status >= 500 && model === MODEL_PRIMARY) {
            const fallbackPayload = buildPayload(request, MODEL_FALLBACK);
            return await fetchCompletion(baseUrl, apiKey, fallbackPayload, controller.signal);
          }
          throw proxyErr;
        }
      }
      // 5xx with primary model on direct URL → retry with fallback model
      if (err instanceof BosonAUError && err.status && err.status >= 500 && model === MODEL_PRIMARY) {
        const fallbackPayload = buildPayload(request, MODEL_FALLBACK);
        return await fetchCompletion(baseUrl, apiKey, fallbackPayload, controller.signal);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BosonAUError('Audio understanding timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
