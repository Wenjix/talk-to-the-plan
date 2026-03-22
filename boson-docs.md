# Boson AI API Documentation Reference

This document compiles the essential endpoints, models, and integration patterns required to use Boson AI's Audio Understanding models. It is optimized for coding agents and developers.

---

## 1. Global Configurations

- **Base URL (Hackathon Endpoint):** `https://hackathon.boson.ai/v1`
- **Format:** OpenAI-compatible Chat Completions
- **Authentication:** All requests require an API key passed in the header:
  `Authorization: Bearer YOUR_API_KEY` (often mapped from `BOSONAI_API_KEY`)

---

## 2. Models Overview

Boson AI provides multimodal audio-understanding models (Audio-in, Text-out) that process both audio and text prompts simultaneously.

| Model ID | Version | Use Case / Notes |
| :--- | :--- | :--- |
| `higgs-audio-understanding-v3.5-Hackathon` | v3.5 | **Recommended (Main).** Stronger instruction following, supports tool use and long system prompts. |
| `higgs-audio-understanding-v3-Hackathon` | v3.0 | **Fallback.** Solid baseline. Use if v3.5 exhibits unexpected edge-case regressions. |

*Note: These models are distinct from standard ASR. They possess native semantic understanding, sentiment analysis, and dynamic language detection (94 languages).*

---

## 3. Audio Preprocessing Requirements (CRITICAL)

Unlike standard APIs that accept raw `.mp3` or `.wav` files via `multipart/form-data`, the Boson Audio Understanding API requires the audio to be pre-processed, chunked, and embedded as base64 strings within an OpenAI-compatible JSON payload.

### The Chunking Pipeline
1. **Resample:** Audio MUST be converted to 16kHz mono.
2. **VAD (Voice Activity Detection):** You MUST use Silero VAD to find speech segments so words aren't cut in half.
3. **Chunking:** Break segments into chunks of **≤4 seconds each**.
4. **Encoding:** Base64 encode each chunk.

*Implementation Note:* It is strongly recommended to use a Python proxy server utilizing the provided `audio_utils.py` (which contains `chunk_audio_file()`) rather than attempting this complex VAD pipeline natively in the browser.

---

## 4. API Request Format (OpenAI Compatible)

**Endpoint:** `POST /chat/completions` (Relative to Base URL)
**Content-Type:** `application/json`

### Required Payload Structure
The API follows standard ChatML but embeds audio chunks as `audio_url` content parts in the `user` message.

```json
{
  "model": "higgs-audio-understanding-v3.5-Hackathon",
  "temperature": 0.2,
  "top_p": 0.9,
  "max_tokens": 2048,
  "stop": ["<|eot_id|>", "<|endoftext|>", "<|audio_eos|>", "<|im_end|>"],
  "extra_body": {"skip_special_tokens": false},
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "Optional text prompt before audio (used mostly for ASR tasks)"},
        {"type": "audio_url", "audio_url": {"url": "data:audio/wav_0;base64,UklGRiQAAABXQVZFZm10..."}},
        {"type": "audio_url", "audio_url": {"url": "data:audio/wav_1;base64,UklGRiQAAABXQVZFZm10..."}}
      ]
    }
  ]
}
```

### Critical API Parameters
Do not modify these parameters; they are required to prevent response formatting breaks:
- `stop`: `["<|eot_id|>", "<|endoftext|>", "<|audio_eos|>", "<|im_end|>"]`
- `extra_body`: `{"skip_special_tokens": false}`
- `temperature`: `0.2` (Recommended default)
- `top_p`: `0.9` (Recommended default)

---

## 5. Prompting Modes & Best Practices

The quality of the output depends heavily on the system prompt. The user prompt is usually left empty (the audio *is* the user input) unless performing strict ASR.

### 5.1 General Audio Understanding (Default)
Provide explicit instructions, constraints, and JSON formatting requirements in the System Prompt.
- **System Prompt:** "You are a medical transcription specialist. Listen to the audio and output a structured clinical note in JSON format."

### 5.2 Thinking Mode (v3.5 Only)
Force the model to reason before answering by appending exactly `"Use Thinking."` to the end of the system prompt. The API will return reasoning wrapped in `<think>...</think>` tags.
- **System Prompt:** "Analyze this meeting audio and extract action items. Use Thinking."

### 5.3 Tool Use / Function Calling (v3.5 Only)
Embed tool schemas directly into the System Prompt wrapped in `<tools>...</tools>` tags.
- The model will reply with `<tool_call>{"name": "func", ...}</tool_call>`.
- The client executes the tool and appends the result to the messages array wrapped in `<tool_response>...</tool_response>`.

### 5.4 Automatic Speech Recognition (ASR)
If you only want exact transcription (no summarization/understanding), you must provide both a system prompt and a text prompt in the user message *before* the audio chunks.
- **System Prompt:** `"You are an automatic speech recognition (ASR) system."`
- **User Text Prompt:** `"Your task is to listen to audio input and output the exact spoken words as plain text."` (Or specify the language: `"...as plain text in Spanish."`)

---

## 6. Python Proxy Implementation Example

Because the frontend browser cannot easily perform Silero VAD and 16kHz resampling, a Python FastAPI proxy should wrap the provided `predict.py` and `audio_utils.py`.

```python
from fastapi import FastAPI, UploadFile, File, Form
from openai import OpenAI
from audio_utils import chunk_audio_file
from predict import build_messages # Helper from starter code that builds the JSON array
import tempfile
import os

app = FastAPI()

@app.post("/api/understand")
async def understand_audio(audio: UploadFile = File(...), system_prompt: str = Form(...)):
    # 1. Save temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # 2. VAD Chunking (from starter code)
        chunks, meta = chunk_audio_file(tmp_path)
        
        # 3. Build Messages Array (from starter code)
        messages = build_messages(chunks, system_prompt=system_prompt)

        # 4. OpenAI Compatible Request
        client = OpenAI(
            base_url="https://hackathon.boson.ai/v1",
            api_key="BOSONAI_API_KEY"
        )
        
        response = client.chat.completions.create(
            model="higgs-audio-understanding-v3.5-Hackathon",
            messages=messages,
            temperature=0.2,
            top_p=0.9,
            max_tokens=2048,
            stop=["<|eot_id|>", "<|endoftext|>", "<|audio_eos|>", "<|im_end|>"],
            extra_body={"skip_special_tokens": False}
        )
        
        return {"text": response.choices[0].message.content.strip()}
    finally:
        os.unlink(tmp_path)
```