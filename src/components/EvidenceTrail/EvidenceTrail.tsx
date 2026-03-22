import type { EvidenceRef } from '../../core/types';
import styles from './EvidenceTrail.module.css';

interface EvidenceTrailProps {
  evidence: EvidenceRef[];
  onNodeClick?: (nodeId: string) => void;
}

const QUOTE_MAX = 60;

function truncateQuote(quote: string): string {
  if (quote.length <= QUOTE_MAX) return quote;
  return `${quote.slice(0, QUOTE_MAX)}...`;
}

export function EvidenceTrail({ evidence, onNodeClick }: EvidenceTrailProps) {
  if (evidence.length === 0) return null;

  return (
    <ul className={styles.trail} aria-label="Evidence trail">
      {evidence.map((ev, i) => {
        const isPrimary = ev.relevance === 'primary';
        const itemClass = [
          styles.item,
          isPrimary ? styles.itemPrimary : styles.itemSupporting,
        ].join(' ');
        const badgeClass = [
          styles.badge,
          isPrimary ? styles.badgePrimary : styles.badgeSupporting,
        ].join(' ');

        return (
          <li key={`${ev.nodeId}-${i}`} style={{ display: 'contents' }}>
            {i > 0 && <span className={styles.separator} aria-hidden="true">&gt;</span>}
            <button
              className={itemClass}
              onClick={() => onNodeClick?.(ev.nodeId)}
              title={ev.quote}
              type="button"
            >
              <span className={badgeClass}>{ev.relevance}</span>
              <span className={styles.quote}>{truncateQuote(ev.quote)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
