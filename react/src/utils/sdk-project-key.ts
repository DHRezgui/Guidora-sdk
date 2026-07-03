/** Org-wide generic corpus when no SDK flowVersion / projectKey is set (strict scoping). */
export const DEFAULT_SDK_PROJECT_KEY = 'default';

/**
 * Resolves the strict SDK project scope for FAQ, remote blueprints, and related API calls.
 * - explicit `projectKey` wins
 * - else `flowVersion` from contextualSuggestions
 * - else `default` (never org-wide / unfiltered)
 */
export function resolveSdkProjectKey(input?: {
  projectKey?: string | null;
  flowVersion?: string | null;
}): string {
  const explicit = input?.projectKey?.trim();
  if (explicit) return explicit;
  const fromFlow = input?.flowVersion?.trim();
  if (fromFlow) return fromFlow;
  return DEFAULT_SDK_PROJECT_KEY;
}
