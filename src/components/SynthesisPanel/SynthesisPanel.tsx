import { useState, useCallback } from 'react';
import type { UnifiedPlan, LanePlan, PlanSection } from '../../core/types';
import { SYNTHESIS_THRESHOLD } from '../../core/fsm/session-fsm';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { EvidenceTrail } from '../EvidenceTrail/EvidenceTrail';
import styles from './SynthesisPanel.module.css';

interface SynthesisPanelProps {
  status: 'exploring' | 'lane_planning' | 'synthesis_ready' | 'synthesized';
  lanePlans: LanePlan[];
  unifiedPlan: UnifiedPlan | null;
  onSynthesize?: () => Promise<void>;
  onEvidenceClick?: (nodeId: string) => void;
  onTalkToPlan?: () => void;
}

const SECTION_ORDER = ['goals', 'assumptions', 'strategy', 'milestones', 'risks', 'nextActions'] as const;

const SYNTHESIS_STAGES = [
  'Comparing lanes...',
  'Resolving conflicts...',
  'Generating unified plan...',
] as const;

function formatSectionName(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

export function SynthesisPanel({
  status,
  lanePlans,
  unifiedPlan,
  onSynthesize,
  onEvidenceClick,
  onTalkToPlan,
}: SynthesisPanelProps) {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const lanes = useSemanticStore(s => s.lanes);
  const setActiveLane = useSessionStore(s => s.setActiveLane);

  const handleSynthesize = useCallback(async () => {
    if (!onSynthesize) return;
    setIsSynthesizing(true);
    setStageIndex(0);

    // Advance stage indicator during synthesis
    const timer = setInterval(() => {
      setStageIndex(prev => Math.min(prev + 1, SYNTHESIS_STAGES.length - 1));
    }, 2000);

    try {
      await onSynthesize();
    } catch {
      // Synthesis may not be implemented yet
    } finally {
      clearInterval(timer);
      setIsSynthesizing(false);
      setStageIndex(0);
    }
  }, [onSynthesize]);

  // Loading state
  if (isSynthesizing) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>
          <div className={styles.spinner} aria-label="Synthesizing" />
          <span className={styles.stageText}>{SYNTHESIS_STAGES[stageIndex]}</span>
        </div>
      </div>
    );
  }

  // Unified plan exists: render it
  if (unifiedPlan) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>{unifiedPlan.title}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onTalkToPlan && (
              <button
                className={styles.synthesizeBtn}
                onClick={onTalkToPlan}
                type="button"
              >
                Talk to Plan
              </button>
            )}
            {status === 'synthesis_ready' && (
            <button
              className={styles.synthesizeBtn}
              onClick={() => void handleSynthesize()}
              type="button"
            >
              Re-synthesize
            </button>
          )}
          </div>
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

  // Synthesis ready: show trigger button
  if (status === 'synthesis_ready') {
    return (
      <div className={styles.panel}>
        <div className={styles.readySection}>
          <p className={styles.planSummary}>
            {lanePlans.length} lane plan{lanePlans.length !== 1 ? 's' : ''} ready:{' '}
            {lanePlans.map(p => p.title).join(', ')}
          </p>
          <button
            className={styles.synthesizeBtn}
            onClick={() => void handleSynthesize()}
            type="button"
          >
            Synthesize Plans
          </button>
        </div>
      </div>
    );
  }

  // Not ready: show disabled progress
  const planCount = lanePlans.length;
  const progressPct = Math.round((planCount / SYNTHESIS_THRESHOLD) * 100);

  const laneHasPlan = (laneId: string) =>
    lanePlans.some(p => p.laneId === laneId);

  return (
    <div className={styles.panel}>
      <div className={styles.disabled}>
        <p className={styles.disabledText}>
          Generate at least {SYNTHESIS_THRESHOLD} lane plans to enable synthesis
        </p>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
        <p className={styles.progressLabel}>
          {planCount} of {SYNTHESIS_THRESHOLD} lane plans ready
        </p>
        {lanes.length > 0 && (
          <div className={styles.laneChips}>
            {lanes.map(lane => {
              const hasPlan = laneHasPlan(lane.id);
              return (
                <button
                  key={lane.id}
                  className={`${styles.laneChip} ${hasPlan ? styles.laneChipDone : ''}`}
                  style={{ borderColor: lane.colorToken, color: hasPlan ? '#fff' : lane.colorToken, background: hasPlan ? lane.colorToken : 'transparent' }}
                  onClick={() => !hasPlan && setActiveLane(lane.id)}
                  title={hasPlan ? `${lane.label}: plan generated` : `${lane.label}: click to switch`}
                  type="button"
                >
                  {lane.label} {hasPlan ? '\u2713' : '\u25CB'}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
