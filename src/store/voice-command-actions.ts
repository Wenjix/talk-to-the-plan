import { useVoiceCommandStore } from './voice-command-store';
import { useVoiceNoteRecordingStore } from './voice-note-recording-store';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { loadSettings, resolveEigenApiKey, resolveBosonApiKey } from '../persistence/settings-store';
import { BufferedPCMRecorder, MicPermissionError } from '../services/voice/media-recorder';
import { chunkPcmBuffer } from '../services/voice/audio-chunker';
import { audioUnderstand } from '../services/voice/boson-client';
import { buildVoiceSystemPrompt } from '../services/voice/voice-prompt';
import { executeToolCall } from '../services/voice/tool-executor';
import { textToSpeech } from '../services/voice/eigen-client';
import { audioPlayback } from '../services/voice/audio-playback';
import { useVoiceChatStore } from './voice-chat-store';
import { useRadialMenuStore } from './radial-menu-store';
import { stripMarkdown } from '../utils/strip-markdown';

let activeRecorder: BufferedPCMRecorder | null = null;
let startPromise: Promise<void> | null = null;
let cancelledDuringStart = false;

export async function startVoiceCommand(nodeId: string): Promise<void> {
  const store = useVoiceCommandStore.getState();
  if (store.isRecording || store.isProcessing || startPromise || activeRecorder) return;

  // Cross-check: don't start if voice note recording is active
  if (useVoiceNoteRecordingStore.getState().isRecording) return;

  cancelledDuringStart = false;

  startPromise = (async () => {
    const recorder = new BufferedPCMRecorder();
    try {
      await recorder.start();

      // Check if cancelled while awaiting mic permission / AudioWorklet init
      if (cancelledDuringStart) {
        recorder.destroy();
        return;
      }

      activeRecorder = recorder;
      useVoiceCommandStore.getState().startRecording(nodeId);
    } catch (err) {
      recorder.destroy();
      if (err instanceof MicPermissionError) {
        useVoiceCommandStore.getState().setError('Microphone permission denied');
      } else {
        useVoiceCommandStore.getState().setError('Failed to start recording');
      }
    }
  })();

  try {
    await startPromise;
  } finally {
    startPromise = null;
  }
}

export async function stopAndProcessVoiceCommand(): Promise<void> {
  // Wait for any pending start to complete before checking state
  if (startPromise) {
    await startPromise;
  }

  const store = useVoiceCommandStore.getState();
  const targetNodeId = store.targetNodeId;
  if (!activeRecorder || !targetNodeId) return;

  const recorder = activeRecorder;
  activeRecorder = null;

  useVoiceCommandStore.getState().stopRecording();
  useVoiceCommandStore.getState().setProcessing(true);

  try {
    const buffer = recorder.stop();
    recorder.destroy();

    const chunkResult = chunkPcmBuffer(buffer, 16000);

    if (chunkResult.chunks.length === 0) {
      useVoiceCommandStore.getState().setError('No speech detected');
      return;
    }

    if (chunkResult.durationSec < 0.5) {
      useVoiceCommandStore.getState().setError('Try speaking longer');
      return;
    }

    const { nodes, edges } = useSemanticStore.getState();
    const topic = useSessionStore.getState().session?.topic ?? '';
    const settings = await loadSettings();
    const systemPrompt = buildVoiceSystemPrompt(targetNodeId, nodes, edges, topic, settings.voiceLanguage);
    const bosonKey = resolveBosonApiKey(settings);

    if (!bosonKey) {
      useVoiceCommandStore.getState().setError('Boson AI API key not configured');
      return;
    }

    const responseText = await audioUnderstand(
      { audioChunks: chunkResult.chunks, systemPrompt },
      bosonKey,
    );
    console.log('[VoiceCmd] boson response:', responseText.slice(0, 300));

    const result = await executeToolCall(responseText, targetNodeId);
    console.log('[VoiceCmd] tool result:', result.toolName, result.success, result.message.slice(0, 200));
    useVoiceCommandStore.getState().setResult(result);

    // Store turns in voice chat history
    const chatStore = useVoiceChatStore.getState();
    chatStore.addTurn({ nodeId: targetNodeId, speaker: 'user', text: 'Voice command' });
    const aiTurnId = chatStore.addTurn({
      nodeId: targetNodeId,
      speaker: 'ai',
      text: result.message,
      toolName: result.toolName,
    });
    const radialPos = useRadialMenuStore.getState().position;
    chatStore.openPanel(targetNodeId, radialPos);

    // Non-blocking TTS with blob storage for replay
    const eigenKey = resolveEigenApiKey(settings);
    if (eigenKey && settings.voiceTtsEnabled) {
      chatStore.setTtsTurnStatus(aiTurnId, 'loading');
      const cleaned = stripMarkdown(result.message);
      const ttsText = cleaned.length > 500
        ? cleaned.slice(0, 497) + '...'
        : cleaned;
      textToSpeech(ttsText, eigenKey, settings.voiceTtsVoiceId || undefined)
        .then((blob) => {
          chatStore.setTtsBlob(aiTurnId, blob);
          chatStore.setTtsTurnStatus(aiTurnId, 'ready');
          audioPlayback.play(blob);
        })
        .catch(() => {
          chatStore.setTtsTurnStatus(aiTurnId, 'failed');
        });
    }
  } catch (err) {
    useVoiceCommandStore.getState().setError(
      err instanceof Error ? err.message : 'Voice command failed',
    );
  }
}

export function cancelVoiceCommand(): void {
  // Signal any in-flight start to abort after mic permission resolves
  cancelledDuringStart = true;

  if (activeRecorder) {
    activeRecorder.destroy();
    activeRecorder = null;
  }
  useVoiceCommandStore.getState().clear();
}
