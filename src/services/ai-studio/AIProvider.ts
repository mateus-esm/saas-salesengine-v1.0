import { UsageStats, ModelInfo, TrainingBlock, IntentionData } from './types';

export abstract class AIProvider {
  protected abstract config: any;

  abstract getUsage(): Promise<UsageStats>;
  abstract getModels(): Promise<ModelInfo[]>;
  abstract createTrainingBlock(data: TrainingBlock): Promise<void>;
  abstract manageIntentions(data: IntentionData): Promise<void>;
}
