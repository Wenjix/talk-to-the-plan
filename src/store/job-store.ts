import { create } from 'zustand';
import type { GenerationJob } from '../core/types';
import { jobTransition } from '../core/fsm/job-fsm';
import type { JobEvent } from '../core/fsm/job-fsm';

interface JobState {
  jobs: GenerationJob[];

  addJob: (job: GenerationJob) => void;
  updateJobState: (jobId: string, event: JobEvent) => void;
  getJob: (id: string) => GenerationJob | undefined;
  getJobsByNode: (nodeId: string) => GenerationJob[];
  clear: () => void;
}

export const useJobStore = create<JobState>()((set, get) => ({
  jobs: [],

  addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
  updateJobState: (jobId, event) => set((s) => ({
    jobs: s.jobs.map((j) => {
      if (j.id !== jobId) return j;
      const newState = jobTransition(j.fsmState, event);
      if (!newState) return j;
      return {
        ...j,
        fsmState: newState,
        attempts: event.type === 'RETRY' ? j.attempts + 1 : j.attempts,
        error: event.type === 'FAIL' ? undefined : j.error,
        resolvedAt: newState === 'succeeded' || newState === 'failed'
          ? new Date().toISOString()
          : j.resolvedAt,
      };
    }),
  })),
  getJob: (id) => get().jobs.find((j) => j.id === id),
  getJobsByNode: (nodeId) => get().jobs.filter((j) => j.targetNodeId === nodeId),
  clear: () => set({ jobs: [] }),
}));
