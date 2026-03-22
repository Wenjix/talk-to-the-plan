import { useState, useEffect, useCallback } from 'react';
import type { SessionSummary } from '../../store/workspace-actions';
import { listSessions } from '../../store/workspace-actions';
import { SessionCard } from './SessionCard';
import styles from './SessionList.module.css';

interface SessionListProps {
  onOpenSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionList({
  onOpenSession,
  onNewSession,
  onDeleteSession,
}: SessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
    } catch {
      // If IDB is unavailable, show empty state
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = useCallback(
    (sessionId: string) => {
      onDeleteSession(sessionId);
      // Optimistically remove from local state
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [onDeleteSession],
  );

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Your Sessions</h2>
        <button
          className={styles.newSessionBtn}
          onClick={onNewSession}
          type="button"
        >
          New Session
        </button>
      </header>

      {sessions.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No sessions yet</p>
          <p className={styles.emptySubtitle}>
            Start exploring to create your first session!
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              id={session.id}
              topic={session.topic}
              status={session.status}
              createdAt={session.createdAt}
              nodeCount={session.nodeCount}
              onOpen={onOpenSession}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
