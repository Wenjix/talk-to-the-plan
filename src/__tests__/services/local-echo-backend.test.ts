import { describe, it, expect, beforeEach } from 'vitest';
import { LocalEchoBackend } from '../../services/local-echo-backend';
import type { TerminalBackendEvents, TerminalConnectionState } from '../../services/terminal-backend';

function createMockEvents() {
  const output: string[] = [];
  const states: TerminalConnectionState[] = [];
  const exits: Array<{ exitCode: number | null; signal: string | null }> = [];

  const events: TerminalBackendEvents = {
    onOutput: (data) => output.push(data),
    onStateChange: (state) => states.push(state),
    onExit: (exitCode, signal) => exits.push({ exitCode, signal }),
  };

  return { events, output, states, exits };
}

describe('LocalEchoBackend', () => {
  let backend: LocalEchoBackend;
  let mocks: ReturnType<typeof createMockEvents>;

  beforeEach(() => {
    backend = new LocalEchoBackend();
    mocks = createMockEvents();
  });

  it('starts in disconnected state', () => {
    expect(backend.getState()).toBe('disconnected');
  });

  it('connects and transitions to ready state', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    expect(backend.getState()).toBe('ready');
    expect(mocks.states).toContain('connecting');
    expect(mocks.states).toContain('ready');
  });

  it('outputs welcome message on connect', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('Parallax Terminal');
    expect(fullOutput).toContain('local echo mode');
    expect(fullOutput).toContain('help');
  });

  it('handles help command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0; // Clear welcome output

    backend.write('help\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('Available commands');
    expect(fullOutput).toContain('clear');
    expect(fullOutput).toContain('echo');
    expect(fullOutput).toContain('env');
    expect(fullOutput).toContain('history');
    expect(fullOutput).toContain('date');
    expect(fullOutput).toContain('whoami');
  });

  it('handles echo command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('echo hello world\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('hello world');
  });

  it('handles env command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('env\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('PARALLAX_SESSION_ID');
    expect(fullOutput).toContain('local-echo');
  });

  it('handles date command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('date\r');

    const fullOutput = mocks.output.join('');
    // Should contain a year-like string
    expect(fullOutput).toMatch(/\d{4}/);
  });

  it('handles whoami command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('whoami\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('parallax-user');
  });

  it('handles unknown command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('nonexistent\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('command not found');
    expect(fullOutput).toContain('nonexistent');
  });

  it('handles empty input (just pressing enter)', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    const outputBefore = mocks.output.length;

    backend.write('\r');

    // Should still output a prompt
    expect(mocks.output.length).toBeGreaterThan(outputBefore);
  });

  it('records command history', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    backend.write('echo first\r');
    backend.write('echo second\r');

    expect(backend.commandHistory).toEqual(['echo first', 'echo second']);
  });

  it('handles history command', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    backend.write('echo first\r');
    backend.write('echo second\r');
    mocks.output.length = 0;

    backend.write('history\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('echo first');
    expect(fullOutput).toContain('echo second');
  });

  it('handles backspace', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    // Type "helx", backspace, type "p", enter
    backend.write('helx');
    backend.write('\x7f'); // backspace
    backend.write('p');
    backend.write('\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('Available commands');
  });

  it('handles Ctrl+C', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('partial input');
    backend.write('\x03'); // Ctrl+C

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('^C');
  });

  it('disconnect transitions to disconnected and fires exit', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    backend.disconnect();

    expect(backend.getState()).toBe('disconnected');
    expect(mocks.exits).toHaveLength(1);
    expect(mocks.exits[0]).toEqual({ exitCode: 0, signal: null });
  });

  it('ignores write when disconnected', () => {
    // Should not throw
    backend.write('hello');
    expect(backend.getState()).toBe('disconnected');
  });

  it('resize is a no-op (does not throw)', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    expect(() => backend.resize(120, 40)).not.toThrow();
  });

  it('vibe command outputs informational message', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('vibe\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('Mistral Vibe CLI');
    expect(fullOutput).toContain('not available');
    expect(fullOutput).toContain('uv tool install mistral-vibe');
  });

  it('vibe-status command outputs status summary', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('vibe-status\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('Vibe Tool Status');
    expect(fullOutput).toContain('not available');
    expect(fullOutput).toContain('not configured');
    expect(fullOutput).toContain('local-echo');
  });

  it('help command lists vibe commands', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });
    mocks.output.length = 0;

    backend.write('help\r');

    const fullOutput = mocks.output.join('');
    expect(fullOutput).toContain('vibe');
    expect(fullOutput).toContain('vibe-status');
  });

  it('probeTool("vibe") returns status with installRequired=true', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    const status = await backend.probeTool('vibe');

    expect(status.available).toBe(false);
    expect(status.installRequired).toBe(true);
    expect(status.installScope).toBe('host');
    expect(status.apiKeyConfigured).toBe(false);
  });

  it('probeTool("vibe") sets lastCheckedAt to valid ISO string', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    const status = await backend.probeTool('vibe');

    expect(status.lastCheckedAt).toBeTruthy();
    expect(new Date(status.lastCheckedAt!).toISOString()).toBe(status.lastCheckedAt);
  });

  it('probeTool("unknown-tool") returns default status', async () => {
    await backend.connect({ cols: 80, rows: 24, events: mocks.events });

    const status = await backend.probeTool('unknown-tool');

    expect(status.available).toBe(false);
    expect(status.installRequired).toBe(true);
    expect(status.installScope).toBeNull();
    expect(status.lastCheckedAt).toBeNull();
  });
});
