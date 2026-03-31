import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface TourPortalProps {
  children: ReactNode;
  containerId?: string;
}

export function TourPortal({ children, containerId = 'trustdev-tour-portal' }: TourPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let target = document.getElementById(containerId);
    if (!target) {
      target = document.createElement('div');
      target.id = containerId;
      document.body.appendChild(target);
    }

    setContainer(target);
  }, [containerId]);

  if (!container) return null;
  return createPortal(children, container);
}
