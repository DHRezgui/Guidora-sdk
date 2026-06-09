import type { JourneyVertical } from '../types';

/**
 * Keyword hints used only to narrow opt-in packs in `mode: 'auto'`.
 * Not a URL classifier — plain text from `projectDomain` (and optional host hints).
 */
const VERTICAL_DOMAIN_KEYWORDS: Record<JourneyVertical, string[]> = {
  healthtech: [
    'health',
    'healthcare',
    'hospital',
    'clinic',
    'pharma',
    'pharmacy',
    'patient',
    'medical',
    'sante',
  ],
  fintech: ['fintech', 'bank', 'banking', 'finance', 'payment', 'transaction', 'wallet'],
  productivity: ['productivity', 'task', 'workspace', 'tasko', 'to-do', 'todo list'],
  tech: ['api explorer', 'developer', 'devtools', 'playground', 'openapi'],
  hr: ['hr ', 'human resources', 'employee onboarding', 'leave management'],
  social: ['social', 'community', 'feed', 'notification'],
  elearning: ['elearning', 'e-learning', 'course', 'learner', 'lms'],
  realestate: ['real estate', 'realestate', 'property', 'mortgage'],
  ecommerce: [
    'ecommerce',
    'e-commerce',
    'shop',
    'catalog',
    'checkout',
    'cart',
    'pet shop',
    'pos',
    'point of sale',
    'chili',
    'restaurant',
    'menu',
    'place order',
  ],
  saas: [
    'saas',
    'b2b',
    'team invite',
    'onboarding checklist',
    'crm',
    'sales crm',
    'sales',
    'deal',
    'deals',
    'pipeline',
    'contact',
    'contacts',
    'lead',
    'opportunity',
  ],
  marketing: ['marketing', 'lead capture', 'newsletter', 'landing'],
  dashboard: ['analytics dashboard', 'bi ', 'kpi', 'data visualization'],
  support: ['help center', 'support ticket', 'faq', 'in-app help'],
};

export type AutoBlueprintVerticalScopeSource =
  | 'explicit'
  | 'explicit-empty'
  | 'inferred'
  /** Verticals taken from dashboard-published blueprints (remote fetch). */
  | 'published-remote'
  | 'none';

export interface AutoBlueprintVerticalScope {
  verticals: JourneyVertical[];
  source: AutoBlueprintVerticalScopeSource;
}

export function inferJourneyVerticalsFromText(text: string): JourneyVertical[] {
  const normalized = (text || '').toLowerCase();
  if (!normalized.trim()) return [];

  const matched: JourneyVertical[] = [];
  for (const [vertical, keywords] of Object.entries(VERTICAL_DOMAIN_KEYWORDS) as Array<
    [JourneyVertical, string[]]
  >) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      matched.push(vertical);
    }
  }
  return matched;
}

function verticalsFromPublishedBlueprints(
  published: Array<{ vertical?: JourneyVertical }> | undefined,
): JourneyVertical[] {
  if (!published?.length) return [];
  const set = new Set<JourneyVertical>();
  for (const blueprint of published) {
    if (blueprint.vertical) {
      set.add(blueprint.vertical);
    }
  }
  return [...set];
}

/**
 * Auto mode only: which verticals may be resolved. Pack catalog is not scanned
 * unless this returns a non-empty list (explicit `journeyVerticals`, inferred
 * domain, or dashboard-published remote blueprints). Avoids productivity/fintech
 * false positives on unrelated apps when nothing is configured.
 */
export function resolveAutoBlueprintVerticalScope(
  options?: { journeyVerticals?: JourneyVertical[]; projectDomain?: string },
  remotePublishedBlueprints?: Array<{ vertical?: JourneyVertical }>,
): AutoBlueprintVerticalScope {
  if (options?.journeyVerticals) {
    if (options.journeyVerticals.length === 0) {
      return { verticals: [], source: 'explicit-empty' };
    }
    return { verticals: [...options.journeyVerticals], source: 'explicit' };
  }

  const inferred = inferJourneyVerticalsFromText(options?.projectDomain ?? '');
  if (inferred.length > 0) {
    return { verticals: inferred, source: 'inferred' };
  }

  const fromPublished = verticalsFromPublishedBlueprints(remotePublishedBlueprints);
  if (fromPublished.length > 0) {
    return { verticals: fromPublished, source: 'published-remote' };
  }

  return { verticals: [], source: 'none' };
}
