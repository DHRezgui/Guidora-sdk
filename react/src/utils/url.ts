export function getCurrentPageUrl(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname + window.location.search;
}

export function getCurrentDevice(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
