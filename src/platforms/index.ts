import { readFileSync } from 'node:fs';
import { SessionProvider, SupportedPlatform, SessionData } from './types.js';
import { ClaudeCodeProvider } from './claude-code.js';
import { GeminiCliProvider } from './gemini-cli.js';
import { QChatProvider } from './q-chat.js';

/**
 * Registry of all available session providers
 */
export class PlatformRegistry {
  private providers: Map<SupportedPlatform, SessionProvider> = new Map();

  constructor() {
    // Register all platform providers
    this.registerProvider(new ClaudeCodeProvider());
    this.registerProvider(new GeminiCliProvider());
    this.registerProvider(new QChatProvider());
  }

  private registerProvider(provider: SessionProvider): void {
    this.providers.set(provider.platform, provider);
  }

  /**
   * Get a specific platform provider
   */
  getProvider(platform: SupportedPlatform): SessionProvider | undefined {
    return this.providers.get(platform);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): SessionProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all available providers (those that exist on the current system)
   */
  async getAvailableProviders(): Promise<SessionProvider[]> {
    const providers = this.getAllProviders();
    const availabilityChecks = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        available: await provider.isAvailable()
      }))
    );

    return availabilityChecks
      .filter(check => check.available)
      .map(check => check.provider);
  }

  /**
   * Get provider by platform flag (from CLI options)
   */
  getProviderFromOptions(options: { claude?: boolean; gemini?: boolean; qchat?: boolean }): SessionProvider | null {
    if (options.claude) return this.getProvider('claude-code') || null;
    if (options.gemini) return this.getProvider('gemini-cli') || null;
    if (options.qchat) return this.getProvider('qchat') || null;
    return null;
  }

  /**
   * Validate that only one platform flag is provided
   */
  validatePlatformOptions(options: { claude?: boolean; gemini?: boolean; qchat?: boolean }): void {
    const platformFlags = [options.claude, options.gemini, options.qchat].filter(Boolean);
    
    if (platformFlags.length > 1) {
      throw new Error('Can only specify one platform flag at a time');
    }
  }

  /**
   * Detect which provider can handle the given file
   * @param filePath Path to the file to detect
   * @returns The provider that can handle the file, or null if none match
   */
  async detectProvider(filePath: string): Promise<SessionProvider | null> {
    const providers = this.getAllProviders();
    
    for (const provider of providers) {
      try {
        const isValid = await provider.validateFile(filePath);
        if (isValid) {
          return provider;
        }
      } catch (error) {
        // Continue checking other providers if one fails
        continue;
      }
    }
    
    return null;
  }
}

// Export a singleton instance
export const platformRegistry = new PlatformRegistry();

// Export individual providers for direct usage if needed
export { ClaudeCodeProvider, GeminiCliProvider, QChatProvider };
export * from './types.js';