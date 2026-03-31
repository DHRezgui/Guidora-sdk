import { useCallback, useEffect, useState } from 'react';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import { GuidedTour, SDKConfig } from '../types';
import { getCurrentPageUrl } from '../utils/url';

export interface UseActiveToursForUrlOptions {
  url?: string;
  autoFetch?: boolean;
}

export interface UseActiveToursForUrlResult {
  tours: GuidedTour[];
  loading: boolean;
  error: string | null;
  refresh: (nextUrl?: string) => Promise<GuidedTour[]>;
}

export function useActiveToursForUrl(
  config?: Partial<SDKConfig>,
  options?: UseActiveToursForUrlOptions,
): UseActiveToursForUrlResult {
  const [tours, setTours] = useState<GuidedTour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextUrl?: string): Promise<GuidedTour[]> => {
      setLoading(true);
      setError(null);

      try {
        const resolved = resolveSDKConfig(config);
        const url = nextUrl ?? options?.url ?? getCurrentPageUrl();
        const response = await sdkApiClient.getActiveToursForUrl(resolved, url);
        const nextTours = response.tours || [];
        setTours(nextTours);
        return nextTours;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load active tours.';
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
