import {
  ActiveToursResponse,
  NormalizedSDKConfig,
  PublishContextualDraftsRequest,
  PublishContextualDraftsResponse,
  TrackBatchResponse,
  TrackEventInput,
  TrackEventResponse,
} from '../types';

function buildHeaders(config: NormalizedSDKConfig): Record<string, string> {
  const token = config.sdkToken || config.getAccessToken?.() || config.accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // For authenticated dashboard flows, JWT is sufficient and avoids extra CORS preflight constraints.
  if (!token && config.apiKey) {
    headers['x-api-key'] = config.apiKey;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request<T>(config: NormalizedSDKConfig, path: string, init?: RequestInit): Promise<T> {
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

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

function sendKeepaliveBatch(config: NormalizedSDKConfig, events: TrackEventInput[]): void {
  const body = JSON.stringify({ events });

  if (typeof window === 'undefined') return;

  if (typeof fetch === 'function') {
    void fetch(`${config.apiUrl}/tracking/events/batch`, {
      method: 'POST',
      headers: buildHeaders(config),
      body,
      keepalive: true,
    }).catch(() => {
      // Fallback best effort when keepalive fails.
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(`${config.apiUrl}/tracking/events/batch`, blob);
      }
    });
    return;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(`${config.apiUrl}/tracking/events/batch`, blob);
  }
}

export const sdkApiClient = {
  getActiveToursForUrl(config: NormalizedSDKConfig, url: string): Promise<ActiveToursResponse> {
    const encodedUrl = encodeURIComponent(url);
    return request<ActiveToursResponse>(config, `/tours/active/url?url=${encodedUrl}`);
  },

  publishContextualDrafts(
    config: NormalizedSDKConfig,
    payload: PublishContextualDraftsRequest,
  ): Promise<PublishContextualDraftsResponse> {
    return request<PublishContextualDraftsResponse>(config, '/tours/contextual/publish', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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

  trackBatchKeepalive(config: NormalizedSDKConfig, events: TrackEventInput[]): void {
    sendKeepaliveBatch(config, events);
  },
};
