import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useRadialMenuStore } from '../../store/radial-menu-store';
import { useVoiceCommandStore } from '../../store/voice-command-store';
import { useVoiceNoteRecordingStore } from '../../store/voice-note-recording-store';
import { branchFromNode } from '../../store/actions';
import { startVoiceCommand, stopAndProcessVoiceCommand, cancelVoiceCommand } from '../../store/voice-command-actions';
import { startVoiceNoteRecording, stopVoiceNoteRecording, cancelVoiceNoteRecording } from '../../store/voice-note-actions';
import { loadSettings, resolveBosonApiKey } from '../../persistence/settings-store';
import { useToastStore } from '../../store/toast-store';
import type { PathType } from '../../core/types';
import styles from './RadialMenu.module.css';

const RADIUS = 140;
const BUTTON_SIZE = 46;
const BUTTON_RADIUS = BUTTON_SIZE / 2;
const BUFFER = 8;
const MIC_SIZE = 48;

interface PathConfig {
  path: PathType | 'voice-note';
  label: string;
  hint: string;
  angle: number; // degrees — distributed as bottom arc
  accent: string;
  group: 'explore' | 'evaluate' | 'annotate';
  type: 'branch' | 'voiceNote';
}

// Bottom semicircle arc: 200° to 344° (7 buttons evenly spaced at 24° intervals)
const PATHS: PathConfig[] = [
  { path: 'clarify',    label: 'Clarify',    hint: 'Sharpen the question',    angle: 200, accent: '#5b8def', group: 'explore',   type: 'branch' },
  { path: 'go-deeper',  label: 'Deeper',     hint: 'Dig into specifics',      angle: 224, accent: '#7b4fbf', group: 'explore',   type: 'branch' },
  { path: 'surprise',   label: 'Surprise',   hint: 'Unexpected angle',        angle: 248, accent: '#e07baf', group: 'explore',   type: 'branch' },
  { path: 'challenge',  label: 'Challenge',  hint: 'Push back on this',       angle: 272, accent: '#d94f4f', group: 'evaluate',  type: 'branch' },
  { path: 'apply',      label: 'Apply',      hint: 'Make it actionable',      angle: 296, accent: '#4faf7b', group: 'evaluate',  type: 'branch' },
  { path: 'connect',    label: 'Connect',    hint: 'Link to other ideas',     angle: 320, accent: '#d4a017', group: 'evaluate',  type: 'branch' },
  { path: 'voice-note', label: 'Note',       hint: 'Attach voice note',       angle: 344, accent: '#e67e22', group: 'annotate',  type: 'voiceNote' },
];

function clamp(min: number, val: number, max: number) {
  return Math.max(min, Math.min(val, max));
}

export function RadialMenu() {
  const isOpen = useRadialMenuStore(s => s.isOpen);
  const position = useRadialMenuStore(s => s.position);
  const targetNodeId = useRadialMenuStore(s => s.targetNodeId);
  const targetFsmState = useRadialMenuStore(s => s.targetFsmState);
  const close = useRadialMenuStore(s => s.close);
  const containerRef = useRef<HTMLDivElement>(null);

  const isRecording = useVoiceCommandStore(s => s.isRecording);
  const isProcessing = useVoiceCommandStore(s => s.isProcessing);
  const lastResult = useVoiceCommandStore(s => s.lastResult);
  const voiceError = useVoiceCommandStore(s => s.error);

  const isRecordingNote = useVoiceNoteRecordingStore(s => s.isRecording);
  const noteElapsedMs = useVoiceNoteRecordingStore(s => s.elapsedMs);

  const [hasBosonKey, setHasBosonKey] = useState(false);
  const micPressedRef = useRef(false);

  // Derive flash state from store instead of syncing via effects
  const flashState: 'idle' | 'success' | 'error' = lastResult
    ? (lastResult.success ? 'success' : 'error')
    : voiceError
      ? 'error'
      : 'idle';

  const isDisabled = targetFsmState !== 'resolved';
  const micDisabled = isDisabled || !hasBosonKey || isProcessing || isRecordingNote;

  const margin = RADIUS + BUTTON_RADIUS + BUFFER;

  // Clamp center to viewport bounds
  const { cx, cy } = useMemo(() => ({
    cx: clamp(margin, position.x, window.innerWidth - margin),
    cy: clamp(margin, position.y, window.innerHeight - margin),
  }), [position, margin]);

  // Load Boson API key status
  useEffect(() => {
    if (!isOpen) return;
    loadSettings().then((settings) => {
      setHasBosonKey(!!resolveBosonApiKey(settings));
    });
  }, [isOpen]);

  // Auto-close after successful result
  useEffect(() => {
    if (lastResult?.success) {
      const timer = setTimeout(() => {
        useVoiceCommandStore.getState().clear();
        close();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [lastResult, close]);

  // Toast and auto-clear on failed result
  useEffect(() => {
    if (lastResult && !lastResult.success) {
      useToastStore.getState().addToast(lastResult.message, 'error');
      const timer = setTimeout(() => {
        useVoiceCommandStore.getState().clear();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [lastResult]);

  // Toast and auto-clear on voice errors
  useEffect(() => {
    if (voiceError) {
      useToastStore.getState().addToast(voiceError, 'error');
      const timer = setTimeout(() => {
        useVoiceCommandStore.getState().clear();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [voiceError]);

  const handleSelect = useCallback((p: PathConfig) => {
    if (isDisabled || !targetNodeId) return;
    if (p.type === 'voiceNote') {
      // Guard: don't start voice note if voice command is active
      if (isRecording || isProcessing) return;
      void startVoiceNoteRecording(targetNodeId);
      return; // don't close — menu transforms to recording state
    }
    void branchFromNode(targetNodeId, p.path as PathType);
    close();
  }, [isDisabled, targetNodeId, close, isRecording, isProcessing]);

  // Auto-save voice note on backdrop close
  const handleBackdropClose = useCallback(() => {
    if (isRecordingNote) {
      void stopVoiceNoteRecording();
    }
    close();
  }, [close, isRecordingNote]);

  // Handle stop button click during voice note recording
  const handleNoteStop = useCallback(() => {
    void stopVoiceNoteRecording().then(() => {
      useToastStore.getState().addToast('Voice note saved', 'success');
      setTimeout(close, 800);
    });
  }, [close]);

  const handleMicPointerDown = useCallback(() => {
    if (micDisabled || !targetNodeId) return;
    micPressedRef.current = true;
    void startVoiceCommand(targetNodeId);
  }, [micDisabled, targetNodeId]);

  const handleMicPointerUp = useCallback(() => {
    if (!micPressedRef.current) return;
    micPressedRef.current = false;
    // stopAndProcessVoiceCommand awaits any pending start internally
    void stopAndProcessVoiceCommand();
  }, []);

  const handleMicPointerLeave = useCallback(() => {
    if (!micPressedRef.current) return;
    micPressedRef.current = false;
    cancelVoiceCommand();
  }, []);

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRecordingNote) {
          cancelVoiceNoteRecording();
        } else if (isRecording) {
          cancelVoiceCommand();
        }
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close, isRecording, isRecordingNote]);

  // Focus first button on open
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const first = containerRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [isOpen]);

  const noteTimerLabel = useMemo(() => {
    const secs = Math.floor(noteElapsedMs / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [noteElapsedMs]);

  if (!isOpen) return null;

  const micStateClass = isRecording
    ? styles.micRecording
    : isProcessing
      ? styles.micProcessing
      : flashState === 'success'
        ? styles.micSuccess
        : flashState === 'error'
          ? styles.micError
          : '';

  const micAriaLabel = isRecording
    ? 'Recording — release to process'
    : isProcessing
      ? 'Processing voice command'
      : !hasBosonKey
        ? 'Voice commands require Boson API key'
        : 'Hold to speak a voice command';

  return (
    <>
      <div className={styles.backdrop} onClick={handleBackdropClose} />

      <div
        ref={containerRef}
        className={styles.container}
        role="menu"
        style={{ left: cx, top: cy }}
      >
        {/* Center button: mic (voice command) or stop (voice note recording) */}
        {isRecordingNote ? (
          <button
            className={`${styles.micCenter} ${styles.micRecording}`}
            style={{
              width: MIC_SIZE,
              height: MIC_SIZE,
              left: -MIC_SIZE / 2,
              top: -MIC_SIZE / 2,
            }}
            type="button"
            aria-label={`Recording voice note — ${noteTimerLabel} — click to stop`}
            onClick={handleNoteStop}
          >
            {'\u25A0'}
          </button>
        ) : (
          <button
            className={`${styles.micCenter} ${micStateClass}`}
            style={{
              width: MIC_SIZE,
              height: MIC_SIZE,
              left: -MIC_SIZE / 2,
              top: -MIC_SIZE / 2,
            }}
            disabled={micDisabled}
            type="button"
            aria-label={micAriaLabel}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerLeave={handleMicPointerLeave}
          >
            {isProcessing ? (
              <span className={styles.micSpinner} />
            ) : (
              '\uD83C\uDF99'
            )}
          </button>
        )}

        {/* Duration timer below center during voice note recording */}
        {isRecordingNote && (
          <span className={styles.noteTimer}>{noteTimerLabel}</span>
        )}

        {PATHS.map((p, i) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = Math.cos(rad) * RADIUS - BUTTON_RADIUS;
          const y = Math.sin(rad) * RADIUS - BUTTON_RADIUS;

          return (
            <button
              key={p.path}
              role="menuitem"
              className={`${styles.button} ${isDisabled ? styles.disabled : ''} ${isRecordingNote ? styles.dimmed : ''}`}
              style={{
                left: x,
                top: y,
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                backgroundColor: p.accent,
                borderColor: p.accent,
                transitionDelay: `${i * 40}ms`,
              }}
              ref={(el) => {
                if (el) {
                  requestAnimationFrame(() => {
                    el.classList.add(styles.visible);
                  });
                }
              }}
              aria-disabled={isDisabled || isRecordingNote}
              aria-label={`${p.label}: ${p.hint}`}
              title={p.hint}
              tabIndex={0}
              onClick={() => !isRecordingNote && handleSelect(p)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
