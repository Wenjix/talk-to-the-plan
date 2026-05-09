import { loadSettings, resolveApiKeys, resolveCartesiaApiKey } from '../persistence/settings-store';
import { useTranscriptStore } from './transcript-store';
import { useCompanionStore } from './companion-store';
import { useSessionStore } from './session-store';
import {
  StreamingTranscriber,
  type TranscriberEvent,
} from '../services/voice/streaming-transcriber';
import { startListener, stopListener } from '../services/voice/listener';
import { clearSchedulerQueue, configureScheduler } from './branch-scheduler';

let activeTranscriber: StreamingTranscriber | null = null;

function handleTranscriberEvent(event: TranscriberEvent): void {
  const store = useCompanionStore.getState();
  const transcript = useTranscriptStore.getState();

  switch (event.type) {
    case 'open':
      if (store.status !== 'listening') {
        store.setStatus('listening');
      }
      break;
    case 'interim':
      if (event.text) transcript.appendInterim(event.text);
      break;
    case 'final':
      if (event.text) {
        transcript.commitFinal({
          text: event.text,
          startMs: event.startMs ?? 0,
          endMs: event.endMs ?? 0,
        });
      }
      break;
    case 'reconnecting':
      if (store.status !== 'reconnecting') {
        store.setStatus('reconnecting', event.error ?? null);
      }
      break;
    case 'close':
    case 'warn':
      // transient — keep current status unless fatal follows
      break;
    case 'fatal':
      // transcriber has already torn itself down; match from our side.
      stopCompanionMode();
      useCompanionStore.getState().setStatus('error', event.error ?? 'Transcriber fatal');
      break;
  }
}

export async function startCompanionMode(): Promise<void> {
  const store = useCompanionStore.getState();
  if (store.status === 'listening' || store.status === 'starting' || store.status === 'reconnecting') return;

  const session = useSessionStore.getState().session;
  if (!session) {
    store.setStatus('error', 'No active session');
    return;
  }

  // Set status BEFORE any async work to prevent double-entry race
  useCompanionStore.getState().setStatus('starting');

  const settings = await loadSettings();
  const cartesiaKey = resolveCartesiaApiKey(settings);
  const apiKeys = resolveApiKeys(settings);
  const anthropicKey = apiKeys.anthropic;

  if (!cartesiaKey) {
    store.setStatus('error', 'Cartesia API key not configured (Settings → voice)');
    return;
  }
  if (!anthropicKey) {
    store.setStatus('error', 'Anthropic API key required for companion listener');
    return;
  }

  configureScheduler({ perMinuteCap: settings.companionMaxBranchesPerMinute });
  useTranscriptStore.getState().start();

  activeTranscriber = new StreamingTranscriber({
    apiKey: cartesiaKey,
    language: settings.voiceLanguage,
    onEvent: handleTranscriberEvent,
  });

  try {
    await activeTranscriber.start();
    startListener({
      anthropicKey,
      model: settings.companionListenerModel,
      language: settings.voiceLanguage,
      minFireIntervalMs: 2000,
      interimIdleMs: 1500,
      maxDeferralMs: 4000,
    });
  } catch (err) {
    activeTranscriber?.stop();
    activeTranscriber = null;
    stopListener();
    clearSchedulerQueue();
    useTranscriptStore.getState().clear();
    store.setStatus(
      'error',
      err instanceof Error ? err.message : 'Failed to start companion mode',
    );
  }
}

export function stopCompanionMode(): void {
  activeTranscriber?.stop();
  activeTranscriber = null;
  stopListener();
  clearSchedulerQueue();
  useTranscriptStore.getState().clear();
  useCompanionStore.getState().reset();
}

export async function toggleCompanionMode(): Promise<void> {
  const status = useCompanionStore.getState().status;
  if (status === 'off' || status === 'error') {
    await startCompanionMode();
  } else {
    stopCompanionMode();
  }
}
