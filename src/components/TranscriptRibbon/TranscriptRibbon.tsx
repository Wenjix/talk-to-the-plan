import { useEffect, useState } from 'react';
import { useTranscriptStore } from '../../store/transcript-store';
import { useCompanionStore } from '../../store/companion-store';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import styles from './TranscriptRibbon.module.css';

const VISIBLE_WINDOW_MS = 20_000;
const TICK_MS = 500;

export function TranscriptRibbon() {
  const segments = useTranscriptStore((s) => s.segments);
  const interimText = useTranscriptStore((s) => s.interimText);
  const status = useCompanionStore((s) => s.status);
  const listenerActivity = useCompanionStore((s) => s.listenerActivity);
  const queuedCount = useCompanionStore((s) => s.queuedIntentCount);
  const error = useCompanionStore((s) => s.error);
  const sessionId = useSessionStore((s) => s.session?.id);
  const hasResolvedAnchor = useSemanticStore((s) =>
    s.nodes.some((n) => n.sessionId === sessionId && n.fsmState === 'resolved'),
  );
  const awaitingRoot = status === 'listening' && !hasResolvedAnchor;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const visible = segments.filter((s) => now - s.committedAt <= VISIBLE_WINDOW_MS);

  const statusLabel =
    status === 'listening'
      ? awaitingRoot
        ? 'Waiting for initial exploration…'
        : listenerActivity === 'thinking'
          ? 'Thinking…'
          : 'Listening'
      : status === 'starting'
        ? 'Starting…'
        : status === 'reconnecting'
          ? 'Reconnecting…'
          : status === 'error'
            ? `Error${error ? `: ${error.slice(0, 80)}` : ''}`
            : 'Off';

  return (
    <div className={styles.ribbon} role="status">
      <div className={styles.meta}>
        <span
          className={`${styles.statusDot} ${
            status === 'listening'
              ? listenerActivity === 'thinking'
                ? styles.dotThinking
                : styles.dotListening
              : status === 'error'
                ? styles.dotError
                : ''
          }`}
          aria-hidden
        />
        <span className={styles.statusLabel}>{statusLabel}</span>
        {queuedCount > 0 && (
          <span className={styles.queueBadge}>{queuedCount} queued</span>
        )}
      </div>
      <div className={styles.transcript}>
        {visible.length === 0 && !interimText && (
          <span className={styles.placeholder}>
            {status === 'listening'
              ? awaitingRoot
                ? 'Canvas is warming up — we\'ll start branching once the root resolves'
                : 'Start speaking — branches will appear as you think'
              : ''}
          </span>
        )}
        {visible.map((seg) => {
          const age = now - seg.committedAt;
          const opacity = Math.max(0.25, 1 - age / VISIBLE_WINDOW_MS);
          return (
            <span
              key={seg.id}
              className={styles.segment}
              style={{ opacity }}
            >
              {seg.text}{' '}
            </span>
          );
        })}
        {interimText && <span className={styles.interim}>{interimText}</span>}
      </div>
    </div>
  );
}
