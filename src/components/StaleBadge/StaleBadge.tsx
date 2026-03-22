import styles from './StaleBadge.module.css';

interface StaleBadgeProps {
  isStale: boolean;
  onRecalculate?: () => void;
  label?: string;
}

export function StaleBadge({ isStale, onRecalculate, label = 'Recalculate' }: StaleBadgeProps) {
  if (!isStale) return null;

  return (
    <span className={styles.badge}>
      <span className={styles.icon} aria-hidden="true">!</span>
      <span>Stale</span>
      {onRecalculate && (
        <button
          className={styles.recalcBtn}
          onClick={onRecalculate}
          type="button"
        >
          {label}
        </button>
      )}
    </span>
  );
}
