import { useSessionStore } from './session-store';
import { useSemanticStore } from './semantic-store';
import { usePlanTalkStore } from './plan-talk-store';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';
import { getDefaultProvider } from '../generation/providers';
import { buildPlanReflectionPrompt } from '../generation/prompts/plan-reflection';
import { PlanReflectionResponseSchema } from '../core/types';
import type { PlanTalkTurn, PlanSectionKey, StructuredPlan, PlanSection, UnifiedPlan } from '../core/types';
import { generateId } from '../utils/ids';
import { transcribeAudio, EigenSTTError, textToSpeech } from '../services/voice/eigen-client';
import { audioPlayback } from '../services/voice/audio-playback';
import { telemetry } from '../services/telemetry/collector';
import { stripMarkdown } from '../utils/strip-markdown';

/**
 * Try to extract a complete "understanding" value from partial JSON.
 * Walks character-by-character to handle escaped quotes correctly.
 * Returns the full understanding string if complete, or null.
 */
export function tryExtractUnderstanding(accumulated: string): string | null {
  const keyPattern = '"understanding"';
  const keyIdx = accumulated.indexOf(keyPattern);
  if (keyIdx === -1) return null;

  // Find the colon after the key
  let i = keyIdx + keyPattern.length;
  while (i < accumulated.length && accumulated[i] !== ':') i++;
  if (i >= accumulated.length) return null;
  i++; // skip ':'

  // Skip whitespace
  while (i < accumulated.length && /\s/.test(accumulated[i])) i++;
  if (i >= accumulated.length || accumulated[i] !== '"') return null;
  i++; // skip opening quote

  // Walk through the string value, handling escaped characters
  let value = '';
  while (i < accumulated.length) {
    const ch = accumulated[i];
    if (ch === '\\') {
      // Escaped character — include both chars and advance past
      if (i + 1 >= accumulated.length) return null; // incomplete escape
      const next = accumulated[i + 1];
      if (next === '"') value += '"';
      else if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else if (next === '\\') value += '\\';
      else if (next === '/') value += '/';
      else value += next;
      i += 2;
    } else if (ch === '"') {
      // Closing quote — value is complete
      return value;
    } else {
      value += ch;
      i++;
    }
  }
  return null; // string not yet closed
}

/**
 * Extract whatever understanding text has streamed so far (may be incomplete).
 * For progressive display only — does not require the closing quote.
 */
export function extractPartialUnderstanding(accumulated: string): string {
  const keyPattern = '"understanding"';
  const keyIdx = accumulated.indexOf(keyPattern);
  if (keyIdx === -1) return '';

  let i = keyIdx + keyPattern.length;
  while (i < accumulated.length && accumulated[i] !== ':') i++;
  if (i >= accumulated.length) return '';
  i++;

  while (i < accumulated.length && /\s/.test(accumulated[i])) i++;
  if (i >= accumulated.length || accumulated[i] !== '"') return '';
  i++;

  let value = '';
  while (i < accumulated.length) {
    const ch = accumulated[i];
    if (ch === '\\') {
      if (i + 1 >= accumulated.length) return value;
      const next = accumulated[i + 1];
      if (next === '"') value += '"';
      else if (next === 'n') value += '\n';
      else if (next === 't') value += '\t';
      else if (next === '\\') value += '\\';
      else if (next === '/') value += '/';
      else value += next;
      i += 2;
    } else if (ch === '"') {
      return value;
    } else {
      value += ch;
      i++;
    }
  }
  return value;
}

/**
 * Send user reflection text to AI for analysis against the unified plan.
 * Uses streaming to progressively display the AI response and start TTS early.
 */
export async function analyzeReflection(transcriptText: string, source: 'voice' | 'typed' = 'typed'): Promise<void> {
  const store = usePlanTalkStore.getState();

  // Guard against concurrent calls (covers all busy states)
  if (store.turnState === 'analyzing' || store.turnState === 'streaming' || store.turnState === 'transcribing' || store.turnState === 'recording') return;

  const session = useSessionStore.getState().session;
  const unifiedPlan = useSemanticStore.getState().unifiedPlan;

  if (!session) throw new Error('No active session');
  if (!unifiedPlan) throw new Error('No unified plan to reflect on');

  // Generate the AI turn ID upfront so onChunk TTS and final addTurn share the same ID
  const aiTurnId = generateId();

  // Add user turn — read fresh state for turnIndex
  const userTurn: PlanTalkTurn = {
    id: generateId(),
    sessionId: session.id,
    unifiedPlanId: unifiedPlan.id,
    turnIndex: usePlanTalkStore.getState().turns.length,
    speaker: 'user',
    transcriptText,
    source,
    createdAt: new Date().toISOString(),
  };
  usePlanTalkStore.getState().addTurn(userTurn);
  usePlanTalkStore.getState().setTurnState('analyzing');
  usePlanTalkStore.getState().setError(null);
  usePlanTalkStore.getState().setStreamingResponse('');

  try {
    const settings = await loadSettings();
    const apiKeys = resolveApiKeys(settings);
    const provider = getDefaultProvider(apiKeys);

    // Read fresh turns from store (includes the userTurn we just added)
    const allTurns = usePlanTalkStore.getState().turns;
    const prompt = buildPlanReflectionPrompt(allTurns, unifiedPlan, session.topic);

    let accumulated = '';
    let ttsStarted = false;

    const raw = await provider.generateStream(prompt, (delta: string) => {
      accumulated += delta;
      usePlanTalkStore.getState().setStreamingResponse(accumulated);

      // Transition from 'analyzing' to 'streaming' on first chunk
      if (usePlanTalkStore.getState().turnState === 'analyzing') {
        usePlanTalkStore.getState().setTurnState('streaming');
      }

      // Try to extract the complete understanding field for early TTS
      if (!ttsStarted) {
        const understanding = tryExtractUnderstanding(accumulated);
        if (understanding) {
          ttsStarted = true;
          usePlanTalkStore.getState().setUnderstanding(understanding);
          // Start TTS immediately without waiting for gap cards/edits
          if (settings.voiceTtsEnabled && settings.eigenApiKey) {
            generateTts(aiTurnId, understanding, settings.eigenApiKey, settings.voiceTtsVoiceId, settings.voiceAutoPlayAi);
          }
        }
      }
    });

    // Parse full JSON from completed response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    const result = PlanReflectionResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('[PlanTalk] schema validation failed:', result.error.issues);
      console.warn('[PlanTalk] parsed response:', JSON.stringify(parsed).slice(0, 500));
      usePlanTalkStore.getState().setError('Could not generate structured edits this turn. Please try again.');
      usePlanTalkStore.getState().setTurnState('error');
      usePlanTalkStore.getState().setStreamingResponse('');
      return;
    }

    const data = result.data;

    // Assign stable UUIDs — LLM-generated IDs are not reliable
    for (const card of data.gapCards) card.id = generateId();
    for (const edit of data.proposedEdits) edit.id = generateId();

    // Add AI turn with the pre-generated ID
    const aiTurn: PlanTalkTurn = {
      id: aiTurnId,
      sessionId: session.id,
      unifiedPlanId: unifiedPlan.id,
      turnIndex: usePlanTalkStore.getState().turns.length,
      speaker: 'ai',
      transcriptText: data.understanding,
      source,
      createdAt: new Date().toISOString(),
    };

    usePlanTalkStore.getState().addTurn(aiTurn);
    usePlanTalkStore.getState().setUnderstanding(data.understanding);
    usePlanTalkStore.getState().setGapCards(data.gapCards);
    usePlanTalkStore.getState().setPendingEdits(data.proposedEdits);
    usePlanTalkStore.getState().setUnresolvedQuestions(data.unresolvedQuestions);
    usePlanTalkStore.getState().setTurnState('responded');
    usePlanTalkStore.getState().setStreamingResponse('');

    telemetry.track('voice_turn_completed', { source, turnId: aiTurn.id });

    // If TTS wasn't started during streaming (understanding extraction failed), start it now
    if (!ttsStarted && settings.voiceTtsEnabled && settings.eigenApiKey) {
      generateTts(aiTurn.id, data.understanding, settings.eigenApiKey, settings.voiceTtsVoiceId, settings.voiceAutoPlayAi);
    }
  } catch (err) {
    usePlanTalkStore.getState().setError(err instanceof Error ? err.message : 'Analysis failed');
    usePlanTalkStore.getState().setTurnState('error');
    usePlanTalkStore.getState().setStreamingResponse('');
    telemetry.track('voice_turn_failed', { source, error: err instanceof Error ? err.message : 'unknown' });
  }
}

/**
 * Accept a committed transcript from realtime WebSocket STT and analyze it.
 * Skips blob upload — text comes directly from the WebSocket.
 */
export async function transcribeRealtimeAndAnalyze(transcriptText: string): Promise<void> {
  const text = transcriptText.trim();
  if (!text) {
    usePlanTalkStore.getState().setError('No speech detected. Please try again.');
    usePlanTalkStore.getState().setTurnState('error');
    return;
  }
  usePlanTalkStore.getState().setPartialTranscript('');
  await analyzeReflection(text, 'voice');
}

/**
 * Record audio, transcribe via Eigen ASR, then analyze.
 */
export async function transcribeAndAnalyze(audioBlob: Blob, apiKey: string, language: string = 'English'): Promise<void> {
  usePlanTalkStore.getState().setTurnState('transcribing');
  usePlanTalkStore.getState().setError(null);

  try {
    const text = await transcribeAudio(audioBlob, apiKey, language);
    usePlanTalkStore.getState().setTurnState('idle');
    await analyzeReflection(text, 'voice');
  } catch (err) {
    const message = err instanceof EigenSTTError
      ? err.message
      : 'Transcription failed. Please try again.';
    usePlanTalkStore.getState().setError(message);
    usePlanTalkStore.getState().setTurnState('error');
    telemetry.track('voice_turn_failed', { source: 'voice', error: message });
  }
}

/**
 * Apply a single approved edit to the unified plan.
 */
export function applyEdit(editId: string): void {
  const store = usePlanTalkStore.getState();
  const semanticStore = useSemanticStore.getState();
  const plan = semanticStore.unifiedPlan;

  if (!plan) throw new Error('No unified plan');

  const edit = store.pendingEdits.find((e) => e.id === editId);
  if (!edit) throw new Error(`Edit ${editId} not found`);

  const updated = applyMutation(plan, edit.sectionKey, edit.operation, edit);
  semanticStore.setUnifiedPlan(updated);

  // Remove applied edit from pending to prevent double-apply
  const freshStore = usePlanTalkStore.getState();
  freshStore.setPendingEdits(
    freshStore.pendingEdits.filter((e) => e.id !== editId),
  );
}

/**
 * Apply all accepted (approved) edits.
 */
export function applyAllAccepted(): void {
  const store = usePlanTalkStore.getState();
  const semanticStore = useSemanticStore.getState();
  let plan = semanticStore.unifiedPlan;

  if (!plan) throw new Error('No unified plan');

  const accepted = store.pendingEdits.filter((e) => e.approved);
  if (accepted.length === 0) return;

  const acceptedIds = new Set(accepted.map((e) => e.id));

  for (const edit of accepted) {
    plan = applyMutation(plan, edit.sectionKey, edit.operation, edit);
  }

  semanticStore.setUnifiedPlan(plan);

  // Remove applied edits from pending to prevent double-apply
  usePlanTalkStore.getState().setPendingEdits(
    usePlanTalkStore.getState().pendingEdits.filter((e) => !acceptedIds.has(e.id)),
  );

  // Record summary turn in transcript
  const session = useSessionStore.getState().session;
  const updatedPlan = useSemanticStore.getState().unifiedPlan;
  if (session && updatedPlan) {
    const summaryTurn: PlanTalkTurn = {
      id: generateId(),
      sessionId: session.id,
      unifiedPlanId: updatedPlan.id,
      turnIndex: usePlanTalkStore.getState().turns.length,
      speaker: 'ai',
      transcriptText: `Applied ${accepted.length} edit(s). Plan updated to revision ${updatedPlan.revision ?? 1}.`,
      source: 'typed',
      createdAt: new Date().toISOString(),
    };
    usePlanTalkStore.getState().addTurn(summaryTurn);
    telemetry.track('edits_applied', { count: accepted.length });
  }
}

// --- Internal helpers ---

async function generateTts(
  turnId: string,
  text: string,
  apiKey: string,
  voiceId: string,
  autoPlay: boolean,
): Promise<void> {
  usePlanTalkStore.getState().setTtsTurnStatus(turnId, 'loading');
  try {
    const blob = await textToSpeech(stripMarkdown(text), apiKey, voiceId || undefined);
    // Guard: if the store was cleared (modal closed) while awaiting, bail out
    if (!usePlanTalkStore.getState().turns.find((t) => t.id === turnId)) return;
    usePlanTalkStore.getState().setTtsBlob(turnId, blob);
    usePlanTalkStore.getState().setTtsTurnStatus(turnId, 'ready');
    telemetry.track('tts_playback_started', { turnId });
    if (autoPlay) {
      await audioPlayback.play(blob);
    }
  } catch {
    // Guard: if the store was cleared while awaiting, don't write stale status
    if (!usePlanTalkStore.getState().turns.find((t) => t.id === turnId)) return;
    usePlanTalkStore.getState().setTtsTurnStatus(turnId, 'failed');
    telemetry.track('tts_playback_failed', { turnId });
  }
}

function applyMutation(
  plan: UnifiedPlan,
  sectionKey: PlanSectionKey,
  operation: string,
  edit: { targetHeading?: string; draftHeading?: string; draftContent?: string[] },
): UnifiedPlan {
  const sections = structuredClone(plan.sections) as StructuredPlan;
  const sectionArray: PlanSection[] = sections[sectionKey];
  let mutated = false;

  switch (operation) {
    case 'add_section': {
      sectionArray.push({
        heading: edit.draftHeading ?? 'New Section',
        content: edit.draftContent ?? ['(content pending)'],
        evidence: plan.evidence.length > 0 ? [plan.evidence[0]] : [],
      });
      mutated = true;
      break;
    }
    case 'update_section': {
      const idx = sectionArray.findIndex((s) => s.heading === edit.targetHeading);
      if (idx >= 0) {
        if (edit.draftHeading) sectionArray[idx].heading = edit.draftHeading;
        if (edit.draftContent) sectionArray[idx].content = edit.draftContent;
        mutated = true;
      }
      break;
    }
    case 'remove_section': {
      const removeIdx = sectionArray.findIndex((s) => s.heading === edit.targetHeading);
      if (removeIdx >= 0 && sectionArray.length > 1) {
        sectionArray.splice(removeIdx, 1);
        mutated = true;
      }
      break;
    }
    case 'update_content_bullet': {
      const bulletIdx = sectionArray.findIndex((s) => s.heading === edit.targetHeading);
      if (bulletIdx >= 0 && edit.draftContent) {
        sectionArray[bulletIdx].content = edit.draftContent;
        mutated = true;
      }
      break;
    }
  }

  // Only bump revision if something actually changed
  if (!mutated) return plan;

  return {
    ...plan,
    sections,
    revision: (plan.revision ?? 1) + 1,
    updatedAt: new Date().toISOString(),
  };
}
