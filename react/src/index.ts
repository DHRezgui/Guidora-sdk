import './styles/index.css';

export const VERSION = '0.1.0';

export interface SDKConfig {
  apiKey: string;
  apiUrl?: string;
  debug?: boolean;
}

export interface SDKInitResult {
  status: 'initialized';
  version: string;
  config: Required<Pick<SDKConfig, 'apiKey' | 'apiUrl' | 'debug'>>;
}

export const initSDK = (config: SDKConfig): SDKInitResult => {
  const normalizedConfig = {
    apiKey: config.apiKey,
    apiUrl: config.apiUrl ?? 'http://localhost:3002/api/v1',
    debug: config.debug ?? false,
  };

  if (!normalizedConfig.apiKey) {
    throw new Error('[TrustDev SDK] "apiKey" is required.');
  }

  return {
    status: 'initialized',
    version: VERSION,
    config: normalizedConfig,
  };
};