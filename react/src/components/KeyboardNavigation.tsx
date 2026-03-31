import { useEffect } from 'react';

export interface KeyboardNavigationProps {
  enabled?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  onClose?: () => void;
  onSkip?: () => void;
}

export function KeyboardNavigation({
  enabled = true,
  onNext,
  onPrev,
  onClose,
  onSkip,
}: KeyboardNavigationProps) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        onClose?.();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        onNext?.();
        return;
      }

      if (event.key === 'ArrowLeft') {
        onPrev?.();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        onSkip?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, onClose, onNext, onPrev, onSkip]);

  return null;
}
