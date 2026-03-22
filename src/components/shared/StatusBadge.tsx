import type { NodeFSMState } from '../../core/types';

const STATE_CONFIG: Record<NodeFSMState, { label: string; className: string }> = {
  idle: { label: 'Ready', className: 'status-badge--idle' },
  generating: { label: 'Generating...', className: 'status-badge--generating' },
  resolved: { label: 'Resolved', className: 'status-badge--resolved' },
  failed: { label: 'Failed', className: 'status-badge--failed' },
  stale: { label: 'Stale', className: 'status-badge--stale' },
};

interface StatusBadgeProps {
  state: NodeFSMState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  const config = STATE_CONFIG[state];
  return (
    <span className={`status-badge ${config.className}`}>
      {config.label}
    </span>
  );
}
