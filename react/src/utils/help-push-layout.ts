const PUSH_DATA_ATTR = 'data-trustdev-push-shifted';
const DEFAULT_PUSH_SELECTORS = [
  'body > *:not([data-trustdev-help-sidebar]):not([data-trustdev-faq-panel])',
];

export function resolveHelpPushWidthPx(): number {
  if (typeof window === 'undefined') return 400;
  return Math.min(400, window.innerWidth * 0.3, Math.max(0, window.innerWidth - 48));
}

function isFullViewportWidth(element: HTMLElement): boolean {
  const computed = getComputedStyle(element);
  if (computed.width === '100vw') return true;
  return element.classList.contains('w-screen');
}

export function resolveHelpPushTargets(selector?: string | string[]): HTMLElement[] {
  const selectors = selector
    ? Array.isArray(selector)
      ? selector
      : selector
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
    : DEFAULT_PUSH_SELECTORS;

  const seen = new Set<HTMLElement>();
  const targets: HTMLElement[] = [];

  for (const entry of selectors) {
    document.querySelectorAll(entry).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.closest('[data-trustdev-help-sidebar], [data-trustdev-faq-panel]')) return;
      if (seen.has(node)) return;
      seen.add(node);
      targets.push(node);
    });
  }

  return targets;
}

export function applyHelpPushLayout(
  side: 'left' | 'right',
  pushTargetSelector?: string | string[],
): () => void {
  const pushPx = resolveHelpPushWidthPx();
  const targets = resolveHelpPushTargets(pushTargetSelector);
  const marginProp = side === 'right' ? 'marginRight' : 'marginLeft';

  const snapshots = targets.map((element) => ({
    element,
    marginRight: element.style.marginRight,
    marginLeft: element.style.marginLeft,
    width: element.style.width,
    maxWidth: element.style.maxWidth,
    transition: element.style.transition,
    shrinkWidth: isFullViewportWidth(element),
  }));

  const widthExpr = `calc(100vw - ${pushPx}px)`;

  snapshots.forEach(({ element, shrinkWidth }) => {
    element.setAttribute(PUSH_DATA_ATTR, 'true');
    element.style.transition =
      'margin-left 0.22s ease-out, margin-right 0.22s ease-out, width 0.22s ease-out, max-width 0.22s ease-out';
    element.style[marginProp] = `${pushPx}px`;
    if (shrinkWidth) {
      element.style.width = widthExpr;
      element.style.maxWidth = widthExpr;
    }
  });

  return () => {
    snapshots.forEach(
      ({ element, marginRight, marginLeft, width, maxWidth, transition }) => {
        element.removeAttribute(PUSH_DATA_ATTR);
        element.style.marginRight = marginRight;
        element.style.marginLeft = marginLeft;
        element.style.width = width;
        element.style.maxWidth = maxWidth;
        element.style.transition = transition;
      },
    );
  };
}
