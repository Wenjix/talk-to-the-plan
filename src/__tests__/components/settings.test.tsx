import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock settings-store to avoid IndexedDB dependency.
// vi.mock is hoisted, so no external references are allowed in the factory.
vi.mock('../../persistence/settings-store', async () => {
  const { z } = await import('zod');
  const ThemeSchema = z.enum(['light', 'dark']).default('light');
  const AppSettingsSchema = z.object({
    mistralApiKey: z.string().default(''),
    anthropicApiKey: z.string().default(''),
    eigenApiKey: z.string().default(''),
    bosonApiKey: z.string().default(''),
    challengeDepth: z.enum(['gentle', 'balanced', 'intense']).default('balanced'),
    autoSaveEnabled: z.boolean().default(true),
    animationsEnabled: z.boolean().default(true),
    theme: ThemeSchema,
    voiceInputMode: z.enum(['hold_to_talk', 'toggle']).default('hold_to_talk'),
    voiceTtsEnabled: z.boolean().default(true),
    voiceAutoPlayAi: z.boolean().default(true),
    voiceTtsVoiceId: z.string().default(''),
    personaModelConfig: z.record(
      z.string(),
      z.object({ providerId: z.enum(['mistral', 'anthropic']), modelId: z.string() })
    ).default({
      expansive: { providerId: 'mistral', modelId: 'mistral-large-2512' },
      analytical: { providerId: 'mistral', modelId: 'mistral-large-2512' },
      pragmatic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
      socratic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
    }),
  });
  const defaults = {
    mistralApiKey: '',
    anthropicApiKey: '',
    eigenApiKey: '',
    bosonApiKey: '',
    challengeDepth: 'balanced' as const,
    autoSaveEnabled: true,
    animationsEnabled: true,
    theme: 'light' as const,
    voiceInputMode: 'hold_to_talk' as const,
    voiceTtsEnabled: true,
    voiceAutoPlayAi: true,
    voiceTtsVoiceId: '',
    personaModelConfig: {
      expansive: { providerId: 'mistral', modelId: 'mistral-large-2512' },
      analytical: { providerId: 'mistral', modelId: 'mistral-large-2512' },
      pragmatic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
      socratic: { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' },
    },
  };
  return {
    ThemeSchema,
    AppSettingsSchema,
    loadSettings: vi.fn().mockResolvedValue({ ...defaults }),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    updateSettings: vi.fn().mockResolvedValue({ ...defaults }),
    resolveApiKeys: vi.fn().mockReturnValue({ mistral: '', anthropic: '' }),
    hasEnvFallback: vi.fn().mockReturnValue(false),
  };
});

import { Settings } from '../../components/Settings/Settings';
import { updateSettings } from '../../persistence/settings-store';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Settings component', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onClose.mockReset();
    document.documentElement.removeAttribute('data-theme');
  });

  function renderSettings() {
    return render(<Settings onClose={onClose} />);
  }

  // --- Tab rendering ---

  it('renders with four tabs (General, API, Display, Personas)', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'General' })).toBeDefined();
    });
    expect(screen.getByRole('tab', { name: 'API' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Display' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Personas' })).toBeDefined();
  });

  it('renders as an accessible dialog', async () => {
    renderSettings();

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('Settings');
    });
  });

  // --- General tab ---

  it('General tab shows challenge depth radio options', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Gentle')).toBeDefined();
    });
    expect(screen.getByLabelText('Balanced')).toBeDefined();
    expect(screen.getByLabelText('Intense')).toBeDefined();
  });

  it('challenge depth radio buttons update on click', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Balanced')).toBeDefined();
    });

    const gentleRadio = screen.getByLabelText('Gentle');
    fireEvent.click(gentleRadio);

    expect(updateSettings).toHaveBeenCalledWith({ challengeDepth: 'gentle' });
  });

  it('animation toggle renders as checkbox', async () => {
    renderSettings();

    await waitFor(() => {
      const checkbox = screen.getByLabelText('Enable animations');
      expect(checkbox).toBeDefined();
      expect(checkbox.getAttribute('type')).toBe('checkbox');
    });
  });

  it('animation toggle calls updateSettings on change', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByLabelText('Enable animations')).toBeDefined();
    });

    const checkbox = screen.getByLabelText('Enable animations');
    fireEvent.click(checkbox);

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ animationsEnabled: false })
    );
  });

  // --- API tab ---

  it('API tab shows only supported LLM input fields', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'API' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'API' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Mistral API key')).toBeDefined();
    });
    expect(screen.getByLabelText('Anthropic API key')).toBeDefined();
    expect(screen.queryByLabelText('Gemini API key')).toBeNull();
    expect(screen.queryByLabelText('OpenAI API key')).toBeNull();
  });

  it('API key input masks the value by default', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    });

    await waitFor(() => {
      const input = screen.getByLabelText('Mistral API key');
      expect(input.getAttribute('type')).toBe('password');
    });
  });

  it('show/hide toggle reveals and masks the API key', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Mistral API key')).toBeDefined();
    });

    const toggleBtns = screen.getAllByLabelText('Show API key');
    fireEvent.click(toggleBtns[0]);

    const input = screen.getByLabelText('Mistral API key');
    expect(input.getAttribute('type')).toBe('text');

    const hideBtns = screen.getAllByLabelText('Hide API key');
    fireEvent.click(hideBtns[0]);

    expect(input.getAttribute('type')).toBe('password');
  });

  it('empty API key shows "Not set" status', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    });

    await waitFor(() => {
      const status = screen.getByTestId('mistral-key-status');
      expect(status.textContent).toBe('Not set');
    });
  });

  it('valid format key shows "Valid format" status', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Mistral API key')).toBeDefined();
    });

    const input = screen.getByLabelText('Mistral API key');
    fireEvent.change(input, { target: { value: 'FakeMistralKey12345678901234' } });

    await waitFor(() => {
      const status = screen.getByTestId('mistral-key-status');
      expect(status.textContent).toBe('Valid format');
    });
  });

  it('invalid format key shows "Invalid format" status', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Mistral API key')).toBeDefined();
    });

    const input = screen.getByLabelText('Mistral API key');
    fireEvent.change(input, { target: { value: 'short-key' } });

    await waitFor(() => {
      const status = screen.getByTestId('mistral-key-status');
      expect(status.textContent).toBe('Invalid format');
    });
  });

  // --- Display tab ---

  it('Display tab shows theme toggle', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Dark mode')).toBeDefined();
    });
  });

  it('theme toggle changes data-theme attribute', async () => {
    renderSettings();

    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Dark mode')).toBeDefined();
    });

    const checkbox = screen.getByLabelText('Dark mode');
    fireEvent.click(checkbox);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  // --- Close behavior ---

  it('closes on Escape key', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', async () => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
