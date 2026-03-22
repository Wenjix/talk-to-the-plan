import type { LanePlan, PlanSection } from '../../core/types';
import styles from './PlanCard.module.css';

interface PlanCardProps {
  plan: LanePlan;
  onEvidenceClick?: (nodeId: string) => void;
}

const SECTION_ORDER = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;

export function PlanCard({ plan, onEvidenceClick }: PlanCardProps) {
  const sections = plan.sections;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{plan.title}</h3>
        <span className={styles.confidence}>
          {Math.round(plan.confidence * 100)}% confidence
        </span>
      </div>
      {SECTION_ORDER.map(key => {
        const items: PlanSection[] = sections[key];
        if (!Array.isArray(items) || items.length === 0) return null;
        return (
          <div key={key} className={styles.section}>
            <h4 className={styles.sectionTitle}>{formatSectionName(key)}</h4>
            {items.map((item, i) => (
              <div key={i} className={styles.item}>
                <h5 className={styles.heading}>{item.heading}</h5>
                <ul className={styles.content}>
                  {item.content.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
                <div className={styles.evidenceList}>
                  {item.evidence.map((ev, k) => (
                    <button
                      key={k}
                      className={styles.evidenceRef}
                      onClick={() => onEvidenceClick?.(ev.nodeId)}
                      title={ev.quote}
                    >
                      [{ev.relevance}] &quot;{ev.quote.length > 60 ? `${ev.quote.slice(0, 60)}...` : ev.quote}&quot;
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function formatSectionName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
