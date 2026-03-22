# Eigen AI API Documentation Reference

This document compiles the essential endpoints, parameters, and patterns required to integrate Eigen AI models into a web application. It is optimized for coding agents and developers.

---

## 1. Global Configurations

- **Base URL (HTTP):** `https://api-web.eigenai.com`
- **Base URL (WebSocket):** `wss://api-web.eigenai.com`
- **Authentication:** All requests require an API key passed in the header:
  `Authorization: Bearer YOUR_API_KEY`

---

## 2. Text-to-Speech (TTS) - Higgs Audio V2.5

**Endpoint:** `POST /api/v1/generate`
**Content-Type:** `multipart/form-data`
**Output:** Raw `.wav` audio file (when `stream=false`), SSE stream (when `stream=true`)

**Model:** `higgs2p5`

### Required Parameters (FormData)
| Parameter | Type | Value |
| :--- | :--- | :--- |
| `model` | string | `"higgs2p5"` |
| `text` | string | The text to synthesize. |

### Optional Parameters (FormData)
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `voice` | string | Preset voice name (e.g., `"Linda"`, `"Jack"`). |
| `voice_id` | string | ID of a custom cloned voice (retrieved via `/upload` endpoint). Use instead of `voice`. |
| `stream` | string | `"false"` (returns WAV file) or `"true"` (HTTP SSE streaming). |
| `sampling` | string | JSON string: `{"temperature": 0.85, "top_p": 0.95, "top_k": 50}` |

### Response Headers
| Header | Description |
| :--- | :--- |
| `x-credits-remaining` | Remaining API credits after the request. |

### Javascript Example
```javascript
const form = new FormData();
form.append('model', 'higgs2p5');
form.append('text', 'Hello, this is a test of the text-to-speech system.');
form.append('voice', 'Linda'); // Or use voice_id for cloned voice
form.append('stream', 'false');
form.append('sampling', JSON.stringify({ temperature: 0.85, top_p: 0.95, top_k: 50 }));

const response = await fetch('https://api-web.eigenai.com/api/v1/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: form
});
const audioBlob = await response.blob(); // .wav file
```

### curl Examples
```bash
# Non-streaming (returns .wav file)
curl -X POST https://api-web.eigenai.com/api/v1/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=higgs2p5" \
  -F "text=Hello, this is a test of the text-to-speech system." \
  -F "voice=Linda" \
  -F "stream=false" \
  -F 'sampling={"temperature":0.85,"top_p":0.95,"top_k":50}' \
  --output speech.wav

# Streaming
curl -X POST https://api-web.eigenai.com/api/v1/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=higgs2p5" \
  -F "text=Hello, this is streaming audio generation." \
  -F "voice=Linda" \
  -F "stream=true" \
  -F 'sampling={"temperature":0.85,"top_p":0.95,"top_k":50}' \
  --no-buffer
```

---

## 3. Automatic Speech Recognition (ASR)

**Endpoint:** `POST /api/v1/generate`
**Content-Type:** `multipart/form-data`
**Output:** JSON with transcription.

**Model:** `higgs_asr_3`

### Required Parameters (FormData)
| Parameter | Type | Value |
| :--- | :--- | :--- |
| `model` | string | `"higgs_asr_3"` |
| `file` | file | Audio file (MP3, WAV, M4A, OGG, WebM). |

### Optional Parameters (FormData)
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `language` | string | Full language name, e.g. `"English"` (not a language code). |

### Response Schema
```json
{ "transcription": "the transcribed text..." }
```

### Javascript Fetch Example
```javascript
const form = new FormData();
form.append('model', 'higgs_asr_3');
form.append('file', audioBlob, 'recording.webm');
form.append('language', 'English');

const response = await fetch('https://api-web.eigenai.com/api/v1/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: form
});
const data = await response.json(); // { transcription: "..." }
```

### curl Example
```bash
curl -X POST https://api-web.eigenai.com/api/v1/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=higgs_asr_3" \
  -F "file=@/path/to/audio.mp3" \
  -F "language=English"
```

---

## 4. Text-to-Speech (TTS) - Real-Time WebSocket Streaming

**Endpoint:** `wss://api-web.eigenai.com/api/v1/generate/ws`
**Output:** Binary PCM frames (16-bit signed integers, 24 kHz, mono) + JSON termination frame.

### Protocol Handshake
1. **Connect:** Open WebSocket to the WSS URL.
2. **Authenticate:** Immediately send JSON auth payload.
3. **Request:** Send JSON TTS parameters.
4. **Receive:** Listen for binary frames (audio) and JSON frames (control).

### Javascript Example
```javascript
const ws = new WebSocket('wss://api-web.eigenai.com/api/v1/generate/ws');

ws.onopen = () => {
  // 1. Authenticate
  ws.send(JSON.stringify({
    token: apiKey,
    model: 'higgs2p5'
  }));

  // 2. Request Synthesis
  ws.send(JSON.stringify({
    text: "Hello, streaming audio world!",
    voice: "Linda"
  }));
};

ws.onmessage = async (event) => {
  if (event.data instanceof Blob) {
    // 3a. Handle Binary Audio Chunk (Raw PCM 16-bit, 24kHz, Mono)
    const arrayBuffer = await event.data.arrayBuffer();
    // Play using AudioContext or decode via PCM player
  } else {
    // 3b. Handle Control Messages
    const data = JSON.parse(event.data);
    if (data.type === 'complete') {
      console.log('Stream finished');
      ws.close();
    }
  }
};
```

---

## 5. Voice Cloning (Upload Reference)

Upload a short voice clip to get a persistent `voice_id` to use in TTS requests, avoiding the need to upload the reference file on every TTS generation.

**Endpoint:** `POST /api/v1/generate/upload`
**Content-Type:** `multipart/form-data`

### Required Parameters (FormData)
| Parameter | Type | Value |
| :--- | :--- | :--- |
| `model` | string | `"higgs2p5"` |
| `voice_reference_file`| file | The audio sample (WAV or MP3). |

### Response Schema
```json
{
  "voice_id": "abc123def456..."
}
```