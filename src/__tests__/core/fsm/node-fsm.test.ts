import { describe, it, expect } from 'vitest'
import { nodeTransition, canPromote, canBranch } from '../../../core/fsm/node-fsm'
import type { NodeFSMState } from '../../../core/types/node'

describe('nodeTransition', () => {
  describe('idle state', () => {
    const state: NodeFSMState = 'idle'

    it('transitions to generating on generate request', () => {
      expect(nodeTransition(state, { type: 'GENERATE_REQUESTED' })).toBe('generating')
    })

    it('returns null for irrelevant events', () => {
      expect(nodeTransition(state, { type: 'GENERATION_SUCCEEDED' })).toBeNull()
      expect(nodeTransition(state, { type: 'GENERATION_FAILED' })).toBeNull()
      expect(nodeTransition(state, { type: 'RETRY_REQUESTED' })).toBeNull()
      expect(nodeTransition(state, { type: 'UPSTREAM_CHANGED' })).toBeNull()
      expect(nodeTransition(state, { type: 'REGENERATE_REQUESTED' })).toBeNull()
    })
  })

  describe('generating state', () => {
    const state: NodeFSMState = 'generating'

    it('transitions to resolved on success', () => {
      expect(nodeTransition(state, { type: 'GENERATION_SUCCEEDED' })).toBe('resolved')
    })

    it('transitions to failed on failure', () => {
      expect(nodeTransition(state, { type: 'GENERATION_FAILED' })).toBe('failed')
    })

    it('returns null for other events', () => {
      expect(nodeTransition(state, { type: 'GENERATE_REQUESTED' })).toBeNull()
      expect(nodeTransition(state, { type: 'RETRY_REQUESTED' })).toBeNull()
      expect(nodeTransition(state, { type: 'UPSTREAM_CHANGED' })).toBeNull()
      expect(nodeTransition(state, { type: 'REGENERATE_REQUESTED' })).toBeNull()
    })
  })

  describe('resolved state', () => {
    const state: NodeFSMState = 'resolved'

    it('transitions to stale on upstream change', () => {
      expect(nodeTransition(state, { type: 'UPSTREAM_CHANGED' })).toBe('stale')
    })

    it('transitions to generating on regenerate request', () => {
      expect(nodeTransition(state, { type: 'REGENERATE_REQUESTED' })).toBe('generating')
    })

    it('returns null for irrelevant events', () => {
      expect(nodeTransition(state, { type: 'GENERATE_REQUESTED' })).toBeNull()
      expect(nodeTransition(state, { type: 'GENERATION_SUCCEEDED' })).toBeNull()
      expect(nodeTransition(state, { type: 'RETRY_REQUESTED' })).toBeNull()
    })
  })

  describe('failed state', () => {
    const state: NodeFSMState = 'failed'

    it('transitions to generating on retry', () => {
      expect(nodeTransition(state, { type: 'RETRY_REQUESTED' })).toBe('generating')
    })

    it('returns null for other events', () => {
      expect(nodeTransition(state, { type: 'GENERATE_REQUESTED' })).toBeNull()
      expect(nodeTransition(state, { type: 'GENERATION_SUCCEEDED' })).toBeNull()
      expect(nodeTransition(state, { type: 'UPSTREAM_CHANGED' })).toBeNull()
    })
  })

  describe('stale state', () => {
    const state: NodeFSMState = 'stale'

    it('transitions to generating on regenerate request', () => {
      expect(nodeTransition(state, { type: 'REGENERATE_REQUESTED' })).toBe('generating')
    })

    it('transitions to generating on generate request', () => {
      expect(nodeTransition(state, { type: 'GENERATE_REQUESTED' })).toBe('generating')
    })

    it('returns null for irrelevant events', () => {
      expect(nodeTransition(state, { type: 'GENERATION_SUCCEEDED' })).toBeNull()
      expect(nodeTransition(state, { type: 'RETRY_REQUESTED' })).toBeNull()
    })
  })
})

describe('canPromote', () => {
  it('returns true only for resolved state', () => {
    expect(canPromote('resolved')).toBe(true)
    expect(canPromote('idle')).toBe(false)
    expect(canPromote('generating')).toBe(false)
    expect(canPromote('failed')).toBe(false)
    expect(canPromote('stale')).toBe(false)
  })
})

describe('canBranch', () => {
  it('returns true for resolved and idle', () => {
    expect(canBranch('resolved')).toBe(true)
    expect(canBranch('idle')).toBe(true)
  })

  it('returns false for other states', () => {
    expect(canBranch('generating')).toBe(false)
    expect(canBranch('failed')).toBe(false)
    expect(canBranch('stale')).toBe(false)
  })
})
