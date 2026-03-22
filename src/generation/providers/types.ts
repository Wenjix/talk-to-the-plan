import type { PersonaId } from '../../core/types';

export interface GenerationProvider {
  generate(prompt: string): Promise<string>;
  generateStream(prompt: string, onChunk: (delta: string) => void): Promise<string>;
}

export type ProviderId = 'mistral' | 'anthropic';

export const PERSONA_PROVIDER_MAP: Record<PersonaId, ProviderId> = {
  expansive: 'mistral',
  analytical: 'mistral',
  pragmatic: 'anthropic',
  socratic: 'anthropic',
};

export const PROVIDER_MODELS: Record<ProviderId, string> = {
  mistral: 'mistral-large-2512',
  anthropic: 'claude-sonnet-4-6',
};

export const DEFAULT_PROVIDER_ID: ProviderId = 'mistral';

export type ApiKeys = Record<ProviderId, string>;

export const AVAILABLE_MODELS: Record<ProviderId, string[]> = {
  mistral: ['mistral-large-2512', 'mistral-medium-latest', 'mistral-small-latest'],
  anthropic: ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-6'],
};

export type PersonaModelConfig = Record<PersonaId, { providerId: ProviderId; modelId: string }>;

export const DEFAULT_PERSONA_MODEL_CONFIG: PersonaModelConfig = {
  expansive: { providerId: 'mistral', modelId: 'mistral-large-2512' },
  analytical: { providerId: 'mistral', modelId: 'mistral-large-2512' },
  pragmatic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
  socratic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
};
