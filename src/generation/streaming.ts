import type { JobType } from '../core/types/index.ts';
import { parseAndValidate } from '../core/validation/schema-gates.ts';
import type { SchemaGateResult } from '../core/validation/schema-gates.ts';

/**
 * Accumulates streaming chunks and parses on completion.
 *
 * Usage:
 *   const acc = new StreamAccumulator(nodeId, 'answer', (delta) => viewStore.appendStream(nodeId, delta));
 *   // ... feed chunks via acc.append(chunk) during streaming ...
 *   const result = acc.finalize();       // parse + validate on completion
 *   if (!result.success) acc.discard();  // error recovery: discard partial
 */
export class StreamAccumulator {
  private buffer: string;
  private nodeId: string;
  private jobType: JobType;
  private onChunk: ((delta: string) => void) | undefined;

  constructor(nodeId: string, jobType: JobType, onChunk?: (delta: string) => void) {
    this.buffer = '';
    this.nodeId = nodeId;
    this.jobType = jobType;
    this.onChunk = onChunk;
  }

  /** Append a chunk from the stream */
  append(chunk: string): void {
    this.buffer += chunk;
    this.onChunk?.(chunk);
  }

  /** Get the accumulated raw text */
  getRaw(): string {
    return this.buffer;
  }

  /** Parse and validate the accumulated response */
  finalize(): SchemaGateResult {
    const raw = extractJSON(this.buffer);
    return parseAndValidate(this.jobType, raw);
  }

  /** Reset the buffer (for error recovery) */
  discard(): void {
    this.buffer = '';
  }

  getNodeId(): string {
    return this.nodeId;
  }
}

/**
 * Parse SSE lines from a text chunk.
 * Returns extracted text payloads from SSE data events.
 *
 * Expected SSE format:
 *   data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
 *   data: [DONE]
 */
export function parseSSEChunk(chunk: string): string[] {
  const lines = chunk.split('\n');
  const results: string[] = [];

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        // SSE format: candidates[0].content.parts[0].text
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          results.push(text);
        }
      } catch {
        // Skip malformed SSE data lines
      }
    }
  }

  return results;
}

/**
 * Extract JSON from LLM response that may contain markdown fences or extra text.
 *
 * Handles:
 *   - ```json ... ``` fenced blocks
 *   - ``` ... ``` fenced blocks (no language tag)
 *   - Raw JSON objects { ... } or arrays [ ... ]
 *   - Plain text (returned as-is for downstream parse error)
 */
export function extractJSON(raw: string): string {
  // Try to find JSON in markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Try to find raw JSON object or array
  const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  return raw.trim();
}
