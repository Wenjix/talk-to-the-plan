import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useViewStore } from '../../store/view-store';
import { useTerminalStore } from '../../store/terminal-store';
import { prepareTerminal, endTerminalSession, setActiveBackend, getActiveBackend, probeVibeToolStatus } from '../../store/terminal-actions';
import type { ITerminalBackend } from '../../services/terminal-backend';
import { buildXtermTheme } from './xterm-theme';
import { TerminalSetupNotice } from './TerminalSetupNotice';
import { deriveReadinessState } from '../../services/terminal-tool-types';
import styles from './TerminalDrawer.module.css';

export function TerminalDrawer() {
  const terminalHeightPx = useViewStore((s) => s.terminalHeightPx);
  const setTerminalHeight = useViewStore((s) => s.setTerminalHeight);
  const connectionState = useTerminalStore((s) => s.connectionState);
  const errorMessage = useTerminalStore((s) => s.errorMessage);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const backendRef = useRef<ITerminalBackend | null>(null);
  const resizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Initialize xterm + backend
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      theme: buildXtermTheme(),
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit after open
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    // Defer backend connection so React StrictMode's cleanup-remount cycle
    // cancels the first mount's connect before a WebSocket is ever created.
    const { setConnectionState, setLastExit } = useTerminalStore.getState();

    const connectTimer = setTimeout(() => {
      const backend = prepareTerminal();
      backendRef.current = backend;

      backend.connect({
        cols: term.cols,
        rows: term.rows,
        events: {
          onOutput: (data: string) => {
            term.write(data);
          },
          onStateChange: (state) => {
            setConnectionState(state);
            if (state === 'ready') {
              probeVibeToolStatus().catch(() => {});
            }
          },
          onExit: (exitCode, signal) => {
            setLastExit({ exitCode, signal });
            setConnectionState('disconnected');
          },
        },
      }).catch(() => {});
    }, 0);

    // Wire user input to backend
    const onDataDisposable = term.onData((data) => {
      const currentBackend = backendRef.current ?? getActiveBackend();
      currentBackend?.write(data);
    });

    // ResizeObserver for fit
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
          const currentBackend = backendRef.current ?? getActiveBackend();
          currentBackend?.resize(term.cols, term.rows);
        } catch {
          // Ignore fit errors during teardown
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // Theme observer: re-apply xterm theme when data-theme changes
    const themeObserver = new MutationObserver(() => {
      term.options.theme = buildXtermTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      clearTimeout(connectTimer);
      // Disconnect backend — PTY is useless without xterm
      if (backendRef.current) {
        backendRef.current.disconnect();
        setActiveBackend(null);
        backendRef.current = null;
      }
      themeObserver.disconnect();
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit when height changes
  useEffect(() => {
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });
  }, [terminalHeightPx]);

  // Resize handle drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = terminalHeightPx;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        // Dragging up increases height
        const delta = startYRef.current - ev.clientY;
        setTerminalHeight(startHeightRef.current + delta);
      };

      const handleMouseUp = () => {
        resizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // Final fit after resize
        requestAnimationFrame(() => {
          fitAddonRef.current?.fit();
        });
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [terminalHeightPx, setTerminalHeight],
  );

  const handleEndSession = useCallback(() => {
    endTerminalSession();
    // Clear the xterm display
    termRef.current?.clear();
    termRef.current?.write('\x1b[2J\x1b[H');
    backendRef.current = null;

    // Reconnect a fresh backend
    if (termRef.current) {
      const backend = prepareTerminal();
      backend.connect({
        cols: termRef.current.cols,
        rows: termRef.current.rows,
        events: {
          onOutput: (data: string) => {
            termRef.current?.write(data);
          },
          onStateChange: (state) => {
            useTerminalStore.getState().setConnectionState(state);
            if (state === 'ready') {
              probeVibeToolStatus().catch(() => {});
            }
          },
          onExit: (exitCode, signal) => {
            useTerminalStore.getState().setLastExit({ exitCode, signal });
            useTerminalStore.getState().setConnectionState('disconnected');
          },
        },
      }).catch(() => {});
      backendRef.current = backend;
    }
  }, []);

  const toolStatus = useTerminalStore((s) => s.tooling.mistralVibe);
  const vibeReadiness = deriveReadinessState(toolStatus);

  const statusDotClass =
    connectionState === 'ready'
      ? styles.statusDotReady
      : connectionState === 'connecting'
        ? styles.statusDotConnecting
        : connectionState === 'error'
          ? styles.statusDotError
          : styles.statusDotDisconnected;

  return (
    <div className={styles.drawer} style={{ height: terminalHeightPx }}>
      {/* Resize handle */}
      <div className={styles.resizeHandle} onMouseDown={handleMouseDown} />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={`${styles.statusDot} ${statusDotClass}`} />
          <span className={styles.headerTitle}>Terminal</span>
          <span className={styles.statusText}>{connectionState}</span>
          {vibeReadiness === 'ready' && <TerminalSetupNotice />}
        </div>
        <button
          className={styles.endSessionBtn}
          onClick={handleEndSession}
          type="button"
          aria-label="End terminal session"
        >
          End Session
        </button>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className={styles.errorBanner}>
          <span>{errorMessage}</span>
          <button
            type="button"
            className={styles.errorDismiss}
            onClick={() => useTerminalStore.getState().setErrorMessage(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Vibe setup notice (install/setup banners — does not block terminal) */}
      {vibeReadiness !== 'ready' && vibeReadiness !== 'unknown' && <TerminalSetupNotice />}

      {/* Terminal */}
      <div ref={containerRef} className={styles.terminalContainer} />
    </div>
  );
}
