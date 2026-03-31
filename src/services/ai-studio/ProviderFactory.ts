import { AIProvider } from './AIProvider';
import { GPTMakerProvider } from './providers/GPTMakerProvider';

export class ProviderFactory {
  private static instance: AIProvider | null = null;

  static getProvider(): AIProvider {
    if (!this.instance) {
      // Default to GPTMakerProvider for now
      // API Key could be sourced from env vars
      this.instance = new GPTMakerProvider({
        apiKey: import.meta.env?.VITE_AI_PROVIDER_KEY || 'default-key',
      });
    }
    return this.instance;
  }

  static setProvider(provider: AIProvider): void {
    this.instance = provider;
  }
}
