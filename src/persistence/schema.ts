import type { DBSchema } from 'idb';
import type {
  PlanningSession,
  ModelLane,
  SemanticNode,
  SemanticEdge,
  Promotion,
  UnifiedPlan,
  DialogueTurn,
  GenerationJob,
  PlanTalkTurn,
  VoiceNote,
} from '../core/types';

export interface ParallaxDB extends DBSchema {
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
  voiceNotes: {
    key: string;
    value: VoiceNote;
    indexes: { 'by-session': string; 'by-node': string };
  };
  voiceNoteBlobs: {
    key: string;
    value: { id: string; blob: Blob };
  };
}

// Preserved as 'fuda-plan' for IndexedDB backward compatibility — renaming would lose existing user data
export const DB_NAME = 'fuda-plan';
export const DB_VERSION = 4;
