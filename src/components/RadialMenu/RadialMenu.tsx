import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useRadialMenuStore } from '../../store/radial-menu-store';
import { useVoiceCommandStore } from '../../store/voice-command-store';
import { branchFromNode } from '../../store/actions';
import { startVoiceCommand, stopAndProcessVoiceCommand, cancelVoiceCommand } from '../../store/voice-command-actions';
import { loadSettings, resolveBosonApiKey } from '../../persistence/settings-store';
import { useToastStore } from '../../store/toast-store';
import type { PathType } from '../../core/types';
import styles from './RadialMenu.module.css';

const RADIUS = 80;
const BUTTON_SIZE = 44;
const BUTTON_RADIUS = BUTTON_SIZE / 2;
const BUFFER = 8;
const MIC_SIZE = 52;

interface PathConfig {
  path: PathType;
  label: string;
  angle: number; // degrees
  accent: string;
}

const PATHS: PathConfig[] = [
  { path: 'clarify',    label: 'Clarify',    angle: 270, accent: '#5b8def' },
  { path: 'go-deeper',  label: 'Deeper',     angle: 330, accent: '#7b4fbf' },
  { path: 'challenge',  label: 'Challenge',  angle: 30,  accent: '#d94f4f' },
  { path: 'apply',      label: 'Apply',      angle: 90,  accent: '#4faf7b' },
  { path: 'connect',    label: 'Connect',    angle: 150, accent: '#d4a017' },
  { path: 'surprise',   label: 'Surprise',   angle: 210, accent: '#e07baf' },
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

  const [hasBosonKey, setHasBosonKey] = useState(false);
  const micPressedRef = useRef(false);

  // Derive flash state from store instead of syncing via effects
  const flashState: 'idle' | 'success' | 'error' = lastResult
    ? (lastResult.success ? 'success' : 'error')
    : voiceError
      ? 'error'
      : 'idle';

  const isDisabled = targetFsmState !== 'resolved';
  const micDisabled = isDisabled || !hasBosonKey || isProcessing;

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

  const handleSelect = useCallback((pathType: PathType) => {
    if (isDisabled || !targetNodeId) return;
    void branchFromNode(targetNodeId, pathType);
    close();
  }, [isDisabled, targetNodeId, close]);

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
        if (isRecording) {
          cancelVoiceCommand();
        }
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close, isRecording]);

  // Focus first button on open
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const first = containerRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [isOpen]);

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
      <div className={styles.backdrop} onClick={close} />

      <div
        ref={containerRef}
        className={styles.container}
        role="menu"
        style={{ left: cx, top: cy }}
      >
        {/* Center mic button */}
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

        {PATHS.map((p, i) => {
          const rad = (p.angle * Math.PI) / 180;
          const x = Math.cos(rad) * RADIUS - BUTTON_RADIUS;
          const y = Math.sin(rad) * RADIUS - BUTTON_RADIUS;

          return (
            <button
              key={p.path}
              role="menuitem"
              className={`${styles.button} ${isDisabled ? styles.disabled : ''}`}
              style={{
                left: x,
                top: y,
                width: BUTTON_SIZE,
                height: BUTTON_SIZE,
                backgroundColor: p.accent,
                borderColor: p.accent,
                transitionDelay: `${i * 30}ms`,
              }}
              ref={(el) => {
                if (el) {
                  requestAnimationFrame(() => {
                    el.classList.add(styles.visible);
                  });
                }
              }}
              aria-disabled={isDisabled}
              aria-label={p.label}
              tabIndex={0}
              onClick={() => handleSelect(p.path)}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
