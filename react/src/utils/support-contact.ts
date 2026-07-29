/**
 * Safe URLs for the Help sidebar “contact support” CTA.
 * Allows mailto / tel / http(s) only — rejects javascript: and other schemes.
 */
export function isSafeSupportContactUrl(raw?: string | null): boolean {
  if (!raw?.trim()) return false;
  try {
    const url = new URL(raw.trim());
    const protocol = url.protocol.toLowerCase();
    return (
      protocol === 'mailto:' ||
      protocol === 'tel:' ||
      protocol === 'http:' ||
      protocol === 'https:'
    );
  } catch {
    return false;
  }
}

export function normalizeSupportContactUrl(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || !isSafeSupportContactUrl(trimmed)) return null;
  return trimmed;
}
