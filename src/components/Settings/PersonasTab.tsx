import type { PersonaId } from '../../core/types';
import { PersonaIdSchema, PERSONA_META } from '../../core/types/lane';
import type { AppSettings } from '../../persistence/settings-store';
import type { ProviderId, PersonaModelConfig } from '../../generation/providers/types';
import { AVAILABLE_MODELS, DEFAULT_PERSONA_MODEL_CONFIG } from '../../generation/providers/types';
import styles from './Settings.module.css';

const ALL_PERSONAS = PersonaIdSchema.options as readonly PersonaId[];
const ALL_PROVIDERS: ProviderId[] = ['mistral', 'anthropic'];
const PROVIDER_LABELS: Record<ProviderId, string> = { mistral: 'Mistral', anthropic: 'Anthropic' };

interface PersonasTabProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => void;
}

export function PersonasTab({ settings, onUpdate }: PersonasTabProps) {
  const config: PersonaModelConfig = {
    ...DEFAULT_PERSONA_MODEL_CONFIG,
    ...settings.personaModelConfig,
  };

  const handleProviderChange = (personaId: PersonaId, providerId: ProviderId) => {
    const updated = {
      ...config,
      [personaId]: { providerId, modelId: AVAILABLE_MODELS[providerId][0] },
    };
    onUpdate({ personaModelConfig: updated });
  };

  const handleModelChange = (personaId: PersonaId, modelId: string) => {
    const updated = {
      ...config,
      [personaId]: { ...config[personaId], modelId },
    };
    onUpdate({ personaModelConfig: updated });
  };

  return (
    <div>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Persona &rarr; Model</legend>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Persona</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Provider</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Model</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PERSONAS.map(id => {
              const meta = PERSONA_META[id];
              const entry = config[id];
              return (
                <tr key={id}>
                  <td style={{ padding: '6px 8px', fontSize: '0.85rem' }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: meta.colorToken,
                      marginRight: 6,
                      verticalAlign: 'middle',
                    }} />
                    {meta.label}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={entry.providerId}
                      onChange={e => handleProviderChange(id, e.target.value as ProviderId)}
                      className={styles.textInput}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      {ALL_PROVIDERS.map(pid => (
                        <option key={pid} value={pid}>{PROVIDER_LABELS[pid]}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <select
                      value={entry.modelId}
                      onChange={e => handleModelChange(id, e.target.value)}
                      className={styles.textInput}
                      style={{ width: '100%', fontSize: '0.85rem' }}
                    >
                      {AVAILABLE_MODELS[entry.providerId].map(mid => (
                        <option key={mid} value={mid}>{mid}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>
    </div>
  );
}
