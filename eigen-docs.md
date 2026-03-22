# Eigen AI API Documentation Reference

This document compiles the essential endpoints, parameters, and patterns required to integrate Eigen AI models into a web application. It is optimized for coding agents and developers.

---

## 1. Global Configurations

- **Base URL (HTTP):** `https://api-web.eigenai.com`
- **Base URL (WebSocket):** `wss://api-web.eigenai.com`
- **Authentication:** All requests require an API key passed in the header:
  `Authorization: Bearer YOUR_API_KEY`

---

## 2. Text-to-Speech (TTS) - HTTP Polling

**Endpoint:** `POST /api/v1/generate`
**Content-Type:** `multipart/form-data`
**Output:** Raw `.wav` audio file (when `stream=false`)

**Recommended Model:** `higgs2p5` (Higgs Audio V2.5 - 24kHz audio)

### Required Parameters (FormData)
| Parameter | Type | Value |
| :--- | :--- | :--- |
| `model` | string | `"higgs2p5"` |
| `text` | string | The text to synthesize. |

### Optional Parameters (FormData)
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `voice` | string | Preset voice name (e.g., `"Linda"`, `"Jack"`). |
| `voice_id` | string | ID of a custom cloned voice (retrieved via `/upload` endpoint). |
| `voice_reference_file` | file | Raw audio file for one-off voice cloning (WAV, MP3). |
| `stream` | boolean | `"false"` (returns WAV file) or `"true"` (HTTP SSE streaming). |
| `voice_settings` | string | JSON string: `{"speed": 1.0}` |
| `sampling` | string | JSON string: `{"temperature": 1.0, "top_p": 0.95, "top_k": 50}` |

### Javascript Fetch Example
```javascript
const form = new FormData();
form.append('model', 'higgs2p5');
form.append('text', 'Hello world');
form.append('voice', 'Linda');
form.append('stream', 'false');

const response = await fetch('https://api-web.eigenai.com/api/v1/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: form
});
const audioBlob = await response.blob();
```

---

## 3. Automatic Speech Recognition (ASR)

*Note: The documentation specifies `whisper_v3_turbo` for the `/api/v1/generate` endpoint, but previous docs mentioned `higgs_asr_3`. If `higgs_asr_3` fails, fall back to `whisper_v3_turbo`.*

**Endpoint:** `POST /api/v1/generate`
**Content-Type:** `multipart/form-data`
**Output:** JSON or plain text transcript.

### Required Parameters (FormData)
| Parameter | Type | Value |
| :--- | :--- | :--- |
| `model` | string | `"higgs_asr_3"` or `"whisper_v3_turbo"` |
| `file` | file | Audio file (MP3, WAV, M4A, OGG, WebM). |

### Optional Parameters (FormData)
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `language` | string | Spoken language code (default `"en"`). |
| `response_format` | string | `"json"` or `"text"`. |

### Javascript Fetch Example
```javascript
const form = new FormData();
form.append('model', 'higgs_asr_3'); // or 'whisper_v3_turbo'
form.append('file', audioBlob, 'recording.webm');
form.append('language', 'en');
form.append('response_format', 'json');

const response = await fetch('https://api-web.eigenai.com/api/v1/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: form
});
const data = await response.json(); // { text: "..." }
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