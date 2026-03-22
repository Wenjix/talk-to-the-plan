import { useState, useCallback } from 'react';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { SynthesisPanel } from '../SynthesisPanel/SynthesisPanel';
import styles from './PlanPanel.module.css';

const MIN_PROMOTIONS = 3;

interface PlanPanelProps {
  onGeneratePlan: () => Promise<void>;
  onEvidenceClick?: (nodeId: string) => void;
  onTalkToPlan?: () => void;
}

export function PlanPanel({ onGeneratePlan, onEvidenceClick, onTalkToPlan }: PlanPanelProps) {
  const unifiedPlan = useSemanticStore(s => s.unifiedPlan);
  const totalPromotions = useSemanticStore(s => s.promotions.length);
  const sessionStatus = useSessionStore(s => s.session?.status ?? 'exploring');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      await onGeneratePlan();
      setIsExpanded(true);
    } finally {
      setIsGenerating(false);
    }
  }, [onGeneratePlan]);

  const canGenerate = totalPromotions >= MIN_PROMOTIONS;
  const remaining = MIN_PROMOTIONS - totalPromotions;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <span className={styles.tabLabel}>Plan</span>
        {unifiedPlan && (
          <button
            className={styles.expandBtn}
            onClick={() => setIsExpanded(true)}
            title="Expand plan to full screen"
          >
            Expand
          </button>
        )}
      </div>

      {/* Plan exists: show it */}
      {unifiedPlan ? (
        <SynthesisPanel
          status={sessionStatus}
          unifiedPlan={unifiedPlan}
          onEvidenceClick={onEvidenceClick}
          onTalkToPlan={onTalkToPlan}
        />
      ) : (
        /* No plan yet: show generate UI */
        <div className={styles.empty}>
          {isGenerating ? (
            <>
              <div className={styles.spinner} />
              <p className={styles.emptyText}>Generating plan...</p>
            </>
          ) : (
            <>
              <p className={styles.emptyHeading}>
                {canGenerate ? 'Ready to generate your plan' : 'Promote nodes to build your plan'}
              </p>
              <p className={styles.emptyHint}>
                {canGenerate
                  ? `${totalPromotions} promoted node${totalPromotions !== 1 ? 's' : ''} across all lanes`
                  : `Promote at least ${MIN_PROMOTIONS} nodes across any lanes. ${remaining} more needed.`}
              </p>
              <button
                className={styles.generateBtn}
                onClick={() => void handleGenerate()}
                disabled={!canGenerate}
              >
                Generate Plan
              </button>
            </>
          )}
        </div>
      )}

      {/* Fullscreen plan overlay */}
      {isExpanded && unifiedPlan && (
        <div className={styles.fullscreenOverlay} onClick={() => setIsExpanded(false)}>
          <div className={styles.fullscreenPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.fullscreenHeader}>
              <h2 className={styles.fullscreenTitle}>{unifiedPlan.title}</h2>
              <div className={styles.fullscreenActions}>
                {onTalkToPlan && (
                  <button className={styles.closeBtn} onClick={onTalkToPlan}>
                    Talk to Plan
                  </button>
                )}
                <button className={styles.closeBtn} onClick={() => setIsExpanded(false)}>
                  Close
                </button>
              </div>
            </div>
            <SynthesisPanel
              status={sessionStatus}
              unifiedPlan={unifiedPlan}
              onEvidenceClick={onEvidenceClick}
              onTalkToPlan={onTalkToPlan}
            />
          </div>
        </div>
      )}
    </div>
  );
}
