import type { PersonaId } from '../../core/types';

export interface GenerationProvider {
  generate(prompt: string): Promise<string>;
  generateStream(prompt: string, onChunk: (delta: string) => void): Promise<string>;
}

export type ProviderId = 'mistral' | 'gemini' | 'anthropic' | 'openai';

export const PERSONA_PROVIDER_MAP: Record<PersonaId, ProviderId> = {
  expansive: 'mistral',
  analytical: 'mistral',
  pragmatic: 'anthropic',
  socratic: 'anthropic',
};

export const PROVIDER_MODELS: Record<ProviderId, string> = {
  mistral: 'mistral-large-2512',
  gemini: 'gemini-3.0-flash',
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.2-chat-latest',
};

export const DEFAULT_PROVIDER_ID: ProviderId = 'mistral';

export type ApiKeys = Record<ProviderId, string>;
