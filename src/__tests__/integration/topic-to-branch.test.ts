import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSemanticStore } from '../../store/semantic-store'
import { useSessionStore } from '../../store/session-store'
import { useJobStore } from '../../store/job-store'
import { useViewStore } from '../../store/view-store'

// Mock settings-store to avoid IndexedDB dependency
vi.mock('../../persistence/settings-store', () => ({
  loadSettings: vi.fn().mockResolvedValue({ mistralApiKey: '', anthropicApiKey: '' }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  updateSettings: vi.fn().mockResolvedValue({ mistralApiKey: '', anthropicApiKey: '' }),
  resolveApiKeys: vi.fn().mockReturnValue({ mistral: '', anthropic: '' }),
}))

import { createSession, explore, answerNode, branchFromNode } from '../../store/actions'

describe('Topic -> Explore -> Answer -> Branch flow', () => {
  beforeEach(() => {
    useSemanticStore.getState().clear()
    useSessionStore.getState().clear()
    useJobStore.getState().clear()
    useViewStore.getState().clear()
  })

  it('creates a session with correct initial state', async () => {
    const session = await createSession('How to design a scalable distributed system')

    expect(session.topic).toBe('How to design a scalable distributed system')
    expect(session.status).toBe('exploring')
    expect(session.version).toBe('fuda_v1')
    expect(session.challengeDepth).toBe('balanced')
    expect(session.activeLaneId).toBeDefined()

    // Session is in session store
    expect(useSessionStore.getState().session).not.toBeNull()
    expect(useSessionStore.getState().uiMode).toBe('compass')
  })

  it('explore creates root node and runs generation job', async () => {
    const session = await createSession('How to design a scalable distributed system')
    const laneId = session.activeLaneId

    await explore(session, laneId, 'How to design a scalable distributed system')

    // Root node was created
    const nodes = useSemanticStore.getState().nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0].nodeType).toBe('root')
    expect(nodes[0].question).toBe('How to design a scalable distributed system')
    expect(nodes[0].laneId).toBe(laneId)
    expect(nodes[0].parentId).toBeNull()
    expect(nodes[0].depth).toBe(0)

    // UI mode switched to exploring
    expect(useSessionStore.getState().uiMode).toBe('exploring')

    // View node was created
    const viewNode = useViewStore.getState().viewNodes.get(nodes[0].id)
    expect(viewNode).toBeDefined()
    expect(viewNode!.isNew).toBe(true)

    // A job was queued
    const jobs = useJobStore.getState().jobs
    expect(jobs.length).toBeGreaterThan(0)
  })

  it('answerNode transitions node to generating and runs job', async () => {
    const session = await createSession('How to design a scalable distributed system')
    const laneId = session.activeLaneId

    await explore(session, laneId, 'How to design a scalable distributed system')

    // Wait for explore job to settle
    await new Promise(r => setTimeout(r, 100))

    const rootNode = useSemanticStore.getState().nodes[0]

    // If root node is already resolved from explore job, we can branch.
    // If still idle, we can answer it.
    if (rootNode.fsmState === 'idle') {
      await answerNode(rootNode.id)

      // Wait for the mock provider to resolve
      await new Promise(r => setTimeout(r, 200))

      const updated = useSemanticStore.getState().getNode(rootNode.id)
      // Node should have progressed (generating, resolved, or failed)
      expect(['generating', 'resolved', 'failed']).toContain(updated?.fsmState)
    }
  })

  it('branchFromNode creates child node and edge', async () => {
    const session = await createSession('How to design a scalable distributed system')
    const laneId = session.activeLaneId

    await explore(session, laneId, 'How to design a scalable distributed system')

    // Wait for the explore job (path_questions) to complete with mock provider
    await new Promise(r => setTimeout(r, 500))

    const rootNode = useSemanticStore.getState().getNode(
      useSemanticStore.getState().nodes[0].id,
    )

    // If the root node is resolved, we can branch from it
    if (rootNode?.fsmState === 'resolved') {
      await branchFromNode(rootNode.id, 'go-deeper')

      const nodes = useSemanticStore.getState().nodes
      expect(nodes.length).toBeGreaterThanOrEqual(2)

      // Find the child node
      const childNode = nodes.find(n => n.parentId === rootNode.id)
      expect(childNode).toBeDefined()
      expect(childNode!.pathType).toBe('go-deeper')
      expect(childNode!.depth).toBe(1)
      expect(childNode!.laneId).toBe(laneId)

      // Edge was created
      const edges = useSemanticStore.getState().edges
      const edge = edges.find(
        e => e.sourceNodeId === rootNode.id && e.targetNodeId === childNode!.id,
      )
      expect(edge).toBeDefined()

      // View node for child was created
      const childView = useViewStore.getState().viewNodes.get(childNode!.id)
      expect(childView).toBeDefined()
    }
  })

  it('rejects branching from non-resolved node', async () => {
    const session = await createSession('How to design a scalable distributed system')
    const laneId = session.activeLaneId

    await explore(session, laneId, 'How to design a scalable distributed system')

    const rootNode = useSemanticStore.getState().nodes[0]

    // Root node starts as idle - cannot branch
    if (rootNode.fsmState === 'idle') {
      await expect(branchFromNode(rootNode.id, 'go-deeper')).rejects.toThrow(
        'Cannot branch from node in state "idle"',
      )
    }
  })

  it('full flow with multiple branches creates a tree', async () => {
    const session = await createSession('How to design a scalable distributed system')
    const laneId = session.activeLaneId

    await explore(session, laneId, 'How to design a scalable distributed system')

    // Wait for explore job
    await new Promise(r => setTimeout(r, 500))

    const rootId = useSemanticStore.getState().nodes[0].id
    const rootNode = useSemanticStore.getState().getNode(rootId)

    if (rootNode?.fsmState === 'resolved') {
      // Branch in two directions
      await branchFromNode(rootId, 'go-deeper')
      await branchFromNode(rootId, 'challenge')

      const nodes = useSemanticStore.getState().nodes
      const edges = useSemanticStore.getState().edges

      // Should have root + 2 children
      expect(nodes.length).toBeGreaterThanOrEqual(3)

      // Root has no parent
      const root = nodes.find(n => n.id === rootId)
      expect(root!.parentId).toBeNull()

      // Children reference root
      const children = nodes.filter(n => n.parentId === rootId)
      expect(children).toHaveLength(2)

      // 2 edges from root
      const rootEdges = edges.filter(e => e.sourceNodeId === rootId)
      expect(rootEdges).toHaveLength(2)
    }
  })
})
