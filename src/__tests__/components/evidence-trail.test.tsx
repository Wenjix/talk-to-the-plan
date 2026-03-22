import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceTrail } from '../../components/EvidenceTrail/EvidenceTrail';
import type { EvidenceRef } from '../../core/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(overrides?: Partial<EvidenceRef>): EvidenceRef {
  return {
    nodeId: 'node-001',
    laneId: 'lane-001',
    quote: 'This is a key finding from the exploration.',
    relevance: 'primary',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EvidenceTrail', () => {
  it('renders nothing for an empty evidence array', () => {
    const { container } = render(<EvidenceTrail evidence={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders breadcrumb items for each EvidenceRef', () => {
    const evidence: EvidenceRef[] = [
      makeEvidence({ nodeId: 'node-a', quote: 'First finding' }),
      makeEvidence({ nodeId: 'node-b', quote: 'Second finding', relevance: 'supporting' }),
    ];

    render(<EvidenceTrail evidence={evidence} />);

    expect(screen.getByText('First finding')).toBeDefined();
    expect(screen.getByText('Second finding')).toBeDefined();
  });

  it('shows relevance badges for each evidence item', () => {
    const evidence: EvidenceRef[] = [
      makeEvidence({ relevance: 'primary' }),
      makeEvidence({ nodeId: 'node-b', relevance: 'supporting' }),
    ];

    render(<EvidenceTrail evidence={evidence} />);

    const badges = screen.getAllByText('primary');
    expect(badges.length).toBe(1);

    const supportingBadges = screen.getAllByText('supporting');
    expect(supportingBadges.length).toBe(1);
  });

  it('calls onNodeClick when clicking an evidence item', () => {
    const handleClick = vi.fn();
    const evidence = [makeEvidence({ nodeId: 'node-target' })];

    render(<EvidenceTrail evidence={evidence} onNodeClick={handleClick} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(handleClick).toHaveBeenCalledWith('node-target');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('truncates long quotes and shows full text as title', () => {
    const longQuote = 'A'.repeat(80);
    const evidence = [makeEvidence({ quote: longQuote })];

    render(<EvidenceTrail evidence={evidence} />);

    const button = screen.getByRole('button');
    // Title should be the full quote
    expect(button.getAttribute('title')).toBe(longQuote);
    // Displayed text should be truncated
    expect(screen.getByText(`${'A'.repeat(60)}...`)).toBeDefined();
  });

  it('does not truncate short quotes', () => {
    const shortQuote = 'Short quote.';
    const evidence = [makeEvidence({ quote: shortQuote })];

    render(<EvidenceTrail evidence={evidence} />);

    expect(screen.getByText(shortQuote)).toBeDefined();
  });

  it('renders separator between items', () => {
    const evidence: EvidenceRef[] = [
      makeEvidence({ nodeId: 'node-a', quote: 'First' }),
      makeEvidence({ nodeId: 'node-b', quote: 'Second' }),
    ];

    render(<EvidenceTrail evidence={evidence} />);

    // There should be one > separator between 2 items
    const separators = screen.getAllByText('>');
    expect(separators.length).toBe(1);
  });

  it('renders as a list with aria-label', () => {
    const evidence = [makeEvidence()];

    render(<EvidenceTrail evidence={evidence} />);

    const list = screen.getByRole('list');
    expect(list.getAttribute('aria-label')).toBe('Evidence trail');
  });
});
