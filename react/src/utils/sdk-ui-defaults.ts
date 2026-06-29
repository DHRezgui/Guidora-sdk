import type { FaqWidgetOptions } from '../types/faq';
import type {
  NormalizedSdkDockLayoutConfig,
  SdkDockLayoutConfig,
  SdkFaqDefaults,
} from '../types/sdk-ui';
import { DEFAULT_HELP_MIN_CLEARANCE_PX, mergeAvoidSelectors } from './help-dock-side';
import { resolveFaqAutoOptions } from './sdk-auto-defaults';

/** Heuristic host zones — excludes TrustDev's own chrome. */
export const DEFAULT_HOST_HEURISTIC_AVOID_SELECTORS = [
  'aside:not([data-trustdev-help-sidebar]):not([data-trustdev-faq-panel]):not([data-trustdev-contextual-panel])',
  'nav',
  '[role="navigation"]',
  '[role="complementary"]',
] as const;

export const DEFAULT_SDK_FAQ_DEFAULTS: SdkFaqDefaults = {
  presentation: 'sidebar',
  side: 'right',
  startCollapsed: true,
  themeMode: 'host',
  modal: false,
  sidebarLayout: 'push',
  contextualSuggestionsEnabled: false,
  audience: 'end-user',
  title: 'Aide',
  placeholder: 'Posez votre question…',
  subtitle: 'Posez votre question, nous trouvons la réponse.',
  topK: 5,
  timeoutMs: 120_000,
  frequentQuestionsMode: 'auto',
  frequentQuestionsLimit: 4,
  showResultScore: false,
  showStrategyFootnote: false,
  contextDisplay: 'hidden',
  showDetailedLoadingHint: false,
};

export function normalizeSdkDockLayoutConfig(
  input?: SdkDockLayoutConfig | false,
): NormalizedSdkDockLayoutConfig {
  if (input === false) {
    return {
      enabled: false,
      useHostHeuristics: false,
      hostAvoidSelectors: [],
      minClearancePx: DEFAULT_HELP_MIN_CLEARANCE_PX,
    };
  }

  return {
    enabled: input?.enabled ?? true,
    useHostHeuristics: input?.useHostHeuristics ?? true,
    hostAvoidSelectors: input?.hostAvoidSelectors?.filter(Boolean) ?? [],
    minClearancePx: input?.minClearancePx ?? DEFAULT_HELP_MIN_CLEARANCE_PX,
  };
}

export function normalizeSdkFaqDefaults(input?: SdkFaqDefaults | false): SdkFaqDefaults | null {
  if (input === false) return null;
  return {
    ...DEFAULT_SDK_FAQ_DEFAULTS,
    ...(input ?? {}),
  };
}

export function resolveInitHostAvoidSelectors(
  dockLayout: NormalizedSdkDockLayoutConfig,
  tourViewerHostAvoidSelectors?: string[],
): string[] {
  if (!dockLayout.enabled) return mergeAvoidSelectors(tourViewerHostAvoidSelectors);

  const heuristicSelectors = dockLayout.useHostHeuristics
    ? [...DEFAULT_HOST_HEURISTIC_AVOID_SELECTORS]
    : [];

  return mergeAvoidSelectors(
    heuristicSelectors,
    dockLayout.hostAvoidSelectors,
    tourViewerHostAvoidSelectors,
  );
}

export function mergeTourViewerFaqOptions(
  faqDefaults: SdkFaqDefaults | null,
  faq?: (FaqWidgetOptions & { config?: unknown }) | null,
): (FaqWidgetOptions & { config?: unknown }) | null {
  if (faq === null) return null;
  if (!faqDefaults && !faq) return faq ?? null;
  if (!faq) return faqDefaults ? resolveFaqAutoOptions({ ...faqDefaults }) : null;
  return resolveFaqAutoOptions({
    ...(faqDefaults ?? {}),
    ...faq,
  });
}
