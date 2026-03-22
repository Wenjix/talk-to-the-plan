import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useRadialMenuStore } from '../../store/radial-menu-store';
import { branchFromNode } from '../../store/actions';
import type { PathType } from '../../core/types';
import styles from './RadialMenu.module.css';

const RADIUS = 80;
const BUTTON_SIZE = 44;
const BUTTON_RADIUS = BUTTON_SIZE / 2;
const BUFFER = 8;

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

  const isDisabled = targetFsmState !== 'resolved';

  const margin = RADIUS + BUTTON_RADIUS + BUFFER;

  // Clamp center to viewport bounds
  const { cx, cy } = useMemo(() => ({
    cx: clamp(margin, position.x, window.innerWidth - margin),
    cy: clamp(margin, position.y, window.innerHeight - margin),
  }), [position, margin]);

  const handleSelect = useCallback((pathType: PathType) => {
    if (isDisabled || !targetNodeId) return;
    void branchFromNode(targetNodeId, pathType);
    close();
  }, [isDisabled, targetNodeId, close]);

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  // Focus first button on open
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const first = containerRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={close} />

      <div
        ref={containerRef}
        className={styles.container}
        role="menu"
        style={{ left: cx, top: cy }}
      >
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
