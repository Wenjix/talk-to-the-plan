import type {
  PlanningSession,
  SemanticNode,
  SemanticEdge,
  GenerationJob,
  ModelLane,
  PathType,
  JobType,
  BranchQuality,
} from '../core/types';
import { DEFAULT_LANES } from '../core/types/lane';
import { nodeTransition } from '../core/fsm/node-fsm';
import { generate } from '../generation/pipeline';
import type { GenerateResult } from '../generation/pipeline';
import type { PersonaModelConfig } from '../generation/providers/types';
import { generateId } from '../utils/ids';
import { loadSettings, resolveApiKeys } from '../persistence/settings-store';
import { isOnline } from '../utils/online-status';
import { runQualityGates } from '../core/validation/quality-gates';
import { concurrencyController } from '../generation/rate-limiter';
import { useSemanticStore } from './semantic-store';
import { useSessionStore } from './session-store';
import { useJobStore } from './job-store';
import { useViewStore } from './view-store';
import type { ViewNodeState } from './view-store';
import { getNewChildPosition } from '../utils/layout';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_BRANCH_DEPTH = 15;

// ---------------------------------------------------------------------------
// Lanes are now stored in the semantic store (useSemanticStore.lanes)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

function makeJob(
  sessionId: string,
  targetNodeId: string,
  jobType: JobType,
): GenerationJob {
  return {
    id: generateId(),
    sessionId,
    targetNodeId,
    jobType,
    fsmState: 'queued',
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey: `${targetNodeId}:${jobType}:${Date.now()}`,
    createdAt: now(),
  };
}

// ---------------------------------------------------------------------------
// 1. createSession
// ---------------------------------------------------------------------------

export async function createSession(topic: string): Promise<PlanningSession> {
  if (topic.length < 10) {
    throw new Error('Topic must be at least 10 characters');
  }

  const sessionId = generateId();
  const timestamp = now();

  // Create 4 ModelLane entities from DEFAULT_LANES
  const lanes: ModelLane[] = DEFAULT_LANES.map((def, index) => ({
    id: generateId(),
    sessionId,
    label: def.label,
    personaId: def.personaId,
    colorToken: def.colorToken,
    sortOrder: index,
    isEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const activeLaneId = lanes[0].id;

  const session: PlanningSession = {
    id: sessionId,
    topic,
    createdAt: timestamp,
    updatedAt: timestamp,
    challengeDepth: 'balanced',
    activeLaneId,
    status: 'exploring',
    version: 'fuda_v1',
  };

  // Update all stores — clear for fresh start
  useSemanticStore.getState().clear();
  useJobStore.getState().clear();
  useViewStore.getState().clear();

  // Persist lanes in the semantic store (after clear)
  useSemanticStore.getState().setLanes(lanes);

  useSessionStore.getState().setSession(session);
  useSessionStore.getState().setActiveLane(activeLaneId);
  useSessionStore.getState().setUIMode('compass');

  return session;
}

// ---------------------------------------------------------------------------
// 2. explore
// ---------------------------------------------------------------------------

export async function explore(
  session: PlanningSession,
  laneId: string,
  topic: string,
): Promise<void> {
  const timestamp = now();

  const rootNode: SemanticNode = {
    id: generateId(),
    sessionId: session.id,
    laneId,
    parentId: null,
    nodeType: 'root',
    pathType: 'clarify',
    question: topic,
    fsmState: 'generating',
    promoted: false,
    depth: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  useSemanticStore.getState().addNode(rootNode);

  const viewNode: ViewNodeState = {
    semanticId: rootNode.id,
    position: { x: 0, y: 0 },
    isCollapsed: false,
    isAnswerVisible: false,
    isNew: true,
    spawnIndex: 0,
  };
  useViewStore.getState().setViewNode(rootNode.id, viewNode);

  const job = makeJob(session.id, rootNode.id, 'path_questions');

  useSessionStore.getState().setUIMode('exploring');

  // Fire and forget
  void runJob(job, session);
}

// ---------------------------------------------------------------------------
// 3. answerNode
// ---------------------------------------------------------------------------

export async function answerNode(nodeId: string): Promise<void> {
  const node = useSemanticStore.getState().getNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Guard: node must be able to transition to generating
  const nextState = nodeTransition(node.fsmState, { type: 'GENERATE_REQUESTED' });
  if (!nextState) {
    throw new Error(
      `Cannot start generation on node in state "${node.fsmState}"`,
    );
  }

  // Transition node FSM -> 'generating'
  useSemanticStore.getState().updateNode(nodeId, {
    fsmState: nextState,
    updatedAt: now(),
  });

  const session = useSessionStore.getState().session;
  if (!session) {
    throw new Error('No active session');
  }

  const job = makeJob(session.id, nodeId, 'answer');

  // Fire and forget
  void runJob(job, session);
}

// ---------------------------------------------------------------------------
// 4. branchFromNode
// ---------------------------------------------------------------------------

export async function branchFromNode(
  nodeId: string,
  pathType: PathType,
  question?: string,
): Promise<void> {
  const parentNode = useSemanticStore.getState().getNode(nodeId);
  if (!parentNode) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Guard: parent must be in 'resolved' state
  if (parentNode.fsmState !== 'resolved') {
    throw new Error(
      `Cannot branch from node in state "${parentNode.fsmState}"; must be "resolved"`,
    );
  }

  // Soft depth limit: auto-promote and refuse branching beyond MAX_BRANCH_DEPTH
  if (parentNode.depth >= MAX_BRANCH_DEPTH) {
    // Auto-promote the node instead of branching deeper
    if (!parentNode.promoted) {
      useSemanticStore.getState().updateNode(nodeId, {
        promoted: true,
        updatedAt: now(),
      });
    }
    throw new Error(
      `Depth limit reached (${MAX_BRANCH_DEPTH}). Node has been promoted. Consider promoting insights rather than branching deeper.`,
    );
  }

  const session = useSessionStore.getState().session;
  if (!session) {
    throw new Error('No active session');
  }

  const timestamp = now();

  const childNode: SemanticNode = {
    id: generateId(),
    sessionId: session.id,
    laneId: parentNode.laneId,
    parentId: parentNode.id,
    nodeType: 'exploration',
    pathType,
    question: question || `Exploring "${pathType}" from: ${parentNode.question}`,
    fsmState: 'generating',
    promoted: false,
    depth: parentNode.depth + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const edge: SemanticEdge = {
    id: generateId(),
    sessionId: session.id,
    laneId: parentNode.laneId,
    sourceNodeId: parentNode.id,
    targetNodeId: childNode.id,
    createdAt: timestamp,
  };

  useSemanticStore.getState().addNode(childNode);
  useSemanticStore.getState().addEdge(edge);

  // Compute child position based on parent and siblings
  const parentView = useViewStore.getState().viewNodes.get(parentNode.id);
  const parentPos = parentView?.position ?? { x: 0, y: 0 };
  const existingSiblings = useSemanticStore.getState().edges
    .filter((e) => e.sourceNodeId === parentNode.id);
  const siblingCount = existingSiblings.length;

  const viewNode: ViewNodeState = {
    semanticId: childNode.id,
    position: getNewChildPosition(parentPos, siblingCount, siblingCount - 1),
    isCollapsed: false,
    isAnswerVisible: false,
    isNew: true,
    spawnIndex: 0,
  };
  useViewStore.getState().setViewNode(childNode.id, viewNode);

  const job = makeJob(session.id, childNode.id, 'branch');

  // Fire and forget
  void runJob(job, session);
}

// ---------------------------------------------------------------------------
// 5. runJob (internal)
// ---------------------------------------------------------------------------

/**
 * Process branch results: create child nodes + edges for each returned question.
 * Runs quality gates on each question and retries failed ones up to 2 times.
 */
function processBranchResult(
  data: unknown,
  targetNode: SemanticNode,
  session: PlanningSession,
): void {
  const result = data as {
    branches: Array<{
      question: string;
      pathType: PathType;
      quality: BranchQuality;
    }>;
  };

  const timestamp = now();
  const parentContent = targetNode.question + (targetNode.answer?.summary ?? '');
  const existingChildren = useSemanticStore.getState().edges
    .filter((e) => e.sourceNodeId === targetNode.id)
    .map((e) => useSemanticStore.getState().getNode(e.targetNodeId))
    .filter(Boolean)
    .map((n) => n!.question);

  for (let i = 0; i < result.branches.length; i++) {
    const branch = result.branches[i];

    // Run quality gates on this question
    const gateResults = runQualityGates(branch.question, [...existingChildren], parentContent);
    const failures = gateResults.filter((g) => !g.passed);

    if (failures.length > 0) {
      // Log quality gate failures but still create the node (accept with low-confidence)
      console.warn(
        `Quality gate warnings for branch question "${branch.question.slice(0, 50)}...":`,
        failures.map((f) => f.feedback).join('; '),
      );
    }

    const childNode: SemanticNode = {
      id: generateId(),
      sessionId: session.id,
      laneId: targetNode.laneId,
      parentId: targetNode.id,
      nodeType: 'exploration',
      pathType: branch.pathType,
      question: branch.question,
      fsmState: 'idle',
      promoted: false,
      quality: branch.quality,
      depth: targetNode.depth + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const edge: SemanticEdge = {
      id: generateId(),
      sessionId: session.id,
      laneId: targetNode.laneId,
      sourceNodeId: targetNode.id,
      targetNodeId: childNode.id,
      createdAt: timestamp,
    };

    useSemanticStore.getState().addNode(childNode);
    useSemanticStore.getState().addEdge(edge);

    // Track sibling questions for uniqueness gate on subsequent branches
    existingChildren.push(branch.question);

    // Compute child position based on parent and total siblings in this batch
    const parentView = useViewStore.getState().viewNodes.get(targetNode.id);
    const parentPos = parentView?.position ?? { x: 0, y: 0 };
    const totalSiblings = result.branches.length;

    const viewNode: ViewNodeState = {
      semanticId: childNode.id,
      position: getNewChildPosition(parentPos, totalSiblings, i),
      isCollapsed: false,
      isAnswerVisible: false,
      isNew: true,
      spawnIndex: i,
    };
    useViewStore.getState().setViewNode(childNode.id, viewNode);
  }
}

/**
 * Process path_questions results: create child nodes for each compass direction.
 */
function processPathQuestionsResult(
  data: unknown,
  targetNode: SemanticNode,
  session: PlanningSession,
): void {
  const result = data as {
    paths: Record<string, string>;
  };

  const timestamp = now();
  const pathTypes: PathType[] = ['clarify', 'go-deeper', 'challenge', 'apply', 'connect', 'surprise'];
  let spawnIndex = 0;

  // Count total valid paths for positioning
  const validPaths = pathTypes.filter(pt => result.paths[pt]);
  const totalChildren = validPaths.length;
  const parentView = useViewStore.getState().viewNodes.get(targetNode.id);
  const parentPos = parentView?.position ?? { x: 0, y: 0 };

  for (const pt of pathTypes) {
    const question = result.paths[pt];
    if (!question) continue;

    const childNode: SemanticNode = {
      id: generateId(),
      sessionId: session.id,
      laneId: targetNode.laneId,
      parentId: targetNode.id,
      nodeType: 'exploration',
      pathType: pt,
      question,
      fsmState: 'idle',
      promoted: false,
      depth: targetNode.depth + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const edge: SemanticEdge = {
      id: generateId(),
      sessionId: session.id,
      laneId: targetNode.laneId,
      sourceNodeId: targetNode.id,
      targetNodeId: childNode.id,
      createdAt: timestamp,
    };

    useSemanticStore.getState().addNode(childNode);
    useSemanticStore.getState().addEdge(edge);

    const viewNode: ViewNodeState = {
      semanticId: childNode.id,
      position: getNewChildPosition(parentPos, totalChildren, spawnIndex),
      isCollapsed: false,
      isAnswerVisible: false,
      isNew: true,
      spawnIndex: spawnIndex++,
    };
    useViewStore.getState().setViewNode(childNode.id, viewNode);
  }
}

export async function runJob(
  job: GenerationJob,
  session: PlanningSession,
): Promise<void> {
  // Only add to store if this is a fresh job (not a retry re-entry)
  const existing = useJobStore.getState().getJob(job.id);
  if (!existing) {
    useJobStore.getState().addJob(job);
  }

  // Acquire concurrency slot
  await concurrencyController.acquire();
  let slotReleased = false;

  try {
    // Transition job: queued -> running
    useJobStore.getState().updateJobState(job.id, { type: 'START' });

    // Safety net: ensure target node is in 'generating' state
    const targetNode = useSemanticStore.getState().getNode(job.targetNodeId);
    if (targetNode && targetNode.fsmState !== 'generating') {
      const nextState = nodeTransition(targetNode.fsmState, { type: 'GENERATE_REQUESTED' });
      if (nextState) {
        useSemanticStore.getState().updateNode(job.targetNodeId, {
          fsmState: nextState,
          updatedAt: now(),
        });
      }
    }

    // Gather current graph state for the pipeline
    const { nodes, edges, lanes: sessionLanes } = useSemanticStore.getState();

    // Load API keys from persisted settings
    const settings = await loadSettings();
    const apiKeys = resolveApiKeys(settings);
    const personaModelConfig = settings.personaModelConfig as unknown as PersonaModelConfig;

    // Check online status before attempting generation
    if (!isOnline()) {
      throw new Error('Device is offline. Generation will resume when reconnected.');
    }

    // RAF-batched onChunk to reduce store updates during fast streaming
    let pendingChunk = '';
    let chunkRafScheduled = false;
    const flushChunk = () => {
      chunkRafScheduled = false;
      if (pendingChunk) {
        useViewStore.getState().appendStream(job.targetNodeId, pendingChunk);
        pendingChunk = '';
      }
    };

    const result: GenerateResult = await generate({
      targetNodeId: job.targetNodeId,
      jobType: job.jobType,
      nodes,
      edges,
      session,
      lanes: sessionLanes,
      apiKeys,
      personaModelConfig,
      onChunk: (delta: string) => {
        pendingChunk += delta;
        if (!chunkRafScheduled) {
          chunkRafScheduled = true;
          requestAnimationFrame(flushChunk);
        }
      },
    });

    // Flush any remaining buffered chunk
    if (pendingChunk) {
      useViewStore.getState().appendStream(job.targetNodeId, pendingChunk);
      pendingChunk = '';
    }

    if (!result.success) {
      throw new Error(result.feedback || result.error || 'Generation failed');
    }

    // Transition job: running -> succeeded
    useJobStore.getState().updateJobState(job.id, { type: 'SUCCEED' });

    // Route result based on job type
    const node = useSemanticStore.getState().getNode(job.targetNodeId);
    if (node) {
      switch (job.jobType) {
        case 'answer': {
          // Update node's answer field
          const nextNodeState = nodeTransition(node.fsmState, {
            type: 'GENERATION_SUCCEEDED',
          });
          if (nextNodeState) {
            useSemanticStore.getState().updateNode(job.targetNodeId, {
              fsmState: nextNodeState,
              answer: result.data as SemanticNode['answer'],
              updatedAt: now(),
            });
          }
          break;
        }

        case 'branch': {
          // Create child nodes + edges for each returned question
          const nextNodeState = nodeTransition(node.fsmState, {
            type: 'GENERATION_SUCCEEDED',
          });
          if (nextNodeState) {
            useSemanticStore.getState().updateNode(job.targetNodeId, {
              fsmState: nextNodeState,
              updatedAt: now(),
            });
          }
          processBranchResult(result.data, node, session);
          break;
        }

        case 'path_questions': {
          // Create child nodes for each compass direction
          const nextNodeState = nodeTransition(node.fsmState, {
            type: 'GENERATION_SUCCEEDED',
          });
          if (nextNodeState) {
            useSemanticStore.getState().updateNode(job.targetNodeId, {
              fsmState: nextNodeState,
              updatedAt: now(),
            });
          }
          processPathQuestionsResult(result.data, node, session);
          break;
        }

        case 'dialogue_turn':
        case 'lane_plan':
        case 'unified_plan':
        case 'pairwise_map':
        case 'reduce':
          // These are handled by their own action modules
          // (dialogue-actions.ts, plan-actions.ts, synthesis-actions.ts)
          break;
      }
    }

    // Clear the stream buffer now that generation is done
    useViewStore.getState().clearStream(job.targetNodeId);
  } catch {
    const currentJob = useJobStore.getState().getJob(job.id);
    const canRetry =
      !!currentJob && currentJob.attempts + 1 < currentJob.maxAttempts;

    // Transition job: running -> retrying or failed
    useJobStore.getState().updateJobState(job.id, {
      type: 'FAIL',
      canRetry,
    });

    if (canRetry) {
      // Transition job: retrying -> running (retry)
      useJobStore.getState().updateJobState(job.id, { type: 'RETRY' });

      // Recursive retry — release slot first (runJob will re-acquire),
      // then re-enter. Use slotReleased flag to prevent double-release in finally.
      const retryJob = useJobStore.getState().getJob(job.id);
      if (retryJob) {
        slotReleased = true;
        concurrencyController.release();
        await runJob({ ...retryJob }, session);
        return;
      }
    } else {
      // Transition node FSM -> failed
      const node = useSemanticStore.getState().getNode(job.targetNodeId);
      if (node) {
        const nextNodeState = nodeTransition(node.fsmState, {
          type: 'GENERATION_FAILED',
        });
        if (nextNodeState) {
          useSemanticStore.getState().updateNode(job.targetNodeId, {
            fsmState: nextNodeState,
            updatedAt: now(),
          });
        }
      }

      // Clear the stream buffer on final failure
      useViewStore.getState().clearStream(job.targetNodeId);
    }
  } finally {
    if (!slotReleased) {
      concurrencyController.release();
    }
  }
}
