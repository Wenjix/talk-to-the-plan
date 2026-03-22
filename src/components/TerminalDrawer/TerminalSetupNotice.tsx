import { useCallback, useState } from 'react';
import { useTerminalStore } from '../../store/terminal-store';
import { probeVibeToolStatus } from '../../store/terminal-actions';
import { deriveReadinessState } from '../../services/terminal-tool-types';
import styles from './TerminalSetupNotice.module.css';

const INSTALL_COMMANDS = [
  { label: 'uv (recommended)', cmd: 'uv tool install mistral-vibe' },
  { label: 'pip', cmd: 'pip install mistral-vibe' },
  { label: 'curl', cmd: 'curl -LsSf https://mistral.ai/vibe/install.sh | bash' },
];

const SETUP_COMMANDS = [
  { label: 'Interactive setup', cmd: 'vibe --setup' },
  { label: 'Environment variable', cmd: 'export MISTRAL_API_KEY=your-key-here' },
];

function ReadyPill({ command, version }: { command: string | null; version: string | null }) {
  return (
    <span className={styles.readyPill}>
      <span className={styles.readyDot} />
      Mistral Vibe ready ({command ?? 'vibe'})
      {version && ` v${version}`}
    </span>
  );
}

function NoticeBanner({
  variant,
  probeInProgress,
  onRecheck,
}: {
  variant: 'install' | 'setup';
  probeInProgress: boolean;
  onRecheck: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const commands = variant === 'install' ? INSTALL_COMMANDS : SETUP_COMMANDS;
  const title =
    variant === 'install' ? 'Mistral Vibe not installed' : 'Mistral Vibe — setup required';

  return (
    <div className={styles.noticeBanner}>
      <div className={styles.noticeHeader}>
        <button
          className={styles.noticeToggle}
          onClick={() => setExpanded((e) => !e)}
          type="button"
        >
          <span className={styles.noticeTitle}>{title}</span>
          <span className={styles.chevron}>{expanded ? '\u25B4' : '\u25BE'}</span>
        </button>
        <button
          className={styles.recheckBtn}
          onClick={onRecheck}
          disabled={probeInProgress}
          type="button"
        >
          {probeInProgress ? 'Checking...' : 'Re-check'}
        </button>
      </div>
      {expanded && (
        <div className={styles.commandList}>
          {commands.map((c) => (
            <div key={c.cmd} className={styles.commandRow}>
              <span className={styles.commandLabel}>{c.label}:</span>
              <code className={styles.commandSnippet}>{c.cmd}</code>
            </div>
          ))}
          {variant === 'setup' && (
            <div className={styles.setupNote}>
              Vibe may write credentials to <code>$VIBE_HOME/.env</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TerminalSetupNotice() {
  const toolStatus = useTerminalStore((s) => s.tooling.mistralVibe);
  const probeInProgress = useTerminalStore((s) => s.toolProbeInProgress);
  const readiness = deriveReadinessState(toolStatus);

  const handleRecheck = useCallback(() => {
    probeVibeToolStatus();
  }, []);

  if (readiness === 'ready') {
    return <ReadyPill command={toolStatus.command} version={toolStatus.version} />;
  }

  if (readiness === 'install_required') {
    return (
      <NoticeBanner variant="install" probeInProgress={probeInProgress} onRecheck={handleRecheck} />
    );
  }

  if (readiness === 'setup_required') {
    return (
      <NoticeBanner variant="setup" probeInProgress={probeInProgress} onRecheck={handleRecheck} />
    );
  }

  return null;
}
