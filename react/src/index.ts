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
  fetchRemoteJourneyBlueprints,
  mergeLocalAndRemoteJourneyBlueprints,
  resolveJourneyBlueprintsRemoteUrl,
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