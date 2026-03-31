import { useCallback, useState } from 'react';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import { SDKConfig, TrackEventInput, TrackEventResponse } from '../types';

export interface UseTrackEventResult {
  trackEvent: (event: TrackEventInput) => Promise<TrackEventResponse>;
  isSending: boolean;
  error: string | null;
}

export function useTrackEvent(config?: Partial<SDKConfig>): UseTrackEventResult {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trackEvent = useCallback(
    async (event: TrackEventInput): Promise<TrackEventResponse> => {
      setIsSending(true);
      setError(null);

      try {
        const resolved = resolveSDKConfig(config);
        const response = await sdkApiClient.trackEvent(resolved, event);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Tracking event failed.';
        setError(message);
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [config],
  );

  return {
    trackEvent,
    isSending,
    error,
  };
}
