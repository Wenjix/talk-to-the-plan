import type { AppSettings, Theme } from '../../persistence/settings-store.ts';
import styles from './Settings.module.css';

interface DisplayTabProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export function DisplayTab({ settings, onUpdate }: DisplayTabProps) {
  const handleThemeChange = () => {
    const next: Theme = settings.theme === 'dark' ? 'light' : 'dark';
    onUpdate({ theme: next });
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  return (
    <div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Theme</legend>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.theme === 'dark'}
            onChange={handleThemeChange}
          />
          Dark mode
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Coming Soon</legend>
        <p className={styles.placeholder}>
          Additional display options will be available in a future update.
        </p>
      </fieldset>
    </div>
  );
}
