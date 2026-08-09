import { UsageStats, TrainingBlock, IntentionData } from './types';

export abstract class AIProvider {
  protected abstract config: any;

  abstract getUsage(): Promise<UsageStats>;
  // getModels() removed in Sprint 7.2 T7 (PM correction): the model catalog is
  // served by the edge function (manage-agent-settings?action=models), not by a
  // provider class. Leaving it abstract broke the build with TS2515 — invisible
  // to `vite build`, which uses esbuild and does not typecheck.
  abstract createTrainingBlock(data: TrainingBlock): Promise<void>;
  abstract manageIntentions(data: IntentionData): Promise<void>;
}
