import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import './Connector.css';

export function Connector(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, id, data } = props;
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const pathType = (data as Record<string, unknown> | undefined)?.pathType as string | undefined;
  const accent = (data as Record<string, unknown> | undefined)?.pathAccent as string | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="parallax-connector" />
      {pathType && accent && (
        <EdgeLabelRenderer>
          <div
            className="parallax-edge-label"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: accent,
              pointerEvents: 'none',
            }}
          >
            {pathType === 'go-deeper' ? 'deeper' : pathType}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
