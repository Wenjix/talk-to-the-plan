export interface AudioChunk {
  index: number;
  dataUrl: string;
}

export interface ChunkResult {
  chunks: AudioChunk[];
  durationSec: number;
  numChunks: number;
}

const CHUNK_DURATION_SEC = 4;
const RMS_SILENCE_THRESHOLD = 0.01;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const WAV_HEADER_SIZE = 44;

/** RMS energy of a Float32 audio segment. Used to skip silent chunks. */
function rmsEnergy(segment: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < segment.length; i++) {
    sum += segment[i] * segment[i];
  }
  return Math.sqrt(sum / segment.length);
}

function float32ToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}

function writeWavHeader(view: DataView, sampleRate: number, dataSize: number): void {
  const byteRate = sampleRate * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  view.setUint32(8, 0x57415645, false); // 'WAVE'

  // fmt subchunk
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true); // subchunk1 size (PCM)
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data subchunk
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, dataSize, true);
}

function encodeWavChunk(pcm: Int16Array, sampleRate: number): string {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  writeWavHeader(view, sampleRate, dataSize);

  // Write PCM samples
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(WAV_HEADER_SIZE + i * 2, pcm[i], true);
  }

  // Base64 encode
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return `data:audio/wav;base64,${base64}`;
}

export function chunkPcmBuffer(samples: Float32Array, sampleRate: number): ChunkResult {
  if (samples.length === 0) {
    return { chunks: [], durationSec: 0, numChunks: 0 };
  }

  const chunkSamples = CHUNK_DURATION_SEC * sampleRate;
  const chunks: AudioChunk[] = [];

  for (let offset = 0; offset < samples.length; offset += chunkSamples) {
    const end = Math.min(offset + chunkSamples, samples.length);
    const segment = samples.subarray(offset, end);
    if (rmsEnergy(segment) < RMS_SILENCE_THRESHOLD) continue;
    const chunkIndex = chunks.length;
    const pcm = float32ToInt16(segment);
    const dataUrl = encodeWavChunk(pcm, sampleRate);
    chunks.push({ index: chunkIndex, dataUrl });
  }

  return {
    chunks,
    durationSec: samples.length / sampleRate,
    numChunks: chunks.length,
  };
}
