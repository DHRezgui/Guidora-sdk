import {
  ActiveToursResponse,
  ContextualFeedbackAggregatesResponse,
  NormalizedSDKConfig,
  PublishContextualDraftsRequest,
  PublishContextualDraftsResponse,
  SubmitContextualFeedbackRequest,
  SubmitContextualFeedbackResponse,
  TrackBatchResponse,
  TrackEventInput,
  TrackEventResponse,
} from '../types';
import { resolveSdkAuthBearerTokenAsync } from './auth-token';

async function buildHeaders(config: NormalizedSDKConfig): Promise<Record<string, string>> {
  const token = await resolveSdkAuthBearerTokenAsync(config);

  const headers: Record<string, string> = {};

  if (!token && config.apiKey) {
    headers['x-api-key'] = config.apiKey;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function request<T>(config: NormalizedSDKConfig, path: string, init?: RequestInit): Promise<T> {
  const hasBody = typeof init?.body !== 'undefined' && init?.body !== null;
  const method = (init?.method || 'GET').toUpperCase();
  const shouldSendJsonContentType = hasBody && method !== 'GET' && method !== 'HEAD';

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(await buildHeaders(config)),
      ...(shouldSendJsonContentType ? { 'Content-Type': 'application/json' } : {}),
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

  void (async () => {
    const headers = await buildHeaders(config);

    if (typeof fetch === 'function') {
      try {
        await fetch(`${config.apiUrl}/tracking/events/batch`, {
          method: 'POST',
          headers,
          body,
          keepalive: true,
        });
      } catch {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([body], { type: 'application/json' });
          navigator.sendBeacon(`${config.apiUrl}/tracking/events/batch`, blob);
        }
      }
      return;
    }

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(`${config.apiUrl}/tracking/events/batch`, blob);
    }
  })();
}

export const sdkApiClient = {
  getActiveToursForUrl(config: NormalizedSDKConfig, url: string): Promise<ActiveToursResponse> {
    const encodedUrl = encodeURIComponent(url);
    // Use a query cache-buster instead of no-store headers to avoid CORS preflight issues.
    const cacheBuster = Date.now();
    return request<ActiveToursResponse>(config, `/tours/active/url?url=${encodedUrl}&_ts=${cacheBuster}`, {
      method: 'GET',
    });
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

  submitContextualFeedback(
    config: NormalizedSDKConfig,
    payload: SubmitContextualFeedbackRequest,
  ): Promise<SubmitContextualFeedbackResponse> {
    return request<SubmitContextualFeedbackResponse>(config, '/tours/contextual/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  submitContextualFeedbackKeepalive(
    config: NormalizedSDKConfig,
    payload: SubmitContextualFeedbackRequest,
  ): void {
    if (typeof window === 'undefined') return;
    const body = JSON.stringify(payload);

    void (async () => {
      const headers = {
        ...(await buildHeaders(config)),
        'Content-Type': 'application/json',
      };

      if (typeof fetch === 'function') {
        try {
          await fetch(`${config.apiUrl}/tours/contextual/feedback`, {
            method: 'POST',
            headers,
            body,
            keepalive: true,
          });
        } catch {
          if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(`${config.apiUrl}/tours/contextual/feedback`, blob);
          }
        }
        return;
      }

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(`${config.apiUrl}/tours/contextual/feedback`, blob);
      }
    })();
  },

  getContextualFeedbackAggregates(
    config: NormalizedSDKConfig,
    options?: { targetUrl?: string; limit?: number },
  ): Promise<ContextualFeedbackAggregatesResponse> {
    const params = new URLSearchParams();
    if (options?.targetUrl) params.set('targetUrl', options.targetUrl);
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    return request<ContextualFeedbackAggregatesResponse>(
      config,
      `/tours/contextual/feedback/aggregates${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
    );
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

  dismissTourForCurrentUser(
    config: NormalizedSDKConfig,
    tourId: string,
    audience?: 'sandbox' | 'production',
  ): Promise<unknown> {
    const qs = audience ? `?audience=${encodeURIComponent(audience)}` : '';
    return request<unknown>(config, `/tours/${tourId}/dismiss${qs}`, {
      method: 'POST',
    });
  },

  completeTourForCurrentUser(
    config: NormalizedSDKConfig,
    tourId: string,
    audience?: 'sandbox' | 'production',
  ): Promise<unknown> {
    const qs = audience ? `?audience=${encodeURIComponent(audience)}` : '';
    return request<unknown>(config, `/tours/${tourId}/complete${qs}`, {
      method: 'POST',
    });
  },
};
