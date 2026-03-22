import type { SessionStatus } from '../types/session'

export type SessionEvent =
  | { type: 'DIRECT_PLAN_CREATED' }
  | { type: 'RESET_TO_EXPLORING' }

export function sessionTransition(
  current: SessionStatus,
  event: SessionEvent,
): SessionStatus | null {
  switch (current) {
    case 'exploring':
      if (event.type === 'DIRECT_PLAN_CREATED') return 'synthesized'
      return null

    case 'synthesized':
      if (event.type === 'RESET_TO_EXPLORING') return 'exploring'
      return null
  }
}
