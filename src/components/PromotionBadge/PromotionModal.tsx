import { useState, useCallback } from 'react';
import type { PromotionReason } from '../../core/types';
import styles from './PromotionModal.module.css';

const REASONS: Array<{ value: PromotionReason; label: string }> = [
  { value: 'insightful_reframe', label: 'Insightful reframe of the problem' },
  { value: 'actionable_detail', label: 'Directly actionable detail' },
  { value: 'risk_identification', label: 'Important risk identified' },
  { value: 'assumption_challenge', label: 'Assumption challenged through dialogue' },
  { value: 'cross_domain_link', label: 'Cross-domain connection discovered' },
];

interface PromotionModalProps {
  onConfirm: (reason: PromotionReason, note: string) => void;
  onCancel: () => void;
}

export function PromotionModal({ onConfirm, onCancel }: PromotionModalProps) {
  const [reason, setReason] = useState<PromotionReason>('insightful_reframe');
  const [note, setNote] = useState('');

  const handleConfirm = useCallback(() => {
    onConfirm(reason, note);
  }, [reason, note, onConfirm]);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>Promote as Evidence</h3>
        <div className={styles.reasons}>
          {REASONS.map(r => (
            <label key={r.value} className={styles.reason}>
              <input
                type="radio"
                name="reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
        <textarea
          className={styles.note}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional note..."
          rows={2}
        />
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={handleConfirm}>Promote</button>
        </div>
      </div>
    </div>
  );
}
