import { useCallback, useEffect, useRef, useState } from 'react';
import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import { SDKConfig, TrackBatchResponse, TrackEventInput } from '../types';

export interface UseTrackBatchResult {
  enqueueEvent: (event: TrackEventInput) => Promise<void>;
  flush: () => Promise<TrackBatchResponse | null>;
  pendingCount: number;
  isFlushing: boolean;
  error: string | null;
}

export function useTrackBatch(config?: Partial<SDKConfig>): UseTrackBatchResult {
  const queueRef = useRef<TrackEventInput[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flushInternal = useCallback(
    async (suppressError = false): Promise<TrackBatchResponse | null> => {
      if (queueRef.current.length === 0 || isFlushing) return null;

      setIsFlushing(true);
      if (!suppressError) setError(null);

      const batch = [...queueRef.current];
      queueRef.current = [];
      setPendingCount(0);

      try {
        const resolved = resolveSDKConfig(config);
        return await sdkApiClient.trackBatch(resolved, batch);
      } catch (err) {
        queueRef.current = [...batch, ...queueRef.current];
        setPendingCount(queueRef.current.length);
        const message = err instanceof Error ? err.message : 'Batch tracking failed.';
        if (!suppressError) {
          setError(message);
          throw err;
        }
        return null;
      } finally {
        setIsFlushing(false);
      }
    },
    [config, isFlushing],
  );

  const flush = useCallback(async (): Promise<TrackBatchResponse | null> => {
    return flushInternal(false);
  }, [flushInternal]);

  const enqueueEvent = useCallback(
    async (event: TrackEventInput): Promise<void> => {
      queueRef.current.push(event);
      setPendingCount(queueRef.current.length);

      const resolved = resolveSDKConfig(config);
      if (queueRef.current.length >= resolved.trackBatchSize) {
        await flush();
      }
    },
    [config, flush],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const resolved = resolveSDKConfig(config);

    const id = window.setInterval(() => {
      if (queueRef.current.length > 0 && !isFlushing) {
        void flushInternal(true);
      }
    }, resolved.trackFlushIntervalMs);

    const onFlushOnExit = () => {
      if (queueRef.current.length === 0) return;
      const batch = [...queueRef.current];
      queueRef.current = [];
      setPendingCount(0);
      sdkApiClient.trackBatchKeepalive(resolved, batch);
    };

    window.addEventListener('beforeunload', onFlushOnExit);
    window.addEventListener('pagehide', onFlushOnExit);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', onFlushOnExit);
      window.removeEventListener('pagehide', onFlushOnExit);
    };
  }, [config, flushInternal, isFlushing]);

  return {
    enqueueEvent,
    flush,
    pendingCount,
    isFlushing,
    error,
  };
}
