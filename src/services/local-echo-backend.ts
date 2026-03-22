import type { ITerminalBackend, TerminalBackendEvents, TerminalConnectionState } from './terminal-backend';
import type { TerminalToolStatus } from './terminal-tool-types';
import { createDefaultToolStatus } from './terminal-tool-types';

const BUILT_IN_COMMANDS: Record<string, (args: string[], ctx: LocalEchoBackend) => string> = {
  help: () =>
    [
      'Available commands:',
      '  help         Show this message',
      '  clear        Clear the terminal',
      '  echo         Print arguments',
      '  env          Show FUDA session variables',
      '  history      Show command history',
      '  date         Show current date/time',
      '  whoami       Show current user',
      '  vibe         Mistral Vibe CLI (requires real backend)',
      '  vibe-status  Show Vibe tool readiness',
      '',
    ].join('\r\n'),

  clear: () => '\x1b[2J\x1b[H',

  echo: (args) => args.join(' ') + '\r\n',

  env: () =>
    [
      'FUDA_SESSION_ID=(local)',
      'FUDA_TERMINAL_BACKEND=local-echo',
      'SHELL=/bin/fuda-sh',
      '',
    ].join('\r\n'),

  history: (_args, ctx) => {
    if (ctx.commandHistory.length === 0) return 'No command history.\r\n';
    return ctx.commandHistory.map((cmd, i) => `  ${i + 1}  ${cmd}`).join('\r\n') + '\r\n';
  },

  date: () => new Date().toString() + '\r\n',

  whoami: () => 'fuda-user\r\n',

  vibe: () =>
    [
      '\x1b[1;33mMistral Vibe CLI\x1b[0m is not available in local-echo mode.',
      'To use Vibe, connect to a real terminal backend with:',
      '  \x1b[36muv tool install mistral-vibe\x1b[0m',
      '  \x1b[36mpip install mistral-vibe\x1b[0m',
      '',
    ].join('\r\n'),

  'vibe-status': () =>
    [
      '\x1b[1mVibe Tool Status\x1b[0m (local-echo mode)',
      '  Binary:    \x1b[31mnot available\x1b[0m (no real shell)',
      '  API Key:   \x1b[31mnot configured\x1b[0m',
      '  Runtime:   local-echo (frontend only)',
      '',
      'Connect a real terminal backend to enable Vibe.',
      '',
    ].join('\r\n'),
};

export class LocalEchoBackend implements ITerminalBackend {
  private state: TerminalConnectionState = 'disconnected';
  private events: TerminalBackendEvents | null = null;
  private lineBuffer = '';
  commandHistory: string[] = [];
  private historyIndex = -1;
  private savedLine = '';
  private cursorPos = 0;

  async connect(opts: { cols: number; rows: number; cwd?: string; events: TerminalBackendEvents }): Promise<void> {
    this.events = opts.events;
    this.state = 'connecting';
    this.events.onStateChange('connecting');

    // Simulate short connection delay
    await new Promise((r) => setTimeout(r, 50));

    this.state = 'ready';
    this.events.onStateChange('ready');
    this.events.onOutput(
      '\x1b[1;36mFUDA Terminal\x1b[0m (local echo mode)\r\n' +
      'Type \x1b[1mhelp\x1b[0m for available commands.\r\n\r\n',
    );
    this.printPrompt();
  }

  write(data: string): void {
    if (this.state !== 'ready' || !this.events) return;

    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        this.events.onOutput('\r\n');
        this.handleLine(this.lineBuffer);
        this.lineBuffer = '';
        this.cursorPos = 0;
        this.historyIndex = -1;
        this.savedLine = '';
      } else if (ch === '\x7f' || ch === '\b') {
        // Backspace
        if (this.cursorPos > 0) {
          const before = this.lineBuffer.slice(0, this.cursorPos - 1);
          const after = this.lineBuffer.slice(this.cursorPos);
          this.lineBuffer = before + after;
          this.cursorPos--;
          // Move cursor back, rewrite remaining, clear trailing, reposition
          this.events.onOutput('\b' + after + ' ' + '\b'.repeat(after.length + 1));
        }
      } else if (ch === '\x03') {
        // Ctrl+C
        this.events.onOutput('^C\r\n');
        this.lineBuffer = '';
        this.cursorPos = 0;
        this.printPrompt();
      } else if (ch === '\x1b') {
        // Start of escape sequence — handled by multi-char sequences below
      } else {
        // Regular character insertion
        const before = this.lineBuffer.slice(0, this.cursorPos);
        const after = this.lineBuffer.slice(this.cursorPos);
        this.lineBuffer = before + ch + after;
        this.cursorPos++;
        this.events.onOutput(ch + after + '\b'.repeat(after.length));
      }
    }

    // Handle escape sequences for arrow keys
    if (data.length >= 3 && data[0] === '\x1b' && data[1] === '[') {
      const code = data[2];
      if (code === 'A') this.handleHistoryUp();
      else if (code === 'B') this.handleHistoryDown();
    }
  }

  resize(_cols: number, _rows: number): void {
    // No-op for local echo
  }

  disconnect(): void {
    this.state = 'disconnected';
    this.events?.onStateChange('disconnected');
    this.events?.onExit(0, null);
    this.events = null;
    this.lineBuffer = '';
    this.commandHistory = [];
    this.historyIndex = -1;
    this.cursorPos = 0;
  }

  getState(): TerminalConnectionState {
    return this.state;
  }

  async probeTool(tool: string): Promise<TerminalToolStatus> {
    const status = createDefaultToolStatus();

    if (tool === 'vibe') {
      status.installRequired = true;
      status.installScope = 'host';
      status.lastCheckedAt = new Date().toISOString();
    }

    this.events?.onToolStatus?.(tool, status);
    return status;
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      this.printPrompt();
      return;
    }

    this.commandHistory.push(trimmed);

    const [cmd, ...args] = trimmed.split(/\s+/);
    const handler = BUILT_IN_COMMANDS[cmd];

    if (handler) {
      const output = handler(args, this);
      this.events!.onOutput(output);
    } else {
      this.events!.onOutput(`fuda-sh: command not found: ${cmd}\r\n`);
    }

    this.printPrompt();
  }

  private printPrompt(): void {
    this.events?.onOutput('\x1b[1;32mfuda\x1b[0m:\x1b[1;34m~\x1b[0m$ ');
  }

  private handleHistoryUp(): void {
    if (this.commandHistory.length === 0) return;

    if (this.historyIndex === -1) {
      this.savedLine = this.lineBuffer;
      this.historyIndex = this.commandHistory.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    } else {
      return;
    }

    this.replaceLine(this.commandHistory[this.historyIndex]);
  }

  private handleHistoryDown(): void {
    if (this.historyIndex === -1) return;

    if (this.historyIndex < this.commandHistory.length - 1) {
      this.historyIndex++;
      this.replaceLine(this.commandHistory[this.historyIndex]);
    } else {
      this.historyIndex = -1;
      this.replaceLine(this.savedLine);
    }
  }

  private replaceLine(newLine: string): void {
    // Clear current line from display
    const clearLeft = '\b'.repeat(this.cursorPos);
    const clearRight = ' '.repeat(this.lineBuffer.length);
    const resetRight = '\b'.repeat(this.lineBuffer.length);
    this.events?.onOutput(clearLeft + clearRight + resetRight);

    this.lineBuffer = newLine;
    this.cursorPos = newLine.length;
    this.events?.onOutput(newLine);
  }
}
