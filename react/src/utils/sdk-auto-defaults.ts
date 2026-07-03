import type { SDKConfig, TourDraftGenerationOptions } from '../types';
import type { FaqWidgetOptions } from '../types/faq';
import type { SdkFaqDefaults } from '../types/sdk-ui';
import type { UseContextualTourSuggestionsOptions } from '../hooks/useContextualTourSuggestions';

export const SEMANTIC_HINTS_PATH = '/tours/contextual/semantic-hints';

export type TourViewerContextualInput = Partial<UseContextualTourSuggestionsOptions> &
  Partial<TourDraftGenerationOptions> & {
    mode?: TourDraftGenerationOptions['mode'];
    uiMode?: 'auto' | 'hidden' | 'manual' | 'debug';
    title?: string;
    stableOnly?: boolean;
    preset?:
      | 'ecommerce-default'
      | 'saas-default'
      | 'marketing-default'
      | 'dashboard-default'
      | 'support-default'
      | 'multi-vertical-default';
    developerMode?: boolean;
    avoidSelectors?: string[];
    minDockClearancePx?: number;
    dockSide?: 'left' | 'right';
  };

export type ResolvedContextualTourViewerOptions = TourViewerContextualInput & {
  publishConfig?: Partial<SDKConfig>;
};

const TRUSTDEV_TOUR_ID_PREFIX = /^trustdev-|contextual-debug-panel/i;

const PUSH_TARGET_SELECTORS = [
  '.h-screen.w-screen',
  '.w-screen.h-screen',
  'body > div:first-of-type',
] as const;

export function resolveSemanticBackendUrl(
  apiUrl?: string,
  semanticEngineMode: 'local' | 'hybrid' | 'backend' = 'hybrid',
): string | undefined {
  if (semanticEngineMode === 'local' || !apiUrl?.trim()) return undefined;
  return `${apiUrl.replace(/\/$/, '')}${SEMANTIC_HINTS_PATH}`;
}

export function detectPushTargetSelector(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const selector of PUSH_TARGET_SELECTORS) {
    if (document.querySelector(selector)) return selector;
  }
  return undefined;
}

export function detectHostThemeReference(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const elements = document.querySelectorAll('[data-tour-id]');
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.closest('[data-trustdev-help-sidebar], [data-trustdev-faq-panel]')) continue;

    const tourId = element.getAttribute('data-tour-id')?.trim();
    if (!tourId || TRUSTDEV_TOUR_ID_PREFIX.test(tourId)) continue;

    return `[data-tour-id="${tourId}"]`;
  }

  return undefined;
}

export function resolveFaqAutoOptions(
  merged: (FaqWidgetOptions & { config?: Partial<SDKConfig> }) | SdkFaqDefaults | null,
): (FaqWidgetOptions & { config?: Partial<SDKConfig> }) | null {
  if (!merged || merged.enabled === false) return merged as FaqWidgetOptions | null;

  const options = merged as FaqWidgetOptions;

  const pushTargetSelector =
    options.pushTargetSelector ??
    (options.sidebarLayout === 'push' ? detectPushTargetSelector() : undefined);

  const hostThemeReference =
    options.hostThemeReference ??
    (options.themeMode === 'host' ? detectHostThemeReference() : undefined);

  return {
    ...options,
    pushTargetSelector,
    hostThemeReference,
    topK: options.topK ?? 5,
    timeoutMs: options.timeoutMs ?? 120_000,
    frequentQuestionsMode: options.frequentQuestionsMode ?? 'auto',
    frequentQuestionsLimit: options.frequentQuestionsLimit ?? 4,
  };
}

const CONTEXTUAL_AUTO_WIRING: Partial<UseContextualTourSuggestionsOptions> = {
  useSemanticRanking: true,
  enableSequenceDetection: true,
  explainabilityEnabled: true,
  conflictResolutionEnabled: true,
  conflictResolutionStrategy: 'hybrid',
  semanticEnhancementEnabled: true,
  semanticEngineMode: 'hybrid',
  semanticBackendTimeoutMs: 12_000,
  semanticSnapshotMinDomAgeMs: 300,
  semanticRoleWeights: { role: 0.6, order: 0.4, copy: 0.5 },
  feedbackEnabled: true,
  flowVersioningEnabled: true,
  minConfidence: 45,
  maxDrafts: 2,
  blueprintsExclusive: false,
  publishScenario: 'simple',
  autoPublish: false,
  persona: 'admin',
  includeSupportDraft: false,
  includeNavigationDraft: false,
  includeFormDraft: false,
};

const CONTEXTUAL_AUTO_DOMAIN_DEFAULTS: Partial<UseContextualTourSuggestionsOptions> = {
  businessObjectives: [
    'discover and use the main features',
    'complete the primary action on this page',
    'navigate between sections',
    'search and filter content',
    'manage account and settings',
  ],
  semanticHints: [
    'search',
    'add',
    'create',
    'save',
    'submit',
    'dashboard',
    'settings',
    'profile',
    'navigation',
    'filter',
    'actions',
    'notifications',
  ],
  customKeywords: {
    'primary-action': [
      'Add',
      'Create',
      'New',
      'Save',
      'Submit',
      'Confirm',
      'Start',
      'Begin',
      'Continue',
      'Done',
    ],
    'support-navigation': [
      'Dashboard',
      'Home',
      'Overview',
      'Menu',
      'Navigation',
      'Settings',
      'Help',
      'Back',
    ],
    discovery: ['Analytics', 'Reports', 'Insights', 'Overview', 'Summary', 'Activity'],
  },
};

export function resolveContextualTourViewerOptions(
  sdkConfig: Partial<SDKConfig> | undefined,
  input: TourViewerContextualInput | null | undefined,
  options?: { debug?: boolean },
): ResolvedContextualTourViewerOptions | null {
  if (!input) return null;

  const semanticEngineMode = input.semanticEngineMode ?? 'hybrid';
  const semanticBackendUrl =
    input.semanticBackendUrl ?? resolveSemanticBackendUrl(sdkConfig?.apiUrl, semanticEngineMode);

  const tokenAccessor =
    input.semanticBackendAccessToken ??
    (() => sdkConfig?.sdkToken ?? null);

  const blueprintTokenAccessor =
    input.journeyBlueprintsAccessToken ?? (() => sdkConfig?.sdkToken ?? null);

  const autoModeDefaults =
    input.mode === 'auto' ? { ...CONTEXTUAL_AUTO_WIRING, ...CONTEXTUAL_AUTO_DOMAIN_DEFAULTS } : {};

  const projectDomain =
    input.projectDomain ??
    (typeof document !== 'undefined' ? document.title?.trim() || undefined : undefined) ??
    'web application';

  return {
    ...autoModeDefaults,
    ...input,
    projectDomain,
    semanticEngineMode,
    semanticBackendUrl,
    semanticBackendAccessToken: tokenAccessor,
    journeyBlueprintsRemoteEnabled:
      input.journeyBlueprintsRemoteEnabled ?? Boolean(sdkConfig?.sdkToken || sdkConfig?.getSdkToken),
    journeyBlueprintsAccessToken: blueprintTokenAccessor,
    publishConfig: input.publishConfig ?? sdkConfig,
    developerMode: input.developerMode ?? options?.debug ?? false,
  };
}
