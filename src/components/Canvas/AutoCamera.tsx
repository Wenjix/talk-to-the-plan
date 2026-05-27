import { useEffect, useMemo, useRef, useState } from 'react';
import { useReactFlow, useOnViewportChange } from '@xyflow/react';
import { useSemanticStore } from '../../store/semantic-store';
import { useCompanionStore } from '../../store/companion-store';

const USER_PAN_GRACE_MS = 3000;
const ANIMATE_DURATION_MS = 600;

interface AutoCameraProps {
  /**
   * Lane this AutoCamera follows. Required because AutoCamera is mounted
   * once per LaneCanvas (one per lane) — without filtering, every instance
   * would try to follow the globally-newest node, calling fitView with an
   * id that exists in only one of the four ReactFlow instances.
   */
  laneId: string;
}

/**
 * Follows newly added nodes with a smooth camera pan — but backs off if the
 * user has manually panned recently. Mount inside <ReactFlow> while companion
 * mode is active. Uses fitView({nodes:[id]}) so centering respects each
 * node's actual measured dimensions rather than a hardcoded offset.
 */
export function AutoCamera({ laneId }: AutoCameraProps) {
  const rf = useReactFlow();
  const companionStatus = useCompanionStore((s) => s.status);

  const [lastUserPanAt, setLastUserPanAt] = useState(0);
  // Counter lets us stack multiple programmatic pans without losing track of
  // which viewport-change events are "ours" vs user-initiated.
  const pendingProgrammaticRef = useRef(0);
  const lastHandledNodeIdRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  useOnViewportChange({
    onEnd: () => {
      if (pendingProgrammaticRef.current > 0) {
        pendingProgrammaticRef.current -= 1;
        return;
      }
      setLastUserPanAt(Date.now());
    },
  });

  const nodes = useSemanticStore((s) => s.nodes);

  const newestNode = useMemo(() => {
    let candidate = null;
    for (const n of nodes) {
      if (n.laneId !== laneId) continue;
      if (!candidate || n.createdAt > candidate.createdAt) candidate = n;
    }
    return candidate;
  }, [nodes, laneId]);

  useEffect(() => {
    if (companionStatus !== 'listening') return;
    if (!newestNode) return;

    if (newestNode.id === lastHandledNodeIdRef.current) return;
    lastHandledNodeIdRef.current = newestNode.id;

    if (Date.now() - lastUserPanAt < USER_PAN_GRACE_MS) return;

    // Clear any previous safety timer
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
    }

    pendingProgrammaticRef.current += 1;
    void rf.fitView({
      nodes: [{ id: newestNode.id }],
      duration: ANIMATE_DURATION_MS,
      padding: 0.4,
    });
    // Safety: if fitView doesn't move the viewport (e.g. node already centered),
    // onEnd may never fire, so decrement after a timeout
    safetyTimerRef.current = window.setTimeout(() => {
      safetyTimerRef.current = null;
      if (pendingProgrammaticRef.current > 0) {
        pendingProgrammaticRef.current -= 1;
      }
    }, ANIMATE_DURATION_MS + 200);

    return () => {
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, [newestNode, companionStatus, lastUserPanAt, rf]);

  return null;
}
