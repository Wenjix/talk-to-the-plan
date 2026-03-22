import { OpenAICompatibleProvider } from './openai-compat';
import { PROVIDER_MODELS } from './types';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      apiKey,
      'https://api.openai.com/v1/chat/completions',
      PROVIDER_MODELS.openai,
      'OpenAI API',
      'max_completion_tokens',
    );
  }
}
