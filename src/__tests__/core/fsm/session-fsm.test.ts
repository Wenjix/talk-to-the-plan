import { describe, it, expect } from 'vitest'
import { sessionTransition } from '../../../core/fsm/session-fsm'
import type { SessionStatus } from '../../../core/types/session'

describe('sessionTransition', () => {
  describe('exploring state', () => {
    const state: SessionStatus = 'exploring'

    it('transitions to lane_planning on first plan created', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 1 })).toBe(
        'lane_planning',
      )
    })

    it('transitions to lane_planning when count is 2', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 2 })).toBe(
        'lane_planning',
      )
    })

    it('transitions directly to synthesis_ready when count >= 3', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 3 })).toBe(
        'synthesis_ready',
      )
    })

    it('returns null for irrelevant events', () => {
      expect(sessionTransition(state, { type: 'SYNTHESIS_TRIGGERED' })).toBeNull()
      expect(sessionTransition(state, { type: 'SYNTHESIS_COMPLETED' })).toBeNull()
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 0 })).toBeNull()
    })
  })

  describe('lane_planning state', () => {
    const state: SessionStatus = 'lane_planning'

    it('transitions to synthesis_ready when count reaches threshold', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 3 })).toBe(
        'synthesis_ready',
      )
    })

    it('transitions to exploring when all plans deleted', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 0 })).toBe(
        'exploring',
      )
    })

    it('returns null when deleting but plans remain', () => {
      expect(
        sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 1 }),
      ).toBeNull()
    })

    it('transitions to exploring on reset', () => {
      expect(sessionTransition(state, { type: 'RESET_TO_EXPLORING' })).toBe('exploring')
    })

    it('returns null for below-threshold plan creation', () => {
      expect(
        sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 2 }),
      ).toBeNull()
    })
  })

  describe('synthesis_ready state', () => {
    const state: SessionStatus = 'synthesis_ready'

    it('transitions to synthesized on trigger', () => {
      expect(sessionTransition(state, { type: 'SYNTHESIS_TRIGGERED' })).toBe('synthesized')
    })

    it('transitions to lane_planning when count drops below threshold', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 2 })).toBe(
        'lane_planning',
      )
    })

    it('transitions to exploring when all plans deleted', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 0 })).toBe(
        'exploring',
      )
    })

    it('transitions to exploring on reset', () => {
      expect(sessionTransition(state, { type: 'RESET_TO_EXPLORING' })).toBe('exploring')
    })

    it('returns null for irrelevant events', () => {
      expect(sessionTransition(state, { type: 'SYNTHESIS_COMPLETED' })).toBeNull()
    })
  })

  describe('synthesized state', () => {
    const state: SessionStatus = 'synthesized'

    it('transitions to exploring on reset', () => {
      expect(sessionTransition(state, { type: 'RESET_TO_EXPLORING' })).toBe('exploring')
    })

    it('transitions to synthesis_ready when new plan created (re-synthesis)', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_CREATED', lanePlanCount: 4 })).toBe(
        'synthesis_ready',
      )
    })

    it('transitions to lane_planning when count drops below threshold', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 1 })).toBe(
        'lane_planning',
      )
    })

    it('transitions to exploring when all plans deleted', () => {
      expect(sessionTransition(state, { type: 'LANE_PLAN_DELETED', lanePlanCount: 0 })).toBe(
        'exploring',
      )
    })

    it('returns null for irrelevant events', () => {
      expect(sessionTransition(state, { type: 'SYNTHESIS_TRIGGERED' })).toBeNull()
    })
  })
})
