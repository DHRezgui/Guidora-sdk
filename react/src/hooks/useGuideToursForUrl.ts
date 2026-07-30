import { useCallback, useEffect, useState } from 'react';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import { GuidedTour, SDKConfig } from '../types';
import { getCurrentPageUrl } from '../utils/url';

export interface UseGuideToursForUrlOptions {
  url?: string;
  autoFetch?: boolean;
}

export interface UseGuideToursForUrlResult {
  tours: GuidedTour[];
  loading: boolean;
  error: string | null;
  refresh: (nextUrl?: string) => Promise<GuidedTour[]>;
}

function buildUrlCandidates(baseUrl: string): string[] {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return ['/'];

  const candidates: string[] = [trimmed];
  const add = (value?: string | null) => {
    if (!value) return;
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (typeof window !== 'undefined') {
    add(window.location.pathname);
    add(window.location.pathname + window.location.search);
    add(window.location.origin + window.location.pathname);
    add(window.location.href);
  }

  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    add(parsed.pathname);
    add(parsed.pathname + parsed.search);
    add(parsed.origin + parsed.pathname);
    add(parsed.href);
  } catch {
    // Ignore invalid candidate parsing and keep original URL.
  }

  return candidates;
}

/** Loads curated Aide > Guides tours (`showInGuides`) for the current page URL. */
export function useGuideToursForUrl(
  config?: Partial<SDKConfig>,
  options?: UseGuideToursForUrlOptions,
): UseGuideToursForUrlResult {
  const [tours, setTours] = useState<GuidedTour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextUrl?: string): Promise<GuidedTour[]> => {
      setLoading(true);
      setError(null);

      try {
        const resolved = resolveSDKConfig(config);
        const requestedUrl = nextUrl ?? options?.url ?? getCurrentPageUrl();
        const candidates = buildUrlCandidates(requestedUrl);

        for (const candidate of candidates) {
          const response = await sdkApiClient.getGuideToursForUrl(resolved, candidate);
          const nextTours = response.tours || [];
          if (nextTours.length > 0) {
            setTours(nextTours);
            return nextTours;
          }
        }

        setTours([]);
        return [];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load guide tours.';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [config, options?.url],
  );

  useEffect(() => {
    if (options?.autoFetch === false) return;
    void refresh();
  }, [options?.autoFetch, refresh]);

  return {
    tours,
    loading,
    error,
    refresh,
  };
}
