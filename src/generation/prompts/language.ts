export type VoiceLanguage = 'English' | 'Chinese';

/**
 * Append a language instruction to a prompt when the user's language setting
 * is not English. JSON structure keys remain in English for parsing.
 */
export function withLanguage(prompt: string, language: VoiceLanguage): string {
  if (language === 'Chinese') {
    return prompt + '\n\nIMPORTANT: Respond in Mandarin Chinese (中文). All text content in your response must be in Chinese. JSON keys must remain in English.';
  }
  return prompt;
}
