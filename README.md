# Parallax

**Think and talk in parallax.** An audio-native AI canvas for exploring ideas — speak your thoughts, branch in six directions, and see them from four distinct perspectives.

Built for the **Boson AI x Eigen AI Hackathon**.

## The problem

AI brainstorming today is a tunnel. One chat. One voice. No peripheral vision. You scroll deeper into the same thread and lose sight of the bigger picture.

## What Parallax does

Parallax turns brainstorming into a visual exploration. Enter a topic and branch out across six paths — clarify, go deeper, challenge, apply, connect, or surprise. Four AI personas think alongside you, each with a distinct style:

- **Expansive** — big-picture, creative, divergent
- **Analytical** — structured, evidence-based, rigorous
- **Pragmatic** — action-oriented, real-world constraints
- **Socratic** — questioning, assumption-testing

Speak directly to any node through voice commands. Promote key insights. Generate a structured plan from everything you've explored.

## Voice integration (Higgs Audio)

- **Eigen AI** (Higgs ASR V3.0 + TTS V2.5) — speech-to-text and text-to-speech
- **Boson AI** (Higgs Audio Understanding V3.5) — voice-driven canvas commands: speak to branch, promote, or start dialogues

## Setup

```bash
git clone https://github.com/Wenjix/talk-to-the-plan.git
cd talk-to-the-plan
npm install
npm run dev
```

Open `http://localhost:5173`. Works without API keys using a built-in demo provider.

## API keys

Configure via the in-app Settings panel (gear icon) or environment variables (copy `.env.example` to `.env`):

| Key | Provider | Purpose |
|-----|----------|---------|
| `VITE_MISTRAL_API_KEY` | Mistral | LLM generation (default) |
| `VITE_ANTHROPIC_API_KEY` | Anthropic | LLM generation |
| `VITE_EIGEN_API_KEY` | Eigen AI | Voice transcription + TTS |
| `VITE_BOSON_API_KEY` | Boson AI | Voice canvas commands |

## Tech stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 19, TypeScript 5.9 | UI components and type safety |
| Build | Vite 7 | Dev server and production bundling |
| State | Zustand 5 | Lightweight store management |
| Canvas | XY Flow 12 (@xyflow/react) | Node graph rendering and interaction |
| Validation | Zod 4 | Runtime schema validation for LLM responses |
| Persistence | IndexedDB (idb 8) | Local session and settings storage |
| Voice | Eigen AI (Higgs Audio), Boson AI | ASR, TTS, and audio understanding |
| LLMs | Mistral, Anthropic | Multi-provider generation with per-persona routing |
| Terminal | xterm.js 6, node-pty | Embedded terminal for freeform exploration |
| Testing | Vitest 4, Testing Library | Unit and component tests |
