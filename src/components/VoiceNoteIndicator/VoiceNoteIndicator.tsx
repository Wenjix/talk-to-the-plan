import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useVoiceNoteStore } from '../../store/voice-note-store';
import { playVoiceNote, deleteVoiceNote } from '../../store/voice-note-actions';
import styles from './VoiceNoteIndicator.module.css';

interface VoiceNoteIndicatorProps {
  nodeId: string;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VoiceNoteIndicator({ nodeId }: VoiceNoteIndicatorProps) {
  const allNotes = useVoiceNoteStore(s => s.notes);
  const notes = useMemo(() => allNotes.filter(n => n.nodeId === nodeId), [allNotes, nodeId]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(o => !o);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (notes.length === 0) return null;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={styles.indicator}
        onClick={toggle}
        title={`${notes.length} voice note${notes.length > 1 ? 's' : ''}`}
      >
        <span className={styles.icon}>{'\uD83C\uDFA4'}</span>
        {notes.length > 1 && <span>{notes.length}</span>}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {notes.map(note => (
            <div key={note.id} className={styles.noteItem}>
              <div className={styles.noteInfo}>
                <span className={styles.noteMeta}>
                  {formatDuration(note.durationMs)}
                  {note.transcriptStatus === 'done' ? '' : note.transcriptStatus === 'pending' ? ' \u00B7 transcribing...' : ' \u00B7 no transcript'}
                </span>
                {note.transcript && (
                  <span className={styles.noteTranscript} title={note.transcript}>
                    {note.transcript}
                  </span>
                )}
              </div>
              <button
                className={styles.noteBtn}
                onClick={(e) => { e.stopPropagation(); void playVoiceNote(note.id); }}
              >
                {'\u25B6'}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={(e) => { e.stopPropagation(); void deleteVoiceNote(note.id); }}
              >
                {'\u2715'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
