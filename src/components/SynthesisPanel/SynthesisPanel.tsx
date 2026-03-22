import type { UnifiedPlan, PlanSection, SessionStatus } from '../../core/types';
import { EvidenceTrail } from '../EvidenceTrail/EvidenceTrail';
import styles from './SynthesisPanel.module.css';

interface SynthesisPanelProps {
  status: SessionStatus;
  unifiedPlan: UnifiedPlan;
  onEvidenceClick?: (nodeId: string) => void;
  onTalkToPlan?: () => void;
}

const SECTION_ORDER = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;

function formatSectionName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

export function SynthesisPanel({
  unifiedPlan,
  onEvidenceClick,
  onTalkToPlan,
}: SynthesisPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{unifiedPlan.title}</h3>
        {onTalkToPlan && (
          <button
            className={styles.synthesizeBtn}
            onClick={onTalkToPlan}
            type="button"
          >
            Talk to Plan
          </button>
        )}
      </div>

      {SECTION_ORDER.map(key => {
        const items: PlanSection[] = unifiedPlan.sections[key];
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
                <EvidenceTrail evidence={item.evidence} onNodeClick={onEvidenceClick} />
              </div>
            ))}
          </div>
        );
      })}

      {/* Conflicts resolved */}
      {unifiedPlan.conflictsResolved.length > 0 && (
        <div className={styles.conflictsSection}>
          <h4 className={styles.sectionTitle}>Conflicts Resolved</h4>
          {unifiedPlan.conflictsResolved.map((conflict, i) => (
            <div key={i} className={styles.conflictItem}>
              <p className={styles.conflictDesc}>{conflict.description}</p>
              <p className={styles.conflictResolution}>Resolution: {conflict.resolution}</p>
              <p className={styles.conflictTradeoff}>Trade-off: {conflict.tradeoff}</p>
            </div>
          ))}
        </div>
      )}

      {/* Unresolved questions */}
      {unifiedPlan.unresolvedQuestions.length > 0 && (
        <div className={styles.unresolvedSection}>
          <h4 className={styles.sectionTitle}>Unresolved Questions</h4>
          <ul className={styles.unresolvedList}>
            {unifiedPlan.unresolvedQuestions.map((q, i) => (
              <li key={i} className={styles.unresolvedItem}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
