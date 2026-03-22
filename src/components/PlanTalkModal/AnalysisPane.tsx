import { usePlanTalkStore } from '../../store/plan-talk-store';
import { GapCard } from './GapCard';
import { EditReview } from './EditReview';
import styles from './PlanTalkModal.module.css';

export function AnalysisPane() {
  const understanding = usePlanTalkStore((s) => s.currentUnderstanding);
  const gapCards = usePlanTalkStore((s) => s.gapCards);
  const pendingEdits = usePlanTalkStore((s) => s.pendingEdits);
  const unresolvedQuestions = usePlanTalkStore((s) => s.unresolvedQuestions);
  const updateEditStatus = usePlanTalkStore((s) => s.updateEditStatus);
  const error = usePlanTalkStore((s) => s.error);

  if (error) {
    return (
      <div className={styles.analysisPane} role="complementary" aria-label="AI Analysis">
        <div className={styles.emptyState} role="alert">
          Analysis error: {error}
        </div>
      </div>
    );
  }

  if (!understanding) {
    return (
      <div className={styles.analysisPane} role="complementary" aria-label="AI Analysis">
        <div className={styles.emptyState}>
          AI analysis will appear here after you share your thoughts about the plan.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.analysisPane} role="complementary" aria-label="AI Analysis">
      <h4 className={styles.analysisSectionTitle}>Understanding</h4>
      <p className={styles.understanding}>{understanding}</p>

      {gapCards.length > 0 && (
        <>
          <h4 className={styles.analysisSectionTitle}>Gap Analysis</h4>
          {gapCards.map((card) => (
            <GapCard key={card.id} card={card} />
          ))}
        </>
      )}

      {pendingEdits.length > 0 && (
        <>
          <h4 className={styles.analysisSectionTitle}>Proposed Edits</h4>
          {pendingEdits.map((edit) => (
            <EditReview
              key={edit.id}
              edit={edit}
              onAccept={(id) => updateEditStatus(id, true)}
              onReject={(id) => updateEditStatus(id, false)}
            />
          ))}
        </>
      )}

      {unresolvedQuestions.length > 0 && (
        <>
          <h4 className={styles.analysisSectionTitle}>Open Questions</h4>
          <ul className={styles.questionsList}>
            {unresolvedQuestions.map((q) => (
              <li key={q.slice(0, 60)} className={styles.questionItem}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
