import { useMemo } from 'react';

interface StreamingAnswerProps {
  text: string;
  isStreaming: boolean;
}

interface PartialAnswer {
  summary: string | null;
  bullets: string[];
  isParseable: boolean;
}

/**
 * Incrementally parse a streaming JSON buffer to extract summary and bullets
 * as they appear, even before the JSON is complete.
 */
function parsePartial(raw: string): PartialAnswer {
  // Strip markdown code fences if present
  const stripped = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

  // Try full parse first
  try {
    const parsed = JSON.parse(stripped);
    return {
      summary: parsed.summary ?? null,
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.filter((b: unknown) => typeof b === 'string' && b.length > 0) : [],
      isParseable: true,
    };
  } catch {
    // Fall through to partial extraction
  }

  // Extract partial summary via regex — handles incomplete JSON
  let summary: string | null = null;
  const summaryMatch = stripped.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)("?)/);
  if (summaryMatch) {
    summary = summaryMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  // Extract complete bullets — only grab fully closed strings in the bullets array
  const bullets: string[] = [];
  const bulletsStart = stripped.indexOf('"bullets"');
  if (bulletsStart !== -1) {
    const afterBullets = stripped.slice(bulletsStart);
    // Match each complete string in the array
    const bulletMatches = afterBullets.matchAll(/"((?:[^"\\]|\\.)*)"/g);
    let first = true;
    for (const m of bulletMatches) {
      if (first) { first = false; continue; } // skip "bullets" key itself
      const val = m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      if (val.length > 0) bullets.push(val);
    }
  }

  return {
    summary,
    bullets,
    isParseable: summary !== null,
  };
}

export function StreamingAnswer({ text, isStreaming }: StreamingAnswerProps) {
  const parsed = useMemo(() => parsePartial(text), [text]);

  const cursor = isStreaming ? <span className="streaming-cursor">|</span> : null;

  // If we can extract structured content, render it formatted
  if (parsed.isParseable) {
    return (
      <div className="streaming-answer">
        {parsed.summary && (
          <p className="streaming-answer-summary">
            {parsed.summary}
            {parsed.bullets.length === 0 && cursor}
          </p>
        )}
        {parsed.bullets.length > 0 && (
          <ul className="streaming-answer-bullets">
            {parsed.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {parsed.bullets.length > 0 && cursor}
      </div>
    );
  }

  // Fallback: show raw text (before any JSON structure is detected)
  return (
    <div className="streaming-text">
      <span>{text}</span>
      {cursor}
    </div>
  );
}
