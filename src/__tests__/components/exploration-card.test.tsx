import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useViewStore } from '../../store/view-store'
import type { SemanticNode } from '../../core/types'

// Mock @xyflow/react to avoid requiring ReactFlow provider
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Top: 'top', Bottom: 'bottom' },
}))

// Mock store actions
vi.mock('../../store/actions', () => ({
  answerNode: vi.fn(),
}))

vi.mock('../../store/terminal-actions', () => ({
  sendNodeToVibe: vi.fn(),
}))

import { ExplorationCard } from '../../components/ExplorationCard/ExplorationCard'
import { answerNode } from '../../store/actions'
import { sendNodeToVibe } from '../../store/terminal-actions'

function makeNodeData(overrides?: Partial<SemanticNode>): SemanticNode {
  const now = new Date().toISOString()
  return {
    id: 'node-1',
    sessionId: 'session-1',
    laneId: 'lane-1',
    parentId: null,
    nodeType: 'exploration',
    pathType: 'go-deeper',
    question: 'What are the key trade-offs?',
    fsmState: 'idle',
    promoted: false,
    depth: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function renderCard(data: SemanticNode) {
  const props = {
    id: data.id,
    data,
    type: 'explorationCard' as const,
    // Minimal NodeProps fields
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    deletable: false,
    selectable: false,
    draggable: false,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
    dragHandle: undefined,
    width: undefined,
    height: undefined,
    measured: { width: undefined, height: undefined },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ExplorationCard {...(props as any)} />)
}

describe('ExplorationCard', () => {
  beforeEach(() => {
    useViewStore.getState().clear()
    vi.clearAllMocks()
  })

  it('renders the question text', () => {
    renderCard(makeNodeData())
    expect(screen.getByText('What are the key trade-offs?')).toBeDefined()
  })

  it('renders StatusBadge with current FSM state', () => {
    renderCard(makeNodeData({ fsmState: 'idle' }))
    expect(screen.getByText('Ready')).toBeDefined()
  })

  it('renders "Show Answer" button when idle', () => {
    renderCard(makeNodeData({ fsmState: 'idle' }))
    expect(screen.getByText('Show Answer')).toBeDefined()
  })

  it('calls answerNode when "Show Answer" is clicked', () => {
    renderCard(makeNodeData({ fsmState: 'idle' }))
    fireEvent.click(screen.getByText('Show Answer'))
    expect(answerNode).toHaveBeenCalledWith('node-1')
  })

  it('renders "Retry" button when failed', () => {
    renderCard(makeNodeData({ fsmState: 'failed' }))
    expect(screen.getByText('Retry')).toBeDefined()
  })

  it('does not render inline branch buttons when resolved (branching via radial menu)', () => {
    renderCard(makeNodeData({ fsmState: 'resolved' }))
    expect(screen.queryByText('Go Deeper')).toBeNull()
    expect(screen.queryByText('Challenge')).toBeNull()
    expect(screen.queryByText('Connect')).toBeNull()
  })

  it('renders "Ask Vibe" button when resolved', () => {
    renderCard(makeNodeData({ fsmState: 'resolved' }))
    expect(screen.getByText('Ask Vibe')).toBeDefined()
  })

  it('calls sendNodeToVibe when "Ask Vibe" is clicked', () => {
    renderCard(makeNodeData({ fsmState: 'resolved' }))
    fireEvent.click(screen.getByText('Ask Vibe'))
    expect(sendNodeToVibe).toHaveBeenCalledWith('node-1')
  })

  it('renders answer summary and bullets when node has answer', () => {
    const data = makeNodeData({
      fsmState: 'resolved',
      answer: {
        summary: 'Key trade-offs include cost and speed.',
        bullets: ['Cost increases with complexity', 'Speed decreases with scale'],
      },
    })
    renderCard(data)
    expect(screen.getByText('Key trade-offs include cost and speed.')).toBeDefined()
    expect(screen.getByText('Cost increases with complexity')).toBeDefined()
    expect(screen.getByText('Speed decreases with scale')).toBeDefined()
  })

  it('renders pathType label when present', () => {
    renderCard(makeNodeData({ pathType: 'go-deeper' }))
    expect(screen.getByText('go-deeper')).toBeDefined()
  })

  it('renders handles for React Flow connections', () => {
    renderCard(makeNodeData())
    expect(screen.getByTestId('handle-target')).toBeDefined()
    expect(screen.getByTestId('handle-source')).toBeDefined()
  })

  it('shows streaming text during generation', () => {
    useViewStore.getState().appendStream('node-1', 'Generating response...')
    renderCard(makeNodeData({ fsmState: 'generating' }))
    expect(screen.getByText('Generating response...')).toBeDefined()
  })
})
