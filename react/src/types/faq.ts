export interface FaqSemanticSearchRequest {
  question: string;
  topK?: number;
  minSimilarity?: number;
  /** FAQ pack scoped to a host app / flow (aligns with `contextualSuggestions.flowVersion`). */
  projectKey?: string;
}

export interface FaqSemanticSearchResult {
  id: string;
  question: string;
  answer: string;
  category: string;
  priority: string;
  score: number;
}

export interface FaqSemanticSearchResponse {
  success: boolean;
  query: string;
  total: number;
  strategyStep?: string;
  results: FaqSemanticSearchResult[];
}

export type FaqSearchStatus = 'ok' | 'timeout' | 'error' | 'disabled' | 'invalid';

export interface FaqSearchClientResult {
  status: FaqSearchStatus;
  results: FaqSemanticSearchResult[];
  query: string | null;
  strategyStep: string | null;
  error: string | null;
}

export interface FaqSearchOptions {
  topK?: number;
  minSimilarity?: number;
  timeoutMs?: number;             // défaut 120000 (premier appel ML lent)
  minQueryLength?: number;
  cacheTtlMs?: number;
  /** FAQ pack / project key. Defaults to backend `default` when omitted. */
  projectKey?: string;
}

/** Page / onboarding context passed to contextual FAQ suggestions. */
export interface FaqPageContext {
  pageUrl?: string;
  pathname?: string;
  pageTitle?: string;
  organizationId?: string;
  tourId?: string;
  tourName?: string;
  tourStepTitle?: string;
  projectDomain?: string;
  /** Extra keywords to rank FAQ suggestions for this page. */
  suggestionKeywords?: string[];
  /** Host app / flow identifier for FAQ corpus scoping. */
  flowVersion?: string;
}

export type FaqFrequentQuestionsMode = 'auto' | 'manual' | 'off';

export type FaqThemeMode = 'auto' | 'light' | 'dark' | 'host';

export type FaqAudienceMode = 'end-user' | 'developer';

export type FaqContextDisplay = 'page-title' | 'summary' | 'hidden';

export interface FaqContentOptions {
  /** Short helper line under the panel title. */
  subtitle?: string;
  /**
   * Content preset. `end-user` hides ML/debug chrome; `developer` keeps diagnostics visible.
   * Default `end-user` via `initSDK({ faqDefaults })`.
   */
  audience?: FaqAudienceMode;
  showResultScore?: boolean;
  showStrategyFootnote?: boolean;
  contextDisplay?: FaqContextDisplay;
  /** When false, hides the long first-request latency hint. */
  showDetailedLoadingHint?: boolean;
  /**
   * How to populate the "Questions fréquentes" section.
   * - `auto` — fetch published FAQ questions from the org corpus (default end-user)
   * - `manual` — use `starterQuestions`
   * - `off` — hide the section
   */
  frequentQuestionsMode?: FaqFrequentQuestionsMode;
  /** Max FAQ suggestions returned in `auto` mode (default `4`). */
  frequentQuestionsLimit?: number;
  /** Manual prompts when `frequentQuestionsMode` is `manual`. */
  starterQuestions?: string[];
}

/** Options for `FaqSearchWidget`, `HelpSidebar`, and `TourViewer` prop `faq`. */
export interface FaqWidgetOptions extends FaqSearchOptions, FaqContentOptions {
  enabled?: boolean;
  title?: string;
  placeholder?: string;
  debounceMs?: number;
  /**
   * `widget` — floating launcher (default).
   * `sidebar` — full-height lateral help panel with optional contextual suggestions.
   */
  presentation?: 'widget' | 'sidebar';
  /** Sidebar edge when `presentation` is `sidebar` (default `right`). */
  side?: 'left' | 'right';
  /**
   * Host DOM zones the help UI must not overlap (e.g. `['[data-tour-id="cart-panel"]']`).
   * When set, the SDK measures clearance at runtime and flips `side` / widget position if needed.
   */
  avoidSelectors?: string[];
  /** Minimum horizontal clearance (px) before flipping dock side (default `420`). */
  minDockClearancePx?: number;
  /** Show page/tour context and suggestion chips when opening the sidebar. */
  contextualSuggestionsEnabled?: boolean;
  /** Extra context merged with auto-collected browser/tour data. */
  pageContext?: Partial<FaqPageContext>;
  /** Collapsed launcher + expandable panel (default). `inline` renders the panel only. */
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  /** When true, only the launcher button is shown until the user opens the panel. */
  startCollapsed?: boolean;
  /**
   * FAQ palette.
   * - `dark` / `light` — TrustDev presets
   * - `auto` — light/dark from host signals + OS fallback
   * - `host` — maps host CSS tokens (shadcn/Tailwind) onto FAQ surfaces
   */
  themeMode?: FaqThemeMode;
  /**
   * Optional host element to mirror when `themeMode` is `host`
   * (e.g. `'[data-tour-id="main-dashboard-panel"]'`).
   */
  hostThemeReference?: string;
  /**
   * When `false`, the sidebar does not render a full-screen blocking backdrop (POS-friendly).
   * Default `true`.
   */
  modal?: boolean;
  /**
   * `overlay` — sidebar floats above host content (default).
   * `push` — shifts host page horizontally when the sidebar is open.
   */
  sidebarLayout?: 'overlay' | 'push';
  /**
   * Host element(s) to shrink when `sidebarLayout` is `push`.
   * CSS selector or comma-separated list. Defaults to direct `body` children outside the SDK.
   */
  pushTargetSelector?: string | string[];
  /** Show helpful / not helpful actions under FAQ answers (default for end-user). */
  showResultFeedback?: boolean;
  className?: string;
  /**
   * FAQ pack key for semantic search and suggestions.
   * When omitted, `pageContext.flowVersion` is used when available.
   */
  projectKey?: string;
}
