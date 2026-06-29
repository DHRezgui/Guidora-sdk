import type { FaqWidgetOptions } from './faq';

export type { FaqContentOptions, FaqAudienceMode, FaqContextDisplay } from './faq';

/**
 * Collision-aware placement for SDK floating chrome (FAQ help + contextual panel).
 * Enabled by default via `initSDK()`. Pass `dockLayout: false` to opt out entirely.
 */
export interface SdkDockLayoutConfig {
  /** When `false`, SDK chrome uses static preferred sides only. Default `true`. */
  enabled?: boolean;
  /**
   * Detect common host sidebars (`aside`, `nav`, ARIA landmarks) in addition to
   * explicit selectors. Default `true`.
   */
  useHostHeuristics?: boolean;
  /** Host zones declared once at init (merged with `TourViewer.hostAvoidSelectors`). */
  hostAvoidSelectors?: string[];
  /** Minimum horizontal clearance (px) before flipping dock side. Default `420`. */
  minClearancePx?: number;
}

/**
 * Default FAQ / help sidebar options applied when `TourViewer` receives a `faq` prop.
 * Pass `faqDefaults: false` in `initSDK()` to disable merging.
 */
export interface SdkFaqDefaults extends Pick<
  FaqWidgetOptions,
  | 'enabled'
  | 'title'
  | 'placeholder'
  | 'presentation'
  | 'side'
  | 'startCollapsed'
  | 'themeMode'
  | 'modal'
  | 'contextualSuggestionsEnabled'
  | 'avoidSelectors'
  | 'minDockClearancePx'
  | 'topK'
  | 'timeoutMs'
  | 'subtitle'
  | 'audience'
  | 'showResultScore'
  | 'showStrategyFootnote'
  | 'contextDisplay'
  | 'showDetailedLoadingHint'
  | 'starterQuestions'
  | 'frequentQuestionsMode'
  | 'frequentQuestionsLimit'
  | 'sidebarLayout'
  | 'pushTargetSelector'
  | 'showResultFeedback'
  | 'hostThemeReference'
> {}

export interface NormalizedSdkDockLayoutConfig {
  enabled: boolean;
  useHostHeuristics: boolean;
  hostAvoidSelectors: string[];
  minClearancePx: number;
}
