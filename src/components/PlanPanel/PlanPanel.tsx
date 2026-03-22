import { useState, useCallback } from 'react';
import type { SessionStatus } from '../../core/types';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { PlanCard } from '../PlanCard/PlanCard';
import { SynthesisPanel } from '../SynthesisPanel/SynthesisPanel';
import styles from './PlanPanel.module.css';

const SYNTHESIS_STATUSES: ReadonlySet<SessionStatus> = new Set([
  'lane_planning',
  'synthesis_ready',
  'synthesized',
]);

interface PlanPanelProps {
  onGeneratePlan: (laneId: string) => void;
  onGenerateDirectPlan?: () => Promise<void>;
  onEvidenceClick?: (nodeId: string) => void;
  onSynthesize?: () => Promise<void>;
  onTalkToPlan?: () => void;
}

export function PlanPanel({ onGeneratePlan, onGenerateDirectPlan, onEvidenceClick, onSynthesize, onTalkToPlan }: PlanPanelProps) {
  const lanePlans = useSemanticStore(s => s.lanePlans);
  const unifiedPlan = useSemanticStore(s => s.unifiedPlan);
  const activeLaneId = useSessionStore(s => s.activeLaneId);
  const sessionStatus = useSessionStore(s => s.session?.status ?? 'exploring');
  const activePlan = lanePlans.find(p => p.laneId === activeLaneId);
  const promotionCount = useSemanticStore(s =>
    s.promotions.filter(p => p.laneId === activeLaneId).length,
  );
  const totalPromotions = useSemanticStore(s => s.promotions.length);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDirectPlan = useCallback(async () => {
    if (!onGenerateDirectPlan) return;
    setIsGenerating(true);
    try {
      await onGenerateDirectPlan();
      setIsExpanded(true);
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerateDirectPlan]);

  const showSynthesis = SYNTHESIS_STATUSES.has(sessionStatus);

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <span className={styles.tabLabel}>
          Lane Plans ({lanePlans.length})
        </span>
        {unifiedPlan && (
          <>
            <span className={styles.tabLabel}>Unified Plan</span>
            <button
              className={styles.expandBtn}
              onClick={() => setIsExpanded(true)}
              title="Expand plan to full screen"
            >
              Expand
            </button>
          </>
        )}
      </div>

      {activePlan ? (
        <PlanCard plan={activePlan} onEvidenceClick={onEvidenceClick} />
      ) : (
        <div className={styles.empty}>
          {promotionCount === 0 ? (
            <>
              <p className={styles.emptyHeading}>Promote nodes to build your plan</p>
              <p className={styles.emptyHint}>
                Click the &#x2606; on any resolved node to mark it as evidence for planning.
              </p>
            </>
          ) : (
            <>
              <p className={styles.emptyText}>No plan generated for this lane yet.</p>
              <p className={styles.promotionCount}>
                {promotionCount} promoted node{promotionCount !== 1 ? 's' : ''} ready
              </p>
            </>
          )}
          <button
            className={styles.generateBtn}
            onClick={() => activeLaneId && onGeneratePlan(activeLaneId)}
            disabled={promotionCount === 0}
          >
            Generate Lane Plan
          </button>
        </div>
      )}

      {/* Show all lane plans summary */}
      {lanePlans.length > 1 && (
        <div className={styles.planList}>
          <h4 className={styles.planListTitle}>All Lane Plans</h4>
          {lanePlans.map(p => (
            <div
              key={p.id}
              className={`${styles.planListItem} ${p.laneId === activeLaneId ? styles.active : ''}`}
            >
              <span className={styles.planListName}>{p.title}</span>
              <span className={styles.planListConfidence}>
                {Math.round(p.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Direct plan generation */}
      {totalPromotions >= 3 && !unifiedPlan && onGenerateDirectPlan && (
        <div className={styles.directPlan}>
          <div className={styles.divider} />
          {isGenerating ? (
            <>
              <div className={styles.spinner} />
              <p className={styles.directPlanText}>Generating plan...</p>
            </>
          ) : (
            <>
              <p className={styles.directPlanText}>
                {totalPromotions} promoted node{totalPromotions !== 1 ? 's' : ''} across all lanes
              </p>
              <button
                className={styles.directPlanBtn}
                onClick={() => void handleDirectPlan()}
              >
                Generate Plan
              </button>
            </>
          )}
        </div>
      )}

      {/* Synthesis section */}
      {showSynthesis && (
        <>
          <div className={styles.divider} />
          <SynthesisPanel
            status={sessionStatus}
            lanePlans={lanePlans}
            unifiedPlan={unifiedPlan}
            onSynthesize={onSynthesize}
            onEvidenceClick={onEvidenceClick}
            onTalkToPlan={onTalkToPlan}
          />
        </>
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
              lanePlans={lanePlans}
              unifiedPlan={unifiedPlan}
              onSynthesize={onSynthesize}
              onEvidenceClick={onEvidenceClick}
              onTalkToPlan={onTalkToPlan}
            />
          </div>
        </div>
      )}
    </div>
  );
}
