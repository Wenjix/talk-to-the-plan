// TODO: Quadrant view temporarily disabled. This file needs repair before re-enabling:
// - RadialMenu and LaneCanvas APIs were simplified during single-canvas refactor
// - Re-integration will need to pass paneBounds back through radial-menu-store
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useQuadrantStore } from '../../store/quadrant-store';
import { useToastStore } from '../../store/toast-store';
import { RadialMenu } from '../RadialMenu/RadialMenu';
import { LanePane } from './LanePane';
import { computeLaneScore, computeAutoSplits } from './layout-engine';
import styles from './QuadrantCanvas.module.css';

type ResponsiveLayout = 'full' | 'stacked-2x1' | 'vertical';

export function QuadrantCanvas() {
  const lanes = useSemanticStore(s => s.lanes);
  const nodes = useSemanticStore(s => s.nodes);
  const focusedLaneId = useSessionStore(s => s.focusedLaneId);
  const colSplit = useQuadrantStore(s => s.colSplit);
  const rowSplit = useQuadrantStore(s => s.rowSplit);
  const autoResize = useQuadrantStore(s => s.autoResize);
  const panes = useQuadrantStore(s => s.panes);
  const setColSplit = useQuadrantStore(s => s.setColSplit);
  const setRowSplit = useQuadrantStore(s => s.setRowSplit);
  const setPanes = useQuadrantStore(s => s.setPanes);
  const containerRef = useRef<HTMLDivElement>(null);
  const [responsiveLayout, setResponsiveLayout] = useState<ResponsiveLayout>('full');

  // ResizeObserver for responsive breakpoints
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;

        // Below minimum threshold: auto-switch to single-lane mode
        if (width < 800 || height < 600) {
          useSessionStore.getState().setLayoutMode('single');
          useToastStore.getState().addToast(
            'Viewport too small for quadrant view — switched to single canvas.',
            'info',
          );
          return;
        }

        if (width >= 1200) {
          setResponsiveLayout('full');
        } else if (width >= 680) {
          setResponsiveLayout('stacked-2x1');
        } else {
          setResponsiveLayout('vertical');
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Initialize panes from lanes on first render
  useEffect(() => {
    if (panes.length === 0 && lanes.length >= 4) {
      setPanes(
        lanes.slice(0, 4).map((lane, i) => ({
          laneId: lane.id,
          index: i,
          pinned: false,
        })),
      );
    }
  }, [lanes, panes.length, setPanes]);

  // Auto-resize: recompute splits when nodes change (debounced)
  useEffect(() => {
    if (!autoResize || panes.length < 4) return;

    const hasPinned = panes.some(p => p.pinned);
    if (hasPinned) return;

    const scores = panes.map(p =>
      computeLaneScore(nodes, p.laneId),
    ) as [number, number, number, number];

    // Don't recompute splits until every pane has at least one node —
    // prevents skewing while generation results arrive asynchronously.
    const allPanesStarted = scores.every(s => s > 0);
    if (!allPanesStarted) return;

    const { colSplit: newCol, rowSplit: newRow } = computeAutoSplits(scores);
    setColSplit(newCol);
    setRowSplit(newRow);
  }, [nodes, autoResize, panes, setColSplit, setRowSplit]);

  // Splitter drag state
  const dragging = useRef<'col' | 'row' | null>(null);

  const handleSplitterMouseDown = useCallback(
    (axis: 'col' | 'row') => (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = axis;

      const onMouseMove = (me: MouseEvent) => {
        const container = containerRef.current;
        if (!container || !dragging.current) return;
        const rect = container.getBoundingClientRect();

        if (dragging.current === 'col') {
          const pct = ((me.clientX - rect.left) / rect.width) * 100;
          setColSplit(pct);
        } else {
          const pct = ((me.clientY - rect.top) / rect.height) * 100;
          setRowSplit(pct);
        }
      };

      const onMouseUp = () => {
        dragging.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [setColSplit, setRowSplit],
  );

  // Sorted lanes for the 4 panes
  const paneLanes = useMemo(() => {
    return panes.map(p => lanes.find(l => l.id === p.laneId)).filter(Boolean) as typeof lanes;
  }, [panes, lanes]);

  // If a lane is focused, show only that lane
  if (focusedLaneId) {
    const focusedLane = lanes.find(l => l.id === focusedLaneId);
    if (focusedLane) {
      const focusedIndex = panes.find(p => p.laneId === focusedLaneId)?.index ?? 0;
      return (
        <div className={styles.quadrantContainer} ref={containerRef}>
          <div className={styles.focusedPane}>
            <LanePane
              lane={focusedLane}
              index={focusedIndex}
                          />
          </div>
          <RadialMenu />
        </div>
      );
    }
  }

  if (paneLanes.length < 4) return null;

  // Vertical stack layout (<680px)
  if (responsiveLayout === 'vertical') {
    return (
      <div ref={containerRef} className={`${styles.quadrantContainer} ${styles.verticalStack}`}>
        {paneLanes.map((lane, i) => (
          <LanePane
            key={lane.id}
            lane={lane}
            index={i}
                      />
        ))}
        <RadialMenu />
      </div>
    );
  }

  // Stacked 2x1 layout (680-1199px)
  if (responsiveLayout === 'stacked-2x1') {
    return (
      <div ref={containerRef} className={`${styles.quadrantContainer} ${styles.stacked2x1}`}>
        <LanePane lane={paneLanes[0]} index={0} onNodeContextMenu={handleNodeContextMenu} />
        <LanePane lane={paneLanes[1]} index={1} onNodeContextMenu={handleNodeContextMenu} />
        <LanePane lane={paneLanes[2]} index={2} onNodeContextMenu={handleNodeContextMenu} />
        <LanePane lane={paneLanes[3]} index={3} onNodeContextMenu={handleNodeContextMenu} />
        <RadialMenu />
      </div>
    );
  }

  // Full 2x2 grid (>=1200px)
  return (
    <div
      ref={containerRef}
      className={styles.quadrantContainer}
      style={{
        gridTemplateColumns: `${colSplit}% var(--quadrant-splitter-width) ${100 - colSplit}%`,
        gridTemplateRows: `${rowSplit}% var(--quadrant-splitter-width) ${100 - rowSplit}%`,
      }}
    >
      {/* Top-left */}
      <LanePane
        lane={paneLanes[0]}
        index={0}
              />

      {/* Vertical splitter (top) */}
      <div
        className={`${styles.splitter} ${styles.splitterVertical}`}
        onMouseDown={handleSplitterMouseDown('col')}
        style={{ gridRow: '1', gridColumn: '2' }}
      />

      {/* Top-right */}
      <LanePane
        lane={paneLanes[1]}
        index={1}
              />

      {/* Horizontal splitter (left) */}
      <div
        className={`${styles.splitter} ${styles.splitterHorizontal}`}
        onMouseDown={handleSplitterMouseDown('row')}
        style={{ gridRow: '2', gridColumn: '1' }}
      />

      {/* Center intersection */}
      <div
        className={styles.splitterIntersection}
        style={{ gridRow: '2', gridColumn: '2' }}
      />

      {/* Horizontal splitter (right) */}
      <div
        className={`${styles.splitter} ${styles.splitterHorizontal}`}
        onMouseDown={handleSplitterMouseDown('row')}
        style={{ gridRow: '2', gridColumn: '3' }}
      />

      {/* Bottom-left */}
      <LanePane
        lane={paneLanes[2]}
        index={2}
              />

      {/* Vertical splitter (bottom) */}
      <div
        className={`${styles.splitter} ${styles.splitterVertical}`}
        onMouseDown={handleSplitterMouseDown('col')}
        style={{ gridRow: '3', gridColumn: '2' }}
      />

      {/* Bottom-right */}
      <LanePane
        lane={paneLanes[3]}
        index={3}
              />

      {/* Single RadialMenu rendered at container level */}
      <RadialMenu />
    </div>
  );
}
