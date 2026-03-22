import { useState, useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { createSession, explore } from '../../store/actions.ts';
import { VoiceRecorder, MicPermissionError } from '../../services/voice/media-recorder.ts';
import { transcribeAudio } from '../../services/voice/eigen-client.ts';
import { loadSettings, resolveEigenApiKey } from '../../persistence/settings-store.ts';
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

  // Voice recording state
  const [hasEigenKey, setHasEigenKey] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);

  const isValid = topic.trim().length >= 10;

  // Check for Eigen API key on mount
  useEffect(() => {
    loadSettings().then(settings => {
      setHasEigenKey(!!resolveEigenApiKey(settings));
    });
  }, []);

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

  const startRecording = useCallback(() => {
    if (isRecording || transcribing) return;
    const recorder = new VoiceRecorder();
    recorderRef.current = recorder;
    const promise = (async () => {
      try {
        await recorder.start();
        setIsRecording(true);
      } catch (err) {
        recorderRef.current = null;
        if (err instanceof MicPermissionError) {
          setError('Microphone permission denied');
        }
      }
    })();
    startPromiseRef.current = promise;
  }, [isRecording, transcribing]);

  const stopAndTranscribe = useCallback(async () => {
    // Wait for start to complete if still in-flight
    if (startPromiseRef.current) {
      await startPromiseRef.current;
      startPromiseRef.current = null;
    }
    if (!recorderRef.current) return;

    setIsRecording(false);
    setTranscribing(true);
    setError('');

    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current.destroy();
      recorderRef.current = null;

      const settings = await loadSettings();
      const eigenKey = resolveEigenApiKey(settings);
      if (!eigenKey) {
        setError('Eigen API key not configured');
        setTranscribing(false);
        return;
      }

      const transcript = await transcribeAudio(blob, eigenKey, settings.voiceLanguage);
      if (transcript.trim()) {
        setTopic(transcript.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  }, []);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.destroy();
        recorderRef.current = null;
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.brandMark}>
          <span className={styles.diamond}>&#x25C6;</span>
          PARALLAX
        </div>
        <p className={styles.tagline}>Think and talk in parallax.</p>
        <p className={styles.subtitle}>Speak your ideas, branch in six directions, and explore from four AI perspectives.</p>

        <div className={styles.inputGroup}>
          <div className={styles.inputWrapper}>
            <textarea
              className={styles.input}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What are you thinking about?"
              rows={4}
              disabled={loading || isRecording}
            />
            {hasEigenKey && (
              <button
                className={`${styles.micBtn} ${isRecording ? styles.micRecording : ''} ${transcribing ? styles.micTranscribing : ''}`}
                onPointerDown={startRecording}
                onPointerUp={() => void stopAndTranscribe()}
                onPointerLeave={() => { if (isRecording) void stopAndTranscribe(); }}
                disabled={loading || transcribing}
                type="button"
                aria-label={isRecording ? 'Recording — release to transcribe' : transcribing ? 'Transcribing...' : 'Hold to speak'}
                title={isRecording ? 'Release to transcribe' : transcribing ? 'Transcribing...' : 'Hold to speak'}
              >
                {transcribing ? (
                  <span className={styles.micSpinner} />
                ) : isRecording ? (
                  '\u23F9'
                ) : (
                  '\uD83C\uDF99'
                )}
              </button>
            )}
          </div>
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
