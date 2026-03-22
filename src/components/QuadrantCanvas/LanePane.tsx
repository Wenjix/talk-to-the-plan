import { useRef, useState, useEffect, useCallback } from 'react';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useQuadrantStore } from '../../store/quadrant-store';
import { LaneCanvas } from '../Canvas/LaneCanvas';
import type { ModelLane } from '../../core/types';
import styles from './QuadrantCanvas.module.css';

interface LanePaneProps {
  lane: ModelLane;
  index: number;
}

export function LanePane({ lane, index }: LanePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const focusedLaneId = useSessionStore(s => s.focusedLaneId);
  const setFocusedLaneId = useSessionStore(s => s.setFocusedLaneId);
  const pinned = useQuadrantStore(s => s.panes.find(p => p.index === index)?.pinned ?? false);
  const setPinned = useQuadrantStore(s => s.setPinned);

  const isFocused = focusedLaneId === lane.id;

  // Node count for this lane
  const nodeCount = useSemanticStore(s =>
    s.nodes.filter(n => n.laneId === lane.id).length,
  );

  // ResizeObserver for compact mode detection
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCompact(entry.contentRect.width < 480);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleFocus = useCallback(() => {
    setFocusedLaneId(isFocused ? null : lane.id);
  }, [isFocused, lane.id, setFocusedLaneId]);

  const handlePin = useCallback(() => {
    setPinned(index, !pinned);
  }, [index, pinned, setPinned]);

  return (
    <div
      ref={containerRef}
      className={`${styles.pane} ${isFocused ? styles.paneFocused : ''} ${compact ? 'pane-compact' : ''}`}
      data-lane-id={lane.id}
    >
      <div
        className={styles.paneHeader}
        style={{ borderTopColor: lane.colorToken }}
      >
        <span
          className={styles.laneDot}
          style={{ backgroundColor: lane.colorToken }}
        />
        <span className={styles.laneLabel}>{lane.label}</span>
        <span className={styles.laneStats}>{nodeCount}</span>
        <div className={styles.paneActions}>
          <button
            className={`${styles.paneBtn} ${isFocused ? styles.paneBtnActive : ''}`}
            onClick={handleFocus}
            title={isFocused ? 'Unfocus pane' : 'Focus pane'}
            type="button"
          >
            {isFocused ? '⊟' : '⊞'}
          </button>
          <button
            className={`${styles.paneBtn} ${pinned ? styles.paneBtnActive : ''}`}
            onClick={handlePin}
            title={pinned ? 'Unpin size' : 'Pin size'}
            type="button"
          >
            {pinned ? '📌' : '📍'}
          </button>
        </div>
      </div>
      <div className={styles.paneCanvas}>
        <LaneCanvas
          laneId={lane.id}
        />
      </div>
    </div>
  );
}
