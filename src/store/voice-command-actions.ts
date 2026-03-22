import { useVoiceCommandStore } from './voice-command-store';
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

let activeRecorder: BufferedPCMRecorder | null = null;
let startPromise: Promise<void> | null = null;
let cancelledDuringStart = false;

export async function startVoiceCommand(nodeId: string): Promise<void> {
  const store = useVoiceCommandStore.getState();
  if (store.isRecording || store.isProcessing || startPromise || activeRecorder) return;

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
    const systemPrompt = buildVoiceSystemPrompt(targetNodeId, nodes, edges, topic);

    const settings = await loadSettings();
    const bosonKey = resolveBosonApiKey(settings);

    if (!bosonKey) {
      useVoiceCommandStore.getState().setError('Boson AI API key not configured');
      return;
    }

    const responseText = await audioUnderstand(
      { audioChunks: chunkResult.chunks, systemPrompt },
      bosonKey,
    );

    const result = await executeToolCall(responseText, targetNodeId);
    useVoiceCommandStore.getState().setResult(result);

    // Non-blocking TTS confirmation
    const eigenKey = resolveEigenApiKey(settings);
    if (eigenKey && settings.voiceTtsEnabled) {
      textToSpeech(result.message, eigenKey, settings.voiceTtsVoiceId || undefined)
        .then((blob) => audioPlayback.play(blob))
        .catch(() => {});
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
