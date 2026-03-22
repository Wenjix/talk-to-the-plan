import { openDB, type IDBPDatabase } from 'idb';
import type { DBSchema } from 'idb';
import { z } from 'zod';
import type { ProviderId, ApiKeys } from '../generation/providers/types';
import { PersonaIdSchema } from '../core/types/lane';

const SETTINGS_DB_NAME = 'fuda-settings';
const SETTINGS_DB_VERSION = 1;

export const ThemeSchema = z.enum(['light', 'dark']).default('light');
export type Theme = z.infer<typeof ThemeSchema>;

export const AppSettingsSchema = z.object({
  mistralApiKey: z.string().default(''),
  anthropicApiKey: z.string().default(''),
  eigenApiKey: z.string().default(''),
  bosonApiKey: z.string().default(''),
  challengeDepth: z.enum(['gentle', 'balanced', 'intense']).default('balanced'),
  autoSaveEnabled: z.boolean().default(true),
  animationsEnabled: z.boolean().default(true),
  theme: ThemeSchema,
  voiceInputMode: z.enum(['hold_to_talk', 'toggle']).default('hold_to_talk'),
  voiceTtsEnabled: z.boolean().default(true),
  voiceAutoPlayAi: z.boolean().default(true),
  voiceTtsVoiceId: z.string().default(''),
  personaModelConfig: z.record(
    PersonaIdSchema,
    z.object({
      providerId: z.enum(['mistral', 'anthropic']),
      modelId: z.string(),
    })
  ).default({
    expansive: { providerId: 'mistral', modelId: 'mistral-large-2512' },
    analytical: { providerId: 'mistral', modelId: 'mistral-large-2512' },
    pragmatic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
    socratic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
  }),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

interface SettingsDB extends DBSchema {
  settings: {
    key: string;
    value: AppSettings;
  };
}

const SETTINGS_KEY = 'app-settings';
const REMOVED_PROVIDER_SETTING_KEYS = ['geminiApiKey', 'openaiApiKey'] as const;

let dbPromise: Promise<IDBPDatabase<SettingsDB>> | null = null;

function getSettingsDB(): Promise<IDBPDatabase<SettingsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<SettingsDB>(SETTINGS_DB_NAME, SETTINGS_DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('settings');
      },
    });
  }
  return dbPromise;
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await getSettingsDB();
  const raw = await db.get('settings', SETTINGS_KEY);
  if (!raw) return AppSettingsSchema.parse({});
  const validated = AppSettingsSchema.parse(raw);
  if (REMOVED_PROVIDER_SETTING_KEYS.some((key) => key in (raw as Record<string, unknown>))) {
    await db.put('settings', validated, SETTINGS_KEY);
  }
  return validated;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const validated = AppSettingsSchema.parse(settings);
  const db = await getSettingsDB();
  await db.put('settings', validated, SETTINGS_KEY);
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = AppSettingsSchema.parse({ ...current, ...partial });
  await saveSettings(updated);
  return updated;
}

const ENV_KEY_MAP: Record<ProviderId, string> = {
  mistral: 'VITE_MISTRAL_API_KEY',
  anthropic: 'VITE_ANTHROPIC_API_KEY',
};

const SETTINGS_KEY_MAP: Record<ProviderId, keyof AppSettings> = {
  mistral: 'mistralApiKey',
  anthropic: 'anthropicApiKey',
};

/**
 * Resolve API keys: IndexedDB value if set, else VITE_*_API_KEY env var, else ''.
 */
export function resolveApiKeys(settings: AppSettings): ApiKeys {
  const providerIds: ProviderId[] = ['mistral', 'anthropic'];
  const keys = {} as ApiKeys;
  for (const id of providerIds) {
    const settingsValue = settings[SETTINGS_KEY_MAP[id]] as string;
    const envValue = (import.meta.env?.[ENV_KEY_MAP[id]] as string) ?? '';
    keys[id] = settingsValue || envValue;
  }
  return keys;
}

export function resolveEigenApiKey(settings: AppSettings): string {
  return settings.eigenApiKey || ((import.meta.env?.VITE_EIGEN_API_KEY as string) ?? '');
}

export function resolveBosonApiKey(settings: AppSettings): string {
  return settings.bosonApiKey || ((import.meta.env?.VITE_BOSON_API_KEY as string) ?? '');
}

/**
 * Check if an env var fallback is active for a given provider.
 */
export function hasEnvFallback(providerId: ProviderId): boolean {
  return !!(import.meta.env?.[ENV_KEY_MAP[providerId]] as string);
}
