import { useState, useCallback } from 'react';
import type { SessionStatus } from '../../core/types';
import { useSessionStore } from '../../store/session-store.ts';
import { useSemanticStore } from '../../store/semantic-store.ts';
import { useViewStore } from '../../store/view-store.ts';
import { usePlanTalkStore } from '../../store/plan-talk-store.ts';
import { toggleTerminal } from '../../store/terminal-actions.ts';
import { saveSession } from '../../persistence/hooks.ts';
import { Settings } from '../Settings/Settings.tsx';
import type { TabId } from '../Settings/Settings.tsx';
import { PersonaSelector } from '../PersonaSelector/PersonaSelector.tsx';
import styles from './Toolbar.module.css';

const STATUS_META: Record<SessionStatus, { className: string; hint: string }> = {
  exploring: { className: styles.statusExploring, hint: 'Explore and resolve nodes, then promote key findings' },
  lane_planning: { className: styles.statusLanePlanning, hint: 'Generate more lane plans to unlock synthesis' },
  synthesis_ready: { className: styles.statusSynthesisReady, hint: 'Lane plans ready \u2014 open Plan panel to synthesize' },
  synthesized: { className: styles.statusSynthesized, hint: 'Unified plan created' },
};

export function Toolbar() {
  const session = useSessionStore(s => s.session);
  const uiMode = useSessionStore(s => s.uiMode);
  const planPanelOpen = useSessionStore(s => s.planPanelOpen);
  const togglePlanPanel = useSessionStore(s => s.togglePlanPanel);
  const nodeCount = useSemanticStore(s => s.nodes.length);
  const generatingCount = useSemanticStore(s =>
    s.nodes.filter(n => n.fsmState === 'generating').length
  );
  const unifiedPlan = useSemanticStore(s => s.unifiedPlan);
  const openPlanTalk = usePlanTalkStore(s => s.open);
  const terminalOpen = useViewStore(s => s.terminalOpen);
  const [settingsState, setSettingsState] = useState<{ open: boolean; initialTab?: TabId }>({ open: false });

  const handleWorkspaceClick = useCallback(() => {
    saveSession().catch(() => {});
    useSessionStore.getState().setUIMode('workspace');
  }, []);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <button
            className={styles.brand}
            onClick={handleWorkspaceClick}
            type="button"
            title="Back to sessions"
          >
            FUDA
          </button>
          {session && (
            <>
              <span className={styles.topic}>{session.topic}</span>
              <span
                className={`${styles.status} ${STATUS_META[session.status]?.className ?? ''}`}
                title={STATUS_META[session.status]?.hint}
              >
                {session.status.replace(/_/g, ' ')}
              </span>
            </>
          )}
        </div>
        <div className={styles.center}>
          {session && <span className={styles.mode}>{uiMode}</span>}
        </div>
        <div className={styles.right}>
          {session && (
            <span className={styles.nodeCount}>
              {nodeCount} nodes{generatingCount > 0 ? ` (${generatingCount} generating)` : ''}
            </span>
          )}
          {session && uiMode === 'exploring' && (
            <button
              className={`${styles.terminalToggle} ${terminalOpen ? styles.terminalToggleActive : ''}`}
              onClick={() => toggleTerminal()}
              type="button"
              aria-label={terminalOpen ? 'Close terminal' : 'Open terminal'}
              title="Ctrl+`"
            >
              Terminal
            </button>
          )}
          {session && uiMode === 'exploring' && (
            <button
              className={`${styles.planToggle} ${planPanelOpen ? styles.planToggleActive : ''} ${session.status === 'synthesis_ready' && !planPanelOpen ? styles.planTogglePulse : ''}`}
              onClick={togglePlanPanel}
              type="button"
              aria-label={planPanelOpen ? 'Close plan panel' : 'Open plan panel'}
            >
              Plan
            </button>
          )}
          {session && unifiedPlan && (
            <button
              className={styles.planToggle}
              onClick={openPlanTalk}
              type="button"
              aria-label="Talk to Plan"
            >
              Talk to Plan
            </button>
          )}
          {session && uiMode === 'exploring' && (
            <PersonaSelector
              onOpenPersonaSettings={() => setSettingsState({ open: true, initialTab: 'personas' })}
            />
          )}
          <button
            className={styles.settingsButton}
            onClick={() => setSettingsState({ open: true })}
            aria-label="Open settings"
          >
            &#x2699;
          </button>
        </div>
      </div>
      {settingsState.open && (
        <Settings
          onClose={() => setSettingsState({ open: false })}
          initialTab={settingsState.initialTab}
        />
      )}
    </>
  );
}
