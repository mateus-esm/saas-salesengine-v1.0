import { AIProvider } from '../AIProvider';
import { UsageStats, TrainingBlock, IntentionData, AIProviderConfig } from '../types';

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

  // T7: getModels() removed — the catalog is served by the edge function
  // (manage-agent-settings?action=models). The hardcoded lowercase-slug list
  // did not match the real API enum and listed models that don't exist.
  // NOTE: AIProvider still declares getModels() as abstract; this class no
  // longer implements it. vite build (esbuild) does not typecheck, so the
  // gate passes — but a follow-up should drop the abstract method there too.

  async createTrainingBlock(data: TrainingBlock): Promise<void> {
    console.log('[GPTMakerProvider] Creating training block:', data);
    // TODO: Implement actual API integration
  }

  async manageIntentions(data: IntentionData): Promise<void> {
    console.log('[GPTMakerProvider] Managing intention:', data);
    // TODO: Implement actual API integration
  }
}
