# Parallax

An audio-native exploration canvas for brainstorming, researching, and generating usable plans. Built for the **Boson AI Hackathon**.

## What it does

Parallax is an interactive planning tool where you explore ideas through a visual graph of questions and insights. You start by entering a topic, and the system generates six follow-up questions along a **Conversation Compass** — clarify, go deeper, challenge, apply, connect, or surprise. From there, you branch out, answer questions, promote key insights, and synthesize everything into a structured plan.

### AI Personas

Each exploration lane is driven by an AI persona with a distinct thinking style. Personas can be individually mapped to different LLM providers and models via Settings:

| Persona | Style | Default Provider |
|---------|-------|-----------------|
| Expansive | Broad, creative, divergent thinking | Mistral |
| Analytical | Structured, evidence-based, rigorous | Mistral |
| Pragmatic | Action-oriented, real-world constraints | Anthropic |
| Socratic | Questioning, dialectic, assumption-testing | Anthropic |

### Core Features

- **Exploration Canvas** — Visual graph (XY Flow) where each node is a question or insight; branch in 6 compass directions via radial menu
- **Dialogue Mode** — Multi-turn dialectic conversations on any node (up to 20 turns with auto-conclude)
- **Node Promotion** — Mark key insights with reasons (reframe, actionable, risk, challenge, cross-link) to feed into plan generation
- **Lane Plans** — Generate structured plans per persona from promoted nodes
- **Plan Synthesis** — Pairwise map-reduce across lane plans to produce a unified plan that resolves contradictions and surfaces synergies
- **Talk to Plan** — Voice-driven plan reflection: speak your thoughts about the plan, and the AI analyzes gaps and proposes edits
- **Vibe Terminal** — Built-in xterm.js terminal with node-pty backend; send any node to the terminal for freeform exploration
- **Session Management** — Multiple sessions persisted to IndexedDB with auto-save

### Voice Integration (Higgs Audio)

- **Eigen AI** (Higgs ASR V3.0 + TTS V2.5) for speech-to-text and text-to-speech in the Talk to Plan modal
- **Boson AI** (Higgs Audio Understanding V3.5) for voice-driven canvas manipulation — speak to a node through the radial menu to branch, promote insights, or start dialogues

## Setup

```bash
git clone https://github.com/Wenjix/talk-to-the-plan.git
cd talk-to-the-plan
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

The app works without any API keys using a built-in **demo provider** that returns realistic placeholder responses. To use real LLM and voice services, configure API keys via the in-app Settings panel or environment variables.

### API Keys

Keys can be set in two ways (Settings panel takes precedence over env vars):

1. **Settings panel** (gear icon in toolbar) — stored in IndexedDB, persists across sessions
2. **Environment variables** — copy `.env.example` to `.env` and fill in values

| Key | Provider | Purpose |
|-----|----------|---------|
| `VITE_MISTRAL_API_KEY` | Mistral | LLM for exploration and plan generation (default provider) |
| `VITE_ANTHROPIC_API_KEY` | Anthropic | LLM for exploration and plan generation |
| `VITE_EIGEN_API_KEY` | Eigen AI | Voice transcription (ASR) and text-to-speech (TTS) |
| `VITE_BOSON_API_KEY` | Boson AI | Audio understanding for voice canvas commands |

At minimum, you need one LLM key (Mistral or Anthropic) to use real AI responses. Without any keys, the demo provider is used automatically.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:full` | Start PTY server + Vite concurrently |
| `npm run build` | Production build |
| `npm run test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier formatting |

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7
- **State:** Zustand (semantic, session, job, view, and plan-talk stores)
- **Canvas:** XY Flow (@xyflow/react)
- **Validation:** Zod 4 (schemas for all LLM response types)
- **Persistence:** IndexedDB (via idb)
- **Voice:** Eigen AI (Higgs Audio), Boson AI (Higgs Audio Understanding)
- **Terminal:** xterm.js with node-pty backend
- **Testing:** Vitest + Testing Library
