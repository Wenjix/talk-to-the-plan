import type { NodeFSMState } from '../types/node'

export type NodeEvent =
  | { type: 'GENERATE_REQUESTED' }
  | { type: 'GENERATION_SUCCEEDED' }
  | { type: 'GENERATION_FAILED' }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'UPSTREAM_CHANGED' }
  | { type: 'REGENERATE_REQUESTED' }

export function nodeTransition(current: NodeFSMState, event: NodeEvent): NodeFSMState | null {
  switch (current) {
    case 'idle':
      if (event.type === 'GENERATE_REQUESTED') return 'generating'
      return null

    case 'generating':
      if (event.type === 'GENERATION_SUCCEEDED') return 'resolved'
      if (event.type === 'GENERATION_FAILED') return 'failed'
      return null

    case 'resolved':
      if (event.type === 'UPSTREAM_CHANGED') return 'stale'
      if (event.type === 'REGENERATE_REQUESTED') return 'generating'
      return null

    case 'failed':
      if (event.type === 'RETRY_REQUESTED') return 'generating'
      return null

    case 'stale':
      if (event.type === 'REGENERATE_REQUESTED') return 'generating'
      if (event.type === 'GENERATE_REQUESTED') return 'generating'
      return null
  }
}

export function canPromote(state: NodeFSMState): boolean {
  return state === 'resolved'
}

export function canBranch(state: NodeFSMState): boolean {
  return state === 'resolved' || state === 'idle'
}
