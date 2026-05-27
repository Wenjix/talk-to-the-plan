import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { execFileSync } from 'child_process';
import path from 'path';

// ---------------------------------------------------------------------------
// Tool status types (duplicated from src/services/terminal-tool-types.ts to
// avoid cross-module import issues between server and Vite-bundled frontend)
// ---------------------------------------------------------------------------

type VibeCommand = 'vibe' | 'mistral-vibe';

interface TerminalToolStatus {
  available: boolean;
  command: VibeCommand | null;
  version: string | null;
  installRequired: boolean;
  installScope: string | null;
  pythonVersion: string | null;
  uvAvailable: boolean;
  apiKeyConfigured: boolean;
  setupRequired: boolean;
  vibeHome: string | null;
  lastCheckedAt: string | null;
}

function createDefaultToolStatus(): TerminalToolStatus {
  return {
    available: false,
    command: null,
    version: null,
    installRequired: false,
    installScope: null,
    pythonVersion: null,
    uvAvailable: false,
    apiKeyConfigured: false,
    setupRequired: false,
    vibeHome: null,
    lastCheckedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tool probing — uses execFileSync (no shell injection risk)
// ---------------------------------------------------------------------------

function probeTool(tool: string): TerminalToolStatus {
  const status = createDefaultToolStatus();
  status.lastCheckedAt = new Date().toISOString();

  if (tool !== 'vibe') return status;

  for (const cmd of ['vibe', 'mistral-vibe'] as const) {
    try {
      const result = execFileSync('which', [cmd], { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result) {
        status.available = true;
        status.command = cmd;
        status.installRequired = false;
        try {
          const ver = execFileSync(cmd, ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
          status.version = ver.replace(/^v?/, '');
        } catch { /* version detection optional */ }
        break;
      }
    } catch { /* binary not found, continue */ }
  }

  if (!status.available) {
    status.installRequired = true;
    status.installScope = 'host';
    return status;
  }

  status.apiKeyConfigured = !!(process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY);
  if (!status.apiKeyConfigured) status.setupRequired = true;

  try {
    const pyVer = execFileSync('python3', ['--version'], { encoding: 'utf-8', timeout: 3000 }).trim();
    status.pythonVersion = pyVer.replace('Python ', '');
  } catch { /* optional */ }

  try {
    execFileSync('which', ['uv'], { timeout: 3000 });
    status.uvAvailable = true;
  } catch { /* optional */ }

  status.vibeHome = process.env.VIBE_HOME || `${process.env.HOME}/.vibe`;

  return status;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/pty' });

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

wss.on('connection', (ws: WebSocket) => {
  if (activeConnections >= MAX_CONNECTIONS) {
    ws.send(JSON.stringify({ type: 'error', message: 'Connection limit reached' }));
    ws.close();
    return;
  }
  activeConnections++;
  let pty: IPty | null = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'spawn': {
          if (pty) {
            ws.send(JSON.stringify({ type: 'error', message: 'PTY already spawned' }));
            return;
          }
          const shell = process.env.SHELL || '/bin/zsh';
          const requestedCwd = msg.cwd || DEFAULT_CWD;
          const cwd = isAllowedCwd(requestedCwd) ? requestedCwd : DEFAULT_CWD;
          const cols = Math.max(1, Math.min(300, msg.cols ?? 80));
          const rows = Math.max(1, Math.min(100, msg.rows ?? 24));
          const ptyEnv = buildPtyEnv();
          try {
            pty = ptySpawn(shell, [], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd,
              env: ptyEnv,
            });
          } catch (spawnErr) {
            const errMsg = spawnErr instanceof Error ? spawnErr.message : 'Unknown error';
            console.error(`[PTY] Failed to spawn "${shell}" in "${cwd}":`, errMsg);
            ws.send(JSON.stringify({
              type: 'error',
              message: `Failed to spawn shell "${shell}": ${errMsg}`,
            }));
            return;
          }

          pty.onData((data: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data }));
            }
          });

          pty.onExit(({ exitCode, signal }) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'exit', exitCode, signal: signal?.toString() ?? null }));
              ws.close();
            }
            pty = null;
          });
          break;
        }

        case 'data': {
          pty?.write(msg.data);
          break;
        }

        case 'resize': {
          if (pty && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
            const resizeCols = Math.max(1, Math.min(300, msg.cols));
            const resizeRows = Math.max(1, Math.min(100, msg.rows));
            pty.resize(resizeCols, resizeRows);
          }
          break;
        }

        case 'probe': {
          const status = probeTool(msg.tool ?? 'vibe');
          ws.send(JSON.stringify({
            type: 'probeResult',
            tool: msg.tool,
            probeId: msg.probeId ?? undefined,
            status,
          }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid message',
      }));
    }
  });

  ws.on('close', () => {
    if (pty) {
      pty.kill();
      pty = null;
    }
    activeConnections--;
  });
});

const PORT = parseInt(process.env.PTY_PORT || '3001', 10);

const MAX_CONNECTIONS = 10;
let activeConnections = 0;

// Allowed cwd paths — restrict to user home and temp. Computed once at module
// load and resolved to absolute paths so the prefix check operates on
// canonical paths (string-prefix matching alone would let `/tmp/../etc` slip
// through and node-pty would happily spawn the shell in `/etc`).
const ALLOWED_CWD_PREFIXES: readonly string[] = (() => {
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  return [home, '/tmp'].map((p) => path.resolve(p));
})();

// Default cwd for the fallback branch — must itself be in the allowlist,
// so reuse the first allowed prefix (already resolved). Falling back to
// `process.env.HOME || '/'` would let an unset HOME spawn the shell in `/`,
// which is outside the allowlist.
const DEFAULT_CWD = ALLOWED_CWD_PREFIXES[0];

function isAllowedCwd(cwd: string): boolean {
  const resolved = path.resolve(cwd);
  return ALLOWED_CWD_PREFIXES.some(
    (p) => resolved === p || resolved.startsWith(p + path.sep),
  );
}

// Build a sanitized env for PTY — only pass through safe variables
function buildPtyEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  const safeKeys = ['HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR', 'USERPROFILE'];
  for (const key of safeKeys) {
    if (process.env[key]) safe[key] = process.env[key]!;
  }
  // Map VITE_MISTRAL_API_KEY → MISTRAL_API_KEY for vibe CLI
  if (process.env.MISTRAL_API_KEY) {
    safe.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  } else if (process.env.VITE_MISTRAL_API_KEY) {
    safe.MISTRAL_API_KEY = process.env.VITE_MISTRAL_API_KEY;
  }
  return safe;
}
server.listen(PORT, '127.0.0.1', () => {
  console.log(`PTY server listening on 127.0.0.1:${PORT}`);
});
