# Voice-First Canvas: Prioritized Voice Feature Design

## Context

Talk to the Plan has four deferred voice features (tracked in beads issue `talk-to-the-plan-yy9`). The user wants to test Boson Audio Understanding, enable radial menu voice branching, and enhance the UX flow of the canvas-based branching research tool. From an IDEO human-centered design perspective, the features that reduce friction in the existing explore → promote → synthesize → reflect loop have the highest impact.

**Prioritization (Approach A: Voice-First Canvas):**

1. **Feature 2: Boson Audio Understanding** — wire up existing center mic end-to-end
2. **Feature 3: Canvas Voice Notes** — new radial menu wedge + node annotation
3. **Feature 4: DialoguePanel Full Voice I/O** — spoken dialectic conversations
4. **Feature 1: Silero VAD** — deferred until chunking quality is evaluated

---

## Feature 2: Boson Audio Understanding (Center Mic)

### Current State

The full pipeline is already wired:

```
RadialMenu.tsx (pointerDown/Up)
  → voice-command-actions.ts (start/stopAndProcessVoiceCommand)
    → media-recorder.ts (BufferedPCMRecorder → Float32Array)
    → audio-chunker.ts (chunkPcmBuffer → 4s WAV chunks)
    → boson-client.ts (audioUnderstand → response text)
    → tool-executor.ts (parseToolCall → executeToolCall)
      → actions.ts (branchFromNode)
```

Visual states (recording/processing/success/error) are wired via `useVoiceCommandStore` into RadialMenu CSS.

### Changes Required

#### 1. Prompt Enhancement (`src/services/voice/voice-prompt.ts`)

The current prompt is too sparse for reliable tool-call responses. Add:

- **PathType mapping table** — natural speech → enum values:
  - Clarifying, refining, sharpening → `clarify`
  - Going deeper, digging in, specifics → `go-deeper`
  - Challenging, pushing back, questioning → `challenge`
  - Making actionable, applying, practical → `apply`
  - Connecting, linking, cross-referencing → `connect`
  - Unexpected angle, creative pivot → `surprise`

- **Explicit format example:**
  ```
  <tool_call>{"name": "branch_exploration", "arguments": {"path_type": "go-deeper", "question": "How does X specifically impact Y?"}}</tool_call>
  ```

- **Question formulation guidance** — instruct model to generate an exploration question capturing user intent, not a literal transcript

- **Best-fit instruction** — if speech doesn't perfectly match a path, choose the closest one

#### 2. PathType Alias Normalization (`src/services/voice/tool-executor.ts`)

Add a normalization map before `PathTypeSchema.parse()` in the `branch_exploration` case:

```typescript
const PATH_TYPE_ALIASES: Record<string, string> = {
  // go-deeper aliases
  'deeper': 'go-deeper', 'deep': 'go-deeper', 'deepen': 'go-deeper',
  'go_deeper': 'go-deeper', 'dig-deeper': 'go-deeper',
  // clarify aliases
  'clarification': 'clarify', 'explain': 'clarify', 'sharpen': 'clarify',
  // challenge aliases
  'push-back': 'challenge', 'push_back': 'challenge', 'question': 'challenge',
  // apply aliases
  'practical': 'apply', 'actionable': 'apply', 'implement': 'apply',
  // connect aliases
  'link': 'connect', 'relate': 'connect', 'cross-reference': 'connect',
  // surprise aliases
  'unexpected': 'surprise', 'creative': 'surprise', 'pivot': 'surprise',
};
const rawPathType = String(args.path_type).toLowerCase().trim();
const normalizedPathType = PATH_TYPE_ALIASES[rawPathType] ?? rawPathType;
const pathType = PathTypeSchema.parse(normalizedPathType) as PathType;
```

#### 3. Optional: Format Instruction in Tool Template (`src/services/voice/canvas-tools.ts`)

Modify `formatToolsForPrompt()` to prepend output format instruction.

### Files Modified

| File | Change |
|------|--------|
| `src/services/voice/voice-prompt.ts` | Enhance system prompt with mapping table, format examples, question guidance |
| `src/services/voice/tool-executor.ts` | Add PathType alias normalization (~10 lines) |
| `src/services/voice/canvas-tools.ts` | Minor: embed `<tool_call>` format instruction |

### Files Unchanged (already complete)

- `src/components/RadialMenu/RadialMenu.tsx` — pointer handlers and visual states
- `src/store/voice-command-actions.ts` — full orchestration pipeline
- `src/services/voice/boson-client.ts` — dual-URL strategy, model fallback, timeout
- `src/services/voice/audio-chunker.ts` — Float32 → WAV chunks
- `src/services/voice/media-recorder.ts` — BufferedPCMRecorder

### Edge Cases (already handled)

| Edge Case | Handler | Status |
|-----------|---------|--------|
| Recording < 0.5s | `voice-command-actions.ts:80` | Done |
| No speech / empty buffer | `voice-command-actions.ts:75` | Done |
| Missing Boson API key | `voice-command-actions.ts:92` | Done |
| Boson API failure | `voice-command-actions.ts:112` | Done |
| Boson timeout (30s) | `boson-client.ts` AbortController | Done |
| Boson 5xx | `boson-client.ts` model fallback to v3 | Done |
| CORS failure | `boson-client.ts` Vite proxy fallback | Done |
| No `<tool_call>` in response | `tool-executor.ts:69` fallback to voice_response | Done |
| Invalid PathType | `tool-executor.ts` Zod parse catch | Done (improved by alias map) |
| Mic permission denied | `media-recorder.ts` MicPermissionError | Done |
| Cancel via pointer leave | `RadialMenu.tsx` cancelVoiceCommand() | Done |
| Cancel via Escape | `RadialMenu.tsx` cancelVoiceCommand() + close | Done |

---

## Feature 3: Canvas Voice Notes (New Wedge)

### Design Rationale (IDEO)

Voice notes capture the *thinking between actions* — the researcher's ambient reactions that currently evaporate. They lower the barrier from "formulate a typed thought" to "just say it." This is IDEO's "capture the peripheral" principle: the most valuable insights often emerge at the margins, not during deliberate analysis.

### Interaction Design

1. Right-click node → RadialMenu opens with 7 buttons (6 paths + Voice Note)
2. Click "Note" wedge → recording begins
3. RadialMenu transforms: wedge buttons fade, center becomes stop button with live duration counter, border pulses red
4. User speaks their thought (tap-to-toggle, not hold — notes may be 30+ seconds)
5. Tap center stop button → recording ends
6. Audio saved to node, transcribed in background via Eigen ASR
7. Menu shows "Saved" flash, auto-closes after 1200ms
8. Node's ExplorationCard shows voice note indicator (audio icon + count badge)
9. Click indicator → dropdown with playback, transcript, delete per note

### Data Model

New type in `src/core/types/voice-note.ts`:

```typescript
export const VoiceNoteSchema = z.object({
  id: UUIDSchema,
  sessionId: UUIDSchema,
  nodeId: UUIDSchema,
  durationMs: z.number().int().nonneg(),
  mimeType: z.string(),
  transcript: z.string().optional(),
  transcriptStatus: z.enum(['pending', 'done', 'failed']).default('pending'),
  createdAt: ISODateTimeSchema,
});
```

Audio blobs stored separately in `voiceNoteBlobs` IndexedDB store (keyed by note ID) to avoid Zod-validated metadata bloat.

### Duration Tracking

`VoiceRecorder.getElapsedMs()` returns 0 after `stop()` is called (recording flag is cleared first). To capture duration accurately, call `getElapsedMs()` *before* calling `stop()` and pass it to the VoiceNote constructor. The `voice-note-actions.ts` lifecycle must sequence this correctly:

```typescript
const durationMs = recorder.getElapsedMs(); // capture BEFORE stop
const blob = await recorder.stop();
```

### Recording Lifecycle: Backdrop Close

If the user clicks the RadialMenu backdrop (which calls `close()`) while a voice note is recording, the recording is **auto-saved** (not discarded). The `close()` handler must check `isRecordingNote` and, if true, call `stopVoiceNoteRecording()` before closing. This preserves the user's spoken thought rather than silently losing it.

### Blob Storage Limits

- **Max recording duration:** 120 seconds (2 minutes). The recording timer enforces this; auto-stop at limit.
- **Session deletion cascade:** When a session is deleted, all voice notes and blobs for that session must be deleted. Add cleanup to the session deletion flow in `repository.ts`.
- **Quota awareness:** Check `src/persistence/quota.ts` before saving; if near quota, show a toast warning and still attempt the save (IndexedDB will throw if truly full).

### IndexedDB Migration

Bump `DB_VERSION` (3 → 4). Add two new stores:

- `voiceNotes` — metadata, indexed by `sessionId` and `nodeId`
- `voiceNoteBlobs` — `{ id: string; blob: Blob }`

### RadialMenu Changes

**Spacing:** 7 buttons at 24° intervals across 200°–344° arc. Increase RADIUS from 110→140px to ensure adequate touch-target clearance. At 140px radius, arc distance between adjacent button centers is `2 × 140 × sin(12°) = 58.2px`, giving ~12px edge-to-edge clearance with 46px buttons. (At 120px the clearance would be only ~3px — too tight for touch.)

**New button config:**
```
{ key: 'voice-note', label: 'Note', color: '#e67e22', angle: 344, description: 'Attach voice note', group: 'annotate', type: 'voiceNote' }
```

**Click handler routing:** Add `type` field to PathConfig. In `handleSelect`:
```typescript
if (p.type === 'voiceNote') startVoiceNoteRecording(targetNodeId);
else branchFromNode(targetNodeId, p.path);
```

**Recording state:** When `isRecording`, wedge buttons get `opacity: 0.3`, center transforms to stop icon + duration counter. Reuse `.micRecording` pulse animation.

### New Files

| File | Purpose |
|------|---------|
| `src/core/types/voice-note.ts` | VoiceNote schema and type |
| `src/store/voice-note-store.ts` | CRUD store for voice notes |
| `src/store/voice-note-recording-store.ts` | Recording UI state (separate from voice-note-store to keep ephemeral recording state out of persisted note data; follows the same pattern separation as useVoiceCommandStore vs useRadialMenuStore) |
| `src/store/voice-note-actions.ts` | start/stop/transcribe/delete/play lifecycle |
| `src/components/VoiceNoteIndicator/VoiceNoteIndicator.tsx` | Indicator + dropdown on ExplorationCard |
| `src/components/VoiceNoteIndicator/VoiceNoteIndicator.module.css` | Styles |

### Modified Files

| File | Change |
|------|--------|
| `src/core/types/index.ts` | Export voice-note types |
| `src/persistence/schema.ts` | DB_VERSION bump, new stores |
| `src/persistence/repository.ts` | Migration block, SessionEnvelope update |
| `src/persistence/hooks.ts` | Save/restore/subscribe voice notes |
| `src/components/RadialMenu/RadialMenu.tsx` | 7th button, angle redistribution, recording state |
| `src/components/RadialMenu/RadialMenu.module.css` | Recording-mode styles |
| `src/components/ExplorationCard/ExplorationCard.tsx` | Render VoiceNoteIndicator |

### Guard: Recorder Conflict

Disable center mic button while voice note is recording (and vice versa). Both recording stores cross-check to prevent dual mic acquisition.

---

## Feature 4: DialoguePanel Full Voice I/O

### Design Rationale (IDEO)

A spoken Socratic dialogue engages different cognitive pathways than typing. It's more improvisational, more emotionally resonant, and closer to how humans naturally debate ideas. The DialoguePanel already has 4 dialectic modes — adding voice transforms it from a chat interface into an intellectual sparring partner.

### Implementation Approach

Reuse proven patterns from PlanTalkModal's `VoicePane`:

**Voice Input:**
- Add mic button to DialoguePanel input area (alongside text input)
- Use `VoiceRecorder` → `transcribeAudio()` (Eigen ASR) → feed transcript into `addUserTurn(nodeId, transcript, mode)` with `source: 'voice'`
- Support both hold-to-talk and toggle modes (consistent with PlanTalkModal)
- Show recording timer during capture

**Voice Output:**
- After AI response stream completes, auto-generate TTS via `textToSpeech()` + `audioPlayback.play()`
- Show replay button on each AI turn
- Per-turn TTS status tracking: disabled/loading/ready/failed
- Respect `voiceTtsEnabled` setting

### Modified Files

| File | Change |
|------|--------|
| `src/components/DialoguePanel/DialoguePanel.tsx` | Add mic button, recording state, TTS replay buttons |
| `src/store/dialogue-actions.ts` | Add TTS generation hook *after* the store write in `generateDialogueResponse()` (post-stream, when full text is available). Track per-turn TTS status in dialogue store. |
| `src/core/types/dialogue.ts` | Add `source: z.enum(['voice', 'typed']).optional()` to `DialogueTurn` — must be `.optional()` for backward compatibility with existing persisted turns (no DB migration needed) |

### No New Infrastructure

All primitives exist: `VoiceRecorder`, `transcribeAudio()`, `textToSpeech()`, `audioPlayback`. The work is UI integration and action wiring.

---

## Feature 1: Silero VAD (Deferred)

### When to Revisit

After testing Features 2 and 3 with real usage. Evaluate:
- Does Boson handle 4-second chunk boundaries gracefully?
- Are transcripts from Eigen ASR clean at chunk edges?
- Does the user perceive quality issues?

If yes to quality issues, add Silero VAD (~5MB ONNX dependency) to replace time-based chunking with speech-boundary-aware chunking.

---

## Implementation Order

### Phase 1: Boson Mic (Feature 2)
- Modify 2-3 files, ~50 lines
- Immediate testability — validates Boson quality
- Unblocks evaluation of Feature 1 (VAD need)

### Phase 2: Voice Notes (Feature 3)
- Create ~6 files, modify ~7 files
- DB migration, new data type, new UI component
- Builds on proven recording/transcription infrastructure

### Phase 3: DialoguePanel Voice (Feature 4)
- Modify ~3 files
- Reuses PlanTalkModal patterns
- Most ambitious UX change but least infrastructure

### Phase 4: Silero VAD (Feature 1)
- Only if quality testing reveals chunking issues

---

## Verification

### Feature 2 Testing
1. Right-click resolved node → hold center mic → speak "dig deeper into this" → verify go-deeper branch created
2. Test all 6 path types with natural speech variants
3. Test ambiguous commands → verify graceful fallback to voice_response
4. Test error cases: tap-without-speaking, missing API key, network failure
5. Evaluate Boson response quality and latency

### Feature 3 Testing
1. Right-click node → click Note wedge → speak for 5-10 seconds → tap stop
2. Verify audio saved, indicator appears on ExplorationCard
3. Click indicator → verify playback works
4. Verify background transcription completes
5. Close and reopen session → verify notes persist
6. Test concurrent recording guard (mic button disabled during note recording)

### Feature 4 Testing
1. Open DialoguePanel on a node → click mic → speak response
2. Verify transcription → AI response → auto TTS playback
3. Test all 4 dialectic modes with voice
4. Test replay buttons on AI turns
5. Verify `voiceTtsEnabled` setting is respected
