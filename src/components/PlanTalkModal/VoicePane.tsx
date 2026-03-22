import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlanTalkStore } from '../../store/plan-talk-store';
import { analyzeReflection, extractPartialUnderstanding } from '../../store/plan-talk-actions';
import { audioPlayback } from '../../services/voice/audio-playback';
import { telemetry } from '../../services/telemetry/collector';
import styles from './PlanTalkModal.module.css';

export function VoicePane() {
  const turns = usePlanTalkStore((s) => s.turns);
  const turnState = usePlanTalkStore((s) => s.turnState);
  const streamingResponse = usePlanTalkStore((s) => s.streamingResponse);
  const ttsAudioBlobs = usePlanTalkStore((s) => s.ttsAudioBlobs);
  const ttsTurnStatus = usePlanTalkStore((s) => s.ttsTurnStatus);
  const [input, setInput] = useState('');
  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isBusy = turnState === 'analyzing' || turnState === 'streaming' || turnState === 'transcribing' || turnState === 'recording';

  // Auto-scroll on new turns and streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns.length, turnState, streamingResponse]);

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
          placeholder="Type your reflection on the plan..."
          disabled={isBusy}
          aria-label="Type your reflection on the plan"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <button
            className={styles.micBtn}
            disabled
            type="button"
            title="Voice coming soon — Eigen integration pending"
          >
            {'\uD83C\uDF99'}
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
    </div>
  );
}
