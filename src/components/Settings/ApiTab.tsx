import { useState } from 'react';
import type { AppSettings } from '../../persistence/settings-store.ts';
import { hasEnvFallback } from '../../persistence/settings-store.ts';
import styles from './Settings.module.css';

function getGeminiKeyStatus(key: string): 'not-set' | 'valid' | 'invalid' {
  if (!key) return 'not-set';
  if (key.startsWith('AI') && key.length > 20) return 'valid';
  return 'invalid';
}

function getMistralKeyStatus(key: string): 'not-set' | 'valid' | 'invalid' {
  if (!key) return 'not-set';
  if (key.length >= 20) return 'valid';
  return 'invalid';
}

function getAnthropicKeyStatus(key: string): 'not-set' | 'valid' | 'invalid' {
  if (!key) return 'not-set';
  if (key.startsWith('sk-ant-') && key.length > 20) return 'valid';
  if (key.length >= 20) return 'valid';
  return 'invalid';
}

function getOpenAIKeyStatus(key: string): 'not-set' | 'valid' | 'invalid' {
  if (!key) return 'not-set';
  if (key.startsWith('sk-') && key.length > 20) return 'valid';
  if (key.length >= 20) return 'valid';
  return 'invalid';
}

function getElevenLabsKeyStatus(key: string): 'not-set' | 'valid' | 'invalid' {
  if (!key) return 'not-set';
  if (/^[a-f0-9]{32}$/i.test(key)) return 'valid';
  if (key.length >= 20) return 'valid'; // Some keys differ in format
  return 'invalid';
}

const STATUS_LABELS = {
  'not-set': 'Not set',
  valid: 'Valid format',
  invalid: 'Invalid format',
} as const;

function statusClass(status: 'not-set' | 'valid' | 'invalid') {
  return status === 'not-set'
    ? styles.statusNotSet
    : status === 'valid'
      ? styles.statusValid
      : styles.statusInvalid;
}

function EnvFallbackBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #999)', marginLeft: 8 }}>
      Using .env default
    </span>
  );
}

interface ApiKeyFieldProps {
  legend: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  status: 'not-set' | 'valid' | 'invalid';
  testId: string;
  showEnvFallback: boolean;
}

function ApiKeyField({ legend, value, onChange, placeholder, ariaLabel, status, testId, showEnvFallback }: ApiKeyFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {legend}
        <EnvFallbackBadge show={showEnvFallback && !value} />
      </legend>
      <div className={styles.inputGroup}>
        <input
          className={styles.textInput}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
        />
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide API key' : 'Show API key'}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <div className={`${styles.statusIndicator} ${statusClass(status)}`} data-testid={testId}>
        {STATUS_LABELS[status]}
      </div>
    </fieldset>
  );
}

export function ApiTab({ settings, onUpdate }: { settings: AppSettings; onUpdate: (partial: Partial<AppSettings>) => void }) {
  const [showElevenLabs, setShowElevenLabs] = useState(false);

  const mistralStatus = getMistralKeyStatus(settings.mistralApiKey);
  const geminiStatus = getGeminiKeyStatus(settings.geminiApiKey);
  const anthropicStatus = getAnthropicKeyStatus(settings.anthropicApiKey);
  const openaiStatus = getOpenAIKeyStatus(settings.openaiApiKey);
  const elevenLabsStatus = getElevenLabsKeyStatus(settings.elevenLabsApiKey);

  return (
    <div>
      <ApiKeyField
        legend="Mistral API Key (Expansive lane)"
        value={settings.mistralApiKey}
        onChange={(v) => onUpdate({ mistralApiKey: v })}
        placeholder="Enter Mistral API key"
        ariaLabel="Mistral API key"
        status={mistralStatus}
        testId="mistral-key-status"
        showEnvFallback={hasEnvFallback('mistral')}
      />

      <ApiKeyField
        legend="Gemini API Key (Analytical lane)"
        value={settings.geminiApiKey}
        onChange={(v) => onUpdate({ geminiApiKey: v })}
        placeholder="AIza..."
        ariaLabel="Gemini API key"
        status={geminiStatus}
        testId="gemini-key-status"
        showEnvFallback={hasEnvFallback('gemini')}
      />

      <ApiKeyField
        legend="Anthropic API Key (Pragmatic lane)"
        value={settings.anthropicApiKey}
        onChange={(v) => onUpdate({ anthropicApiKey: v })}
        placeholder="sk-ant-..."
        ariaLabel="Anthropic API key"
        status={anthropicStatus}
        testId="anthropic-key-status"
        showEnvFallback={hasEnvFallback('anthropic')}
      />

      <ApiKeyField
        legend="OpenAI API Key (Socratic lane)"
        value={settings.openaiApiKey}
        onChange={(v) => onUpdate({ openaiApiKey: v })}
        placeholder="sk-..."
        ariaLabel="OpenAI API key"
        status={openaiStatus}
        testId="openai-key-status"
        showEnvFallback={hasEnvFallback('openai')}
      />

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>ElevenLabs API Key</legend>
        <div className={styles.inputGroup}>
          <input
            className={styles.textInput}
            type={showElevenLabs ? 'text' : 'password'}
            value={settings.elevenLabsApiKey}
            onChange={(e) => onUpdate({ elevenLabsApiKey: e.target.value })}
            placeholder="Enter ElevenLabs API key"
            aria-label="ElevenLabs API key"
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setShowElevenLabs((v) => !v)}
            aria-label={showElevenLabs ? 'Hide API key' : 'Show API key'}
          >
            {showElevenLabs ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className={`${styles.statusIndicator} ${statusClass(elevenLabsStatus)}`} data-testid="elevenlabs-key-status">
          {STATUS_LABELS[elevenLabsStatus]}
        </div>
        <p style={{ color: 'var(--text-muted, #999)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
          Voice transcription audio is sent to ElevenLabs when enabled.
        </p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Voice / TTS</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            checked={settings.voiceTtsEnabled}
            onChange={(e) => onUpdate({ voiceTtsEnabled: e.target.checked })}
            aria-label="Enable text-to-speech"
          />
          Enable text-to-speech
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            type="checkbox"
            checked={settings.voiceAutoPlayAi}
            onChange={(e) => onUpdate({ voiceAutoPlayAi: e.target.checked })}
            disabled={!settings.voiceTtsEnabled}
            aria-label="Auto-play AI responses"
          />
          Auto-play AI responses
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          Voice input mode:
          <select
            value={settings.voiceInputMode}
            onChange={(e) => onUpdate({ voiceInputMode: e.target.value as 'hold_to_talk' | 'toggle' })}
            aria-label="Voice input mode"
          >
            <option value="hold_to_talk">Hold to talk</option>
            <option value="toggle">Toggle</option>
          </select>
        </label>
        <input
          className={styles.textInput}
          type="text"
          value={settings.voiceTtsVoiceId}
          onChange={(e) => onUpdate({ voiceTtsVoiceId: e.target.value })}
          placeholder="21m00Tcm4TlvDq8ikWAM (default)"
          disabled={!settings.voiceTtsEnabled}
          aria-label="TTS Voice ID"
          style={{ marginBottom: '0.5rem' }}
        />
        <p style={{ color: 'var(--text-muted, #999)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
          AI responses are synthesized via ElevenLabs when TTS is enabled.
        </p>
      </fieldset>
    </div>
  );
}
