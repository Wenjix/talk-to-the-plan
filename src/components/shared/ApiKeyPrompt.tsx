import { useState, useCallback } from 'react';
import { updateSettings } from '../../persistence/settings-store.ts';

interface ApiKeyPromptProps {
  onSaved: () => void;
}

export function ApiKeyPrompt({ onSaved }: ApiKeyPromptProps) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    try {
      await updateSettings({ mistralApiKey: apiKey.trim() });
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [apiKey, saving, onSaved]);

  return (
    <div style={{ padding: 24, maxWidth: 400 }}>
      <h3 style={{ color: '#e0e0e0', marginBottom: 8 }}>Mistral API Key</h3>
      <p style={{ color: '#8888aa', fontSize: '0.85rem', marginBottom: 16 }}>
        Enter your Mistral API key to enable AI-powered exploration.
        Additional provider keys (Gemini, Anthropic, OpenAI) can be configured in Settings.
        Without keys, mock responses will be used.
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        placeholder="Enter Mistral API key"
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #3a3a5a',
          background: '#1a1a2e',
          color: '#e0e0e0',
          fontSize: '0.9rem',
          marginBottom: 12,
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          disabled={!apiKey.trim() || saving}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            background: '#7b4fbf',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          {saving ? 'Saving...' : 'Save Key'}
        </button>
        <button
          onClick={onSaved}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid #3a3a5a',
            background: 'transparent',
            color: '#8888aa',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          Skip (use mock)
        </button>
      </div>
    </div>
  );
}
