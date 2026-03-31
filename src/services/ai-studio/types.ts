export interface UsageStats {
  creditsAvailable: number;
  creditsUsed: number;
  currency: string;
}

export interface ModelInfo {
  id: string;
  provider: 'OpenAI' | 'Anthropic' | 'Meta' | 'Alibaba' | 'Deepseek' | 'Maritaca' | string;
  name: string;
  costPerRequest: number;
  isNew?: boolean;
  isBeta?: boolean;
  isDeprecated?: boolean;
}

export type TrainingBlockType = 'text' | 'website' | 'video' | 'document';

export interface TrainingBlock {
  type: TrainingBlockType;
  content: string; // text content, URL, or document reference
  metadata?: Record<string, any>;
}

export interface WebhookAction {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  payloadSchema?: Record<string, any>; // JSON structure for dynamic payloads
  headers?: Record<string, string>;
}

export interface IntentionData {
  id?: string;
  name: string;
  triggers: string[]; // Keywords to trigger this intention
  webhookAction?: WebhookAction;
}

export interface AIProviderConfig {
  apiKey: string;
  apiUrl?: string;
  [key: string]: any;
}
