import type { JobFSMState } from '../types/job'

export type JobEvent =
  | { type: 'START' }
  | { type: 'SUCCEED' }
  | { type: 'FAIL'; canRetry: boolean }
  | { type: 'RETRY' }

export function jobTransition(current: JobFSMState, event: JobEvent): JobFSMState | null {
  switch (current) {
    case 'queued':
      if (event.type === 'START') return 'running'
      return null

    case 'running':
      if (event.type === 'SUCCEED') return 'succeeded'
      if (event.type === 'FAIL') return event.canRetry ? 'retrying' : 'failed'
      return null

    case 'retrying':
      if (event.type === 'RETRY') return 'running'
      return null

    case 'succeeded':
      return null

    case 'failed':
      return null
  }
}
