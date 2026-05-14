import { useCallback, useMemo, useState } from 'react';
import { findElement } from '../utils/dom-utils';

export interface ResolveOptions {
  retries?: number;
  intervalMs?: number;
  preferredText?: string;
  preferActive?: boolean;
}

export interface UseTourTargetResolverResult {
  resolveTarget: (selector?: string, options?: ResolveOptions) => Promise<HTMLElement | null>;
  isResolving: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useTourTargetResolver(): UseTourTargetResolverResult {
  const [isResolving, setIsResolving] = useState(false);

  const resolveTarget = useCallback(
    async (selector?: string, options?: ResolveOptions): Promise<HTMLElement | null> => {
      if (!selector) return null;

      const retries = options?.retries ?? 8;
      const intervalMs = options?.intervalMs ?? 300;

      setIsResolving(true);
      try {
        for (let i = 0; i <= retries; i += 1) {
          const element = findElement(selector, {
            preferredText: options?.preferredText,
            preferActive: options?.preferActive,
          });
          if (element) return element;
          if (i < retries) await sleep(intervalMs);
        }
        return null;
      } finally {
        setIsResolving(false);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      resolveTarget,
      isResolving,
    }),
    [resolveTarget, isResolving],
  );
}
