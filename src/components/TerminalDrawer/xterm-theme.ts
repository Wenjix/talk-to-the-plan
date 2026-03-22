import type { ITheme } from '@xterm/xterm';

function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Build an xterm ITheme from CSS custom properties.
 * Falls back to Catppuccin Mocha palette for ANSI colors.
 */
export function buildXtermTheme(): ITheme {
  return {
    background: getCSSVar('--terminal-bg') || '#1e1e2e',
    foreground: getCSSVar('--terminal-text') || '#cdd6f4',
    cursor: getCSSVar('--terminal-cursor') || '#f5e0dc',
    cursorAccent: getCSSVar('--terminal-bg') || '#1e1e2e',
    selectionBackground: getCSSVar('--terminal-selection-bg') || 'rgba(99, 102, 241, 0.3)',

    // Catppuccin Mocha ANSI palette
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#cba6f7',
    cyan: '#94e2d5',
    white: '#bac2de',

    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#cba6f7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  };
}
