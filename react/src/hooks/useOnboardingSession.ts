import { useCallback, useEffect, useState } from 'react';
import { getOrCreateSessionId, resetSessionId } from '../utils/storage';

export interface UseOnboardingSessionResult {
  sessionId: string;
  startedAt: number;
  restartSession: () => string;
}

export function useOnboardingSession(): UseOnboardingSessionResult {
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());

  const restartSession = useCallback(() => {
    const next = resetSessionId();
    setSessionId(next);
    setStartedAt(Date.now());
    return next;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setSessionId(getOrCreateSessionId());
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    return () => window.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return {
    sessionId,
    startedAt,
    restartSession,
  };
}
