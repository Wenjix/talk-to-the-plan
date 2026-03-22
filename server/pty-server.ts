import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { execFileSync } from 'child_process';

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
          const cwd = msg.cwd || process.env.HOME || '/';
          // Build env for the PTY, mapping VITE_MISTRAL_API_KEY → MISTRAL_API_KEY
          // so that `vibe` CLI can find the key regardless of which name was used
          const ptyEnv = { ...process.env } as Record<string, string>;
          if (!ptyEnv.MISTRAL_API_KEY && ptyEnv.VITE_MISTRAL_API_KEY) {
            ptyEnv.MISTRAL_API_KEY = ptyEnv.VITE_MISTRAL_API_KEY;
          }
          try {
            pty = ptySpawn(shell, [], {
              name: 'xterm-256color',
              cols: msg.cols ?? 80,
              rows: msg.rows ?? 24,
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
            pty.resize(msg.cols, msg.rows);
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
  });
});

const PORT = parseInt(process.env.PTY_PORT || '3001', 10);
server.listen(PORT, '127.0.0.1', () => {
  console.log(`PTY server listening on 127.0.0.1:${PORT}`);
});
