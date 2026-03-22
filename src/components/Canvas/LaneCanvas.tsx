import { ReactFlow, Background, Controls, applyNodeChanges } from '@xyflow/react';
import type { Node, OnNodesChange, OnEdgesChange, ReactFlowInstance, NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSemanticStore } from '../../store/semantic-store';
import { useViewStore } from '../../store/view-store';
import { useRadialMenuStore } from '../../store/radial-menu-store';
import { projectToReactFlow } from '../../store/view-projection';
import { nodeTypes, edgeTypes } from './shared-types';
import { useMemo, useCallback, useEffect, useRef, useState } from 'react';

interface LaneCanvasProps {
  laneId: string;
}

export function LaneCanvas({ laneId }: LaneCanvasProps) {
  const semanticNodes = useSemanticStore(s => s.nodes);
  const semanticEdges = useSemanticStore(s => s.edges);
  const viewStates = useViewStore(s => s.viewNodes);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);

  const { nodes, edges } = useMemo(
    () => projectToReactFlow(semanticNodes, semanticEdges, viewStates, laneId),
    [semanticNodes, semanticEdges, viewStates, laneId]
  );

  const [rfNodes, setRfNodes] = useState<Node[]>([]);

  useEffect(() => {
    setRfNodes(prev => {
      const prevMap = new Map(prev.map(n => [n.id, n]));
      return nodes.map(n => {
        const existing = prevMap.get(n.id);
        if (!existing) return n;
        // Preserve React Flow's measured dimensions to avoid "uninitialized node" warning
        return {
          ...n,
          width: existing.width,
          height: existing.height,
          measured: existing.measured,
        };
      });
    });
  }, [nodes]);

  const onNodesChange = useCallback<OnNodesChange>((changes) => {
    setRfNodes(prev => applyNodeChanges(changes, prev));
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        useViewStore.getState().updatePosition(change.id, change.position);
      }
    }
  }, []);

  const onEdgesChange = useCallback<OnEdgesChange>(() => {}, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfInstanceRef.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.2 }), 50);
  }, []);

  const onNodeContextMenu = useCallback<NodeMouseHandler>((event, node) => {
    if (node.type !== 'explorationCard') return;
    event.preventDefault();
    const semanticNode = useSemanticStore.getState().getNode(node.id);
    if (!semanticNode) return;
    useRadialMenuStore.getState().open(
      node.id,
      semanticNode.fsmState,
      event.clientX,
      event.clientY,
    );
  }, []);

  // Re-layout when lane has all nodes at origin
  const prevLaneRef = useRef(laneId);
  useEffect(() => {
    if (prevLaneRef.current === laneId && prevLaneRef.current !== undefined) return;
    prevLaneRef.current = laneId;

    const currentViewStates = useViewStore.getState().viewNodes;
    const laneNodes = semanticNodes.filter(n => n.laneId === laneId);
    const needsLayout = laneNodes.length > 1 && laneNodes.every(n => {
      const view = currentViewStates.get(n.id);
      return !view || (view.position.x === 0 && view.position.y === 0);
    });

    if (needsLayout) {
      const laneEdges = semanticEdges.filter(e =>
        laneNodes.some(n => n.id === e.sourceNodeId)
      );
      useViewStore.getState().relayoutTree(laneNodes, laneEdges);
    }

    if (rfInstanceRef.current) {
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2 }), 100);
    }
  }, [laneId, semanticNodes, semanticEdges]);

  // Auto-fit view when new nodes appear
  const prevNodeCount = useRef(nodes.length);
  useEffect(() => {
    if (nodes.length > prevNodeCount.current && rfInstanceRef.current) {
      rfInstanceRef.current.fitView({ padding: 0.2, duration: 300 });
    }
    prevNodeCount.current = nodes.length;
  }, [nodes.length]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeContextMenu={onNodeContextMenu}
      onInit={onInit}
      minZoom={0.5}
      defaultEdgeOptions={{ type: 'parallaxConnector' }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="var(--canvas-dot, #1a1a2e)" gap={20} />
      <Controls />
    </ReactFlow>
  );
}
