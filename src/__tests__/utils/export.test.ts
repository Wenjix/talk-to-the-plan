import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  UnifiedPlan,
  ModelLane,
  PlanningSession,
  SemanticNode,
  SemanticEdge,
  Promotion,
  DialogueTurn,
  StructuredPlan,
  EvidenceRef,
  ConflictResolution,
} from '../../core/types';
import {
  exportUnifiedPlanMarkdown,
  exportSessionJSON,
  importSessionJSON,
  downloadFile,
} from '../../utils/export';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = '2026-01-15T12:00:00.000Z';
const sessionId = crypto.randomUUID();
const laneAId = crypto.randomUUID();
const laneBId = crypto.randomUUID();
const nodeId = crypto.randomUUID();

function makeLane(overrides?: Partial<ModelLane>): ModelLane {
  return {
    id: laneAId,
    sessionId,
    label: 'Expansive',
    personaId: 'expansive',
    colorToken: '#7B4FBF',
    sortOrder: 0,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeLaneB(): ModelLane {
  return makeLane({ id: laneBId, label: 'Analytical', personaId: 'analytical', colorToken: '#4A90D9', sortOrder: 1 });
}

function makeEvidence(overrides?: Partial<EvidenceRef>): EvidenceRef {
  return {
    nodeId,
    laneId: laneAId,
    quote: 'This is key evidence',
    relevance: 'primary',
    ...overrides,
  };
}

function makeSections(): StructuredPlan {
  const section = {
    heading: 'Primary Goal',
    content: ['Achieve market fit', 'Validate hypothesis'],
    evidence: [makeEvidence()],
  };
  return {
    goals: [section],
    assumptions: [{ ...section, heading: 'Key Assumption' }],
    strategy: [{ ...section, heading: 'Core Strategy' }],
    milestones: [{ ...section, heading: 'Milestone One' }],
    risks: [{ ...section, heading: 'Top Risk' }],
    nextActions: [{ ...section, heading: 'Immediate Action' }],
  };
}

function makeConflict(): ConflictResolution {
  return {
    description: 'Speed vs Quality',
    laneAId,
    laneBId,
    resolution: 'Phased approach',
    tradeoff: 'Slower initial launch',
  };
}

function makeUnifiedPlan(overrides?: Partial<UnifiedPlan>): UnifiedPlan {
  return {
    id: crypto.randomUUID(),
    sessionId,
    sourcePlanIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
    title: 'Unified Strategic Plan',
    sections: makeSections(),
    conflictsResolved: [makeConflict()],
    unresolvedQuestions: ['What is the budget?'],
    evidence: [makeEvidence()],
    revision: 1,
    createdAt: now,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<PlanningSession>): PlanningSession {
  return {
    id: sessionId,
    topic: 'A sufficiently long topic for planning',
    createdAt: now,
    updatedAt: now,
    challengeDepth: 'balanced',
    activeLaneId: laneAId,
    status: 'exploring',
    version: 'fuda_v1',
    ...overrides,
  };
}

function makeNode(overrides?: Partial<SemanticNode>): SemanticNode {
  return {
    id: nodeId,
    sessionId,
    laneId: laneAId,
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'What are the trade-offs?',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeEdge(): SemanticEdge {
  return {
    id: crypto.randomUUID(),
    sessionId,
    laneId: laneAId,
    sourceNodeId: nodeId,
    targetNodeId: crypto.randomUUID(),
    createdAt: now,
  };
}

function makePromotion(): Promotion {
  return {
    id: crypto.randomUUID(),
    sessionId,
    laneId: laneAId,
    nodeId,
    reason: 'insightful_reframe',
    createdAt: now,
  };
}

function makeDialogueTurn(): DialogueTurn {
  return {
    id: crypto.randomUUID(),
    sessionId,
    nodeId,
    turnIndex: 0,
    speaker: 'ai',
    dialecticMode: 'socratic',
    content: 'Consider this angle',
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// exportUnifiedPlanMarkdown
// ---------------------------------------------------------------------------

describe('exportUnifiedPlanMarkdown', () => {
  const lanes = [makeLane(), makeLaneB()];
  const plan = makeUnifiedPlan();
  const md = exportUnifiedPlanMarkdown(plan, lanes);

  it('contains the heading "Plan"', () => {
    expect(md).toContain('# Plan');
  });

  it('contains all section headings', () => {
    for (const heading of ['Goals', 'Assumptions', 'Strategy', 'Milestones', 'Risks', 'Next Actions']) {
      expect(md).toContain(`## ${heading}`);
    }
  });

  it('contains evidence quotes', () => {
    expect(md).toContain('"This is key evidence"');
  });

  it('contains conflict resolution descriptions', () => {
    expect(md).toContain('### Speed vs Quality');
    expect(md).toContain('**Resolution:** Phased approach');
  });

  it('contains conflict trade-offs', () => {
    expect(md).toContain('**Trade-off:** Slower initial launch');
  });

  it('contains unresolved questions', () => {
    expect(md).toContain('## Unresolved Questions');
    expect(md).toContain('- What is the budget?');
  });

  it('resolves lane labels instead of raw IDs', () => {
    expect(md).toContain('Expansive');
    expect(md).toContain('Analytical');
    expect(md).toContain('**Lanes:** Expansive vs Analytical');
    expect(md).not.toContain(laneAId);
    expect(md).not.toContain(laneBId);
  });
});

// ---------------------------------------------------------------------------
// exportSessionJSON
// ---------------------------------------------------------------------------

describe('exportSessionJSON', () => {
  const session = makeSession();
  const nodes = [makeNode()];
  const edges = [makeEdge()];
  const promotions = [makePromotion()];
  const lanes = [makeLane()];
  const dialogueTurns = [makeDialogueTurn()];

  const json = exportSessionJSON(session, {
    nodes,
    edges,
    promotions,
    lanes,
    unifiedPlan: null,
    dialogueTurns,
  });

  it('returns valid JSON', () => {
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('contains all expected top-level keys', () => {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const key of [
      'version', 'exportedAt', 'session', 'nodes', 'edges',
      'promotions', 'lanes', 'unifiedPlan', 'dialogueTurns',
    ]) {
      expect(parsed).toHaveProperty(key);
    }
  });

  it('session field matches input', () => {
    const parsed = JSON.parse(json) as { session: PlanningSession };
    expect(parsed.session.id).toBe(session.id);
    expect(parsed.session.topic).toBe(session.topic);
  });

  it('nodes and edges are preserved', () => {
    const parsed = JSON.parse(json) as { nodes: SemanticNode[]; edges: SemanticEdge[] };
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0].id).toBe(nodes[0].id);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].id).toBe(edges[0].id);
  });

  it('version is fuda_v1', () => {
    const parsed = JSON.parse(json) as { version: string };
    expect(parsed.version).toBe('fuda_v1');
  });
});

// ---------------------------------------------------------------------------
// importSessionJSON
// ---------------------------------------------------------------------------

describe('importSessionJSON', () => {
  const session = makeSession();
  const nodes = [makeNode()];
  const edges = [makeEdge()];
  const promotions = [makePromotion()];
  const lanes = [makeLane()];
  const dialogueTurns = [makeDialogueTurn()];

  const json = exportSessionJSON(session, {
    nodes,
    edges,
    promotions,
    lanes,
    unifiedPlan: null,
    dialogueTurns,
  });

  it('round-trips with exportSessionJSON', () => {
    const result = importSessionJSON(json);
    expect(result.session.id).toBe(session.id);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
    expect(result.promotions).toHaveLength(1);
    expect(result.lanes).toHaveLength(1);
    expect(result.dialogueTurns).toHaveLength(1);
    expect(result.unifiedPlan).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => importSessionJSON('not-json{')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => importSessionJSON('{"version":"fuda_v1"}')).toThrow();
  });

  it('throws on invalid session data (topic too short)', () => {
    const bad = JSON.parse(json) as Record<string, unknown>;
    (bad.session as Record<string, unknown>).topic = 'short';
    expect(() => importSessionJSON(JSON.stringify(bad))).toThrow();
  });

  it('throws when version is wrong', () => {
    const bad = JSON.parse(json) as Record<string, unknown>;
    bad.version = 'fuda_v999';
    expect(() => importSessionJSON(JSON.stringify(bad))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// downloadFile
// ---------------------------------------------------------------------------

describe('downloadFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and revokes object URL', () => {
    const fakeUrl = 'blob:http://localhost/fake-id';
    const createObjectURL = vi.fn(() => fakeUrl);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) { /* noop */ },
      set download(_: string) { /* noop */ },
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    downloadFile('hello', 'test.md', 'text/markdown');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('sets correct download filename on anchor element', () => {
    const fakeUrl = 'blob:http://localhost/fake-id';
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => fakeUrl, revokeObjectURL: vi.fn() });

    let capturedDownload = '';
    let capturedHref = '';
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(v: string) { capturedHref = v; },
      set download(v: string) { capturedDownload = v; },
      click: vi.fn(),
    } as unknown as HTMLAnchorElement);

    downloadFile('data', 'export.json', 'application/json');

    expect(capturedDownload).toBe('export.json');
    expect(capturedHref).toBe(fakeUrl);
  });
});
