import { useVoiceNoteStore } from './voice-note-store';
import { useVoiceNoteRecordingStore } from './voice-note-recording-store';
import { useVoiceCommandStore } from './voice-command-store';
import { useSessionStore } from './session-store';
import { VoiceRecorder, MicPermissionError } from '../services/voice/media-recorder';
import { transcribeAudio } from '../services/voice/eigen-client';
import { audioPlayback } from '../services/voice/audio-playback';
import { putEntity, deleteEntity, getEntity } from '../persistence/repository';
import { loadSettings, resolveEigenApiKey } from '../persistence/settings-store';
import type { VoiceNote } from '../core/types';

const MAX_RECORDING_MS = 120_000; // 2 minutes

let activeRecorder: VoiceRecorder | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
}

export async function startVoiceNoteRecording(nodeId: string): Promise<void> {
  const recStore = useVoiceNoteRecordingStore.getState();
  if (recStore.isRecording) return;

  // Cross-check: don't start if voice command is active
  const vcStore = useVoiceCommandStore.getState();
  if (vcStore.isRecording || vcStore.isProcessing) return;

  const recorder = new VoiceRecorder();
  try {
    await recorder.start();
  } catch (err) {
    recorder.destroy();
    if (err instanceof MicPermissionError) {
      console.error('Voice note: microphone permission denied');
    }
    return;
  }

  activeRecorder = recorder;
  useVoiceNoteRecordingStore.getState().startRecording(nodeId);

  // Update elapsed time every 100ms
  elapsedTimer = setInterval(() => {
    if (activeRecorder) {
      useVoiceNoteRecordingStore.getState().setElapsed(activeRecorder.getElapsedMs());
    }
  }, 100);

  // Auto-stop at max duration
  autoStopTimer = setTimeout(() => {
    stopVoiceNoteRecording();
  }, MAX_RECORDING_MS);
}

export async function stopVoiceNoteRecording(): Promise<void> {
  const recStore = useVoiceNoteRecordingStore.getState();
  if (!activeRecorder || !recStore.targetNodeId) return;

  const recorder = activeRecorder;
  const nodeId = recStore.targetNodeId;
  activeRecorder = null;
  clearTimers();

  // Capture duration BEFORE stop (getElapsedMs returns 0 after stop)
  const durationMs = recorder.getElapsedMs();

  let blob: Blob;
  try {
    blob = await recorder.stop();
  } catch {
    recorder.destroy();
    useVoiceNoteRecordingStore.getState().clear();
    return;
  }
  recorder.destroy();

  useVoiceNoteRecordingStore.getState().stopRecording();

  const sessionId = useSessionStore.getState().session?.id;
  if (!sessionId) {
    useVoiceNoteRecordingStore.getState().clear();
    return;
  }

  const noteId = crypto.randomUUID();
  const note: VoiceNote = {
    id: noteId,
    sessionId,
    nodeId,
    durationMs,
    mimeType: blob.type || 'audio/webm',
    transcriptStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Persist metadata + blob to IndexedDB
  useVoiceNoteStore.getState().addNote(note);
  await Promise.all([
    putEntity('voiceNotes', note),
    putEntity('voiceNoteBlobs', { id: noteId, blob }),
  ]);

  useVoiceNoteRecordingStore.getState().clear();

  // Background transcription (fire-and-forget)
  transcribeVoiceNote(noteId).catch(() => {});
}

export async function transcribeVoiceNote(noteId: string): Promise<void> {
  useVoiceNoteRecordingStore.getState().setTranscribing(true);

  try {
    const settings = await loadSettings();
    const eigenKey = resolveEigenApiKey(settings);
    if (!eigenKey) {
      useVoiceNoteStore.getState().updateNote(noteId, { transcriptStatus: 'failed' });
      await putEntity('voiceNotes', {
        ...useVoiceNoteStore.getState().notes.find((n) => n.id === noteId)!,
        transcriptStatus: 'failed',
      });
      return;
    }

    const blobEntry = await getEntity('voiceNoteBlobs', noteId);
    if (!blobEntry) {
      useVoiceNoteStore.getState().updateNote(noteId, { transcriptStatus: 'failed' });
      return;
    }

    const transcript = await transcribeAudio(blobEntry.blob, eigenKey);
    useVoiceNoteStore.getState().updateNote(noteId, { transcript, transcriptStatus: 'done' });

    const updated = useVoiceNoteStore.getState().notes.find((n) => n.id === noteId);
    if (updated) {
      await putEntity('voiceNotes', updated);
    }
  } catch {
    useVoiceNoteStore.getState().updateNote(noteId, { transcriptStatus: 'failed' });
    const failed = useVoiceNoteStore.getState().notes.find((n) => n.id === noteId);
    if (failed) {
      await putEntity('voiceNotes', failed).catch(() => {});
    }
  } finally {
    useVoiceNoteRecordingStore.getState().setTranscribing(false);
  }
}

export async function deleteVoiceNote(noteId: string): Promise<void> {
  useVoiceNoteStore.getState().removeNote(noteId);
  await Promise.all([
    deleteEntity('voiceNotes', noteId),
    deleteEntity('voiceNoteBlobs', noteId),
  ]);
}

export async function playVoiceNote(noteId: string): Promise<void> {
  const blobEntry = await getEntity('voiceNoteBlobs', noteId);
  if (!blobEntry) return;
  await audioPlayback.play(blobEntry.blob);
}

export function cancelVoiceNoteRecording(): void {
  if (activeRecorder) {
    activeRecorder.destroy();
    activeRecorder = null;
  }
  clearTimers();
  useVoiceNoteRecordingStore.getState().clear();
}

export function isVoiceNoteRecording(): boolean {
  return useVoiceNoteRecordingStore.getState().isRecording;
}
