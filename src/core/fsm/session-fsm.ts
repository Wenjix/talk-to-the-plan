import type { SessionStatus } from '../types/session'

export type SessionEvent =
  | { type: 'LANE_PLAN_CREATED'; lanePlanCount: number }
  | { type: 'LANE_PLAN_DELETED'; lanePlanCount: number }
  | { type: 'SYNTHESIS_TRIGGERED' }
  | { type: 'SYNTHESIS_COMPLETED' }
  | { type: 'DIRECT_PLAN_CREATED' }
  | { type: 'RESET_TO_EXPLORING' }

export const SYNTHESIS_THRESHOLD = 3

export function sessionTransition(
  current: SessionStatus,
  event: SessionEvent,
): SessionStatus | null {
  switch (current) {
    case 'exploring':
      if (event.type === 'LANE_PLAN_CREATED' && event.lanePlanCount >= 1) {
        return event.lanePlanCount >= SYNTHESIS_THRESHOLD ? 'synthesis_ready' : 'lane_planning'
      }
      if (event.type === 'DIRECT_PLAN_CREATED') return 'synthesized'
      return null

    case 'lane_planning':
      if (event.type === 'LANE_PLAN_CREATED' && event.lanePlanCount >= SYNTHESIS_THRESHOLD) {
        return 'synthesis_ready'
      }
      if (event.type === 'DIRECT_PLAN_CREATED') return 'synthesized'
      if (event.type === 'LANE_PLAN_DELETED' && event.lanePlanCount === 0) {
        return 'exploring'
      }
      if (event.type === 'RESET_TO_EXPLORING') return 'exploring'
      return null

    case 'synthesis_ready':
      if (event.type === 'SYNTHESIS_TRIGGERED') return 'synthesized'
      if (event.type === 'LANE_PLAN_DELETED' && event.lanePlanCount < SYNTHESIS_THRESHOLD) {
        return event.lanePlanCount === 0 ? 'exploring' : 'lane_planning'
      }
      if (event.type === 'RESET_TO_EXPLORING') return 'exploring'
      return null

    case 'synthesized':
      if (event.type === 'RESET_TO_EXPLORING') return 'exploring'
      if (event.type === 'LANE_PLAN_CREATED') return 'synthesis_ready'
      if (event.type === 'LANE_PLAN_DELETED' && event.lanePlanCount < SYNTHESIS_THRESHOLD) {
        return event.lanePlanCount === 0 ? 'exploring' : 'lane_planning'
      }
      return null
  }
}
