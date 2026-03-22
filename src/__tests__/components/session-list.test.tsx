import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SessionSummary } from '../../store/workspace-actions';

// Mock workspace-actions
const mockListSessions = vi.fn<() => Promise<SessionSummary[]>>();
vi.mock('../../store/workspace-actions', () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...(args as [])),
  switchSession: vi.fn(),
  deleteSession: vi.fn(),
}));

import { SessionList } from '../../components/SessionList/SessionList';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides?: Partial<SessionSummary>): SessionSummary {
  return {
    id: crypto.randomUUID(),
    topic: 'How to build a sustainable business model for SaaS',
    status: 'exploring',
    createdAt: new Date().toISOString(),
    nodeCount: 5,
    lanePlanCount: 1,
    ...overrides,
  };
}

const defaultProps = {
  onOpenSession: vi.fn(),
  onNewSession: vi.fn(),
  onDeleteSession: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);
  });

  it('renders loading state initially', () => {
    // Make the promise never resolve during this test
    mockListSessions.mockReturnValue(new Promise(() => {}));
    render(<SessionList {...defaultProps} />);

    expect(screen.getByText('Loading sessions...')).toBeDefined();
  });

  it('renders empty state when no sessions exist', async () => {
    mockListSessions.mockResolvedValue([]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeDefined();
    });
    expect(screen.getByText('Start exploring to create your first session!')).toBeDefined();
  });

  it('renders session cards for each saved session', async () => {
    const sessions = [
      makeSummary({ topic: 'First topic for sustainable planning' }),
      makeSummary({ topic: 'Second topic about architecture decisions' }),
    ];
    mockListSessions.mockResolvedValue(sessions);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('First topic for sustainable planning')).toBeDefined();
    });
    expect(screen.getByText('Second topic about architecture decisions')).toBeDefined();
  });

  it('shows topic, status, and node count on cards', async () => {
    const session = makeSummary({
      topic: 'Migrating from monolith to microservices strategy',
      status: 'lane_planning',
      nodeCount: 12,
      lanePlanCount: 2,
    });
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Migrating from monolith to microservices strategy')).toBeDefined();
    });
    expect(screen.getByText('Lane Planning')).toBeDefined();
    expect(screen.getByText('12 nodes')).toBeDefined();
    expect(screen.getByText('2/4 lanes planned')).toBeDefined();
  });

  it('shows singular "node" for 1 node', async () => {
    const session = makeSummary({ nodeCount: 1 });
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('1 node')).toBeDefined();
    });
  });

  it('shows correct status badges for all statuses', async () => {
    const sessions = [
      makeSummary({ topic: 'Topic A is about something exploratory', status: 'exploring' }),
      makeSummary({ topic: 'Topic B is about lane planning details', status: 'lane_planning' }),
      makeSummary({ topic: 'Topic C is about synthesis readiness', status: 'synthesis_ready' }),
      makeSummary({ topic: 'Topic D is about synthesized outcomes', status: 'synthesized' }),
    ];
    mockListSessions.mockResolvedValue(sessions);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Exploring')).toBeDefined();
    });
    expect(screen.getByText('Lane Planning')).toBeDefined();
    expect(screen.getByText('Synthesis Ready')).toBeDefined();
    expect(screen.getByText('Synthesized')).toBeDefined();
  });

  it('calls onOpenSession when "Open" is clicked', async () => {
    const session = makeSummary({ id: 'session-123' });
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Open'));
    expect(defaultProps.onOpenSession).toHaveBeenCalledWith('session-123');
  });

  it('shows confirmation when "Delete" is clicked', async () => {
    const session = makeSummary();
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Are you sure?')).toBeDefined();
    // Should show confirm and cancel buttons
    expect(screen.getByText('Delete')).toBeDefined(); // confirm delete
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('calls onDeleteSession after confirmation', async () => {
    const session = makeSummary({ id: 'session-to-delete' });
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeDefined();
    });

    // Click the initial Delete button
    fireEvent.click(screen.getByText('Delete'));

    // Now we should see the confirmation UI with a "Delete" confirm button
    // There may be two "Delete" buttons (the word appears in confirm bar);
    // find the one inside the confirm bar
    const deleteButtons = screen.getAllByText('Delete');
    // The confirm delete button is the one after "Are you sure?"
    const confirmBtn = deleteButtons[deleteButtons.length - 1];
    fireEvent.click(confirmBtn);

    expect(defaultProps.onDeleteSession).toHaveBeenCalledWith('session-to-delete');
  });

  it('does not call onDeleteSession if confirmation is cancelled', async () => {
    const session = makeSummary({ id: 'session-keep' });
    mockListSessions.mockResolvedValue([session]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Are you sure?')).toBeDefined();

    fireEvent.click(screen.getByText('Cancel'));

    expect(defaultProps.onDeleteSession).not.toHaveBeenCalled();
    // Should revert to showing the original Delete/Open buttons
    expect(screen.getByText('Open')).toBeDefined();
  });

  it('calls onNewSession when "New Session" is clicked', async () => {
    mockListSessions.mockResolvedValue([]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('New Session')).toBeDefined();
    });

    fireEvent.click(screen.getByText('New Session'));
    expect(defaultProps.onNewSession).toHaveBeenCalledOnce();
  });

  it('renders header with title and new session button', async () => {
    mockListSessions.mockResolvedValue([]);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Your Sessions')).toBeDefined();
    });
    expect(screen.getByText('New Session')).toBeDefined();
  });

  it('optimistically removes card after deletion', async () => {
    const sessions = [
      makeSummary({ id: 'keep-this', topic: 'Topic to keep in the session list' }),
      makeSummary({ id: 'delete-this', topic: 'Topic to delete from the session list' }),
    ];
    mockListSessions.mockResolvedValue(sessions);
    render(<SessionList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Topic to delete from the session list')).toBeDefined();
    });

    // Find the second card's delete button
    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[1]); // Second card

    // Confirm
    const confirmDeleteBtns = screen.getAllByText('Delete');
    fireEvent.click(confirmDeleteBtns[confirmDeleteBtns.length - 1]);

    // The deleted card should be removed optimistically
    await waitFor(() => {
      expect(screen.queryByText('Topic to delete from the session list')).toBeNull();
    });
    expect(screen.getByText('Topic to keep in the session list')).toBeDefined();
  });
});
