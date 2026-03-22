import type { GenerationProvider } from './types';
import { PROVIDER_MODELS } from './types';
import {
  fetchWithRetry,
  createTimeoutController,
  NON_STREAMING_TIMEOUT_MS,
  STREAMING_INACTIVITY_TIMEOUT_MS,
  HARD_CEILING_MS,
} from './fetch-utils';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = PROVIDER_MODELS.gemini;

export class GeminiProvider implements GenerationProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string): Promise<string> {
    const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${this.apiKey}`;
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      },
      NON_STREAMING_TIMEOUT_MS,
      'Gemini API',
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  async generateStream(
    prompt: string,
    onChunk: (delta: string) => void
  ): Promise<string> {
    const url = `${GEMINI_API_BASE}/${MODEL}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    // Hard ceiling abort controller for entire streaming session
    const hardCeiling = createTimeoutController(HARD_CEILING_MS);

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
        signal: hardCeiling.controller.signal,
      },
      STREAMING_INACTIVITY_TIMEOUT_MS,
      'Gemini API',
    );

    const reader = response.body?.getReader();
    if (!reader) {
      hardCeiling.clear();
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let accumulated = '';

    try {
      while (true) {
        // Inactivity timeout per chunk read
        const inactivityTimer = setTimeout(
          () => hardCeiling.controller.abort(),
          STREAMING_INACTIVITY_TIMEOUT_MS,
        );

        const { done, value } = await reader.read();
        clearTimeout(inactivityTimer);

        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6);
          if (json === '[DONE]') continue;
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (delta) {
              accumulated += delta;
              onChunk(delta);
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } finally {
      hardCeiling.clear();
    }

    return accumulated;
  }
}
