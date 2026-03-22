import { useCallback, useEffect, useState } from 'react';
import { useSessionStore } from './store/session-store';
import { useViewStore } from './store/view-store';
import { switchSession, deleteSession, listSessions } from './store/workspace-actions';
import { generateDirectPlan } from './store/plan-actions';
import { useToastStore } from './store/toast-store';
import { toggleTerminal } from './store/terminal-actions';
import { addUserTurn, generateDialogueResponse, concludeDialogue } from './store/dialogue-actions';
import { usePlanTalkStore } from './store/plan-talk-store';
import { TopicInput } from './components/TopicInput/TopicInput';
import { ParallaxCanvas } from './components/Canvas/ParallaxCanvas';
import { PlanPanel } from './components/PlanPanel/PlanPanel';
import { DialoguePanel } from './components/DialoguePanel/DialoguePanel';
import { SessionList } from './components/SessionList/SessionList';
import { Toolbar } from './components/Toolbar/Toolbar';
import { PlanTalkModal } from './components/PlanTalkModal/PlanTalkModal';
import { TerminalDrawer } from './components/TerminalDrawer/TerminalDrawer';
import { useTheme } from './components/Settings/ThemeProvider';
import type { DialecticMode } from './core/types';
import './App.css';

function App() {
  useTheme();
  const uiMode = useSessionStore(s => s.uiMode);
  const session = useSessionStore(s => s.session);
  const planPanelOpen = useSessionStore(s => s.planPanelOpen);
  const terminalOpen = useViewStore(s => s.terminalOpen);
  const dialogueNodeId = useViewStore(s => s.dialoguePanelNodeId);
  const closeDialogue = useViewStore(s => s.closeDialoguePanel);
  const [dialogueGenerating, setDialogueGenerating] = useState(false);

  // On initial mount with no session, check IDB for saved sessions
  useEffect(() => {
    if (session) return; // Already have a session
    if (uiMode !== 'topic_input') return; // Already navigating somewhere

    let cancelled = false;
    listSessions()
      .then((sessions) => {
        if (cancelled) return;
        if (sessions.length > 0) {
          useSessionStore.getState().setUIMode('workspace');
        }
      })
      .catch(() => {
        // IDB unavailable; stay on topic_input
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenSession = useCallback((sessionId: string) => {
    switchSession(sessionId).catch((err) => {
      console.warn('Failed to switch session:', err);
    });
  }, []);

  const handleNewSession = useCallback(() => {
    useSessionStore.getState().setUIMode('topic_input');
  }, []);

  const handleDeleteSession = useCallback((sessionId: string) => {
    deleteSession(sessionId).catch((err) => {
      console.warn('Failed to delete session:', err);
    });
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    try {
      await generateDirectPlan();
    } catch (err) {
      console.error('Failed to generate plan:', err);
      useToastStore.getState().addToast(
        `Plan generation failed: ${(err as Error).message}`,
        'error',
        5000,
      );
    }
  }, []);

  const handleDialogueSend = useCallback((content: string, mode: DialecticMode) => {
    if (!dialogueNodeId) return;
    addUserTurn(dialogueNodeId, content, mode);
    setDialogueGenerating(true);
    generateDialogueResponse(dialogueNodeId, mode)
      .catch((err) => console.error('Dialogue generation failed:', err))
      .finally(() => setDialogueGenerating(false));
  }, [dialogueNodeId]);

  const handleDialogueConclude = useCallback(() => {
    if (!dialogueNodeId) return;
    setDialogueGenerating(true);
    concludeDialogue(dialogueNodeId)
      .then(() => closeDialogue())
      .catch((err) => console.error('Dialogue conclude failed:', err))
      .finally(() => setDialogueGenerating(false));
  }, [dialogueNodeId, closeDialogue]);

  const handleTalkToPlan = useCallback(() => {
    usePlanTalkStore.getState().open();
  }, []);

  // Keyboard shortcut: Ctrl+` toggles terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToolbar = session || uiMode === 'workspace';

  return (
    <div className="app">
      {showToolbar && <Toolbar />}
      <main className="app-main">
        {uiMode === 'topic_input' && <TopicInput />}
        {uiMode === 'workspace' && (
          <SessionList
            onOpenSession={handleOpenSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
          />
        )}
        {(uiMode === 'compass' || uiMode === 'exploring') && (
          <div className="exploring-layout">
            <div className="exploring-content">
              <ParallaxCanvas />
              {terminalOpen && <TerminalDrawer />}
            </div>
            {planPanelOpen && (
              <div className="plan-panel-container">
                <PlanPanel
                  onGeneratePlan={handleGeneratePlan}
                  onTalkToPlan={handleTalkToPlan}
                />
              </div>
            )}
          </div>
        )}
        {/* DialoguePanel overlay — z-index: 100 */}
        {dialogueNodeId && (uiMode === 'exploring' || uiMode === 'compass') && (
          <div className="dialogue-panel-overlay">
            <DialoguePanel
              nodeId={dialogueNodeId}
              onClose={closeDialogue}
              onSendMessage={handleDialogueSend}
              onConclude={handleDialogueConclude}
              isGenerating={dialogueGenerating}
            />
          </div>
        )}
      </main>
      <PlanTalkModal />
    </div>
  );
}

export default App;
