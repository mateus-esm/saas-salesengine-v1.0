import { AIProvider } from '../AIProvider';
import { UsageStats, ModelInfo, TrainingBlock, IntentionData, AIProviderConfig } from '../types';

export class GPTMakerProvider extends AIProvider {
  protected config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    super();
    this.config = config;
  }

  async getUsage(): Promise<UsageStats> {
    // Mocked implementation based on HTML context
    // In the future this will be replaced with a real API call to GPT Maker
    return {
      creditsAvailable: 1464,
      creditsUsed: 0,
      currency: 'créditos'
    };
  }

  async getModels(): Promise<ModelInfo[]> {
    // Hardcoded models extracted from the GPT Maker context
    return [
      { id: 'gpt-5.4-mini', provider: 'OpenAI', name: 'GPT-5.4 Mini', costPerRequest: 2, isNew: true },
      { id: 'gpt-5.4', provider: 'OpenAI', name: 'GPT-5.4', costPerRequest: 7 },
      { id: 'gpt-5.2', provider: 'OpenAI', name: 'GPT-5.2', costPerRequest: 5 },
      { id: 'gpt-5.1', provider: 'OpenAI', name: 'GPT-5.1', costPerRequest: 4 },
      { id: 'gpt-5', provider: 'OpenAI', name: 'GPT-5', costPerRequest: 4 },
      { id: 'gpt-5-mini', provider: 'OpenAI', name: 'GPT-5 Mini', costPerRequest: 1 },
      { id: 'gpt-4.1', provider: 'OpenAI', name: 'GPT-4.1', costPerRequest: 4 },
      { id: 'gpt-4.1-mini', provider: 'OpenAI', name: 'GPT-4.1 Mini', costPerRequest: 1 },
      { id: 'o4-mini', provider: 'OpenAI', name: 'o4-Mini', costPerRequest: 3 },
      { id: 'o3', provider: 'OpenAI', name: 'o3', costPerRequest: 5 },
      { id: 'gpt-4o-mini', provider: 'OpenAI', name: 'GPT-4o Mini', costPerRequest: 1 },
      { id: 'gpt-4o', provider: 'OpenAI', name: 'GPT-4o', costPerRequest: 5 },
      { id: 'o3-mini', provider: 'OpenAI', name: 'o3-Mini (Beta)', costPerRequest: 3, isBeta: true },
      { id: 'o1', provider: 'OpenAI', name: 'o1', costPerRequest: 25 },
      { id: 'gpt-4-turbo', provider: 'OpenAI', name: 'GPT-4 Turbo', costPerRequest: 20 },
      
      { id: 'claude-4.5-sonnet', provider: 'Anthropic', name: 'Claude 4.5 Sonnet', costPerRequest: 10 },
      { id: 'claude-4.5-haiku', provider: 'Anthropic', name: 'Claude 4.5 Haiku', costPerRequest: 3, isNew: true },
      { id: 'claude-3.5-sonnet', provider: 'Anthropic', name: 'Claude 3.5 Sonnet', costPerRequest: 10, isDeprecated: true },
      { id: 'claude-3.7-sonnet', provider: 'Anthropic', name: 'Claude 3.7 Sonnet', costPerRequest: 10, isDeprecated: true },
      { id: 'claude-3.5-haiku', provider: 'Anthropic', name: 'Claude 3.5 Haiku', costPerRequest: 2, isDeprecated: true },
      
      { id: 'llama-3.3', provider: 'Meta', name: 'LlAMA 3.3', costPerRequest: 1 },
      { id: 'qwen-2.5-max', provider: 'Alibaba', name: 'Qwen 2.5 Max', costPerRequest: 3 },
      { id: 'deepseek-v3', provider: 'Deepseek', name: 'Deepseek V3', costPerRequest: 1 },
      { id: 'sabia-3.1', provider: 'Maritaca', name: 'Sabiá 3.1', costPerRequest: 3, isNew: true },
      { id: 'sabia-3', provider: 'Maritaca', name: 'Sabiá 3', costPerRequest: 3 },
    ];
  }

  async createTrainingBlock(data: TrainingBlock): Promise<void> {
    console.log('[GPTMakerProvider] Creating training block:', data);
    // TODO: Implement actual API integration
  }

  async manageIntentions(data: IntentionData): Promise<void> {
    console.log('[GPTMakerProvider] Managing intention:', data);
    // TODO: Implement actual API integration
  }
}
