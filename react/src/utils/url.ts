export function getCurrentPageUrl(): string {
  if (typeof window === 'undefined') return '/';
  // Include hash so SPA view switches via #section (or ?view=) are distinct "pages".
  return window.location.pathname + window.location.search + window.location.hash;
}

export function getCurrentDevice(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
