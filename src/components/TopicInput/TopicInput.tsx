import { useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { createSession, explore } from '../../store/actions.ts';
import styles from './TopicInput.module.css';

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
        <h1 className={styles.title}>What would you like to plan?</h1>
        <p className={styles.subtitle}>
          Enter a topic or question to explore through multiple AI perspectives.
        </p>
        <div className={styles.inputGroup}>
          <textarea
            className={styles.input}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Should we migrate from monolith to microservices?"
            rows={3}
            disabled={loading}
          />
          <div className={styles.footer}>
            <span className={styles.charCount}>
              {topic.trim().length}/10 min
            </span>
            {error && <span className={styles.error}>{error}</span>}
            <button
              className={styles.startBtn}
              onClick={handleSubmit}
              disabled={!isValid || loading}
            >
              {loading ? 'Starting...' : 'Start Exploring'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
