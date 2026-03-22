import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { ExplorationCard } from '../ExplorationCard/ExplorationCard';
import { Connector } from '../shared/Connector';

/** Shared node/edge type registrations — must be stable references (module-scope, not recreated per render) */
export const nodeTypes: NodeTypes = {
  explorationCard: ExplorationCard,
};

export const edgeTypes: EdgeTypes = {
  fudaConnector: Connector,
};
