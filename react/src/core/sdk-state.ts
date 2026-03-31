import { NormalizedSDKConfig, SDKConfig, SDKInitResult } from '../types';

export const SDK_VERSION = '0.1.0';
const DEFAULT_API_URL = 'http://localhost:3002/api/v1';

let currentConfig: NormalizedSDKConfig | null = null;

function normalizeConfig(config: SDKConfig): NormalizedSDKConfig {
  if (!config.apiKey) {
    throw new Error('[TrustDev SDK] "apiKey" is required.');
  }

  return {
    apiKey: config.apiKey,
    apiUrl: config.apiUrl ?? DEFAULT_API_URL,
    sdkToken: config.sdkToken,
    accessToken: config.accessToken,
    getAccessToken: config.getAccessToken,
    organizationId: config.organizationId,
    debug: config.debug ?? false,
    trackBatchSize: config.trackBatchSize ?? 20,
    trackFlushIntervalMs: config.trackFlushIntervalMs ?? 5000,
  };
}

export function initSDK(config: SDKConfig): SDKInitResult {
  currentConfig = normalizeConfig(config);

  return {
    status: 'initialized',
    version: SDK_VERSION,
    config: currentConfig,
  };
}

export function getSDKConfig(): NormalizedSDKConfig | null {
  return currentConfig;
}

export function resolveSDKConfig(config?: Partial<SDKConfig>): NormalizedSDKConfig {
  if (config?.apiKey) {
    return normalizeConfig(config as SDKConfig);
  }

  if (!currentConfig) {
    throw new Error(
      '[TrustDev SDK] SDK not initialized. Call initSDK(...) first or pass a hook config with apiKey.',
    );
  }

  return currentConfig;
}
