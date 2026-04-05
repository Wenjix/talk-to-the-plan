import { useEffect, useRef, useState } from 'react';
import { useVoiceChatStore } from '../../store/voice-chat-store';
import { useVoiceCommandStore } from '../../store/voice-command-store';
import { useSemanticStore } from '../../store/semantic-store';
import { audioPlayback } from '../../services/voice/audio-playback';
import styles from './VoiceChatPanel.module.css';

interface Props {
  position: { x: number; y: number };
}

export function VoiceChatPanel({ position }: Props) {
  const nodeId = useVoiceChatStore((s) => s.activePanelNodeId);
  const turns = useVoiceChatStore((s) =>
    nodeId ? (s.turnsByNode[nodeId] ?? []) : [],
  );
  const ttsBlobs = useVoiceChatStore((s) => s.ttsBlobs);
  const ttsTurnStatus = useVoiceChatStore((s) => s.ttsTurnStatus);
  const closePanel = useVoiceChatStore((s) => s.closePanel);

  const isRecording = useVoiceCommandStore((s) => s.isRecording);
  const isProcessing = useVoiceCommandStore((s) => s.isProcessing);

  const nodes = useSemanticStore((s) => s.nodes);
  const node = nodeId ? nodes.find((n) => n.id === nodeId) : null;
  const nodeLabel = node?.answer?.summary?.slice(0, 40) ?? 'Node';

  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new turns or status changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, isRecording, isProcessing]);

  // Clear the audioPlayback singleton callback on unmount so it does not
  // close over a stale setPlayingTurnId after this panel is destroyed.
  useEffect(() => {
    return () => audioPlayback.onEnd(null);
  }, []);

  if (!nodeId) return null;

  function handleReplay(turnId: string) {
    const blob = ttsBlobs[turnId];
    if (!blob) return;

    if (playingTurnId === turnId) {
      audioPlayback.stop();
      setPlayingTurnId(null);
      return;
    }

    audioPlayback.onEnd(() => setPlayingTurnId(null));
    audioPlayback.play(blob);
    setPlayingTurnId(turnId);
  }

  // Position panel to the right of the radial menu
  const panelStyle: React.CSSProperties = {
    left: position.x + 80,
    top: Math.max(10, position.y - 120),
  };

  return (
    <div className={styles.panel} style={panelStyle}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Voice Chat · {nodeLabel}</span>
        <button className={styles.closeBtn} onClick={closePanel} aria-label="Close voice chat">
          ✕
        </button>
      </div>

      <div className={styles.turns} ref={scrollRef} role="log" aria-live="polite">
        {turns.length === 0 && !isRecording && !isProcessing && (
          <div className={styles.emptyState}>
            Hold the mic button to start a voice conversation
          </div>
        )}

        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`${styles.turnBubble} ${turn.speaker === 'user' ? styles.turnUser : styles.turnAi}`}
          >
            <div className={styles.turnLabel}>
              {turn.speaker === 'user' ? 'You' : 'AI'}
              {turn.toolName && turn.toolName !== 'voice_response' && (
                <span className={styles.toolBadge}>{turn.toolName}</span>
              )}
            </div>
            <div className={styles.turnText}>{turn.text}</div>

            {/* TTS replay for AI turns */}
            {turn.speaker === 'ai' && ttsTurnStatus[turn.id] === 'loading' && (
              <div className={styles.ttsSpinner} />
            )}
            {turn.speaker === 'ai' && ttsTurnStatus[turn.id] === 'ready' && (
              <button
                className={`${styles.replayBtn} ${playingTurnId === turn.id ? styles.replayBtnPlaying : ''}`}
                onClick={() => handleReplay(turn.id)}
              >
                {playingTurnId === turn.id ? '⏹ Stop' : '🔊 Replay'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Status bar for recording/processing */}
      {(isRecording || isProcessing) && (
        <div className={styles.statusBar}>
          {isRecording && (
            <>
              <div className={styles.recordingDot} />
              <span>Listening...</span>
            </>
          )}
          {isProcessing && (
            <>
              <div className={styles.processingSpinner} />
              <span>Processing...</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
