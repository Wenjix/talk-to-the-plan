# Persona Selector & Model Configuration

## Context

The app currently hardcodes a single persona (`expansive`) with a fixed persona-to-provider/model mapping. `DEFAULT_LANES` was recently reduced to 1 entry. Users cannot switch personas or choose which model backs each persona. This spec adds a toolbar persona selector and a Settings tab for configuring persona-model mappings.

## Design Decisions

- **Toolbar dropdown** for quick persona switching (not buried in settings)
- **Any persona can use any provider/model** — no locked bindings
- **Switching is non-destructive** — mutates the active lane's `personaId`, existing nodes untouched
- **Curated model lists** per provider (no free-text input)
- **Persisted in IndexedDB** alongside existing app settings
- **Dropdown populates from `PersonaId` enum**, not from stored lanes — always shows all 4 personas regardless of how many lanes exist

## Components

### 1. PersonaSelector (toolbar dropdown)

**Location**: `src/components/PersonaSelector/PersonaSelector.tsx`

A button in the Toolbar right section (before the gear icon) showing the active persona's color dot and name. Clicking opens a dropdown.

**Dropdown contents**:
- 4 persona options (from `PersonaId` enum), each with color dot + name
- Active persona has a checkmark
- Divider line
- "Configure..." link that opens Settings modal to the Personas tab

**Behavior on select**:
- Calls `updateLanePersona(activeLaneId, selectedPersonaId)` on the semantic store
- Future generations route through the newly selected persona's provider/model
- Existing nodes and their answers are unaffected

**State reads**:
- `activeLaneId` from `useSessionStore`
- Active lane from `useSemanticStore` (to get current `personaId`)
- Persona metadata (label, colorToken) from a new `PERSONA_META` constant

**"Configure..." deep-link**:
- `PersonaSelector` receives an `onOpenPersonaSettings: () => void` callback from `Toolbar`
- `Toolbar` lifts its settings state to `{ open: boolean, initialTab?: TabId }` so clicking "Configure..." sets `{ open: true, initialTab: 'personas' }`
- `Settings` component accepts an optional `initialTab` prop

### 2. PersonasTab (settings tab)

**Location**: `src/components/Settings/PersonasTab.tsx`

A new tab in the Settings modal showing a configuration table for all 4 personas.

**Each row**:
- Persona color dot + name (read-only label)
- Provider dropdown: `Mistral` | `Anthropic`
- Model dropdown: curated list filtered by selected provider

**Curated model lists** (defined as `AVAILABLE_MODELS` in `types.ts`):
- Mistral: `mistral-large-2512`, `mistral-medium-latest`, `mistral-small-latest`
- Anthropic: `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4-6`

Changing provider resets model to that provider's first option.

### 3. Settings schema changes

**File**: `src/persistence/settings-store.ts`

Add to `AppSettingsSchema` with a `.default(...)` for migration safety (existing IndexedDB data won't have this field):

```ts
personaModelConfig: z.record(
  PersonaIdSchema,
  z.object({
    providerId: z.enum(['mistral', 'anthropic']),
    modelId: z.string(),
  })
).default({
  expansive:  { providerId: 'mistral',   modelId: 'mistral-large-2512' },
  analytical: { providerId: 'mistral',   modelId: 'mistral-large-2512' },
  pragmatic:  { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
  socratic:   { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
})
```

### 4. Provider routing changes

**File**: `src/generation/providers/types.ts`
- Add `AVAILABLE_MODELS: Record<ProviderId, string[]>` with the curated lists
- Add `PersonaModelConfig` type alias
- `PERSONA_PROVIDER_MAP` and `PROVIDER_MODELS` become fallback defaults only

**File**: `src/generation/providers/index.ts`
- `getProviderForPersona` signature changes to `(personaId, apiKeys, config?)` where `config` is `PersonaModelConfig`
- When `config` is provided, uses `config[personaId]` to resolve `providerId` + `modelId`
- Falls back to hardcoded map if no config
- **Provider cache key** changes from `${providerId}:${apiKey}` to `${providerId}:${apiKey}:${modelId}` so model changes create new provider instances

**File**: `src/generation/pipeline.ts`
- `GenerateOptions` interface adds `personaModelConfig?: PersonaModelConfig`
- `generate()` passes config through to `getProviderForPersona(personaId, apiKeys, config)`

**File**: `src/generation/providers/anthropic.ts`
- Accept `model` as a constructor parameter instead of hardcoding `claude-sonnet-4-6`

**File**: `src/generation/providers/mistral.ts`
- Accept `model` as a constructor parameter instead of hardcoding `PROVIDER_MODELS.mistral`
- Forward to `OpenAICompatibleProvider` (which already accepts model param)

### 5. Semantic store change

**File**: `src/store/semantic-store.ts`
- Add `updateLanePersona(laneId: string, personaId: PersonaId)` action
- Mutates the lane's `personaId` field in place

### 6. Persona metadata constant

**File**: `src/core/types/lane.ts`
- Add `PERSONA_META: Record<PersonaId, { label: string, colorToken: string }>` constant
- Extracted from the old `DEFAULT_LANES` data so the dropdown and PersonasTab can render persona labels/colors without depending on stored lanes

## Files to create

| File | Purpose |
|------|---------|
| `src/components/PersonaSelector/PersonaSelector.tsx` | Toolbar dropdown component |
| `src/components/PersonaSelector/PersonaSelector.module.css` | Dropdown styles |
| `src/components/Settings/PersonasTab.tsx` | Settings tab for model config |

## Files to modify

| File | Change |
|------|--------|
| `src/core/types/lane.ts` | Add `PERSONA_META` constant |
| `src/components/Toolbar/Toolbar.tsx` | Add PersonaSelector, lift settings state to `{ open, initialTab }` |
| `src/components/Settings/Settings.tsx` | Add 'personas' tab, accept `initialTab` prop |
| `src/persistence/settings-store.ts` | Add `personaModelConfig` to schema with `.default(...)` |
| `src/generation/providers/types.ts` | Add `AVAILABLE_MODELS`, `PersonaModelConfig` type |
| `src/generation/providers/index.ts` | Accept config in `getProviderForPersona`, update cache key to include modelId |
| `src/generation/pipeline.ts` | Add `personaModelConfig` to `GenerateOptions`, pass through to provider |
| `src/generation/providers/anthropic.ts` | Accept configurable model param |
| `src/generation/providers/mistral.ts` | Accept configurable model param |
| `src/store/semantic-store.ts` | Add `updateLanePersona` action |

## Verification

1. `npm run build` — no type errors
2. `npm run test` — existing tests pass
3. Manual: open app, click persona dropdown, switch to Analytical — future node generations should use Analytical preamble
4. Manual: open Settings > Personas, change Expansive from Mistral to Anthropic/claude-sonnet-4-6, close settings, generate a node — should hit Anthropic API
5. Manual: reload page — persona model config should persist
6. Manual: switch persona, then switch back — verify provider cache serves correct model instance
