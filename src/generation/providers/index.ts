import type { GenerationProvider, ProviderId, ApiKeys } from './types';
import { PERSONA_PROVIDER_MAP, DEFAULT_PROVIDER_ID } from './types';
import type { PersonaId } from '../../core/types';
import { DemoProvider } from './demo-provider';
import { GeminiProvider } from './gemini';
import { MistralProvider } from './mistral';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';

export type { GenerationProvider } from './types';
export type { ProviderId, ApiKeys } from './types';
export { PERSONA_PROVIDER_MAP, DEFAULT_PROVIDER_ID, PROVIDER_MODELS } from './types';

// Cache per (providerId, apiKey) pair
const providerCache = new Map<string, GenerationProvider>();

function cacheKey(providerId: ProviderId, apiKey: string): string {
  return `${providerId}:${apiKey}`;
}

function createProvider(providerId: ProviderId, apiKey: string): GenerationProvider {
  switch (providerId) {
    case 'gemini':
      return new GeminiProvider(apiKey);
    case 'mistral':
      return new MistralProvider(apiKey);
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'anthropic':
      return new AnthropicProvider(apiKey);
  }
}

/** Core factory: get a provider by ID and API key. Returns DemoProvider if no key. */
export function getProviderById(providerId: ProviderId, apiKey: string): GenerationProvider {
  if (!apiKey) return new DemoProvider();

  const key = cacheKey(providerId, apiKey);
  const cached = providerCache.get(key);
  if (cached) return cached;

  const provider = createProvider(providerId, apiKey);
  providerCache.set(key, provider);
  return provider;
}

/** Resolve persona → provider via PERSONA_PROVIDER_MAP. */
export function getProviderForPersona(personaId: PersonaId, apiKeys: ApiKeys): GenerationProvider {
  const providerId = PERSONA_PROVIDER_MAP[personaId];
  return getProviderById(providerId, apiKeys[providerId]);
}

/** Returns the default provider (Mistral) for cross-lane operations. */
export function getDefaultProvider(apiKeys: ApiKeys): GenerationProvider {
  return getProviderById(DEFAULT_PROVIDER_ID, apiKeys[DEFAULT_PROVIDER_ID]);
}

/** @deprecated Use getProviderById, getProviderForPersona, or getDefaultProvider instead. */
export function getProvider(apiKey: string): GenerationProvider {
  return getProviderById('mistral', apiKey);
}
