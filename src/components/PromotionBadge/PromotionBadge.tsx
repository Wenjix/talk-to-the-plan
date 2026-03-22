import styles from './PromotionBadge.module.css';

interface PromotionBadgeProps {
  isPromoted: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

export function PromotionBadge({ isPromoted, onClick, onContextMenu, disabled }: PromotionBadgeProps) {
  return (
    <button
      className={`${styles.badge} ${isPromoted ? styles.promoted : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      disabled={disabled}
      title={isPromoted ? 'Unpromote' : 'Click to promote \u00b7 Right-click for options'}
    >
      {isPromoted ? '\u2605' : '\u2606'}
    </button>
  );
}
