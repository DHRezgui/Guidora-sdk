import { useEffect } from 'react';

export interface UseRealtimeToursSyncOptions {
  enabled?: boolean;
  intervalMs?: number;
  onSync: () => Promise<unknown>;
  onError?: (error: unknown) => void;
  syncOnFocus?: boolean;
  syncOnReconnect?: boolean;
}

export function useRealtimeToursSync(options: UseRealtimeToursSyncOptions): void {
  const enabled = options.enabled ?? true;
  const intervalMs = options.intervalMs ?? 15000;
  const syncOnFocus = options.syncOnFocus ?? true;
  const syncOnReconnect = options.syncOnReconnect ?? true;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const syncNow = async () => {
      try {
        await options.onSync();
      } catch (error) {
        options.onError?.(error);
      }
    };

    const intervalId = window.setInterval(() => {
      void syncNow();
    }, intervalMs);

    const onFocus = () => {
      if (!syncOnFocus) return;
      if (document.visibilityState === 'hidden') return;
      void syncNow();
    };

    const onOnline = () => {
      if (!syncOnReconnect) return;
      void syncNow();
    };

    if (syncOnFocus) {
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
    }

    if (syncOnReconnect) {
      window.addEventListener('online', onOnline);
    }

    return () => {
      window.clearInterval(intervalId);
      if (syncOnFocus) {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
      }
      if (syncOnReconnect) {
        window.removeEventListener('online', onOnline);
      }
    };
  }, [enabled, intervalMs, options.onError, options.onSync, syncOnFocus, syncOnReconnect]);
}
