import { KeyboardEvent, ReactNode, useEffect, useRef } from 'react';

export interface FocusTrapProps {
  enabled?: boolean;
  children: ReactNode;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => !el.hasAttribute('disabled'));
}

export function FocusTrap({ enabled = true, children }: FocusTrapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !ref.current || typeof document === 'undefined') return;

    const root = ref.current;
    const focusable = getFocusable(root);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [enabled]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled || event.key !== 'Tab' || !ref.current) return;

    const focusable = getFocusable(ref.current);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
