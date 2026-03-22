# Persona Selector & Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toolbar persona selector dropdown and a Settings Personas tab so users can switch personas and configure which provider/model each persona uses.

**Architecture:** Toolbar gets a PersonaSelector dropdown that reads the active lane's persona and lets users switch. A new PersonasTab in Settings lets users map each persona to any provider + model from a curated list. The `personaModelConfig` is persisted in IndexedDB settings and threaded through `GenerateOptions` → `getProviderForPersona()`.

**Tech Stack:** React 19, Zustand, CSS Modules, Zod, IndexedDB (idb)

**Spec:** `docs/superpowers/specs/2026-03-22-persona-model-selector-design.md`

---

### Task 1: Add PERSONA_META constant and AVAILABLE_MODELS

**Files:**
- Modify: `src/core/types/lane.ts`
- Modify: `src/generation/providers/types.ts`

- [ ] **Step 1: Add PERSONA_META to lane.ts**

After `DEFAULT_LANES`, add:

```ts
export const PERSONA_META: Record<PersonaId, { label: string; colorToken: string }> = {
  expansive: { label: 'Expansive', colorToken: '#7B4FBF' },
  analytical: { label: 'Analytical', colorToken: '#4A90D9' },
  pragmatic: { label: 'Pragmatic', colorToken: '#3DAA6D' },
  socratic: { label: 'Socratic', colorToken: '#D94F4F' },
};
```

- [ ] **Step 2: Add AVAILABLE_MODELS and PersonaModelConfig to types.ts**

In `src/generation/providers/types.ts`, add after `ApiKeys`:

```ts
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
```

- [ ] **Step 3: Build to verify no type errors**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/core/types/lane.ts src/generation/providers/types.ts
git commit -m "feat: add PERSONA_META, AVAILABLE_MODELS, and PersonaModelConfig type"
```

---

### Task 2: Add personaModelConfig to settings store

**Files:**
- Modify: `src/persistence/settings-store.ts`

- [ ] **Step 1: Add personaModelConfig to AppSettingsSchema**

Import `PersonaIdSchema` from `../core/types` at the top. Then add this field inside `AppSettingsSchema` (after `voiceTtsVoiceId`):

```ts
personaModelConfig: z.record(
  z.string(),
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
```

Note: Use `z.record(z.string(), ...)` instead of `z.record(PersonaIdSchema, ...)` because Zod record keys parse from serialized JSON where keys are always strings. The `.default(...)` ensures existing users get the default config on upgrade without a Zod validation error.

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All pass (settings tests exercise `AppSettingsSchema.parse({})`)

- [ ] **Step 4: Commit**

```bash
git add src/persistence/settings-store.ts
git commit -m "feat: add personaModelConfig to AppSettings schema"
```

---

### Task 3: Make providers accept configurable model + update cache key

**Files:**
- Modify: `src/generation/providers/anthropic.ts:23-25`
- Modify: `src/generation/providers/mistral.ts:4-12`
- Modify: `src/generation/providers/index.ts`
- Test: `src/__tests__/generation/providers.test.ts`

- [ ] **Step 1: Update AnthropicProvider constructor to accept model param**

In `src/generation/providers/anthropic.ts`, change constructor (line 23-26):

```ts
constructor(apiKey: string, model?: string) {
  this.apiKey = apiKey;
  this.model = model ?? PROVIDER_MODELS.anthropic;
}
```

- [ ] **Step 2: Update MistralProvider constructor to accept model param**

In `src/generation/providers/mistral.ts`, replace the class:

```ts
import { OpenAICompatibleProvider } from './openai-compat';
import { PROVIDER_MODELS } from './types';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model?: string) {
    super(
      apiKey,
      'https://api.mistral.ai/v1/chat/completions',
      model ?? PROVIDER_MODELS.mistral,
      'Mistral API',
    );
  }
}
```

- [ ] **Step 3: Update provider factory and cache to support model param**

In `src/generation/providers/index.ts`:

Update `cacheKey` to include model:
```ts
function cacheKey(providerId: ProviderId, apiKey: string, model: string): string {
  return `${providerId}:${apiKey}:${model}`;
}
```

Update `createProvider` to accept model:
```ts
function createProvider(providerId: ProviderId, apiKey: string, model: string): GenerationProvider {
  switch (providerId) {
    case 'mistral':
      return new MistralProvider(apiKey, model);
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
  }
}
```

Update `getProviderById` to accept model:
```ts
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
```

Add `PersonaModelConfig` import and update `getProviderForPersona`:
```ts
import type { PersonaModelConfig } from './types';
import { DEFAULT_PERSONA_MODEL_CONFIG } from './types';

export function getProviderForPersona(
  personaId: PersonaId,
  apiKeys: ApiKeys,
  config?: PersonaModelConfig,
): GenerationProvider {
  const mapping = config?.[personaId] ?? DEFAULT_PERSONA_MODEL_CONFIG[personaId];
  return getProviderById(mapping.providerId, apiKeys[mapping.providerId], mapping.modelId);
}
```

Also update the re-exports at the top of `index.ts`:

```ts
export type { GenerationProvider, PersonaModelConfig } from './types';
export type { ProviderId, ApiKeys } from './types';
export { PERSONA_PROVIDER_MAP, DEFAULT_PROVIDER_ID, PROVIDER_MODELS, AVAILABLE_MODELS, DEFAULT_PERSONA_MODEL_CONFIG } from './types';
```

- [ ] **Step 4: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: All pass (existing provider tests call `getProviderById` with 2 args, which still works because `model` is optional)

- [ ] **Step 6: Commit**

```bash
git add src/generation/providers/anthropic.ts src/generation/providers/mistral.ts src/generation/providers/index.ts
git commit -m "feat: make providers accept configurable model, update cache key"
```

---

### Task 4: Thread personaModelConfig through the generation pipeline

**Files:**
- Modify: `src/generation/pipeline.ts:8,15-24,60`
- Modify: `src/store/actions.ts:479-514`

- [ ] **Step 1: Add personaModelConfig to GenerateOptions**

In `src/generation/pipeline.ts`, add import:
```ts
import type { ApiKeys, PersonaModelConfig } from './providers/types';
```

Add to `GenerateOptions` interface (after `apiKeys`):
```ts
personaModelConfig?: PersonaModelConfig;
```

Update the `getProviderForPersona` call (line 60) to pass config:
```ts
const provider = getProviderForPersona(personaId, options.apiKeys, options.personaModelConfig);
```

- [ ] **Step 2: Pass personaModelConfig in runJob**

In `src/store/actions.ts`, after line 481 (`const apiKeys = resolveApiKeys(settings);`), add:

```ts
const personaModelConfig = settings.personaModelConfig;
```

Then in the `generate(...)` call (around line 499-514), add `personaModelConfig` to the options object:
```ts
const result: GenerateResult = await generate({
  targetNodeId: job.targetNodeId,
  jobType: job.jobType,
  nodes,
  edges,
  session,
  lanes: sessionLanes,
  apiKeys,
  personaModelConfig,
  onChunk: (delta: string) => {
    pendingChunk += delta;
    if (!chunkRafScheduled) {
      chunkRafScheduled = true;
      requestAnimationFrame(flushChunk);
    }
  },
});
```

- [ ] **Step 3: Build and test**

Run: `npm run build && npm run test`
Expected: Both pass

- [ ] **Step 4: Commit**

```bash
git add src/generation/pipeline.ts src/store/actions.ts
git commit -m "feat: thread personaModelConfig through generation pipeline"
```

---

### Task 5: Add updateLanePersona to semantic store

**Files:**
- Modify: `src/store/semantic-store.ts`

- [ ] **Step 1: Add updateLanePersona to SemanticState interface**

After `setLanes` (line 22), add:
```ts
updateLanePersona: (laneId: string, personaId: PersonaId) => void;
```

Add import at top: `import type { PersonaId } from '../core/types';` (if not already there — it's imported via `ModelLane` but `PersonaId` isn't directly imported, add it to the existing import).

- [ ] **Step 2: Add implementation**

After `setLanes` implementation (line 65), add:
```ts
updateLanePersona: (laneId, personaId) => set((s) => ({
  lanes: s.lanes.map((l) => (l.id === laneId ? { ...l, personaId } : l)),
})),
```

- [ ] **Step 3: Build and test**

Run: `npm run build && npm run test`
Expected: Both pass

- [ ] **Step 4: Commit**

```bash
git add src/store/semantic-store.ts
git commit -m "feat: add updateLanePersona action to semantic store"
```

---

### Task 6: Create PersonaSelector toolbar dropdown

**Files:**
- Create: `src/components/PersonaSelector/PersonaSelector.tsx`
- Create: `src/components/PersonaSelector/PersonaSelector.module.css`

- [ ] **Step 1: Create PersonaSelector.module.css**

Create `src/components/PersonaSelector/PersonaSelector.module.css`:

```css
.wrapper {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 6px;
  color: var(--text-primary, #1a1a1a);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.trigger:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.caret {
  font-size: 0.65rem;
  opacity: 0.6;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  min-width: 160px;
  z-index: 1001;
  padding: 4px 0;
}

.option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-primary, #1a1a1a);
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
}

.option:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
}

.check {
  width: 16px;
  font-size: 0.75rem;
  text-align: center;
  flex-shrink: 0;
}

.divider {
  height: 1px;
  background: var(--border-color, #e0e0e0);
  margin: 4px 0;
}

.configLink {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-secondary, #666666);
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
}

.configLink:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  color: var(--text-primary, #1a1a1a);
}
```

- [ ] **Step 2: Create PersonaSelector.tsx**

Create `src/components/PersonaSelector/PersonaSelector.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import type { PersonaId } from '../../core/types';
import { PersonaIdSchema, PERSONA_META } from '../../core/types/lane';
import { useSessionStore } from '../../store/session-store';
import { useSemanticStore } from '../../store/semantic-store';
import styles from './PersonaSelector.module.css';

const ALL_PERSONAS = PersonaIdSchema.options as readonly PersonaId[];

interface PersonaSelectorProps {
  onOpenPersonaSettings: () => void;
}

export function PersonaSelector({ onOpenPersonaSettings }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activeLaneId = useSessionStore(s => s.activeLaneId);
  const activeLane = useSemanticStore(s => s.lanes.find(l => l.id === activeLaneId));
  const updateLanePersona = useSemanticStore(s => s.updateLanePersona);

  const currentPersona = activeLane?.personaId ?? 'expansive';
  const meta = PERSONA_META[currentPersona];

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (personaId: PersonaId) => {
    if (activeLaneId) {
      updateLanePersona(activeLaneId, personaId);
    }
    setOpen(false);
  };

  if (!activeLaneId) return null;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(prev => !prev)}
        type="button"
        aria-label={`Active persona: ${meta.label}`}
      >
        <span className={styles.dot} style={{ background: meta.colorToken }} />
        {meta.label}
        <span className={styles.caret}>&#x25BE;</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {ALL_PERSONAS.map(id => {
            const m = PERSONA_META[id];
            const isActive = id === currentPersona;
            return (
              <button
                key={id}
                className={styles.option}
                onClick={() => handleSelect(id)}
                type="button"
              >
                <span className={styles.check}>{isActive ? '\u2713' : ''}</span>
                <span className={styles.dot} style={{ background: m.colorToken }} />
                {m.label}
              </button>
            );
          })}
          <div className={styles.divider} />
          <button
            className={styles.configLink}
            onClick={() => { setOpen(false); onOpenPersonaSettings(); }}
            type="button"
          >
            Configure&hellip;
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src/components/PersonaSelector/
git commit -m "feat: create PersonaSelector toolbar dropdown component"
```

---

### Task 7: Create PersonasTab settings component

**Files:**
- Create: `src/components/Settings/PersonasTab.tsx`

- [ ] **Step 1: Create PersonasTab.tsx**

Create `src/components/Settings/PersonasTab.tsx`:

```tsx
import type { PersonaId } from '../../core/types';
import { PersonaIdSchema, PERSONA_META } from '../../core/types/lane';
import type { AppSettings } from '../../persistence/settings-store';
import type { ProviderId, PersonaModelConfig } from '../../generation/providers/types';
import { AVAILABLE_MODELS, DEFAULT_PERSONA_MODEL_CONFIG } from '../../generation/providers/types';
import styles from './Settings.module.css';

const ALL_PERSONAS = PersonaIdSchema.options as readonly PersonaId[];
const ALL_PROVIDERS: ProviderId[] = ['mistral', 'anthropic'];
const PROVIDER_LABELS: Record<ProviderId, string> = { mistral: 'Mistral', anthropic: 'Anthropic' };

interface PersonasTabProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export function PersonasTab({ settings, onUpdate }: PersonasTabProps) {
  const config: PersonaModelConfig = {
    ...DEFAULT_PERSONA_MODEL_CONFIG,
    ...settings.personaModelConfig,
  };

  const handleProviderChange = (personaId: PersonaId, providerId: ProviderId) => {
    const updated = {
      ...config,
      [personaId]: { providerId, modelId: AVAILABLE_MODELS[providerId][0] },
    };
    onUpdate({ personaModelConfig: updated });
  };

  const handleModelChange = (personaId: PersonaId, modelId: string) => {
    const updated = {
      ...config,
      [personaId]: { ...config[personaId], modelId },
    };
    onUpdate({ personaModelConfig: updated });
  };

  return (
    <div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Persona &rarr; Model</legend>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Persona</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Provider</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Model</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PERSONAS.map(id => {
              const meta = PERSONA_META[id];
              const entry = config[id];
              return (
                <tr key={id}>
                  <td style={{ padding: '6px 8px', fontSize: '0.85rem' }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: meta.colorToken,
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }} />
                    {meta.label}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={entry.providerId}
                      onChange={e => handleProviderChange(id, e.target.value as ProviderId)}
                      className={styles.textInput}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      {ALL_PROVIDERS.map(pid => (
                        <option key={pid} value={pid}>{PROVIDER_LABELS[pid]}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={entry.modelId}
                      onChange={e => handleModelChange(id, e.target.value)}
                      className={styles.textInput}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      {AVAILABLE_MODELS[entry.providerId].map(mid => (
                        <option key={mid} value={mid}>{mid}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src/components/Settings/PersonasTab.tsx
git commit -m "feat: create PersonasTab settings component"
```

---

### Task 8: Wire PersonaSelector into Toolbar + PersonasTab into Settings

**Files:**
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/components/Settings/Settings.tsx`

- [ ] **Step 1: Update Settings to accept initialTab prop**

In `src/components/Settings/Settings.tsx`:

Update and export `TabId` type (line 10):
```ts
export type TabId = 'general' | 'api' | 'personas' | 'display';
```

Add to `TABS` array (after 'api' entry):
```ts
{ id: 'personas', label: 'Personas' },
```

Update `SettingsProps` interface:
```ts
interface SettingsProps {
  onClose: () => void;
  initialTab?: TabId;
}
```

Update component signature and `useState`:
```ts
export function Settings({ onClose, initialTab }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'general');
```

Add import for `PersonasTab`:
```ts
import { PersonasTab } from './PersonasTab.tsx';
```

Add tab content render (after the `api` block):
```tsx
{activeTab === 'personas' && (
  <PersonasTab settings={settings} onUpdate={handleUpdate} />
)}
```

- [ ] **Step 2: Update Toolbar to include PersonaSelector and support initialTab**

In `src/components/Toolbar/Toolbar.tsx`:

Add import:
```ts
import { PersonaSelector } from '../PersonaSelector/PersonaSelector.tsx';
```

Add import for `TabId`:
```ts
import type { TabId } from '../Settings/Settings.tsx';
```

Replace `const [settingsOpen, setSettingsOpen] = useState(false);` with:
```ts
const [settingsState, setSettingsState] = useState<{ open: boolean; initialTab?: TabId }>({ open: false });
```

Add before the settings button (line 102), inside the `right` div:
```tsx
{session && uiMode === 'exploring' && (
  <PersonaSelector
    onOpenPersonaSettings={() => setSettingsState({ open: true, initialTab: 'personas' })}
  />
)}
```

Update settings button onClick:
```ts
onClick={() => setSettingsState({ open: true })}
```

Update the Settings render at the bottom:
```tsx
{settingsState.open && (
  <Settings
    onClose={() => setSettingsState({ open: false })}
    initialTab={settingsState.initialTab}
  />
)}
```

- [ ] **Step 3: Build and test**

Run: `npm run build && npm run test`
Expected: Both pass

- [ ] **Step 4: Commit**

```bash
git add src/components/Toolbar/Toolbar.tsx src/components/Settings/Settings.tsx
git commit -m "feat: wire PersonaSelector into Toolbar, PersonasTab into Settings"
```

---

### Task 9: Update existing tests and add new tests

**Files:**
- Modify: `src/__tests__/generation/providers.test.ts`
- Modify: `src/__tests__/components/settings.test.tsx`

- [ ] **Step 1: Update settings.test.tsx mock and assertions**

The settings test file has a hand-rolled `AppSettingsSchema` mock and a `defaults` object. Both need updating:

1. Add `personaModelConfig` to the mock `AppSettingsSchema` inside `vi.mock(...)` to match the real schema's new field (with `.default(...)`)
2. Add `personaModelConfig` to the `defaults` object with the default config value
3. Update the tab count assertion — change `'renders with three tabs'` to `'renders with four tabs'` and add assertion for the new Personas tab:
   ```ts
   expect(screen.getByRole('tab', { name: 'Personas' })).toBeDefined();
   ```

- [ ] **Step 2: Add test for getProviderForPersona with custom config**

In `src/__tests__/generation/providers.test.ts`, add a new test in the `getProviderForPersona` describe block:

```ts
it('uses custom config when provided', () => {
  const apiKeys: ApiKeys = { mistral: '', anthropic: 'sk-ant-FakeKey1234567890123' };
  const config = {
    expansive: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
    analytical: { providerId: 'mistral' as const, modelId: 'mistral-large-2512' },
    pragmatic: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
    socratic: { providerId: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
  };
  // expansive mapped to anthropic with key → should get AnthropicProvider, not DemoProvider
  const provider = getProviderForPersona('expansive', apiKeys, config);
  expect(provider).toBeDefined();
  expect(provider.generate).toBeDefined();
});
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/generation/providers.test.ts src/__tests__/components/settings.test.tsx
git commit -m "test: update settings mock for PersonasTab, add custom config provider test"
```

---

### Task 10: End-to-end manual verification

- [ ] **Step 1: Final build and test**

Run: `npm run build && npm run test`
Expected: Both pass

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`

Manual checks:
1. Open `http://localhost:5173`, create a session with a topic
2. Verify persona dropdown appears in toolbar showing "Expansive" with purple dot
3. Click dropdown — all 4 personas listed with checkmark on Expansive
4. Switch to "Analytical" — dropdown label updates, no errors in console
5. Click "Configure..." — Settings opens directly to Personas tab
6. Change Expansive provider from Mistral to Anthropic — model dropdown updates to show Anthropic models
7. Close settings, reload page — config persists
8. Generate a node — verify it uses the configured persona's preamble (check network tab for which API is called)

- [ ] **Step 3: Commit any fixes from manual testing**

If any issues found, fix and commit individually.
