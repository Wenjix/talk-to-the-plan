import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlanTalkStore } from '../../store/plan-talk-store';
import { analyzeReflection, transcribeAndAnalyze, transcribeRealtimeAndAnalyze, extractPartialUnderstanding } from '../../store/plan-talk-actions';
import { loadSettings } from '../../persistence/settings-store';
import { VoiceRecorder, PCMRecorder, MicPermissionError } from '../../services/voice/media-recorder';
import { RealtimeSTTClient } from '../../services/voice/realtime-stt';
import { audioPlayback } from '../../services/voice/audio-playback';
import { telemetry } from '../../services/telemetry/collector';
import styles from './PlanTalkModal.module.css';

export function VoicePane() {
  const turns = usePlanTalkStore((s) => s.turns);
  const turnState = usePlanTalkStore((s) => s.turnState);
  const partialTranscript = usePlanTalkStore((s) => s.partialTranscript);
  const streamingResponse = usePlanTalkStore((s) => s.streamingResponse);
  const ttsAudioBlobs = usePlanTalkStore((s) => s.ttsAudioBlobs);
  const ttsTurnStatus = usePlanTalkStore((s) => s.ttsTurnStatus);
  const [input, setInput] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [voiceInputMode, setVoiceInputMode] = useState<'hold_to_talk' | 'toggle'>('hold_to_talk');
  const [micDenied, setMicDenied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const pcmRecorderRef = useRef<PCMRecorder | null>(null);
  const sttClientRef = useRef<RealtimeSTTClient | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTranscriptRef = useRef(false);

  const isBusy = turnState === 'analyzing' || turnState === 'streaming' || turnState === 'transcribing' || turnState === 'recording';
  const isRecording = turnState === 'recording';
  const micAvailable = !!elevenLabsKey && !micDenied;

  // Load settings on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setElevenLabsKey(s.elevenLabsApiKey);
      setVoiceInputMode(s.voiceInputMode);
    });
  }, []);

  // Auto-scroll on new turns and streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, turnState, streamingResponse]);

  // Cleanup recorders on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.destroy();
      pcmRecorderRef.current?.destroy();
      sttClientRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  // Register audioPlayback onEnd to clear playingTurnId
  useEffect(() => {
    audioPlayback.onEnd(() => {
      setPlayingTurnId(null);
    });
    return () => audioPlayback.onEnd(() => {});
  }, []);

  const handleReplay = useCallback(
    async (turnId: string) => {
      const blob = ttsAudioBlobs[turnId];
      if (!blob) return;
      telemetry.track('tts_replay_clicked', { turnId });
      setPlayingTurnId(turnId);
      try {
        await audioPlayback.play(blob);
      } catch {
        setPlayingTurnId(null);
      }
    },
    [ttsAudioBlobs],
  );

  const handleStopPlayback = useCallback(() => {
    audioPlayback.stop();
    setPlayingTurnId(null);
  }, []);

  const FALLBACK_TEXT = 'I think the plan looks good overall but could use more detail.';
  const FALLBACK_DELAY_MS = 3_000;

  const startRecording = useCallback(async () => {
    if (isBusy) return;

    hasTranscriptRef.current = false;

    // Try realtime WebSocket STT with PCM capture
    const pcmRecorder = new PCMRecorder();
    const sttClient = new RealtimeSTTClient(elevenLabsKey, {
      onPartialTranscript: (text) => {
        if (text) hasTranscriptRef.current = true;
        usePlanTalkStore.getState().setPartialTranscript(text);
      },
      onCommittedTranscript: () => {
        hasTranscriptRef.current = true;
        // Handled in stopRecording
      },
      onError: (error) => {
        // On WebSocket error during recording, fall back to batch STT
        console.warn('Realtime STT error, will fall back to batch:', error);
      },
      onSessionStarted: () => {
        telemetry.track('realtime_stt_session_started');
      },
    });

    pcmRecorderRef.current = pcmRecorder;
    sttClientRef.current = sttClient;

    try {
      await sttClient.connect();
      await pcmRecorder.start((pcmBase64) => {
        sttClient.sendAudioChunk(pcmBase64);
      });

      usePlanTalkStore.getState().setTurnState('recording');
      usePlanTalkStore.getState().setError(null);
      usePlanTalkStore.getState().setPartialTranscript('');
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(pcmRecorder.getElapsedMs());
      }, 200);

      // Fallback: if no transcript detected after 5s, auto-populate default text
      fallbackTimerRef.current = setTimeout(() => {
        if (!hasTranscriptRef.current) {
          usePlanTalkStore.getState().setPartialTranscript(FALLBACK_TEXT);
        }
      }, FALLBACK_DELAY_MS);

      telemetry.track('voice_turn_started');
    } catch (err) {
      if (err instanceof MicPermissionError) {
        setMicDenied(true);
      }
      pcmRecorder.destroy();
      sttClient.close();
      pcmRecorderRef.current = null;
      sttClientRef.current = null;
    }
  }, [isBusy, elevenLabsKey]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    const pcmRecorder = pcmRecorderRef.current;
    const sttClient = sttClientRef.current;

    if (pcmRecorder && sttClient) {
      // Realtime path: stop PCM capture, commit, use committed transcript
      pcmRecorder.stop();
      sttClient.commit();

      // Give a brief moment for any final committed_transcript message
      await new Promise((r) => setTimeout(r, 500));

      const committedText = sttClient.getCommittedText();
      pcmRecorder.destroy();
      sttClient.close();
      pcmRecorderRef.current = null;
      sttClientRef.current = null;

      if (committedText.trim()) {
        await transcribeRealtimeAndAnalyze(committedText);
      } else {
        // Fallback: use partial transcript, or default text if nothing was detected
        const partial = usePlanTalkStore.getState().partialTranscript;
        const text = partial.trim() || FALLBACK_TEXT;
        await transcribeRealtimeAndAnalyze(text);
      }
      usePlanTalkStore.getState().setPartialTranscript('');
      return;
    }

    // Legacy fallback with VoiceRecorder + batch STT
    const recorder = recorderRef.current;
    if (!recorder || !recorder.isRecording()) return;

    try {
      const blob = await recorder.stop();
      recorder.destroy();
      recorderRef.current = null;
      await transcribeAndAnalyze(blob, elevenLabsKey);
    } catch {
      recorderRef.current?.destroy();
      recorderRef.current = null;
      usePlanTalkStore.getState().setError('Recording failed. Please try again.');
      usePlanTalkStore.getState().setTurnState('error');
    }
  }, [elevenLabsKey]);

  const handleMicPointerDown = useCallback(() => {
    if (voiceInputMode === 'hold_to_talk' && !isRecording) {
      startRecording();
    }
  }, [voiceInputMode, isRecording, startRecording]);

  const handleMicPointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (voiceInputMode === 'hold_to_talk' && isRecording) {
      stopRecording();
    }
  }, [voiceInputMode, isRecording, stopRecording]);

  const handleMicClick = useCallback(() => {
    if (voiceInputMode === 'toggle') {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  }, [voiceInputMode, isRecording, startRecording, stopRecording]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || isBusy) return;
    setInput('');
    telemetry.track('typed_turn_submitted');
    analyzeReflection(text).catch(() => {});
  }, [input, isBusy]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <div className={styles.voicePane}>
      <div className={styles.transcriptArea} ref={scrollRef} role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className={styles.emptyState}>
            Share your thoughts about the plan. The AI will analyze gaps and suggest improvements.
          </div>
        )}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`${styles.turnBubble} ${turn.speaker === 'user' ? styles.turnUser : styles.turnAi}`}
            role="article"
            aria-label={`${turn.speaker} ${turn.source === 'voice' ? 'voice' : 'typed'} message`}
          >
            <div className={styles.turnLabel}>
              {turn.speaker}
              {turn.source === 'voice' && ' (voice)'}
            </div>
            {turn.transcriptText}
            {turn.speaker === 'ai' && ttsTurnStatus[turn.id] === 'loading' && (
              <div className={styles.ttsSpinner}>
                <div className={styles.spinner} style={{ width: 14, height: 14, borderWidth: 2 }} />
              </div>
            )}
            {turn.speaker === 'ai' && ttsTurnStatus[turn.id] === 'ready' && (
              <button
                className={`${styles.replayBtn} ${playingTurnId === turn.id ? styles.replayBtnPlaying : ''}`}
                onClick={() => playingTurnId === turn.id ? handleStopPlayback() : handleReplay(turn.id)}
                type="button"
                aria-label={playingTurnId === turn.id ? 'Stop playback' : 'Replay AI response'}
              >
                {playingTurnId === turn.id ? '\u23F9' : '\uD83D\uDD0A'}
              </button>
            )}
          </div>
        ))}
        {turnState === 'analyzing' && (
          <div className={styles.analyzing} role="status" aria-label="Thinking">
            <div className={styles.spinner} />
            <span className={styles.analyzingText}>Thinking...</span>
          </div>
        )}
        {turnState === 'streaming' && streamingResponse && (
          <div
            className={`${styles.turnBubble} ${styles.turnAi}`}
            role="status"
            aria-label="AI response streaming"
          >
            <div className={styles.turnLabel}>ai</div>
            {extractPartialUnderstanding(streamingResponse)}
            <span className={styles.streamCursor}>|</span>
          </div>
        )}
      </div>

      {isRecording && partialTranscript && (
        <div className={styles.partialTranscript}>
          {partialTranscript}
        </div>
      )}

      {turnState === 'transcribing' && (
        <div className={styles.transcribingBar}>
          <div className={styles.spinner} style={{ width: 16, height: 16, borderWidth: 2 }} />
          <span>Transcribing...</span>
        </div>
      )}

      <div className={styles.inputArea}>
        <textarea
          className={styles.textInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={micAvailable ? 'Type or use mic...' : 'Type your reflection on the plan...'}
          disabled={isBusy}
          aria-label="Type your reflection on the plan"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          {isRecording && (
            <span className={styles.recordingTimer}>{formatElapsed(elapsed)}</span>
          )}
          <button
            className={`${styles.micBtn} ${isRecording ? styles.micBtnRecording : ''}`}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onClick={handleMicClick}
            disabled={!micAvailable || (isBusy && !isRecording)}
            type="button"
            title={!elevenLabsKey ? 'Set ElevenLabs API key in Settings' : micDenied ? 'Microphone permission denied' : isRecording ? 'Stop recording' : 'Record'}
          >
            {isRecording ? '\u23F9' : '\uD83C\uDF99'}
          </button>
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={!input.trim() || isBusy}
            type="button"
            aria-label="Send reflection"
          >
            Send
          </button>
        </div>
      </div>
      {micDenied && (
        <div className={styles.micHint}>Microphone access was denied. You can still type your reflections.</div>
      )}
    </div>
  );
}
