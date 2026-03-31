import { ActiveToursResponse, NormalizedSDKConfig, TrackBatchResponse, TrackEventInput, TrackEventResponse } from '../types';

function buildHeaders(config: NormalizedSDKConfig): Record<string, string> {
  const token = config.sdkToken || config.getAccessToken?.() || config.accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request<T>(
  config: NormalizedSDKConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(config),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[TrustDev SDK] API ${response.status}: ${text || response.statusText}`);
  }

  return (await response.json()) as T;
}

export const sdkApiClient = {
  getActiveToursForUrl(config: NormalizedSDKConfig, url: string): Promise<ActiveToursResponse> {
    const encodedUrl = encodeURIComponent(url);
    return request<ActiveToursResponse>(config, `/tours/active/url?url=${encodedUrl}`);
  },

  trackEvent(config: NormalizedSDKConfig, event: TrackEventInput): Promise<TrackEventResponse> {
    return request<TrackEventResponse>(config, '/tracking/events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },

  trackBatch(config: NormalizedSDKConfig, events: TrackEventInput[]): Promise<TrackBatchResponse> {
    return request<TrackBatchResponse>(config, '/tracking/events/batch', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
  },
};
