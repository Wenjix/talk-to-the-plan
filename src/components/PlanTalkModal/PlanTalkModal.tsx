import { useEffect, useCallback, useRef } from 'react';
import { usePlanTalkStore } from '../../store/plan-talk-store';
import { useSemanticStore } from '../../store/semantic-store';
import { applyAllAccepted } from '../../store/plan-talk-actions';
import { telemetry } from '../../services/telemetry/collector';
import { audioPlayback } from '../../services/voice/audio-playback';
import { VoicePane } from './VoicePane';
import { AnalysisPane } from './AnalysisPane';
import styles from './PlanTalkModal.module.css';

export function PlanTalkModal() {
  const isOpen = usePlanTalkStore((s) => s.isOpen);
  const close = usePlanTalkStore((s) => s.close);
  const clear = usePlanTalkStore((s) => s.clear);
  const pendingEdits = usePlanTalkStore((s) => s.pendingEdits);
  const setPendingEdits = usePlanTalkStore((s) => s.setPendingEdits);
  const turns = usePlanTalkStore((s) => s.turns);
  const ttsTurnStatus = usePlanTalkStore((s) => s.ttsTurnStatus);
  const unifiedPlan = useSemanticStore((s) => s.unifiedPlan);

  const modalRef = useRef<HTMLDivElement>(null);

  const acceptedCount = pendingEdits.filter((e) => e.approved).length;

  const ttsChipStatus = (() => {
    const aiTurns = turns.filter(t => t.speaker === 'ai');
    if (aiTurns.length === 0) return 'disabled';
    const lastAiTurn = aiTurns[aiTurns.length - 1];
    const status = ttsTurnStatus[lastAiTurn.id];
    if (status === 'loading') return 'loading';
    if (status === 'ready') return 'ready';
    if (status === 'failed') return 'failed';
    return 'disabled';
  })();

  const handleClose = useCallback(() => {
    audioPlayback.stop();
    telemetry.track('modal_closed');
    close();
    clear();
  }, [close, clear]);

  const handleApply = useCallback(() => {
    applyAllAccepted();
  }, []);

  const handleDiscard = useCallback(() => {
    setPendingEdits([]);
  }, [setPendingEdits]);

  // Focus modal on open + track telemetry
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
      telemetry.track('modal_opened');
    }
  }, [isOpen]);

  // Keyboard navigation: Escape to close + focus trap
  useEffect(() => {
    if (!isOpen) return;
    const modal = modalRef.current;
    if (!modal) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab') {
        const focusable = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [contenteditable], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={handleClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-talk-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 id="plan-talk-title" className={styles.modalTitle}>Talk to Plan</h2>
            {unifiedPlan && (
              <span className={styles.revisionBadge}>
                rev {unifiedPlan.revision ?? 1}
              </span>
            )}
            <span className={`${styles.ttsChip} ${styles[`ttsChip${ttsChipStatus.charAt(0).toUpperCase()}${ttsChipStatus.slice(1)}`]}`} aria-label={`TTS ${ttsChipStatus}`}>
              TTS
            </span>
          </div>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close Talk to Plan modal" type="button">
            Close
          </button>
        </div>

        <VoicePane />
        <AnalysisPane />

        <div className={styles.footer}>
          <button
            className={styles.discardBtn}
            onClick={handleDiscard}
            disabled={pendingEdits.length === 0}
            type="button"
          >
            Discard Draft
          </button>
          <button
            className={styles.applyBtn}
            onClick={handleApply}
            disabled={acceptedCount === 0}
            aria-label={`Apply ${acceptedCount} accepted edit${acceptedCount !== 1 ? 's' : ''} to plan`}
            type="button"
          >
            Apply {acceptedCount > 0 ? `${acceptedCount} edit${acceptedCount > 1 ? 's' : ''}` : 'selected edits'}
          </button>
        </div>
      </div>
    </div>
  );
}
