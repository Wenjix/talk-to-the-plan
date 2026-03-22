import { useState, useCallback } from 'react';
import type { SessionStatus } from '../../core/types/session';
import { formatRelativeDate } from '../../utils/format-date';
import styles from './SessionList.module.css';

interface SessionCardProps {
  id: string;
  topic: string;
  status: SessionStatus;
  createdAt: string;
  nodeCount: number;
  lanePlanCount: number;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

const STATUS_LABELS: Record<SessionStatus, string> = {
  exploring: 'Exploring',
  lane_planning: 'Lane Planning',
  synthesis_ready: 'Synthesis Ready',
  synthesized: 'Synthesized',
};

const STATUS_STYLES: Record<SessionStatus, string> = {
  exploring: styles.statusExploring,
  lane_planning: styles.statusLanePlanning,
  synthesis_ready: styles.statusSynthesisReady,
  synthesized: styles.statusSynthesized,
};

/** Total number of lane plan slots (4 lanes) */
const TOTAL_LANES = 4;

export function SessionCard({
  id,
  topic,
  status,
  createdAt,
  nodeCount,
  lanePlanCount,
  onOpen,
  onDelete,
}: SessionCardProps) {
  const [confirming, setConfirming] = useState(false);

  const handleOpen = useCallback(() => {
    onOpen(id);
  }, [onOpen, id]);

  const handleDeleteClick = useCallback(() => {
    setConfirming(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    setConfirming(false);
    onDelete(id);
  }, [onDelete, id]);

  const handleCancelDelete = useCallback(() => {
    setConfirming(false);
  }, []);

  const progressPercent = Math.min(
    Math.round((lanePlanCount / TOTAL_LANES) * 100),
    100,
  );

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTopic}>{topic}</h3>
        <span className={`${styles.statusBadge} ${STATUS_STYLES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          {formatRelativeDate(createdAt)}
        </span>
        <span className={styles.metaItem}>
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        </span>
        <span className={styles.metaItem}>
          {lanePlanCount}/{TOTAL_LANES} lanes planned
        </span>
      </div>

      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {confirming ? (
        <div className={styles.confirmBar}>
          <span className={styles.confirmText}>Are you sure?</span>
          <button
            className={styles.confirmYes}
            onClick={handleConfirmDelete}
            type="button"
          >
            Delete
          </button>
          <button
            className={styles.confirmNo}
            onClick={handleCancelDelete}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.cardActions}>
          <button
            className={styles.openBtn}
            onClick={handleOpen}
            type="button"
          >
            Open
          </button>
          <button
            className={styles.deleteBtn}
            onClick={handleDeleteClick}
            type="button"
          >
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
