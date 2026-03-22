import { useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { createSession, explore } from '../../store/actions.ts';
import styles from './TopicInput.module.css';

const PERSONA_DOTS = [
  { color: '#7B4FBF', label: 'Expansive' },
  { color: '#4A90D9', label: 'Analytical' },
  { color: '#3DAA6D', label: 'Pragmatic' },
  { color: '#D94F4F', label: 'Socratic' },
];

export function TopicInput() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = topic.trim().length >= 10;

  const handleSubmit = useCallback(async () => {
    if (!isValid || loading) return;
    setLoading(true);
    setError('');
    try {
      const session = await createSession(topic.trim());
      await explore(session, session.activeLaneId, topic.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  }, [topic, isValid, loading]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.brandMark}>
          <span className={styles.diamond}>&#x25C6;</span>
          PARALLAX
        </div>
        <p className={styles.tagline}>See your ideas from every angle</p>

        <div className={styles.inputGroup}>
          <textarea
            className={styles.input}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you thinking about?"
            rows={4}
            disabled={loading}
          />
          <div className={styles.footer}>
            <div className={styles.perspectives}>
              <div className={styles.dots}>
                {PERSONA_DOTS.map(d => (
                  <span
                    key={d.label}
                    className={styles.dot}
                    style={{ background: d.color }}
                    title={d.label}
                  />
                ))}
              </div>
              <span className={styles.perspectiveLabel}>4 perspectives</span>
            </div>
            <span className={styles.charCount}>
              {topic.trim().length}/10
            </span>
            {error && <span className={styles.error}>{error}</span>}
            <button
              className={styles.exploreBtn}
              onClick={handleSubmit}
              disabled={!isValid || loading}
            >
              {loading ? 'Starting...' : 'Explore \u2192'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
