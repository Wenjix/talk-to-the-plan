import { useState, useRef, useEffect } from 'react';
import type { PersonaId } from '../../core/types';
import { PersonaIdSchema, PERSONA_META } from '../../core/types/lane';
import { useSessionStore } from '../../store/session-store';
import { useSemanticStore } from '../../store/semantic-store';
import styles from './PersonaSelector.module.css';

const ALL_PERSONAS = PersonaIdSchema.options as readonly PersonaId[];

interface PersonaSelectorProps {
  onOpenPersonaSettings: () => void;
}

export function PersonaSelector({ onOpenPersonaSettings }: PersonaSelectorProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activeLaneId = useSessionStore(s => s.activeLaneId);
  const activeLane = useSemanticStore(s => s.lanes.find(l => l.id === activeLaneId));
  const updateLanePersona = useSemanticStore(s => s.updateLanePersona);

  const currentPersona = activeLane?.personaId ?? 'expansive';
  const meta = PERSONA_META[currentPersona];

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (personaId: PersonaId) => {
    if (activeLaneId) {
      updateLanePersona(activeLaneId, personaId);
    }
    setOpen(false);
  };

  if (!activeLaneId) return null;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(prev => !prev)}
        type="button"
        aria-label={`Active persona: ${meta.label}`}
      >
        <span className={styles.dot} style={{ background: meta.colorToken }} />
        {meta.label}
        <span className={styles.caret}>&#x25BE;</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          {ALL_PERSONAS.map(id => {
            const m = PERSONA_META[id];
            const isActive = id === currentPersona;
            return (
              <button
                key={id}
                className={styles.option}
                onClick={() => handleSelect(id)}
                type="button"
              >
                <span className={styles.check}>{isActive ? '\u2713' : ''}</span>
                <span className={styles.dot} style={{ background: m.colorToken }} />
                {m.label}
              </button>
            );
          })}
          <div className={styles.divider} />
          <button
            className={styles.configLink}
            onClick={() => { setOpen(false); onOpenPersonaSettings(); }}
            type="button"
          >
            Configure&hellip;
          </button>
        </div>
      )}
    </div>
  );
}
