/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MISTRAL_API_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
  readonly VITE_TERMINAL_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
