import { describe, it, expect } from 'vitest'
import { jobTransition } from '../../../core/fsm/job-fsm'
import type { JobFSMState } from '../../../core/types/job'

describe('jobTransition', () => {
  describe('queued state', () => {
    const state: JobFSMState = 'queued'

    it('transitions to running on start', () => {
      expect(jobTransition(state, { type: 'START' })).toBe('running')
    })

    it('returns null for irrelevant events', () => {
      expect(jobTransition(state, { type: 'SUCCEED' })).toBeNull()
      expect(jobTransition(state, { type: 'FAIL', canRetry: true })).toBeNull()
      expect(jobTransition(state, { type: 'RETRY' })).toBeNull()
    })
  })

  describe('running state', () => {
    const state: JobFSMState = 'running'

    it('transitions to succeeded on success', () => {
      expect(jobTransition(state, { type: 'SUCCEED' })).toBe('succeeded')
    })

    it('transitions to retrying on retryable failure', () => {
      expect(jobTransition(state, { type: 'FAIL', canRetry: true })).toBe('retrying')
    })

    it('transitions to failed on non-retryable failure', () => {
      expect(jobTransition(state, { type: 'FAIL', canRetry: false })).toBe('failed')
    })

    it('returns null for other events', () => {
      expect(jobTransition(state, { type: 'START' })).toBeNull()
      expect(jobTransition(state, { type: 'RETRY' })).toBeNull()
    })
  })

  describe('retrying state', () => {
    const state: JobFSMState = 'retrying'

    it('transitions to running on retry', () => {
      expect(jobTransition(state, { type: 'RETRY' })).toBe('running')
    })

    it('returns null for other events', () => {
      expect(jobTransition(state, { type: 'START' })).toBeNull()
      expect(jobTransition(state, { type: 'SUCCEED' })).toBeNull()
      expect(jobTransition(state, { type: 'FAIL', canRetry: true })).toBeNull()
    })
  })

  describe('succeeded state (terminal)', () => {
    const state: JobFSMState = 'succeeded'

    it('returns null for all events', () => {
      expect(jobTransition(state, { type: 'START' })).toBeNull()
      expect(jobTransition(state, { type: 'SUCCEED' })).toBeNull()
      expect(jobTransition(state, { type: 'FAIL', canRetry: true })).toBeNull()
      expect(jobTransition(state, { type: 'RETRY' })).toBeNull()
    })
  })

  describe('failed state (terminal)', () => {
    const state: JobFSMState = 'failed'

    it('returns null for all events', () => {
      expect(jobTransition(state, { type: 'START' })).toBeNull()
      expect(jobTransition(state, { type: 'SUCCEED' })).toBeNull()
      expect(jobTransition(state, { type: 'FAIL', canRetry: false })).toBeNull()
      expect(jobTransition(state, { type: 'RETRY' })).toBeNull()
    })
  })

  describe('full lifecycle', () => {
    it('queued -> running -> succeeded', () => {
      let state: JobFSMState = 'queued'
      state = jobTransition(state, { type: 'START' })!
      expect(state).toBe('running')
      state = jobTransition(state, { type: 'SUCCEED' })!
      expect(state).toBe('succeeded')
    })

    it('queued -> running -> retrying -> running -> succeeded', () => {
      let state: JobFSMState = 'queued'
      state = jobTransition(state, { type: 'START' })!
      expect(state).toBe('running')
      state = jobTransition(state, { type: 'FAIL', canRetry: true })!
      expect(state).toBe('retrying')
      state = jobTransition(state, { type: 'RETRY' })!
      expect(state).toBe('running')
      state = jobTransition(state, { type: 'SUCCEED' })!
      expect(state).toBe('succeeded')
    })

    it('queued -> running -> failed (dead letter)', () => {
      let state: JobFSMState = 'queued'
      state = jobTransition(state, { type: 'START' })!
      state = jobTransition(state, { type: 'FAIL', canRetry: false })!
      expect(state).toBe('failed')
      expect(jobTransition(state, { type: 'RETRY' })).toBeNull()
    })
  })
})
