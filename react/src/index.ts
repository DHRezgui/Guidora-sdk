import './styles/index.css';

export { initSDK, SDK_VERSION as VERSION } from './core/sdk-state';
export * from './components';
export * from './hooks';
export * from './types';
export {
  buildSemanticPageSnapshot,
  buildSemanticStepCopy,
  classifyCandidate,
  computeSemanticScoreDelta,
  proposeSequenceOrder,
  resolveSemanticWeights,
  runLocalSemanticInference,
} from './utils/semantic-step-intelligence';
export type {
  SemanticCandidateInput,
  SemanticCandidateRole,
  SemanticInferenceResult,
  SemanticPageSnapshot,
  SemanticRole,
  SemanticStepCopy,
  SemanticFusionWeights,
} from './utils/semantic-step-intelligence';
export {
  fetchBackendSemanticHints,
  mergeBackendHints,
} from './utils/semantic-backend-client';
export {
  clearFaqSearchCache,
  normalizeFaqQuery,
  searchFaq,
} from './utils/faq-search-client';
export {
  buildAbandonmentFeatureFingerprint,
  buildAbandonmentRawFeatures,
  countAbandonmentSignals,
  hasMinimumAbandonmentSignals,
} from './utils/abandonment-features';
export {
  DEFAULT_ABANDONMENT_INTENT_POLICIES,
  matchAbandonmentPagePolicy,
  resolveAbandonmentIntentPolicy,
  resolveAbandonmentSessionIntent,
  resolveEffectiveAbandonmentPolicy,
} from './utils/abandonment-session-intent';
export {
  evaluateFrictionCombination,
  hasStrongSingleFamilyFriction,
  resolveActiveFrictionFamilies,
} from './utils/friction-combination';
export {
  evaluateHelpDecision,
  hasConcreteFrictionEvidence,
} from './utils/friction-decision-engine';
export { buildFrictionExplanation } from './utils/friction-explanation';
export {
  DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS,
  filterCountersByFreshness,
  isFrictionSignalFresh,
} from './utils/friction-signal-freshness';
export type { FrictionSignalTimestamps } from './utils/friction-signal-freshness';
export {
  clearHelpOutcomesForTests,
  emitHelpOutcome,
  getRecentHelpOutcomes,
  serializeHelpOutcome,
  subscribeHelpOutcomes,
} from './utils/friction-help-outcomes';
export {
  FRICTION_SIGNAL_CATALOG,
  hasStrongHelpSignal,
  listActiveFrictionSignals,
} from './utils/friction-signal-catalog';
export { FRICTION_INTERACTIVE_CLICK_SELECTOR } from './utils/friction-advanced-signals';
export {
  buildPageGuides,
  buildPageGuidesScopeKey,
  clearRememberedPageGuideToursForTests,
  filterToursForPageGuides,
  getRememberedPageGuideTours,
  mergeToursForPageGuides,
  pageGuideCtaLabel,
  pageGuideStatusLabel,
  rememberPageGuideTours,
  DEFAULT_PAGE_GUIDES_LIMIT,
} from './utils/page-guides';
export type { PageGuideItem, PageGuideStatus } from './utils/page-guides';
export {
  clearAbandonmentPredictionCache,
  predictAbandonment,
} from './utils/abandonment-prediction-client';
export {
  clearProactiveHelpListenersForTests,
  requestProactiveHelp,
  subscribeProactiveHelp,
} from './utils/proactive-help-bus';
export {
  buildFaqSuggestionContext,
  clearFaqSuggestionsCache,
  fetchFaqSuggestions,
} from './utils/faq-suggestions-client';
export type { FaqSuggestionItem, FaqSuggestionsResponse } from './utils/faq-suggestions-client';
export {
  buildContextualFaqSuggestions,
  collectFaqPageContext,
  formatFaqContextSummary,
} from './utils/faq-context';
export {
  DEFAULT_DEVELOPER_FAQ_SUBTITLE,
  DEFAULT_END_USER_FAQ_SUBTITLE,
  formatFaqCategoryLabel,
  formatFaqContextLabel,
  resolveContextualSuggestionsEnabled,
  resolveFaqContentOptions,
} from './utils/faq-content';
export {
  measureAvoidRects,
  measureDockClearances,
  measureSideClearance,
  mergeAvoidSelectors,
  resolveHelpDockSide,
  resolveSdkDockLayout,
} from './utils/help-dock-side';
export {
  DEFAULT_HOST_HEURISTIC_AVOID_SELECTORS,
  DEFAULT_SDK_FAQ_DEFAULTS,
  mergeTourViewerFaqOptions,
  normalizeSdkDockLayoutConfig,
  normalizeSdkFaqDefaults,
  resolveInitHostAvoidSelectors,
} from './utils/sdk-ui-defaults';
export {
  detectHostThemeReference,
  detectPushTargetSelector,
  resolveContextualTourViewerOptions,
  resolveFaqAutoOptions,
  resolveSemanticBackendUrl,
  SEMANTIC_HINTS_PATH,
} from './utils/sdk-auto-defaults';
export {
  hostFaqThemeCssVarsToStyle,
  resolveHostFaqTheme,
} from './utils/host-faq-theme';
export type { HostFaqThemeSnapshot, ResolveHostFaqThemeOptions } from './utils/host-faq-theme';
export {
  appearanceFromRgb,
  buildFaqThemeClassName,
  detectHostAppTheme,
  detectHostDocumentTheme,
  detectSystemColorScheme,
  parseCssColorToRgb,
  resolveAutoFaqThemeAppearance,
  resolveFaqThemeAppearance,
  resolveFaqThemeAppearanceInitial,
  SSR_SAFE_AUTO_FAQ_THEME,
} from './utils/faq-theme';
export type {
  FaqThemeAppearance,
  FaqThemeMode,
  HostThemeDetectionResult,
  HostThemeDetectionSource,
} from './utils/faq-theme';
export type { ContextualFaqSuggestion } from './utils/faq-context';
export {
  DEFAULT_SDK_PROJECT_KEY,
  resolveSdkProjectKey,
} from './utils/sdk-project-key';
export { resolveFaqProjectKey } from './utils/faq-project-key';
export {
  openExternalSupportWidget,
  type OpenExternalSupportWidgetResult,
  type SupportExternalWidgetOptions,
  type SupportExternalWidgetProvider,
} from './utils/support-external-widget';
export {
  buildSupportTicketSessionContext,
  resolveSupportPresentation,
  type SupportPresentation,
} from './utils/support-ticket-context';
export {
  ensureSupportTicketNavTracking,
  getSupportTicketRuntimeSignals,
  parseBrowserLabel,
  recordSupportFaqSearch,
  recordSupportNavigation,
  sanitizeNavigationUrl,
} from './utils/support-ticket-runtime-signals';
export {
  fetchRemoteJourneyBlueprints,
  mergeLocalAndRemoteJourneyBlueprints,
  resolveJourneyBlueprintsRemoteUrl,
  resolveRemoteBlueprintsProjectKey,
  resolveTourDraftOptionsWithRemoteBlueprints,
  clearRemoteJourneyBlueprintsCache,
} from './utils/journey-blueprints-remote-client';
export type { RemoteBlueprintsFetchResult, RemoteBlueprintsFetchStatus } from './utils/journey-blueprints-remote-client';
export {
  generateContextualTourDraftsAsync,
  invalidateContextualCandidateScanState,
  __applyPreferredSemanticOrderForTests,
  __resetSemanticDomMutationTrackerForTests,
} from './utils/tour-suggestion-generator';
export {
  enforceSemanticStepCopy,
  isBloatedCopyText,
  isOversizedStepTarget,
  getCanonicalTargetKeyForStep,
} from './utils/step-structural-guards';
export type {
  BackendSemanticHint,
  BackendSemanticInferenceRequest,
  BackendSemanticInferenceResponse,
  BackendSemanticInferenceResult,
  BackendSemanticInferenceStatus,
} from './utils/semantic-backend-client';
export type {
  FaqSearchClientResult,
  FaqSearchOptions,
  FaqSearchStatus,
  FaqSemanticSearchRequest,
  FaqSemanticSearchResponse,
  FaqSemanticSearchResult,
  FaqWidgetOptions,
  FaqPageContext,
} from './types/faq';
export type {
  AbandonmentPredictionClientResult,
  AbandonmentPredictionOptions,
  AbandonmentPredictionRequest,
  AbandonmentPredictionResponse,
  AbandonmentPredictionResult,
  AbandonmentRawFeatures,
  FrictionBehaviorSignals,
  SdkAbandonmentPredictionConfig,
} from './types/ml';
export type {
  SupportEmailBrand,
  SupportHelpEpisode,
  SupportHelpEpisodeTrigger,
  SupportTicketSessionContext,
  CreateSupportTicketRequest,
  SupportTicketRecord,
  CreateSupportTicketResponse,
  SupportTicketSubmitStatus,
} from './types/support';
export {
  detectHostSupportBrand,
  resolveSupportEmailBrand,
  type DetectHostSupportBrandOptions,
} from './utils/support-email-brand';
