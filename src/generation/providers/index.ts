import type { GenerationProvider, ProviderId, ApiKeys, PersonaModelConfig } from './types';
import { DEFAULT_PROVIDER_ID, PROVIDER_MODELS, DEFAULT_PERSONA_MODEL_CONFIG } from './types';
import type { PersonaId } from '../../core/types';
import { DemoProvider } from './demo-provider';
import { MistralProvider } from './mistral';
import { AnthropicProvider } from './anthropic';

export type { GenerationProvider, PersonaModelConfig } from './types';
export type { ProviderId, ApiKeys } from './types';
export { PERSONA_PROVIDER_MAP, DEFAULT_PROVIDER_ID, PROVIDER_MODELS, AVAILABLE_MODELS, DEFAULT_PERSONA_MODEL_CONFIG } from './types';

// Cache per (providerId, apiKey, model) tuple
const providerCache = new Map<string, GenerationProvider>();

function cacheKey(providerId: ProviderId, apiKey: string, model: string): string {
  return `${providerId}:${apiKey}:${model}`;
}

function createProvider(providerId: ProviderId, apiKey: string, model: string): GenerationProvider {
  switch (providerId) {
    case 'mistral':
      return new MistralProvider(apiKey, model);
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
  }
}

/** Core factory: get a provider by ID and API key. Returns DemoProvider if no key. */
export function getProviderById(providerId: ProviderId, apiKey: string, model?: string): GenerationProvider {
  if (!apiKey) return new DemoProvider();

  const resolvedModel = model ?? PROVIDER_MODELS[providerId];
  const key = cacheKey(providerId, apiKey, resolvedModel);
  const cached = providerCache.get(key);
  if (cached) return cached;

  const provider = createProvider(providerId, apiKey, resolvedModel);
  providerCache.set(key, provider);
  return provider;
}

/** Resolve persona → provider via config or DEFAULT_PERSONA_MODEL_CONFIG. */
export function getProviderForPersona(
  personaId: PersonaId,
  apiKeys: ApiKeys,
  config?: PersonaModelConfig,
): GenerationProvider {
  const mapping = config?.[personaId] ?? DEFAULT_PERSONA_MODEL_CONFIG[personaId];
  return getProviderById(mapping.providerId, apiKeys[mapping.providerId], mapping.modelId);
}

/** Returns the default provider (Mistral) for cross-lane operations. */
export function getDefaultProvider(apiKeys: ApiKeys): GenerationProvider {
  return getProviderById(DEFAULT_PROVIDER_ID, apiKeys[DEFAULT_PROVIDER_ID]);
}
