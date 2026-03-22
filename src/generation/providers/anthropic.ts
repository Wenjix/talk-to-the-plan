import type { GenerationProvider } from './types';
import { PROVIDER_MODELS } from './types';
import {
  fetchWithRetry,
  createTimeoutController,
  NON_STREAMING_TIMEOUT_MS,
  STREAMING_INACTIVITY_TIMEOUT_MS,
  HARD_CEILING_MS,
} from './fetch-utils';

/**
 * Strips markdown code fences from response text.
 * Anthropic has no native JSON mode, so the model may wrap JSON in ```json ... ```.
 */
function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');
}

export class AnthropicProvider implements GenerationProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = PROVIDER_MODELS.anthropic;
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      NON_STREAMING_TIMEOUT_MS,
      'Anthropic API',
    );

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';
    return stripCodeFences(text);
  }

  async generateStream(
    prompt: string,
    onChunk: (delta: string) => void,
  ): Promise<string> {
    const hardCeiling = createTimeoutController(HARD_CEILING_MS);

    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
        signal: hardCeiling.controller.signal,
      },
      STREAMING_INACTIVITY_TIMEOUT_MS,
      'Anthropic API',
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
            if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta?.text ?? '';
              if (delta) {
                accumulated += delta;
                onChunk(delta);
              }
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } finally {
      hardCeiling.clear();
    }

    return stripCodeFences(accumulated);
  }
}
