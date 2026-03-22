import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SemanticNode, SemanticEdge, DialogueTurn } from '../../core/types';
import { getDescendantIds } from '../../store/view-store';
import { useViewStore } from '../../store/view-store';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { projectToReactFlow } from '../../store/view-projection';
import { MAX_BRANCH_DEPTH } from '../../store/actions';
import { MAX_DIALOGUE_TURNS, addUserTurn } from '../../store/dialogue-actions';

// Mock loadSettings to avoid indexedDB dependency (concludeDialogue uses it)
vi.mock('../../persistence/settings-store', () => ({
  loadSettings: vi.fn().mockResolvedValue({
    mistralApiKey: '',
    geminiApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
    challengeDepth: 'balanced',
    autoSaveEnabled: true,
    animationsEnabled: true,
    theme: 'light',
  }),
  resolveApiKeys: vi.fn().mockReturnValue({ mistral: '', gemini: '', anthropic: '', openai: '' }),
}));

// Mock providers to avoid real API calls from concludeDialogue
vi.mock('../../generation/providers', () => ({
  getProviderForPersona: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue('{"summary":"test","bullets":["b"]}'),
    generateStream: vi.fn().mockResolvedValue('{"summary":"test","bullets":["b"]}'),
  }),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const LANE_ID = 'lane-1';
const SESSION_ID = 'session-1';

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: SESSION_ID,
    laneId: LANE_ID,
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'Test question',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEdge(
  sourceNodeId: string,
  targetNodeId: string,
  overrides?: Partial<SemanticEdge>,
): SemanticEdge {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sessionId: SESSION_ID,
    laneId: LANE_ID,
    sourceNodeId,
    targetNodeId,
    createdAt: now,
    ...overrides,
  };
}

function makeTurn(nodeId: string, index: number): DialogueTurn {
  return {
    id: crypto.randomUUID(),
    sessionId: SESSION_ID,
    nodeId,
    turnIndex: index,
    speaker: 'user',
    dialecticMode: 'socratic',
    content: `Turn ${index} content`,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// getDescendantIds
// ---------------------------------------------------------------------------

describe('getDescendantIds', () => {
  it('returns all descendants via BFS', () => {
    // Tree: A -> B -> D, A -> C
    const edges = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
      makeEdge('B', 'D'),
    ];

    const result = getDescendantIds('A', edges);

    expect(result).toHaveLength(3);
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toContain('D');
  });

  it('returns empty array for leaf nodes', () => {
    const edges = [
      makeEdge('A', 'B'),
      makeEdge('A', 'C'),
    ];

    const result = getDescendantIds('B', edges);

    expect(result).toEqual([]);
  });

  it('returns empty array when node has no edges', () => {
    const result = getDescendantIds('A', []);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Collapse/expand in projection
// ---------------------------------------------------------------------------

describe('collapse/expand in projection', () => {
  beforeEach(() => {
    useViewStore.getState().clear();
    useSemanticStore.getState().clear();
  });

  it('collapse hides descendants from projected nodes', () => {
    const root = makeNode({ id: 'root' });
    const child = makeNode({ id: 'child', parentId: 'root' });
    const grandchild = makeNode({ id: 'grandchild', parentId: 'child' });

    const edges = [
      makeEdge('root', 'child'),
      makeEdge('child', 'grandchild'),
    ];

    const viewStates = new Map([
      ['root', { semanticId: 'root', position: { x: 0, y: 0 }, isCollapsed: true, isAnswerVisible: false, isNew: false, spawnIndex: 0 }],
      ['child', { semanticId: 'child', position: { x: 0, y: 100 }, isCollapsed: false, isAnswerVisible: false, isNew: false, spawnIndex: 0 }],
      ['grandchild', { semanticId: 'grandchild', position: { x: 0, y: 200 }, isCollapsed: false, isAnswerVisible: false, isNew: false, spawnIndex: 0 }],
    ]);

    const result = projectToReactFlow(
      [root, child, grandchild],
      edges,
      viewStates,
      LANE_ID,
    );

    // Only root should be visible — child and grandchild are hidden
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('root');
    // Edges should also be filtered
    expect(result.edges).toHaveLength(0);
  });

  it('expand shows descendants again', () => {
    const root = makeNode({ id: 'root' });
    const child = makeNode({ id: 'child', parentId: 'root' });

    const edges = [makeEdge('root', 'child')];

    const viewStates = new Map([
      ['root', { semanticId: 'root', position: { x: 0, y: 0 }, isCollapsed: false, isAnswerVisible: false, isNew: false, spawnIndex: 0 }],
      ['child', { semanticId: 'child', position: { x: 0, y: 100 }, isCollapsed: false, isAnswerVisible: false, isNew: false, spawnIndex: 0 }],
    ]);

    const result = projectToReactFlow(
      [root, child],
      edges,
      viewStates,
      LANE_ID,
    );

    // Both nodes visible when not collapsed
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Soft depth limit
// ---------------------------------------------------------------------------

describe('soft depth limit', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
    useViewStore.getState().clear();
  });

  it('MAX_BRANCH_DEPTH constant is exported and equals 15', () => {
    expect(MAX_BRANCH_DEPTH).toBe(15);
  });

  it('branchFromNode throws at depth >= MAX_BRANCH_DEPTH', async () => {
    // Set up a session
    useSessionStore.getState().setSession({
      id: SESSION_ID,
      topic: 'Test topic for branching depth limit check',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      challengeDepth: 'balanced',
      activeLaneId: LANE_ID,
      status: 'exploring',
      version: 'fuda_v1',
    });

    // Create a node at MAX_BRANCH_DEPTH
    const deepNode = makeNode({
      id: 'deep-node',
      fsmState: 'resolved',
      depth: MAX_BRANCH_DEPTH,
      answer: { summary: 'test', bullets: ['bullet'] },
    });
    useSemanticStore.getState().addNode(deepNode);

    // Dynamically import to avoid module-level side effects
    const { branchFromNode } = await import('../../store/actions');

    await expect(branchFromNode('deep-node', 'go-deeper')).rejects.toThrow(
      /Depth limit reached/,
    );

    // Verify node was auto-promoted
    const updated = useSemanticStore.getState().getNode('deep-node');
    expect(updated?.promoted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dialogue turn cap
// ---------------------------------------------------------------------------

describe('dialogue turn cap', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear();
    useSessionStore.getState().clear();
  });

  it('MAX_DIALOGUE_TURNS constant is exported and equals 20', () => {
    expect(MAX_DIALOGUE_TURNS).toBe(20);
  });

  it('addUserTurn throws at turn cap and triggers auto-conclude', () => {
    const nodeId = 'test-node';

    useSessionStore.getState().setSession({
      id: SESSION_ID,
      topic: 'Test topic for turn cap validation test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      challengeDepth: 'balanced',
      activeLaneId: LANE_ID,
      status: 'exploring',
      version: 'fuda_v1',
    });

    // Add a node with an answer (needed for concludeDialogue)
    useSemanticStore.getState().addNode(
      makeNode({
        id: nodeId,
        fsmState: 'resolved',
        answer: { summary: 'test', bullets: ['bullet'] },
      }),
    );

    // Pre-fill MAX_DIALOGUE_TURNS turns
    for (let i = 0; i < MAX_DIALOGUE_TURNS; i++) {
      useSemanticStore.getState().addDialogueTurn(makeTurn(nodeId, i));
    }

    // The next addUserTurn should throw
    expect(() => addUserTurn(nodeId, 'One more', 'socratic')).toThrow(
      /Dialogue turn cap reached/,
    );
  });
});
