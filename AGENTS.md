# AGENTS.md — Parallax (talk-to-the-plan)

## Project Overview

Parallax is a React SPA that lets users explore topics through multi-persona AI-driven exploration. A user enters a topic, and the app generates a tree of questions/answers across four AI personas (Expansive, Analytical, Pragmatic, Socratic), each rendered as a "lane" on an interactive canvas. Users can branch, promote insights, synthesize plans, and interact via voice (companion mode with real-time transcription → branch creation).

## Essential Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Vite dev server (frontend only) |
| `pnpm dev:server` | PTY WebSocket server only |
| `pnpm dev:full` | Both frontend + PTY server concurrently |
| `pnpm build` | `tsc -b && vite build` |
| `pnpm test` | `vitest run` (single run) |
| `pnpm test:watch` | `vitest` (watch mode) |
| `pnpm lint` | `eslint .` |
| `pnpm format` | `prettier --write 'src/**/*.{ts,tsx}'` |

**Package manager:** pnpm (v10.27.0, enforced in package.json).

## Architecture & Data Flow

### High-Level Flow

```
Topic Input → createSession() → explore() → runJob()
  → compileContext() → buildPrompt() → getProviderForPersona() → generate()
  → parseAndValidate() → processBranchResult/processPathQuestionsResult
  → stores updated → canvas re-renders
```

### Core Layers

1. **`src/core/types/`** — Zod-validated domain types (Node, Edge, Lane, Session, Job, Promotion, Plan). All types have companion Zod schemas used for validation at persistence boundaries and LLM output parsing.

2. **`src/core/fsm/`** — Finite state machines for nodes (`idle → generating → resolved → stale/failed`), jobs, and sessions. FSMs are pure functions that return `null` for invalid transitions — callers must check the return value.

3. **`src/core/graph/`** — Graph algorithms: adjacency indexing, ancestor chain traversal, sibling/cousin resolution. Used by `context-compiler.ts` to build the LLM prompt context.

4. **`src/core/validation/`** — `schema-gates.ts` validates LLM JSON output against per-job-type Zod schemas. `quality-gates.ts` checks branch question quality (uniqueness, relevance).

5. **`src/store/`** — Zustand stores (no middleware). Key stores:
   - `session-store` — active session, UI mode, active lane, layout
   - `semantic-store` — nodes, edges, promotions, lanes, dialogue turns (the graph data)
   - `view-store` — canvas positions, stream buffers, panel state
   - `job-store` — generation job FSM tracking
   - `companion-store` — voice companion mode state
   - `voice-chat-store`, `transcript-store`, `voice-note-store` — voice subsystem

6. **`src/store/actions.ts`** — The main orchestrator. `createSession`, `explore`, `answerNode`, `branchFromNode`, `exploreFromVoice`, and the central `runJob` function. All mutations flow through here.

7. **`src/generation/`** — LLM integration pipeline:
   - `pipeline.ts` — orchestrates context → prompt → provider → validate
   - `providers/` — Mistral and Anthropic providers (both support streaming). `DemoProvider` is the fallback when no API key is set.
   - `prompts/` — prompt builders per job type, persona preambles, language wrapping
   - `rate-limiter.ts` — token-bucket rate limiting for API calls
   - `streaming.ts` — `StreamAccumulator` class and SSE/JSON extraction utilities

8. **`src/services/voice/`** — Voice subsystem:
   - `listener.ts` — subscribes to transcript store, fires LLM calls to detect intents from speech, enqueues them to `branch-scheduler`
   - `branch-scheduler.ts` — drains intent queue, resolves anchor nodes, calls `exploreFromVoice` with concurrency/rate limiting
   - `streaming-transcriber.ts`, `audio-chunker.ts`, `media-recorder.ts` — browser audio → transcription pipeline
   - `boson-client.ts`, `eigen-client.ts`, `cartesia-client.ts` — voice AI service clients
   - `tool-executor.ts` — executes canvas tools from voice commands

9. **`src/persistence/`** — IndexedDB persistence via `idb` library:
   - `schema.ts` — defines `ParallaxDB` with 9 object stores
   - `repository.ts` — CRUD helpers + `loadSessionEnvelope` (parallel load of all entities)
   - `hooks.ts` — auto-save (500ms debounce), `restoreSession` with Zod validation at hydration boundary
   - `settings-store.ts` — separate IDB database for app settings (API keys, theme, persona-model config)

10. **`src/components/`** — React UI components using CSS Modules (`.module.css`). Canvas built on `@xyflow/react`.

11. **`server/`** — Express + WebSocket PTY server (`node-pty`). Runs on port 3001. Proxied through Vite dev server at `/ws/pty`.

12. **`api/`** — Vercel serverless functions for proxying external APIs (Boson, Eigen, Mistral, Cartesia) to avoid CORS issues.

### UI Modes (Session Store)

The app progresses through: `topic_input` → `workspace` → `compass` → `exploring`

- `topic_input` — initial topic entry
- `workspace` — session list/picker
- `compass` — first exploration loaded, showing path questions
- `exploring` — active exploration with branching

## Key Patterns & Conventions

### State Management

- **Zustand stores are the single source of truth.** No React context for app state. Stores are accessed via `useStoreName(s => s.field)` for reactive subscriptions or `useStoreName.getState()` for imperative reads.
- **Action modules** (files in `src/store/*-actions.ts`) are standalone async functions that read/write stores imperatively — they are NOT React hooks. They are the "controller layer."
- Store `clear()` methods reset to initial state. Called when creating/switching sessions.

### Type System

- All domain types use Zod schemas (`src/core/types/*.ts`). The pattern is: define Zod schema first, derive TypeScript type via `z.infer<typeof Schema>`.
- `generateId()` returns `crypto.randomUUID()` — all entity IDs are UUIDs.
- Timestamps are ISO 8601 with offset (`z.string().datetime({ offset: true })`).

### LLM Integration

- **Persona → Provider mapping** is configurable per-session via `personaModelConfig` in settings. Default: Expansive/Analytical → Mistral, Pragmatic/Socratic → Anthropic.
- **Provider caching** by `(providerId, apiKey, model)` tuple in `providers/index.ts`.
- **Streaming** uses `requestAnimationFrame`-batched chunk flushing to avoid excessive Zustand updates.
- **Schema gates** validate every LLM response against job-type-specific Zod schemas before accepting.

### Job Lifecycle

Jobs go through: `queued → running → succeeded/failed → (retry)`. The `runJob` function in `actions.ts` manages the full lifecycle including:
- Concurrency control via `concurrencyController` (acquire/release)
- Retry logic (max 3 attempts)
- FSM transitions on both job and target node
- Result routing based on `jobType` (answer, branch, path_questions, etc.)

### Branch Depth

`MAX_BRANCH_DEPTH = 15`. Beyond this, branching is refused and the node is auto-promoted.

### Persistence

- Two separate IndexedDB databases: `fuda-plan` (session data) and `fuda-settings` (app settings). The `fuda-` prefix is preserved for backward compatibility — renaming would break existing user data.
- Auto-save subscribes to store changes with 500ms debounce.
- Hydration validates all entities through Zod — invalid entities are skipped with console warnings (graceful degradation).

### API Key Resolution

Keys are resolved: IndexedDB settings value → `VITE_*` env var → empty string. `VITE_*` env vars are **client-visible** (inlined at build time) — only for local dev.

### CSS

- **CSS Modules** for component styles (`.module.css`). No CSS-in-JS.
- **CSS custom properties** for theming. Theme file at `src/components/Settings/theme.css`. Dark mode via `[data-theme="dark"]` attribute.
- Persona colors: Expansive `#7B4FBF`, Analytical `#4A90D9`, Pragmatic `#3DAA6D`, Socratic `#D94F4F`.

## Testing

- **Vitest** with jsdom environment for component tests, node environment for `src/core/**` tests (configured via `environmentMatchGlobs` in `vitest.config.ts`).
- **`@testing-library/react`** for component tests.
- Test files live alongside code in `src/__tests__/`, mirroring the `src/` directory structure.
- Test setup (`src/__tests__/setup.ts`) polyfills `ResizeObserver` and `localStorage`/`sessionStorage` for jsdom.
- `zod` is inlined via `server.deps.inline` in vitest config (avoids ESM/CJS issues).
- Path alias `@` → `src/` is configured in vitest config and tsconfig.

### Test Reset Patterns

Modules with singleton state expose `__resetForTest()` or `__resetListenerForTest()` / `__resetSchedulerForTest()` functions. Call these in `beforeEach` to avoid state leaking between tests.

## Gotchas & Non-Obvious Details

- **DB name is `fuda-plan`, not `parallax`.** The package name is "parallax" but IndexedDB uses the legacy name. Do not rename.
- **`node-pty` requires a postinstall chmod.** The `postinstall` script fixes spawn-helper permissions on macOS. If PTY features fail, check this.
- **Vite proxy routes** (`/api/boson`, `/api/eigen`, `/api/mistral`, `/api/cartesia`) strip their prefix before forwarding. E.g., `/api/mistral/v1/chat/completions` → `https://api.mistral.ai/v1/chat/completions`.
- **Provider `DemoProvider`** is silently used when no API key is set. It returns hardcoded mock responses — tests that expect real LLM behavior need keys.
- **Streaming uses RAF batching** in `actions.ts:runJob`. Chunks are buffered and flushed on `requestAnimationFrame`, not on every chunk arrival. This affects timing in tests.
- **`verbatimModuleSyntax: true`** in tsconfig means you MUST use `import type` for type-only imports.
- **`erasableSyntaxOnly: true`** — no enums with runtime values (use `as const` objects or Zod enums instead).
- **Unused vars/params with `_` prefix** are allowed by ESLint (`argsIgnorePattern: '^_'`).
- **`src/services/terminal-tool-types.ts`** is intentionally duplicated in `server/pty-server.ts` to avoid cross-module imports between the Vite-bundled frontend and the standalone server.
- **Voice listener** has a "hard deferral" mechanism: if the user talks continuously with no utterance boundary, it forces a fire after `maxDeferralMs` to prevent indefinite silence.
- **Branch scheduler** uses a generation counter to invalidate in-flight operations after queue clears — don't rely on `inFlightTokens.size` immediately after `clearSchedulerQueue()`.

## Code Style

- **Prettier** config: no semicolons, single quotes, trailing commas, 100 char print width, 2-space indent.
- **ESLint** with `@typescript-eslint/recommended` + React hooks + React Refresh plugins.
- No CSS-in-JS; use CSS Modules.
- Component files are PascalCase directories with co-located `.module.css`: `components/FooBar/FooBar.tsx` + `FooBar.module.css`.

## Vercel Deployment

- `vercel.json` configures SPA rewrites (everything except `/api`, `/assets`, `vite.svg`, `pcm-processor.js` → `index.html`).
- `api/` directory contains Vercel serverless functions for external API proxying.
- Build command: `pnpm install --ignore-scripts && pnpm run build`. The `--ignore-scripts` flag skips the `node-pty` chmod (not needed in serverless).
- Output directory: `dist`.
