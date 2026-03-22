import type { ChallengeDepth } from '../../core/types/primitives.ts';
import type { AppSettings } from '../../persistence/settings-store.ts';
import styles from './Settings.module.css';

interface GeneralTabProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

const DEPTH_OPTIONS: readonly { value: ChallengeDepth; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'intense', label: 'Intense' },
];

export function GeneralTab({ settings, onUpdate }: GeneralTabProps) {
  return (
    <div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Default Challenge Depth</legend>
        <div className={styles.radioGroup} role="radiogroup" aria-label="Challenge depth">
          {DEPTH_OPTIONS.map((opt) => (
            <label key={opt.value} className={styles.radioLabel}>
              <input
                type="radio"
                name="challengeDepth"
                value={opt.value}
                checked={settings.challengeDepth === opt.value}
                onChange={() => onUpdate({ challengeDepth: opt.value })}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Animations</legend>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.animationsEnabled}
            onChange={(e) => onUpdate({ animationsEnabled: e.target.checked })}
          />
          Enable animations
        </label>
      </fieldset>
    </div>
  );
}
