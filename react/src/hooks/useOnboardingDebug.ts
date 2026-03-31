import { useCallback, useMemo, useState } from 'react';
import { OnboardingDebugLog } from '../types';

export interface UseOnboardingDebugOptions {
  enabled?: boolean;
  maxLogs?: number;
}

export function useOnboardingDebug(options?: UseOnboardingDebugOptions) {
  const enabled = options?.enabled ?? false;
  const maxLogs = options?.maxLogs ?? 200;
  const [logs, setLogs] = useState<OnboardingDebugLog[]>([]);

  const push = useCallback(
    (level: OnboardingDebugLog['level'], message: string, payload?: unknown) => {
      if (!enabled) return;
      const entry: OnboardingDebugLog = {
        timestamp: Date.now(),
        level,
        message,
        payload,
      };

      setLogs((prev) => {
        const next = [...prev, entry];
        return next.slice(Math.max(0, next.length - maxLogs));
      });

      if (level === 'error') console.error('[TrustDev SDK]', message, payload);
      else if (level === 'warn') console.warn('[TrustDev SDK]', message, payload);
      else console.info('[TrustDev SDK]', message, payload);
    },
    [enabled, maxLogs],
  );

  const clearLogs = useCallback(() => setLogs([]), []);

  return useMemo(
    () => ({
      enabled,
      logs,
      info: (message: string, payload?: unknown) => push('info', message, payload),
      warn: (message: string, payload?: unknown) => push('warn', message, payload),
      error: (message: string, payload?: unknown) => push('error', message, payload),
      clearLogs,
    }),
    [clearLogs, enabled, logs, push],
  );
}
