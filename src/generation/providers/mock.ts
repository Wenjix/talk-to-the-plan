import type { GenerationProvider } from './types';

const MOCK_DELAY = 100; // ms

const MOCK_ANSWER = JSON.stringify({
  summary: "This is a mock answer for testing purposes.",
  bullets: [
    "Mock point 1: Testing the generation pipeline",
    "Mock point 2: Verifying JSON parsing",
    "Mock point 3: Checking schema validation",
  ],
});

const MOCK_BRANCHES = JSON.stringify({
  branches: [
    { question: "Mock follow-up question 1?", pathType: "go-deeper", quality: { novelty: 0.8, specificity: 0.7, challenge: 0.5 } },
    { question: "Mock follow-up question 2?", pathType: "challenge", quality: { novelty: 0.6, specificity: 0.8, challenge: 0.9 } },
    { question: "Mock follow-up question 3?", pathType: "connect", quality: { novelty: 0.7, specificity: 0.6, challenge: 0.4 } },
  ],
});

const MOCK_PATH_QUESTIONS = JSON.stringify({
  paths: {
    clarify: "Mock: What exactly do you mean by this?",
    "go-deeper": "Mock: Can you elaborate on the core mechanism?",
    challenge: "Mock: What evidence supports this assumption?",
    apply: "Mock: How would this work in practice?",
    connect: "Mock: How does this relate to adjacent domains?",
    surprise: "Mock: What if the opposite were true?",
  },
});

function detectResponseType(prompt: string): string {
  if (prompt.includes('path_questions') || prompt.includes('Conversation Compass') || prompt.includes('"paths"')) {
    return MOCK_PATH_QUESTIONS;
  }
  if (prompt.includes('branch') || prompt.includes('follow-up questions') || prompt.includes('"branches"')) {
    return MOCK_BRANCHES;
  }
  return MOCK_ANSWER;
}

export class MockProvider implements GenerationProvider {
  async generate(prompt: string): Promise<string> {
    await new Promise(r => setTimeout(r, MOCK_DELAY));
    return detectResponseType(prompt);
  }

  async generateStream(prompt: string, onChunk: (delta: string) => void): Promise<string> {
    const response = detectResponseType(prompt);
    // Simulate streaming by sending chunks
    const chunkSize = 20;
    for (let i = 0; i < response.length; i += chunkSize) {
      await new Promise(r => setTimeout(r, 10));
      onChunk(response.slice(i, i + chunkSize));
    }
    return response;
  }
}
