import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTerminalStore } from '../../store/terminal-store';
import { createDefaultToolStatus } from '../../services/terminal-tool-types';
import type { TerminalToolStatus } from '../../services/terminal-tool-types';
import { TerminalSetupNotice } from '../../components/TerminalDrawer/TerminalSetupNotice';

describe('TerminalSetupNotice', () => {
  beforeEach(() => {
    useTerminalStore.getState().clear();
  });

  it('renders nothing when readiness is "unknown"', () => {
    // Set a status that results in "unknown" readiness
    const unknownStatus: TerminalToolStatus = {
      ...createDefaultToolStatus(),
      installRequired: false,
      available: false,
      apiKeyConfigured: true,
    };
    useTerminalStore.getState().setToolStatus('mistralVibe', unknownStatus);

    const { container } = render(<TerminalSetupNotice />);
    expect(container.innerHTML).toBe('');
  });

  it('renders ready pill when readiness is "ready"', () => {
    const readyStatus: TerminalToolStatus = {
      ...createDefaultToolStatus(),
      available: true,
      command: 'vibe',
      version: '1.2.3',
      installRequired: false,
      apiKeyConfigured: true,
    };
    useTerminalStore.getState().setToolStatus('mistralVibe', readyStatus);

    render(<TerminalSetupNotice />);
    expect(screen.getByText(/Mistral Vibe ready/)).toBeInTheDocument();
    expect(screen.getByText(/vibe/)).toBeInTheDocument();
    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument();
  });

  it('renders install banner with install commands when "install_required"', () => {
    // Default status has installRequired=true
    render(<TerminalSetupNotice />);

    expect(screen.getByText(/not installed/i)).toBeInTheDocument();
    expect(screen.getByText('uv tool install mistral-vibe')).toBeInTheDocument();
    expect(screen.getByText('pip install mistral-vibe')).toBeInTheDocument();
    expect(screen.getByText(/curl.*install\.sh/)).toBeInTheDocument();
  });

  it('renders setup banner with setup commands when "setup_required"', () => {
    const setupStatus: TerminalToolStatus = {
      ...createDefaultToolStatus(),
      available: true,
      command: 'vibe',
      installRequired: false,
      apiKeyConfigured: false,
      setupRequired: true,
    };
    useTerminalStore.getState().setToolStatus('mistralVibe', setupStatus);

    render(<TerminalSetupNotice />);

    expect(screen.getByText(/setup required/i)).toBeInTheDocument();
    expect(screen.getByText('vibe --setup')).toBeInTheDocument();
    expect(screen.getByText(/export MISTRAL_API_KEY/)).toBeInTheDocument();
  });

  it('re-check button is disabled while probeInProgress', () => {
    // Default = install_required, so banner shows
    useTerminalStore.getState().setToolProbeInProgress(true);

    render(<TerminalSetupNotice />);

    const recheckBtn = screen.getByText('Checking...');
    expect(recheckBtn).toBeDisabled();
  });

  it('re-check button shows "Re-check" when not probing', () => {
    render(<TerminalSetupNotice />);

    const recheckBtn = screen.getByText('Re-check');
    expect(recheckBtn).not.toBeDisabled();
  });
});
