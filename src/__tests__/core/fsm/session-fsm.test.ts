import { describe, it, expect } from 'vitest'
import { sessionTransition } from '../../../core/fsm/session-fsm'
import type { SessionStatus } from '../../../core/types/session'

describe('sessionTransition', () => {
  describe('exploring state', () => {
    const state: SessionStatus = 'exploring'

    it('transitions to synthesized on direct plan created', () => {
      expect(sessionTransition(state, { type: 'DIRECT_PLAN_CREATED' })).toBe('synthesized')
    })

    it('returns null for reset (already exploring)', () => {
      expect(sessionTransition(state, { type: 'RESET_TO_EXPLORING' })).toBeNull()
    })
  })

  describe('synthesized state', () => {
    const state: SessionStatus = 'synthesized'

    it('transitions to exploring on reset', () => {
      expect(sessionTransition(state, { type: 'RESET_TO_EXPLORING' })).toBe('exploring')
    })

    it('returns null for direct plan created (already synthesized)', () => {
      expect(sessionTransition(state, { type: 'DIRECT_PLAN_CREATED' })).toBeNull()
    })
  })
})
