import type { GenerationProvider } from './types';
import {
  fetchWithRetry,
  createTimeoutController,
  NON_STREAMING_TIMEOUT_MS,
  STREAMING_INACTIVITY_TIMEOUT_MS,
  HARD_CEILING_MS,
} from './fetch-utils';

/**
 * Base class for providers using the OpenAI-compatible chat completions format.
 * Used by Mistral and OpenAI (both share the same API shape).
 */
export class OpenAICompatibleProvider implements GenerationProvider {
  protected apiKey: string;
  protected baseUrl: string;
  protected model: string;
  protected label: string;
  protected tokenParamName: string;

  constructor(apiKey: string, baseUrl: string, model: string, label: string, tokenParamName = 'max_tokens') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.label = label;
    this.tokenParamName = tokenParamName;
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetchWithRetry(
      this.baseUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          [this.tokenParamName]: 16384,
          response_format: { type: 'json_object' },
        }),
      },
      NON_STREAMING_TIMEOUT_MS,
      this.label,
    );

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  async generateStream(
    prompt: string,
    onChunk: (delta: string) => void,
  ): Promise<string> {
    const hardCeiling = createTimeoutController(HARD_CEILING_MS);

    const response = await fetchWithRetry(
      this.baseUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          [this.tokenParamName]: 16384,
          response_format: { type: 'json_object' },
          stream: true,
        }),
        signal: hardCeiling.controller.signal,
      },
      STREAMING_INACTIVITY_TIMEOUT_MS,
      this.label,
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
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
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
