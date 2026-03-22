import type { DBSchema } from 'idb';
import type {
  PlanningSession,
  ModelLane,
  SemanticNode,
  SemanticEdge,
  Promotion,
  LanePlan,
  UnifiedPlan,
  DialogueTurn,
  GenerationJob,
  PlanTalkTurn,
} from '../core/types';

export interface FudaDB extends DBSchema {
  sessions: {
    key: string;
    value: PlanningSession;
  };
  lanes: {
    key: string;
    value: ModelLane;
    indexes: { 'by-session': string };
  };
  nodes: {
    key: string;
    value: SemanticNode;
    indexes: { 'by-session': string; 'by-lane': string };
  };
  edges: {
    key: string;
    value: SemanticEdge;
    indexes: { 'by-session': string };
  };
  promotions: {
    key: string;
    value: Promotion;
    indexes: { 'by-session': string; 'by-lane': string };
  };
  lanePlans: {
    key: string;
    value: LanePlan;
    indexes: { 'by-session': string; 'by-lane': string };
  };
  unifiedPlans: {
    key: string;
    value: UnifiedPlan;
    indexes: { 'by-session': string };
  };
  dialogueTurns: {
    key: string;
    value: DialogueTurn;
    indexes: { 'by-session': string; 'by-node': string };
  };
  jobs: {
    key: string;
    value: GenerationJob;
    indexes: { 'by-session': string };
  };
  planTalkTurns: {
    key: string;
    value: PlanTalkTurn;
    indexes: { 'by-session': string; 'by-unified-plan': string };
  };
}

export const DB_NAME = 'fuda-plan';
export const DB_VERSION = 2;
