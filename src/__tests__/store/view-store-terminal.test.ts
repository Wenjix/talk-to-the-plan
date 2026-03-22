import { describe, it, expect, beforeEach } from 'vitest';
import { useViewStore } from '../../store/view-store';

describe('view-store terminal geometry', () => {
  beforeEach(() => {
    useViewStore.getState().clear();
    // Reset terminal height to default after clear (clear doesn't touch it)
    useViewStore.getState().setTerminalHeight(280);
  });

  it('terminalOpen defaults to false', () => {
    expect(useViewStore.getState().terminalOpen).toBe(false);
  });

  it('terminalHeightPx defaults to 280', () => {
    expect(useViewStore.getState().terminalHeightPx).toBe(280);
  });

  it('setTerminalOpen sets open state', () => {
    useViewStore.getState().setTerminalOpen(true);
    expect(useViewStore.getState().terminalOpen).toBe(true);

    useViewStore.getState().setTerminalOpen(false);
    expect(useViewStore.getState().terminalOpen).toBe(false);
  });

  it('toggleTerminal flips open state', () => {
    expect(useViewStore.getState().terminalOpen).toBe(false);

    useViewStore.getState().toggleTerminal();
    expect(useViewStore.getState().terminalOpen).toBe(true);

    useViewStore.getState().toggleTerminal();
    expect(useViewStore.getState().terminalOpen).toBe(false);
  });

  it('setTerminalHeight clamps to 200-520 range', () => {
    useViewStore.getState().setTerminalHeight(100);
    expect(useViewStore.getState().terminalHeightPx).toBe(200);

    useViewStore.getState().setTerminalHeight(600);
    expect(useViewStore.getState().terminalHeightPx).toBe(520);

    useViewStore.getState().setTerminalHeight(350);
    expect(useViewStore.getState().terminalHeightPx).toBe(350);
  });

  it('clear() resets terminalOpen but preserves terminalHeightPx', () => {
    useViewStore.getState().setTerminalOpen(true);
    useViewStore.getState().setTerminalHeight(400);

    useViewStore.getState().clear();

    expect(useViewStore.getState().terminalOpen).toBe(false);
    // Height is preserved as user preference
    expect(useViewStore.getState().terminalHeightPx).toBe(400);
  });
});
