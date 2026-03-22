import type { NodeTypes, EdgeTypes } from '@xyflow/react';
import { ExplorationCard } from '../ExplorationCard/ExplorationCard';
import { PlanCard } from '../PlanCard/PlanCard';
import { Connector } from '../shared/Connector';

/** Shared node/edge type registrations — must be stable references (module-scope, not recreated per render) */
export const nodeTypes: NodeTypes = {
  explorationCard: ExplorationCard,
  // @ts-expect-error PlanCard accepts PlanCardProps; plan data is threaded via node.data
  planCard: PlanCard,
};

export const edgeTypes: EdgeTypes = {
  fudaConnector: Connector,
};
