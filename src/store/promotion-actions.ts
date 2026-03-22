import type { Promotion, PromotionReason } from '../core/types';
import { canPromote } from '../core/fsm/node-fsm';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { generateId } from '../utils/ids';

export function promoteNode(
  nodeId: string,
  reason: PromotionReason,
  note?: string,
): Promotion {
  const node = useSemanticStore.getState().getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (!canPromote(node.fsmState)) {
    throw new Error(`Cannot promote node in state: ${node.fsmState}`);
  }

  const session = useSessionStore.getState().session;
  if (!session) throw new Error('No active session');

  // Check not already promoted
  const existing = useSemanticStore.getState().promotions.find(p => p.nodeId === nodeId);
  if (existing) throw new Error('Node is already promoted');

  const promotion: Promotion = {
    id: generateId(),
    sessionId: session.id,
    laneId: node.laneId,
    nodeId: node.id,
    reason,
    note,
    createdAt: new Date().toISOString(),
  };

  useSemanticStore.getState().addPromotion(promotion);
  useSemanticStore.getState().updateNode(nodeId, { promoted: true });
  return promotion;
}

export function unpromoteNode(nodeId: string): void {
  const promotions = useSemanticStore.getState().promotions;
  const promotion = promotions.find(p => p.nodeId === nodeId);
  if (!promotion) return;

  useSemanticStore.getState().removePromotion(promotion.id);
  useSemanticStore.getState().updateNode(nodeId, { promoted: false });
}

export function getNodePromotion(nodeId: string): Promotion | undefined {
  return useSemanticStore.getState().promotions.find(p => p.nodeId === nodeId);
}

export function getLanePromotions(laneId: string): Promotion[] {
  return useSemanticStore.getState().promotions.filter(p => p.laneId === laneId);
}
