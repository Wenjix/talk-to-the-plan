import { describe, it, expect } from 'vitest';
import {
  createDefaultToolStatus,
  deriveReadinessState,
} from '../../services/terminal-tool-types';
import type { TerminalToolStatus } from '../../services/terminal-tool-types';

describe('terminal-tool-types', () => {
  describe('createDefaultToolStatus', () => {
    it('returns correct defaults', () => {
      const status = createDefaultToolStatus();
      expect(status.available).toBe(false);
      expect(status.command).toBeNull();
      expect(status.version).toBeNull();
      expect(status.installRequired).toBe(true);
      expect(status.installScope).toBeNull();
      expect(status.pythonVersion).toBeNull();
      expect(status.uvAvailable).toBe(false);
      expect(status.apiKeyConfigured).toBe(false);
      expect(status.setupRequired).toBe(false);
      expect(status.vibeHome).toBeNull();
      expect(status.lastCheckedAt).toBeNull();
    });

    it('returns a new object each call', () => {
      const a = createDefaultToolStatus();
      const b = createDefaultToolStatus();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('deriveReadinessState', () => {
    it('returns "ready" when available and apiKeyConfigured', () => {
      const status: TerminalToolStatus = {
        ...createDefaultToolStatus(),
        available: true,
        command: 'vibe',
        version: '1.0.0',
        installRequired: false,
        apiKeyConfigured: true,
        setupRequired: false,
      };
      expect(deriveReadinessState(status)).toBe('ready');
    });

    it('returns "install_required" when installRequired is true', () => {
      const status = createDefaultToolStatus();
      expect(deriveReadinessState(status)).toBe('install_required');
    });

    it('returns "setup_required" when binary exists but no API key', () => {
      const status: TerminalToolStatus = {
        ...createDefaultToolStatus(),
        available: true,
        command: 'vibe',
        installRequired: false,
        apiKeyConfigured: false,
        setupRequired: false,
      };
      expect(deriveReadinessState(status)).toBe('setup_required');
    });

    it('returns "setup_required" when setupRequired flag is true', () => {
      const status: TerminalToolStatus = {
        ...createDefaultToolStatus(),
        available: true,
        command: 'vibe',
        installRequired: false,
        apiKeyConfigured: false,
        setupRequired: true,
      };
      expect(deriveReadinessState(status)).toBe('setup_required');
    });

    it('returns "unknown" for ambiguous state (not installed, not required)', () => {
      const status: TerminalToolStatus = {
        ...createDefaultToolStatus(),
        installRequired: false,
        available: false,
        apiKeyConfigured: true,
      };
      expect(deriveReadinessState(status)).toBe('unknown');
    });
  });
});
