import { useState, useCallback, memo } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { SemanticNode, PromotionReason } from '../../core/types';
import { StatusBadge } from '../shared/StatusBadge';
import { StreamingAnswer } from '../shared/StreamingAnswer';
import { PromotionBadge } from '../PromotionBadge/PromotionBadge';
import { PromotionModal } from '../PromotionBadge/PromotionModal';
import { VoiceNoteIndicator } from '../VoiceNoteIndicator/VoiceNoteIndicator';
import { useViewStore } from '../../store/view-store';
import { useSemanticStore } from '../../store/semantic-store';
import { answerNode } from '../../store/actions';
import { promoteNode, unpromoteNode } from '../../store/promotion-actions';
import { sendNodeToVibe } from '../../store/terminal-actions';
import { canPromote } from '../../core/fsm/node-fsm';
import styles from './ExplorationCard.module.css';

type ExplorationCardData = SemanticNode & { _hiddenDescendants?: number };
type ExplorationCardNodeType = Node<ExplorationCardData, 'explorationCard'>;

const REASON_LABELS: Record<PromotionReason, string> = {
  insightful_reframe: 'Reframe',
  actionable_detail: 'Actionable',
  risk_identification: 'Risk',
  assumption_challenge: 'Challenge',
  cross_domain_link: 'Cross-link',
};

function ExplorationCardInner({ data, id }: NodeProps<ExplorationCardNodeType>) {
  const node = data;
  const streamBuffer = useViewStore(s => s.streamBuffers.get(id) ?? '');
  const toggleCollapse = useViewStore(s => s.toggleCollapse);
  const viewNode = useViewStore(s => s.viewNodes.get(id));
  const isStreaming = node.fsmState === 'generating';
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const promotionReason = useSemanticStore(s =>
    node.promoted ? s.promotions.find(p => p.nodeId === id)?.reason : undefined,
  );

  // Check if this node has children (is a parent) by checking edges
  const hasChildren = useSemanticStore(s =>
    s.edges.some(e => e.sourceNodeId === id)
  );

  const isCollapsed = viewNode?.isCollapsed ?? false;
  const hiddenCount = (node as ExplorationCardData)._hiddenDescendants ?? 0;

  const handleAnswer = useCallback(() => {
    if (node.fsmState === 'idle') {
      void answerNode(id);
    }
  }, [node.fsmState, id]);

  const handlePromotionClick = useCallback(() => {
    if (node.promoted) {
      unpromoteNode(id);
    } else if (canPromote(node.fsmState)) {
      // Quick-promote with default reason
      promoteNode(id, 'actionable_detail');
    }
  }, [node.promoted, node.fsmState, id]);

  const handlePromotionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!node.promoted && canPromote(node.fsmState)) {
      setShowPromotionModal(true);
    }
  }, [node.promoted, node.fsmState]);

  const handlePromotionConfirm = useCallback((reason: PromotionReason, note: string) => {
    promoteNode(id, reason, note || undefined);
    setShowPromotionModal(false);
  }, [id]);

  const handlePromotionCancel = useCallback(() => {
    setShowPromotionModal(false);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    toggleCollapse(id);
  }, [toggleCollapse, id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+P: open promotion modal
        if (!node.promoted && canPromote(node.fsmState)) {
          setShowPromotionModal(true);
        }
      } else {
        // P: quick-promote / unpromote
        if (node.promoted) {
          unpromoteNode(id);
        } else if (canPromote(node.fsmState)) {
          promoteNode(id, 'actionable_detail');
        }
      }
    }
  }, [node.promoted, node.fsmState, id]);

  return (
    <div
      className={`${styles.card} ${node.promoted ? styles.promoted : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.header}>
        <StatusBadge state={node.fsmState} />
        {node.pathType && (
          <span className={styles.pathType}>{node.pathType}</span>
        )}
        <PromotionBadge
          isPromoted={node.promoted}
          onClick={handlePromotionClick}
          onContextMenu={handlePromotionContextMenu}
          disabled={!canPromote(node.fsmState) && !node.promoted}
        />
        {promotionReason && (
          <span className={styles.promotionTag}>{REASON_LABELS[promotionReason]}</span>
        )}
        <VoiceNoteIndicator nodeId={id} />
        {hasChildren && (
          <button
            className={styles.collapseBtn}
            onClick={handleToggleCollapse}
            title={isCollapsed ? 'Expand children' : 'Collapse children'}
          >
            {isCollapsed ? `+${hiddenCount}` : '-'}
          </button>
        )}
      </div>

      {showPromotionModal && (
        <PromotionModal
          onConfirm={handlePromotionConfirm}
          onCancel={handlePromotionCancel}
        />
      )}

      <div className={styles.question}>{node.question}</div>

      {/* Show streaming text during generation — progressively parsed */}
      {isStreaming && streamBuffer && (
        <div className={styles.answer}>
          <StreamingAnswer text={streamBuffer} isStreaming={true} />
        </div>
      )}

      {/* Show resolved answer */}
      {node.answer && (
        <div className={styles.answer}>
          <p className={styles.summary}>{node.answer.summary}</p>
          <ul className={styles.bullets}>
            {node.answer.bullets?.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className={styles.actions}>
        {node.fsmState === 'idle' && (
          <button className={styles.answerBtn} onClick={handleAnswer}>
            Show Answer
          </button>
        )}
        {node.fsmState === 'failed' && (
          <button className={styles.retryBtn} onClick={handleAnswer}>
            Retry
          </button>
        )}
        {node.fsmState === 'resolved' && (
          <button className={styles.vibeBtn} onClick={() => sendNodeToVibe(id)}>
            Ask Vibe
          </button>
        )}
      </div>

      {node.fsmState === 'resolved' && !hasChildren && (
        <div className={styles.branchHint}>Right-click to branch</div>
      )}

      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
}

export const ExplorationCard = memo(ExplorationCardInner);
