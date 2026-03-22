import { useState, useCallback, useRef, useEffect } from 'react';
import type { DialecticMode, DialogueTurn } from '../../core/types';
import { useSemanticStore } from '../../store/semantic-store';
import { useViewStore } from '../../store/view-store';
import styles from './DialoguePanel.module.css';

const MODES: Array<{ id: DialecticMode; label: string; desc: string }> = [
  { id: 'socratic', label: 'Socratic', desc: 'Questions only' },
  { id: 'devil_advocate', label: "Devil's Advocate", desc: 'Argues opposite' },
  { id: 'steelman', label: 'Steelman', desc: 'Strengthens your case' },
  { id: 'collaborative', label: 'Collaborative', desc: 'Builds together' },
];

interface DialoguePanelProps {
  nodeId: string;
  onClose: () => void;
  onSendMessage: (content: string, mode: DialecticMode) => void;
  onConclude: () => void;
  isGenerating: boolean;
}

export function DialoguePanel({ nodeId, onClose, onSendMessage, onConclude, isGenerating }: DialoguePanelProps) {
  const [mode, setMode] = useState<DialecticMode>('socratic');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get dialogue turns from semantic store
  // NOTE: The semantic store may not have getDialogueTurnsByNode yet (it's being added by another agent).
  // Use a safe accessor that filters the dialogueTurns array.
  const dialogueTurns = useSemanticStore(s => {
    // Safely access dialogueTurns (may not exist yet)
    const turns = (s as unknown as Record<string, unknown>).dialogueTurns as DialogueTurn[] | undefined;
    return (turns ?? []).filter((t: DialogueTurn) => t.nodeId === nodeId);
  });

  // Get streaming buffer for dialogue
  const streamBuffer = useViewStore(s => s.streamBuffers.get(`dialogue-${nodeId}`) ?? '');

  // Auto-scroll on new turns
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [dialogueTurns.length, streamBuffer]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;
    setInput('');
    onSendMessage(trimmed, mode);
  }, [input, mode, isGenerating, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestedClick = useCallback((text: string) => {
    onSendMessage(text, mode);
  }, [mode, onSendMessage]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Dialogue</h3>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {/* Mode selector */}
      <div className={styles.modeSelector}>
        {MODES.map(m => (
          <button
            key={m.id}
            className={`${styles.modeBtn} ${mode === m.id ? styles.modeBtnActive : ''}`}
            onClick={() => setMode(m.id)}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Chat thread */}
      <div className={styles.thread} ref={scrollRef}>
        {dialogueTurns.map((turn: DialogueTurn) => (
          <div key={turn.id} className={`${styles.turn} ${turn.speaker === 'user' ? styles.turnUser : styles.turnAi}`}>
            <div className={styles.turnSpeaker}>
              {turn.speaker === 'user' ? 'You' : 'AI'}
              {turn.turnType && <span className={styles.turnType}>{turn.turnType}</span>}
            </div>
            <div className={styles.turnContent}>{turn.content}</div>
            {/* Suggested responses after AI turns */}
            {turn.speaker === 'ai' && turn.suggestedResponses && turn.suggestedResponses.length > 0 && (
              <div className={styles.suggestions}>
                {turn.suggestedResponses.map((sr, i) => (
                  <button
                    key={i}
                    className={styles.suggestionChip}
                    onClick={() => handleSuggestedClick(sr.text)}
                    disabled={isGenerating}
                  >
                    {sr.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Streaming indicator */}
        {isGenerating && streamBuffer && (
          <div className={`${styles.turn} ${styles.turnAi}`}>
            <div className={styles.turnSpeaker}>AI</div>
            <div className={styles.turnContent}>
              {streamBuffer}
              <span className={styles.cursor}>|</span>
            </div>
          </div>
        )}
        {isGenerating && !streamBuffer && (
          <div className={`${styles.turn} ${styles.turnAi}`}>
            <div className={styles.turnContent}>
              <span className={styles.thinking}>Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          rows={2}
          disabled={isGenerating}
        />
        <div className={styles.inputActions}>
          <button
            className={styles.concludeBtn}
            onClick={onConclude}
            disabled={isGenerating || dialogueTurns.length === 0}
          >
            Conclude
          </button>
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
