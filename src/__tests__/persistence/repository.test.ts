import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory mock of the IDB database used by repository.ts
// ---------------------------------------------------------------------------

interface MockStore {
  data: Map<string, Record<string, unknown>>
  indexes: Map<string, string> // indexName -> fieldName mapping
}

function createMockDB() {
  const stores = new Map<string, MockStore>()

  function ensureStore(name: string): MockStore {
    if (!stores.has(name)) {
      stores.set(name, { data: new Map(), indexes: new Map() })
    }
    return stores.get(name)!
  }

  const db = {
    put(storeName: string, value: Record<string, unknown>) {
      const store = ensureStore(storeName)
      const key = value.id as string
      store.data.set(key, structuredClone(value))
      return Promise.resolve(key)
    },

    get(storeName: string, key: string) {
      const store = ensureStore(storeName)
      const val = store.data.get(key)
      return Promise.resolve(val ? structuredClone(val) : undefined)
    },

    delete(storeName: string, key: string) {
      const store = ensureStore(storeName)
      store.data.delete(key)
      return Promise.resolve()
    },

    getAllFromIndex(storeName: string, _indexName: string, key: string) {
      const store = ensureStore(storeName)
      // Derive the field from the index name convention "by-<field>"
      const field = _indexName.replace('by-', '') + 'Id'
      const results: Record<string, unknown>[] = []
      for (const val of store.data.values()) {
        if (val[field] === key) {
          results.push(structuredClone(val))
        }
      }
      return Promise.resolve(results)
    },

    createObjectStore(name: string, _opts: unknown) {
      const store = ensureStore(name)
      return {
        createIndex(indexName: string, fieldName: string) {
          store.indexes.set(indexName, fieldName)
        },
      }
    },

    _clear() {
      stores.clear()
    },
  }

  return db
}

let mockDB: ReturnType<typeof createMockDB>

// Mock the `idb` module so openDB returns our in-memory mock
vi.mock('idb', () => ({
  openDB: () => {
    return Promise.resolve(mockDB)
  },
}))

// We must import after the vi.mock call so the mock is in place.
// Also, the repository caches the DB promise as a singleton.
// We need to reset it between tests by re-importing or resetting the module.
let putEntity: typeof import('../../persistence/repository').putEntity
let getEntity: typeof import('../../persistence/repository').getEntity
let deleteEntity: typeof import('../../persistence/repository').deleteEntity
let getAllByIndex: typeof import('../../persistence/repository').getAllByIndex
let loadSessionEnvelope: typeof import('../../persistence/repository').loadSessionEnvelope

beforeEach(async () => {
  mockDB = createMockDB()

  // Reset the module so the cached dbPromise is cleared
  vi.resetModules()

  // Re-mock idb after resetModules (resetModules clears the mock registry)
  vi.doMock('idb', () => ({
    openDB: () => Promise.resolve(mockDB),
  }))

  const repo = await import('../../persistence/repository')
  putEntity = repo.putEntity
  getEntity = repo.getEntity
  deleteEntity = repo.deleteEntity
  getAllByIndex = repo.getAllByIndex
  loadSessionEnvelope = repo.loadSessionEnvelope
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = '2026-03-01T00:00:00.000+00:00'
const sessionId = '00000000-0000-4000-a000-000000000000'
const laneId = '00000000-0000-4000-a000-000000000001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('repository CRUD helpers', () => {
  it('putEntity then getEntity returns the same data', async () => {
    const session = {
      id: sessionId,
      topic: 'Test session topic for round-trip',
      createdAt: now,
      updatedAt: now,
      challengeDepth: 'balanced',
      activeLaneId: laneId,
      status: 'exploring',
      version: 'fuda_v1',
    }

    await putEntity('sessions', session as never)
    const result = await getEntity('sessions', sessionId)

    expect(result).toBeDefined()
    expect(result).toEqual(session)
  })

  it('getEntity returns undefined for a non-existent key', async () => {
    const result = await getEntity('sessions', 'non-existent-id')
    expect(result).toBeUndefined()
  })

  it('deleteEntity removes an entity', async () => {
    const session = {
      id: sessionId,
      topic: 'Session to be deleted',
      createdAt: now,
      updatedAt: now,
      challengeDepth: 'balanced',
      activeLaneId: laneId,
      status: 'exploring',
      version: 'fuda_v1',
    }

    await putEntity('sessions', session as never)
    // Verify it exists first
    const before = await getEntity('sessions', sessionId)
    expect(before).toBeDefined()

    await deleteEntity('sessions', sessionId)

    const after = await getEntity('sessions', sessionId)
    expect(after).toBeUndefined()
  })

  it('getAllByIndex returns filtered results matching the index key', async () => {
    const lane1 = {
      id: '00000000-0000-4000-a000-000000000010',
      sessionId,
      label: 'Lane 1',
      personaId: 'analytical',
      colorToken: '#4A90D9',
      sortOrder: 0,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    }
    const lane2 = {
      id: '00000000-0000-4000-a000-000000000011',
      sessionId,
      label: 'Lane 2',
      personaId: 'expansive',
      colorToken: '#7B4FBF',
      sortOrder: 1,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    }
    const otherSessionLane = {
      id: '00000000-0000-4000-a000-000000000012',
      sessionId: '00000000-0000-4000-a000-999999999999',
      label: 'Other session lane',
      personaId: 'pragmatic',
      colorToken: '#3DAA6D',
      sortOrder: 0,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    }

    await putEntity('lanes', lane1 as never)
    await putEntity('lanes', lane2 as never)
    await putEntity('lanes', otherSessionLane as never)

    const results = await getAllByIndex('lanes', 'by-session' as never, sessionId as never)

    expect(results).toHaveLength(2)
    const ids = results.map((r: Record<string, unknown>) => r.id).sort()
    expect(ids).toEqual([lane1.id, lane2.id].sort())
  })

  it('getAllByIndex returns empty array when no matches', async () => {
    const results = await getAllByIndex(
      'lanes',
      'by-session' as never,
      'no-matching-session' as never,
    )
    expect(results).toEqual([])
  })
})

describe('loadSessionEnvelope', () => {
  it('returns all entity types for a session', async () => {
    // Create a session
    const session = {
      id: sessionId,
      topic: 'Envelope test session topic',
      createdAt: now,
      updatedAt: now,
      challengeDepth: 'balanced',
      activeLaneId: laneId,
      status: 'exploring',
      version: 'fuda_v1',
    }
    await putEntity('sessions', session as never)

    // Create a lane
    const lane = {
      id: laneId,
      sessionId,
      label: 'Analytical',
      personaId: 'analytical',
      colorToken: '#4A90D9',
      sortOrder: 0,
      isEnabled: true,
      createdAt: now,
      updatedAt: now,
    }
    await putEntity('lanes', lane as never)

    // Create a node
    const nodeId = '00000000-0000-4000-a000-000000000020'
    const node = {
      id: nodeId,
      sessionId,
      laneId,
      parentId: null,
      nodeType: 'root',
      pathType: 'go-deeper',
      question: 'Root question',
      fsmState: 'idle',
      promoted: false,
      depth: 0,
      createdAt: now,
      updatedAt: now,
    }
    await putEntity('nodes', node as never)

    // Create an edge
    const edge = {
      id: '00000000-0000-4000-a000-000000000030',
      sessionId,
      laneId,
      sourceNodeId: nodeId,
      targetNodeId: nodeId,
      createdAt: now,
    }
    await putEntity('edges', edge as never)

    const envelope = await loadSessionEnvelope(sessionId)

    expect(envelope.session).toEqual(session)
    expect(envelope.lanes).toHaveLength(1)
    expect(envelope.lanes[0]).toEqual(lane)
    expect(envelope.nodes).toHaveLength(1)
    expect(envelope.nodes[0]).toEqual(node)
    expect(envelope.edges).toHaveLength(1)
    expect(envelope.edges[0]).toEqual(edge)
    expect(envelope.promotions).toEqual([])
    expect(envelope.unifiedPlans).toEqual([])
    expect(envelope.dialogueTurns).toEqual([])
  })

  it('throws when session is not found', async () => {
    await expect(
      loadSessionEnvelope('00000000-0000-4000-a000-000000000099'),
    ).rejects.toThrow('Session not found')
  })
})
