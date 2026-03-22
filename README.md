# Talk to the Plan

An audio-native exploration canvas for brainstorming, researching, and generating usable plans. Built for the **Boson AI Hackathon**.

## What it does

Talk to the Plan is an interactive planning tool where you explore ideas through a visual graph. Each node represents a question or insight, and you branch out in six directions: clarify, go deeper, challenge, apply, connect, or surprise. Four AI personas (expansive, analytical, pragmatic, socratic) provide different perspectives on your topic.

### Voice Integration (Higgs Audio)

- **Eigen AI** (Higgs ASR V3.0 + TTS V2.5) for speech-to-text and text-to-speech in the Talk to Plan modal
- **Boson AI** (Higgs Audio Understanding V3.5) for voice-driven canvas manipulation — speak to a node through the radial menu to branch, promote insights, or start dialogues

## Setup

```bash
git clone https://github.com/Wenjix/talk-to-the-plan.git
cd talk-to-the-plan
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
```

Open `http://localhost:5173` in your browser.

## API Keys

| Key | Provider | Purpose |
|-----|----------|---------|
| `VITE_GEMINI_API_KEY` | Google | Primary LLM for exploration and plan generation |
| `VITE_MISTRAL_API_KEY` | Mistral | Alternative LLM provider |
| `VITE_ANTHROPIC_API_KEY` | Anthropic | Alternative LLM provider |
| `VITE_OPENAI_API_KEY` | OpenAI | Alternative LLM provider |
| `VITE_EIGEN_API_KEY` | Eigen AI | Voice transcription (ASR) and text-to-speech (TTS) |
| `VITE_BOSON_API_KEY` | Boson AI | Audio understanding for voice canvas commands |

At minimum, you need one LLM key (Gemini recommended) to use the exploration canvas.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:full` | Start PTY server + Vite concurrently |
| `npm run build` | Production build |
| `npm run test` | Run tests |
| `npm run lint` | Lint check |

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7
- **State:** Zustand
- **Canvas:** XY Flow (@xyflow/react)
- **Persistence:** IndexedDB (via idb)
- **Voice:** Eigen AI (Higgs Audio), Boson AI (Higgs Audio Understanding)
- **Terminal:** xterm.js with node-pty backend
