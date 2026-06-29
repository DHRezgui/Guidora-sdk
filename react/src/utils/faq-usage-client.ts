import { resolveSdkAuthBearerTokenAsync } from '../core/auth-token';
import type { NormalizedSDKConfig } from '../types';

const trackedViews = new Set<string>();
const trackedFeedback = new Set<string>();

export function resetFaqUsageTrackingForTests(): void {
  trackedViews.clear();
  trackedFeedback.clear();
}

function buildAuthHeaders(config: NormalizedSDKConfig): Promise<Record<string, string>> {
  return resolveSdkAuthBearerTokenAsync(config).then((token) => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }
    return headers;
  });
}

export async function trackFaqView(config: NormalizedSDKConfig, faqId: string): Promise<void> {
  const dedupeKey = `${config.apiUrl}::${faqId}`;
  if (trackedViews.has(dedupeKey)) return;
  trackedViews.add(dedupeKey);

  try {
    const headers = await buildAuthHeaders(config);
    await fetch(`${config.apiUrl}/faq/entries/${encodeURIComponent(faqId)}/track-view`, {
      method: 'POST',
      headers,
    });
  } catch {
    trackedViews.delete(dedupeKey);
  }
}

export async function trackFaqFeedback(
  config: NormalizedSDKConfig,
  faqId: string,
  helpful: boolean,
): Promise<void> {
  const dedupeKey = `${config.apiUrl}::${faqId}::${helpful ? 'yes' : 'no'}`;
  if (trackedFeedback.has(dedupeKey)) return;
  trackedFeedback.add(dedupeKey);

  try {
    const headers = await buildAuthHeaders(config);
    await fetch(`${config.apiUrl}/faq/entries/${encodeURIComponent(faqId)}/track-feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ helpful }),
    });
  } catch {
    trackedFeedback.delete(dedupeKey);
  }
}
