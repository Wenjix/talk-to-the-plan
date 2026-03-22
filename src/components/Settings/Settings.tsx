import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
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
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        updateSettings(partial);
        if (partial.challengeDepth) {
          setChallengeDepth(partial.challengeDepth);
        }
        return next;
      });
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
