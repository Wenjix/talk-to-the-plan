# Higgs Audio Integration: Implementation Plan

## Context

The Talk to Plan voice pipeline has placeholder stubs where ElevenLabs used to be (removed — never worked properly). We're integrating Boson AI's Higgs Audio models to:
1. **Add Eigen AI** (Higgs Audio ASR V3.0 + TTS V2.5) as the voice provider for the PlanTalk modal (browser-direct, no proxy)
2. **Add voice-driven canvas manipulation** via Boson AI's Higgs Audio Understanding V3.5 (speak to a resolved node through the radial menu)

Eigen AI is the **sole voice provider** — no fallback, no provider toggle.

Architecture: **browser-first** (no Python sidecar). Eigen calls go direct from browser. Boson calls attempt browser-direct first, with a Vite dev-proxy fallback if CORS blocks — matching the existing proxy pattern in `vite.config.ts`.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Voice provider | Eigen AI only (no fallback) | Simplest path; ElevenLabs was removed |
| VAD for audio chunking | Time-based 4s split (no Silero VAD) | Avoids ~5MB ONNX dependency; add VAD later if quality demands it |
| Boson integration | Browser-direct, Vite proxy fallback | No Python sidecar; matches project's browser-first philosophy |
| Voice canvas UX | Radial menu center mic (press-and-hold) | Compelling demo centerpiece; natural interaction model |

---

## Phase 1: Eigen AI Voice (ASR + TTS)

Wire Eigen AI into the existing stub slots in `plan-talk-actions.ts`. The stubs currently throw "not yet implemented" errors.

### 1A. New File: `src/services/voice/eigen-client.ts`

```typescript
export class EigenSTTError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EigenSTTError';
    this.status = status;
  }
}

export class EigenTTSError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EigenTTSError';
    this.status = status;
  }
}

/**
 * Transcribe audio using Eigen AI Higgs ASR V3.0.
 * Endpoint: POST https://api-web.eigenai.com/api/v1/generate
 * Input: multipart/form-data { model: 'higgs_asr_3', file: Blob, language: 'English' }
 * Output: { text: string }
 */
export async function transcribeAudio(audioBlob: Blob, apiKey: string): Promise<string>

/**
 * Text-to-speech using Eigen AI Higgs Audio TTS V2.5.
 * Endpoint: POST https://api-web.eigenai.com/api/v1/generate
 * Input: multipart/form-data { model: 'higgs2p5', text, voice, stream: 'false', sampling }
 * Output: WAV audio Blob
 * Default voice: 'Linda' (alternatives: 'Jack', etc.)
 */
const DEFAULT_VOICE = 'Linda';
export async function textToSpeech(text: string, apiKey: string, voiceId?: string): Promise<Blob>
```

**Implementation details:**
- `transcribeAudio`: 30s AbortController timeout. FormData: `model='higgs_asr_3'`, `file=audioBlob` (filename `recording.webm`), `language='English'`. Auth: `Authorization: Bearer ${apiKey}`. Error mapping: 401 → "Invalid Eigen AI API key", 429 → rate limit.
- `textToSpeech`: 15s timeout. FormData: `model='higgs2p5'`, `text`, `voice=voiceId||'Linda'`, `stream='false'`, `sampling=JSON.stringify({temperature:0.85,top_p:0.95,top_k:50})`. Returns `res.blob()` (WAV — `AudioPlayback.play()` handles natively).

### 1B. Modify: `src/persistence/settings-store.ts`

Add to `AppSettingsSchema`:
```typescript
eigenApiKey: z.string().default(''),
```

Add env fallback helper:
```typescript
export function resolveEigenApiKey(settings: AppSettings): string {
  return settings.eigenApiKey || (import.meta.env?.VITE_EIGEN_API_KEY as string) ?? '';
}
```

### 1C. Modify: `src/components/Settings/ApiTab.tsx`

- Add `ApiKeyField` for "Eigen AI" (same reusable pattern as existing Mistral/Gemini/etc fields)
- Update `voiceTtsVoiceId` placeholder to `"Linda (default)"`
- Update help text: "Voice powered by Eigen AI (Higgs Audio)"

### 1D. Modify: `src/store/plan-talk-actions.ts`

Replace the temporary stubs with real Eigen imports:
```typescript
import { transcribeAudio, EigenSTTError, textToSpeech } from '../services/voice/eigen-client';
```

Update `analyzeReflection()` TTS calls to use `settings.eigenApiKey`:
```typescript
if (settings.voiceTtsEnabled && settings.eigenApiKey) {
  generateTts(aiTurnId, understanding, settings.eigenApiKey, settings.voiceTtsVoiceId, settings.voiceAutoPlayAi);
}
```

Update `transcribeAndAnalyze()` error handling:
```typescript
const message = err instanceof EigenSTTError
  ? err.message
  : 'Transcription failed. Please try again.';
```

### 1E. Modify: `src/components/PlanTalkModal/VoicePane.tsx`

Re-enable mic button (currently disabled with "Voice coming soon"):
- Load `eigenApiKey` from settings
- Use `VoiceRecorder` (MediaRecorder blob) to capture audio
- On stop: call `transcribeAndAnalyze(blob, eigenApiKey)`
- Support hold-to-talk and toggle modes via `voiceInputMode` setting

### Phase 1 — No New Dependencies

Zero new npm packages. Eigen API uses standard `multipart/form-data` over HTTPS.

---

## Phase 2: Voice-Driven Canvas (Demo Centerpiece)

Right-click a resolved node → hold center mic in radial menu → speak → canvas responds with branching, promoting, dialogue, or verbal reply.

**Depends on:** Phase 1 complete (Eigen TTS used for confirmation audio).

### CORS Strategy

Boson endpoint: `https://hackathon.boson.ai/v1/chat/completions`

1. **Browser-direct (try first):** If hackathon endpoint sets permissive CORS headers, this works with zero infrastructure.
2. **Vite dev-proxy (fallback):** Add to `vite.config.ts`:
   ```typescript
   '/api/boson': {
     target: 'https://hackathon.boson.ai',
     changeOrigin: true,
     rewrite: (path) => path.replace(/^\/api\/boson/, ''),
   }
   ```
   Client calls `/api/boson/v1/chat/completions`. Consistent with existing proxy patterns.

### 2A. New File: `src/services/voice/audio-chunker.ts`

Time-based 4-second chunking with WAV encoding. No VAD, no ONNX.

```typescript
interface AudioChunk {
  index: number;
  dataUrl: string; // "data:audio/wav_0;base64,..."
}

interface ChunkResult {
  chunks: AudioChunk[];
  durationSec: number;
  numChunks: number;
}

/**
 * Split raw PCM Float32Array into <=4s WAV base64 segments.
 * 1. Split into 4-second segments (4 * sampleRate samples each)
 * 2. Convert Float32 → Int16 PCM
 * 3. Prepend 44-byte RIFF WAV header (mono, 16-bit, sampleRate)
 * 4. Base64-encode → data URL with sequential mime types per Boson spec
 */
export function chunkPcmBuffer(pcmFloat32: Float32Array, sampleRate: number): ChunkResult

// Helper: Write 44-byte RIFF WAV header into a DataView
function writeWavHeader(view: DataView, sampleRate: number, numSamples: number): void

// Helper: Encode Int16Array with WAV header to base64 data URL
function encodeWavChunk(pcmInt16: Int16Array, sampleRate: number, index: number): string
```

### 2B. Modify: `src/services/voice/media-recorder.ts`

Add `BufferedPCMRecorder` class (after existing `PCMRecorder`, ~line 91):

```typescript
/**
 * Like PCMRecorder but accumulates all PCM chunks into a single buffer
 * instead of streaming them. Used for voice commands where we need
 * the complete audio before processing.
 */
export class BufferedPCMRecorder {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private chunks: Int16Array[] = [];
  private startedAt = 0;

  /** Same AudioContext + AudioWorklet setup as PCMRecorder (16kHz) */
  async start(): Promise<void>

  /** Concatenate accumulated chunks → single Float32Array */
  stop(): Float32Array

  getElapsedMs(): number
  destroy(): void
}
```

Reuses existing `public/pcm-processor.js` AudioWorklet — no changes needed.

### 2C. New File: `src/services/voice/boson-client.ts`

```typescript
const BOSON_BASE_URL = 'https://hackathon.boson.ai/v1';
// Fallback: '/api/boson/v1' (via Vite proxy if CORS blocks)

const STOP_SEQUENCES = ['<|eot_id|>', '<|endoftext|>', '<|audio_eos|>', '<|im_end|>'];
const EXTRA_BODY = { skip_special_tokens: false };
const MODEL_PRIMARY = 'higgs-audio-understanding-v3.5-Hackathon';
const MODEL_FALLBACK = 'higgs-audio-understanding-v3-Hackathon';

export class BosonAUError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'BosonAUError';
    this.status = status;
  }
}

interface BosonAudioRequest {
  audioChunks: AudioChunk[];    // From audio-chunker.ts
  systemPrompt: string;         // Context + tool definitions
  userText?: string;            // Optional text before audio
  model?: string;               // Default: v3.5
}

/**
 * Send audio to Boson Higgs Audio Understanding.
 * Builds OpenAI-compatible chat completions payload:
 *   messages[0] = { role: "system", content: systemPrompt }
 *   messages[1] = { role: "user", content: [...audio_url parts] }
 * Returns raw response text (may contain <tool_call> tags).
 * On v3.5 failure, retries once with v3 fallback model.
 */
export async function audioUnderstand(
  request: BosonAudioRequest,
  apiKey: string,
): Promise<string>
```

**Message format per Boson spec:**
```typescript
messages: [
  { role: 'system', content: systemPromptWithTools },
  { role: 'user', content: [
    ...(userText ? [{ type: 'text', text: userText }] : []),
    ...audioChunks.map(c => ({ type: 'audio_url', audio_url: { url: c.dataUrl } })),
  ]},
]
```

### 2D. New File: `src/services/voice/canvas-tools.ts`

Tool definitions using real enum values from the codebase:
- `PathType` from `src/core/types/primitives.ts`: `clarify | go-deeper | challenge | apply | connect | surprise`
- `PromotionReason` from `src/core/types/promotion.ts`: `insightful_reframe | actionable_detail | risk_identification | assumption_challenge | cross_domain_link`
- `DialecticMode` from `src/core/types/dialogue.ts`: `socratic | devil_advocate | steelman | collaborative`

```typescript
export const CANVAS_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'branch_exploration',
      description: 'Create a new branch from the current node to explore a specific direction',
      parameters: {
        type: 'object',
        properties: {
          path_type: {
            type: 'string',
            enum: ['clarify', 'go-deeper', 'challenge', 'apply', 'connect', 'surprise'],
          },
          question: { type: 'string', description: 'The specific follow-up question for the new branch' },
        },
        required: ['path_type', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promote_insight',
      description: 'Mark the current node as a key planning insight worth preserving',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['insightful_reframe', 'actionable_detail', 'risk_identification', 'assumption_challenge', 'cross_domain_link'],
          },
          note: { type: 'string', description: 'Why this insight matters for the plan' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_dialogue',
      description: 'Open a dialectic dialogue to explore this node conversationally',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['socratic', 'devil_advocate', 'steelman', 'collaborative'],
          },
          opening: { type: 'string', description: 'Initial dialogue message based on voice input' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'voice_response',
      description: 'Respond verbally when no canvas action is appropriate',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'What to say back to the user' },
        },
        required: ['message'],
      },
    },
  },
];

/** Format tools into <tools>...</tools> XML block for system prompt */
export function formatToolsForPrompt(): string
```

### 2E. New File: `src/services/voice/tool-executor.ts`

Parses `<tool_call>` JSON from Boson response, dispatches to existing store actions.

```typescript
interface ToolCallResult {
  toolName: string;
  success: boolean;
  message: string; // TTS-friendly confirmation
}

/**
 * Parse <tool_call>{"name":"...","arguments":{...}}</tool_call> from response.
 * Execute corresponding store action. Return confirmation message for TTS.
 */
export async function executeToolCall(
  responseText: string,
  targetNodeId: string,
): Promise<ToolCallResult>
```

**Tool → action mapping:**
| Tool | Store Action | Source |
|------|-------------|--------|
| `branch_exploration` | `branchFromNode(nodeId, pathType)` | `src/store/actions.ts` |
| `promote_insight` | `promoteNode(nodeId, reason, note)` | `src/store/promotion-actions.ts` |
| `start_dialogue` | `addUserTurn(nodeId, opening, mode)` + `generateDialogueResponse(nodeId, mode)` | `src/store/dialogue-actions.ts` |
| `voice_response` | No store action; return `message` for TTS | — |

**Fallback:** If no `<tool_call>` tag found, treat entire response as a `voice_response` message.

### 2F. New File: `src/services/voice/voice-prompt.ts`

```typescript
import { compileContext } from '../../core/graph/context-compiler';
import { formatToolsForPrompt } from './canvas-tools';
import type { SemanticNode, SemanticEdge } from '../../core/types';

/**
 * Build system prompt for Boson Audio Understanding.
 * Includes: role, node context (via compileContext), session topic, tool definitions.
 */
export function buildVoiceSystemPrompt(
  nodeId: string,
  nodes: SemanticNode[],
  edges: SemanticEdge[],
  sessionTopic: string,
): string
```

Prompt structure:
```
You are a voice-driven planning assistant for the FUDA exploration canvas.
The user is examining a specific node and speaking a command.

Session topic: {sessionTopic}

Current Node:
- Question: {node.question}
- Answer: {node.answer?.summary}
- Depth: {node.depth}

{compileContext(nodeId, nodes, edges).formatted}

Based on what the user says, choose ONE tool call.
- Explore further → branch_exploration
- Mark important → promote_insight
- Discuss/debate → start_dialogue
- None of the above → voice_response

<tools>
{formatToolsForPrompt()}
</tools>
```

### 2G. New File: `src/store/voice-command-store.ts`

```typescript
import { create } from 'zustand';

interface VoiceCommandState {
  isRecording: boolean;
  isProcessing: boolean;
  targetNodeId: string | null;
  lastResult: { toolName: string; success: boolean; message: string } | null;
  error: string | null;

  startRecording: (nodeId: string) => void;
  stopRecording: () => void;
  setProcessing: (processing: boolean) => void;
  setResult: (result: { toolName: string; success: boolean; message: string }) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}

export const useVoiceCommandStore = create<VoiceCommandState>()((set) => ({
  isRecording: false,
  isProcessing: false,
  targetNodeId: null,
  lastResult: null,
  error: null,

  startRecording: (nodeId) => set({ isRecording: true, targetNodeId: nodeId, error: null, lastResult: null }),
  stopRecording: () => set({ isRecording: false }),
  setProcessing: (processing) => set({ isProcessing: processing }),
  setResult: (result) => set({ lastResult: result, isProcessing: false }),
  setError: (error) => set({ error, isProcessing: false }),
  clear: () => set({ isRecording: false, isProcessing: false, targetNodeId: null, lastResult: null, error: null }),
}));
```

### 2H. New File: `src/store/voice-command-actions.ts`

Full pipeline orchestration:

```typescript
import { useVoiceCommandStore } from './voice-command-store';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { loadSettings, resolveEigenApiKey } from '../persistence/settings-store';
import { BufferedPCMRecorder } from '../services/voice/media-recorder';
import { chunkPcmBuffer } from '../services/voice/audio-chunker';
import { audioUnderstand } from '../services/voice/boson-client';
import { executeToolCall } from '../services/voice/tool-executor';
import { buildVoiceSystemPrompt } from '../services/voice/voice-prompt';
import { textToSpeech as eigenTts } from '../services/voice/eigen-client';
import { audioPlayback } from '../services/voice/audio-playback';

let recorder: BufferedPCMRecorder | null = null;

export async function startVoiceCommand(nodeId: string): Promise<void> {
  // 1. Create BufferedPCMRecorder, start recording
  // 2. Update voice-command-store: startRecording(nodeId)
}

export async function stopAndProcessVoiceCommand(): Promise<void> {
  // 1. Stop recording → get Float32Array PCM buffer
  // 2. Destroy recorder
  // 3. Set store to processing
  // 4. Chunk audio via chunkPcmBuffer(buffer, 16000)
  // 5. Guard: if chunks empty or duration < 0.5s → "No speech detected"
  // 6. Build system prompt via buildVoiceSystemPrompt()
  // 7. Call audioUnderstand() with chunks + prompt
  // 8. Parse + execute tool call via executeToolCall()
  // 9. Store result
  // 10. TTS confirmation via Eigen (non-blocking)
}

export function cancelVoiceCommand(): void {
  // Destroy recorder, clear store
}
```

### 2I. Modify: `src/persistence/settings-store.ts` (Phase 2 addition)

Add to `AppSettingsSchema`:
```typescript
bosonApiKey: z.string().default(''),
```

Add helper:
```typescript
export function resolveBosonApiKey(settings: AppSettings): string {
  return settings.bosonApiKey || (import.meta.env?.VITE_BOSON_API_KEY as string) ?? '';
}
```

### 2J. Modify: `src/components/Settings/ApiTab.tsx` (Phase 2 addition)

- Add `ApiKeyField` for "Boson AI (Audio Understanding)"
- Help text: "Used for voice commands on the exploration canvas."

### 2K. Modify: `src/store/radial-menu-store.ts`

Add voice state:
```typescript
interface RadialMenuState {
  // ... existing fields ...
  voiceState: 'idle' | 'recording' | 'processing' | 'success' | 'error';
  setVoiceState: (state: 'idle' | 'recording' | 'processing' | 'success' | 'error') => void;
}
```

### 2L. Modify: `src/components/RadialMenu/RadialMenu.tsx`

Add center microphone button at position (0, 0) — the center of the existing 6-button ring:

```tsx
// New imports
import { useVoiceCommandStore } from '../../store/voice-command-store';
import { startVoiceCommand, stopAndProcessVoiceCommand, cancelVoiceCommand } from '../../store/voice-command-actions';

// Inside RadialMenu component:
const isVoiceRecording = useVoiceCommandStore(s => s.isRecording);
const isVoiceProcessing = useVoiceCommandStore(s => s.isProcessing);

// Center mic button (press-and-hold)
<button
  className={`${styles.micButton} ${isVoiceRecording ? styles.micRecording : ''} ${isVoiceProcessing ? styles.micProcessing : ''}`}
  style={{
    left: -BUTTON_RADIUS,
    top: -BUTTON_RADIUS,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  }}
  onPointerDown={() => {
    if (!isDisabled && hasBosonKey && targetNodeId) {
      startVoiceCommand(targetNodeId);
    }
  }}
  onPointerUp={() => {
    if (isVoiceRecording) stopAndProcessVoiceCommand();
  }}
  onPointerLeave={() => {
    if (isVoiceRecording) cancelVoiceCommand();
  }}
  disabled={isDisabled || !hasBosonKey || isVoiceProcessing}
  aria-label="Hold to speak a voice command"
/>
```

**Visual feedback:**
- Idle: mic icon, subtle pulse
- Recording: red ring, expanding animation, elapsed timer
- Processing: spinner overlay
- Success: green flash → auto-close radial menu after 500ms
- Error: red flash + toast notification

### 2M. Modify: `src/components/RadialMenu/RadialMenu.module.css`

```css
.micButton {
  position: absolute;
  border-radius: 50%;
  background: var(--card-bg);
  border: 2px solid var(--accent-primary);
  z-index: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.micButton:hover:not(:disabled) {
  transform: scale(1.1);
}

.micRecording {
  border-color: #d94f4f;
  animation: micPulse 1s ease-in-out infinite;
}

.micProcessing {
  opacity: 0.7;
  cursor: wait;
}

@keyframes micPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217, 79, 79, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(217, 79, 79, 0); }
}
```

---

## Files Summary

### New Files (8)

| File | Purpose |
|------|---------|
| `src/services/voice/eigen-client.ts` | Eigen AI ASR + TTS client |
| `src/services/voice/audio-chunker.ts` | Time-based 4s PCM chunking + WAV encoding |
| `src/services/voice/boson-client.ts` | Higgs Audio Understanding client |
| `src/services/voice/canvas-tools.ts` | Tool definitions for canvas voice actions |
| `src/services/voice/tool-executor.ts` | Tool call → store action mapping |
| `src/services/voice/voice-prompt.ts` | System prompt builder with node context |
| `src/store/voice-command-store.ts` | Voice command Zustand store |
| `src/store/voice-command-actions.ts` | Voice command orchestration |

### Modified Files (7)

| File | Changes |
|------|---------|
| `src/persistence/settings-store.ts` | Add `eigenApiKey`, `bosonApiKey` + resolver helpers |
| `src/components/Settings/ApiTab.tsx` | Add Eigen + Boson API key fields |
| `src/store/plan-talk-actions.ts` | Replace stubs with Eigen imports, use `eigenApiKey` |
| `src/services/voice/media-recorder.ts` | Add `BufferedPCMRecorder` class |
| `src/store/radial-menu-store.ts` | Add `voiceState` field |
| `src/components/RadialMenu/RadialMenu.tsx` | Add center mic button |
| `src/components/RadialMenu/RadialMenu.module.css` | Mic button styles + animations |

**Also modify** (Phase 1):
| `src/components/PlanTalkModal/VoicePane.tsx` | Re-enable mic with Eigen ASR via VoiceRecorder blob |

### Existing Code Reused (no changes needed)

| File | What's Reused |
|------|---------------|
| `src/core/graph/context-compiler.ts` | `compileContext()` for building voice prompt node context |
| `src/store/actions.ts` | `branchFromNode(nodeId, pathType)` for tool-executed branching |
| `src/store/promotion-actions.ts` | `promoteNode(nodeId, reason, note)` for tool-executed promotion |
| `src/store/dialogue-actions.ts` | `addUserTurn()` + `generateDialogueResponse()` for tool-executed dialogue |
| `src/services/voice/audio-playback.ts` | `audioPlayback` singleton for TTS playback |
| `public/pcm-processor.js` | AudioWorklet processor (shared by PCMRecorder and BufferedPCMRecorder) |

---

## Error Handling

| Failure | Detection | User Recovery | System Recovery |
|---------|-----------|---------------|-----------------|
| Mic permission denied | `getUserMedia` rejection | Inline mic-denied state; typed input stays available | No auto-retry |
| Eigen ASR timeout | Fetch timeout (30s) or non-2xx | "Transcription failed, try again" toast | Reset turn state to `error` |
| Eigen TTS failure | Fetch timeout (15s) or autoplay block | Text stays visible; TTS chip shows "failed" | Never block plan output on TTS |
| Boson CORS blocked | Fetch TypeError | "Audio Understanding unavailable" toast | Fall back to Vite proxy path |
| Boson invalid response | No `<tool_call>` tag found | Treat entire response as verbal reply | Falls through to `voice_response` |
| Boson rate limit / 5xx | HTTP status code | "Audio Understanding busy, try again" | Retry once with v3 fallback model |
| Audio too short (<0.5s) | Duration check before API call | "Try speaking longer" feedback | Reject before expensive API call |
| No Boson API key | Settings check | Mic button disabled with tooltip | N/A |
| Old persisted settings | Zod `.default()` on new fields | Silent migration | Missing fields auto-default |

---

## Dependency Graph

```
Phase 1A: eigen-client.ts         ─┐
Phase 1B: settings-store.ts        │ (1A + 1B parallel)
Phase 1C: Settings/ApiTab.tsx       │ (depends on 1B)
Phase 1D: plan-talk-actions.ts      │ (depends on 1A, 1B)
Phase 1E: VoicePane.tsx            ─┘ (depends on 1A, 1D)

─── Phase 1 Complete ───

Phase 2A: audio-chunker.ts        ─┐
Phase 2B: BufferedPCMRecorder       │
Phase 2D: canvas-tools.ts          │ (2A, 2B, 2D, 2G, 2K all parallel)
Phase 2G: voice-command-store.ts    │
Phase 2K: radial-menu-store.ts    ─┘
          │
Phase 2C: boson-client.ts          (depends on 2A)
Phase 2E: tool-executor.ts         (depends on 2D)
Phase 2F: voice-prompt.ts          (depends on 2D)
Phase 2I: settings-store.ts        (bosonApiKey addition)
Phase 2J: Settings/ApiTab.tsx       (depends on 2I)
          │
Phase 2H: voice-command-actions.ts  (depends on 2A-2G — integration point)
          │
Phase 2L: RadialMenu.tsx           ─┐
Phase 2M: RadialMenu.module.css    ─┘ (depends on 2G, 2H, 2K)
```

---

## Not In Scope

- **No `@ricky0123/vad-web`** — time-based chunking first; add Silero VAD later if audio quality demands it
- **No Python sidecar** — Vite proxy covers CORS without deployment complexity
- **No PlanTalk Audio Understanding mode** — defer until Phase 2 proves Boson quality
- **No Canvas Voice Notes** — separate feature, not needed for demo
- **No DialoguePanel voice** — out of scope for initial delivery

---

## Verification

### Phase 1 (Eigen Voice)
1. Set Eigen AI API key in Settings
2. Open PlanTalk, record voice → verify ASR returns transcript
3. Verify AI response generates TTS via Eigen endpoint
4. Verify WAV audio plays correctly
5. Verify typed input still works as before

### Phase 2 (Voice Canvas)
1. Set Boson AI API key in Settings
2. Create a session, explore until at least one node is resolved
3. Right-click resolved node → radial menu shows center mic button
4. Hold mic → speak "Challenge the assumption about market size" → release
5. Verify: new Challenge branch appears with AI-generated question
6. Hold mic → speak "This is a great insight, promote it" → release
7. Verify: node gets promoted with appropriate reason
8. Hold mic → speak "Let's debate this further" → release
9. Verify: dialogue panel opens in appropriate dialectic mode
10. Verify TTS plays confirmation after each action

### Error Cases
- No Boson API key set → mic button disabled with tooltip
- Audio < 0.5s → "Try speaking longer" feedback
- API error → red flash, error toast, menu stays open
- No speech detected → "I didn't catch that" TTS
