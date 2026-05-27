import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppSettings } from '../../persistence/settings-store.ts';
import { loadSettings, updateSettings, AppSettingsSchema } from '../../persistence/settings-store.ts';
import { useSessionStore } from '../../store/session-store.ts';
import { GeneralTab } from './GeneralTab.tsx';
import { ApiTab } from './ApiTab.tsx';
import { DisplayTab } from './DisplayTab.tsx';
import { PersonasTab } from './PersonasTab.tsx';
import styles from './Settings.module.css';

export type TabId = 'general' | 'api' | 'personas' | 'display';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'api', label: 'API' },
  { id: 'personas', label: 'Personas' },
  { id: 'display', label: 'Display' },
];

interface SettingsProps {
  onClose: () => void;
  initialTab?: TabId;
}

export function Settings({ onClose, initialTab }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'general');
  const [settings, setSettings] = useState<AppSettings>(
    AppSettingsSchema.parse({})
  );

  const setChallengeDepth = useSessionStore((s) => s.setChallengeDepth);
  const updateSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleUpdate = useCallback(
    (partial: Partial<AppSettings>) => {
      // Sequence number tags this update. On persist failure we only revert
      // React state if no newer update has been started (otherwise the
      // revert would clobber the user's subsequent edits).
      const seq = ++updateSeq.current;
      setSettings((prev) => ({ ...prev, ...partial }));
      void updateSettings(partial).then(
        () => {
          // Apply side-effecting store mutations only after the IDB write
          // succeeds, so a failed persist can't leave the session store
          // running with one challengeDepth and IDB holding another.
          if (partial.challengeDepth) {
            setChallengeDepth(partial.challengeDepth);
          }
        },
        (err) => {
          console.warn('Failed to persist settings update:', err);
          if (seq === updateSeq.current) {
            void loadSettings().then((s) => setSettings(s));
          }
        },
      );
    },
    [setChallengeDepth]
  );

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            &#x2715;
          </button>
        </div>

        <div className={styles.tabBar} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.tabContent} role="tabpanel">
          {activeTab === 'general' && (
            <GeneralTab settings={settings} onUpdate={handleUpdate} />
          )}
          {activeTab === 'api' && (
            <ApiTab settings={settings} onUpdate={handleUpdate} />
          )}
          {activeTab === 'personas' && (
            <PersonasTab settings={settings} onUpdate={handleUpdate} />
          )}
          {activeTab === 'display' && (
            <DisplayTab settings={settings} onUpdate={handleUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}
