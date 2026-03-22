import { OpenAICompatibleProvider } from './openai-compat';
import { PROVIDER_MODELS } from './types';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      apiKey,
      'https://api.mistral.ai/v1/chat/completions',
      PROVIDER_MODELS.mistral,
      'Mistral API',
    );
  }
}
