import type { NormalizedSdkDockLayoutConfig, SdkDockLayoutConfig, SdkFaqDefaults } from './sdk-ui';

export type PositionType =
  | 'TOP'
  | 'BOTTOM'
  | 'LEFT'
  | 'RIGHT'
  | 'CENTER'
  | 'TOP_LEFT'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_RIGHT';

export type ActionType = 'CLICK' | 'HOVER' | 'SCROLL' | 'NEXT' | 'SKIP' | 'COMPLETE';

export type StepType = 'tooltip' | 'highlight' | 'modal' | 'form' | 'tutorial' | 'checklist';

export type EventType = 'PAGE_VIEW' | 'CLICK' | 'SCROLL' | 'HOVER' | 'EXIT' | 'FORM_SUBMIT' | 'ERROR';

export type FrictionType =
  | 'CLICK_MISS'
  | 'SCROLL_HESITATION'
  | 'TIME_ON_PAGE_EXCESSIVE'
  | 'FORM_ABANDONMENT'
  | 'NAVIGATION_BACK';

export type { SdkDockLayoutConfig, SdkFaqDefaults, NormalizedSdkDockLayoutConfig } from './sdk-ui';

export interface SDKConfig {
  apiKey: string;
  apiUrl?: string;
  sdkToken?: string;
  /**
   * Async resolver for browser BFF sessions (`td_sess_...`).
   * Preferred in production instead of exposing PAT in `NEXT_PUBLIC_*`.
   */
  getSdkToken?: () => string | null | Promise<string | null>;
  accessToken?: string;
  getAccessToken?: () => string | null;
  organizationId?: string;
  debug?: boolean;
  trackBatchSize?: number;
  trackFlushIntervalMs?: number;
  syncEnabled?: boolean;
  syncIntervalMs?: number;
  syncOnFocus?: boolean;
  syncOnReconnect?: boolean;
  /** Force dismiss/complete user-state channel when both sandbox test and prod are active. */
  tourAudience?: 'sandbox' | 'production';
  /**
   * Collision-aware docking for FAQ help + contextual SDK chrome.
   * **Enabled by default** (with host heuristics). Pass `dockLayout: false` to disable.
   */
  dockLayout?: SdkDockLayoutConfig | false;
  /**
   * Default FAQ / help sidebar options merged into `TourViewer` `faq` prop.
   * Includes `presentation: 'sidebar'` by default. Pass `faqDefaults: false` to opt out.
   */
  faqDefaults?: SdkFaqDefaults | false;
}

export interface NormalizedSDKConfig {
  apiKey: string;
  apiUrl: string;
  sdkToken?: string;
  getSdkToken?: () => string | null | Promise<string | null>;
  accessToken?: string;
  getAccessToken?: () => string | null;
  organizationId?: string;
  debug: boolean;
  trackBatchSize: number;
  trackFlushIntervalMs: number;
  syncEnabled: boolean;
  syncIntervalMs: number;
  syncOnFocus: boolean;
  syncOnReconnect: boolean;
  tourAudience?: 'sandbox' | 'production';
  dockLayout: NormalizedSdkDockLayoutConfig;
  faqDefaults: SdkFaqDefaults | null;
}

export interface SDKInitResult {
  status: 'initialized';
  version: string;
  config: NormalizedSDKConfig;
}

export interface Step {
  id?: string;
  orderIndex?: number;
  title: string;
  content: string;
  stepType?: StepType;
  targetSelector?: string;
  /**
   * Runtime fallback selectors ordered by preference. Used when
   * `targetSelector` no longer matches after a UI change.
   */
  selectorAlternatives?: string[];
  /**
   * Lightweight target fingerprint for runtime retargeting / self-heal.
   */
  targetFingerprint?: {
    tagName?: string;
    role?: string;
    ariaLabel?: string;
    textSample?: string;
    placeholder?: string;
    name?: string;
  };
  /**
   * Selector stability score (0-100) used by publish/debug decisions.
   */
  stabilityScore?: number;
  /**
   * Number of runtime self-heal rewrites performed for this step.
   */
  selfHealCount?: number;
  /**
   * Confidence (0..1) of semantic role attribution used to rewrite copy/order.
   */
  semanticRoleConfidence?: number;
  stepTargetUrl?: string;
  position?: PositionType;
  action?: ActionType;
  skipAllowed?: boolean;
  highlightElement?: boolean;
  waitTimeoutMs?: number;
  /** Étape utilisée par le backend pour les contrôles qualité (sélecteur stable / actionnable). */
  isPrimary?: boolean;
}

export type TourDraftIntent = 'discovery' | 'primary-action' | 'support-navigation' | 'form-flow';

// ============================================================================
// Journey blueprints — business-meaningful, possibly multi-page tour templates.
// ============================================================================

/**
 * Verticals supported out of the box by the contextual generator. Each vertical
 * ships a curated set of `JourneyBlueprint`s that map well-known business
 * funnels (e-commerce purchase, SaaS onboarding, lead capture, etc.) onto the
 * actual DOM of the host application.
 */
export type JourneyVertical =
  // ===== Core verticals (built-in, always shipped with the SDK) =====
  | 'ecommerce'
  | 'saas'
  | 'marketing'
  // Data / analytics dashboards (BI tooling, ops consoles, embedded charts).
  | 'dashboard'
  // In-app support surfaces (FAQ, ticket creation, guided docs, help center).
  | 'support'
  // ===== Opt-in verticals (tree-shakeable packs under
  // `@trustdev/onboarding-sdk-react/packs`). Importing the matching pack is
  // the only way to activate these — they are intentionally NOT loaded by
  // any built-in preset to keep the default bundle small. =====
  // Developer tooling: API explorers, code playgrounds, interactive docs.
  | 'tech'
  // Human Resources tooling: employee onboarding, leave management, org charts.
  | 'hr'
  // Social / community: user profile, feed, notifications, comments.
  | 'social'
  // Online education / e-learning: course catalog, quiz, progress tracking.
  | 'elearning'
  // Real estate: property search, mortgage simulator, virtual tour.
  | 'realestate'
  // Fintech (PREVIEW — requires real-world validation): banking, transactions,
  // investments. Vocabulary is heavily regulated and locale-specific.
  | 'fintech'
  // Healthtech (PREVIEW — requires real-world validation): patient record,
  // appointment, follow-up. HIPAA-sensitive vocabulary; locale-specific.
  | 'healthtech'
  // Productivity / PM (project & task dashboards, team collaboration).
  | 'productivity';

/**
 * Stable identifiers for "what the user should do at this step", independent
 * of the host application's specific copy or DOM. The resolver tries to map
 * each role to a real element on the current page or on a discoverable route.
 */
export type JourneyStepSemanticRole =
  // E-commerce funnel
  | 'ecommerce.browse-catalog'
  | 'ecommerce.view-product'
  | 'ecommerce.add-to-cart'
  | 'ecommerce.view-cart'
  | 'ecommerce.checkout'
  | 'ecommerce.confirm-order'
  // SaaS funnel — core
  | 'saas.dashboard-overview'
  | 'saas.create-resource'
  | 'saas.invite-teammate'
  | 'saas.open-settings'
  // SaaS — first-run onboarding
  | 'saas.first-login'
  | 'saas.setup-wizard'
  | 'saas.profile-completion'
  | 'saas.welcome-checklist'
  // SaaS — feature discovery & change communication
  | 'saas.feature-announcement'
  | 'saas.feature-tooltip'
  | 'saas.changelog'
  // Account & settings management (cross-vertical, billing-flavored)
  | 'account.billing'
  | 'account.notifications'
  | 'account.security'
  | 'account.plan-upgrade'
  // Dashboard / analytics interactions
  | 'dashboard.kpi-overview'
  | 'dashboard.filter-panel'
  | 'dashboard.date-picker'
  | 'dashboard.chart-explore'
  | 'dashboard.export-data'
  // In-app support / help
  | 'support.faq-navigation'
  | 'support.ticket-create'
  | 'support.docs-guided'
  | 'support.contact-help'
  // Marketing / lead generation
  | 'marketing.cta-hero'
  | 'marketing.contact-form'
  | 'marketing.newsletter-signup'
  | 'marketing.demo-request'
  // Cross-vertical auth
  | 'auth.register'
  | 'auth.login'
  | 'auth.view-profile'
  // ============ OPT-IN PACK ROLES (loaded via `/packs`) ============
  // Tech / DevTools
  | 'tech.api-explorer'
  | 'tech.code-playground'
  | 'tech.interactive-docs'
  | 'tech.auth-token'
  // HR / People ops
  | 'hr.employee-onboarding'
  | 'hr.leave-request'
  | 'hr.org-chart'
  | 'hr.performance-review'
  // Social / Community
  | 'social.user-profile'
  | 'social.feed-scroll'
  | 'social.notifications'
  | 'social.create-post'
  // E-learning
  | 'elearning.course-catalog'
  | 'elearning.start-course'
  | 'elearning.quiz-attempt'
  | 'elearning.progress-tracking'
  // Real estate
  | 'realestate.property-search'
  | 'realestate.property-detail'
  | 'realestate.mortgage-simulator'
  | 'realestate.virtual-tour'
  | 'realestate.contact-agent'
  // Fintech (PREVIEW)
  | 'fintech.banking-dashboard'
  | 'fintech.transactions-list'
  | 'fintech.transfer-money'
  | 'fintech.investment-portfolio'
  | 'fintech.expense-dashboard'
  | 'fintech.category-breakdown'
  | 'fintech.expense-list'
  | 'fintech.expense-filter'
  | 'fintech.add-expense'
  // Healthtech (PREVIEW)
  | 'healthtech.patient-record'
  | 'healthtech.book-appointment'
  | 'healthtech.medical-history'
  | 'healthtech.prescription-renewal'
  | 'healthtech.management-dashboard'
  | 'healthtech.facility-management'
  | 'healthtech.pharmacy-inventory'
  | 'healthtech.patient-analytics'
  | 'healthtech.healthcare-reports'
  // Productivity / PM
  | 'productivity.dashboard-overview'
  | 'productivity.search-workspace'
  | 'productivity.create-project'
  | 'productivity.import-data'
  | 'productivity.open-tasks'
  | 'productivity.create-task'
  | 'productivity.task-list'
  | 'productivity.open-team'
  | 'productivity.invite-member'
  | 'productivity.open-analytics'
  | 'productivity.kpi-overview'
  | 'productivity.export-report'
  | 'productivity.open-calendar'
  | 'productivity.calendar-view';

export interface JourneyStepBlueprint {
  /** Stable role identifier, used by debug telemetry and resolver. */
  semanticRole: JourneyStepSemanticRole;
  /** User-facing title (rendered in the tour tooltip). */
  title: string;
  /** User-facing description / instruction body. */
  description: string;
  /** Optional tooltip placement override. */
  position?: PositionType;
  /** Optional action override (NEXT, CLICK, NAVIGATE, ...). */
  action?: ActionType;
  /**
   * Marks this step as mandatory for the journey to be viable. If a required
   * step cannot be resolved (neither on the current page nor cross-page), the
   * entire blueprint is rejected and no draft is produced. Non-required steps
   * are silently skipped when unresolvable.
   */
  required?: boolean;
  /**
   * Deductive resolution: when the step cannot be matched on the current page
   * nor cross-page via direct anchor detection, but at least one of the listed
   * predecessor semantic roles has been resolved in the SAME blueprint, the
   * resolver will emit a "deduced" step whose `stepTargetUrl` is the first
   * declared `routePatterns` entry. The runtime then navigates the user to
   * that route and resolves the actual target selector dynamically on the new
   * page using `targetHints.selectorHints`.
   *
   * Use sparingly: only declare deduction when the next route in the funnel is
   * unambiguously reachable from the predecessor (e.g. checkout follows cart,
   * profile follows login).
   */
  inferAfter?: JourneyStepSemanticRole[];
  /**
   * Hints used by the resolver to find a matching element. The more hints
   * you provide, the more robustly the blueprint will resolve across
   * different host applications.
   */
  targetHints: {
    /**
     * URL path patterns (regex strings) where the target element is expected
     * to live. When non-empty AND no element matches on the current page,
     * the resolver will look for an internal `<a href>` whose pathname matches
     * one of these patterns, then emit a step with `stepTargetUrl` pointing
     * to that route (cross-page resolution).
     */
    routePatterns?: string[];
    /** Direct CSS selectors to try first (e.g. `[data-tour-id="add-to-cart"]`). */
    selectorHints?: string[];
    /**
     * Lowercase tokens to match against element text / aria-label / data-*
     * attributes. Multilingual tokens are recommended (FR + EN).
     */
    semanticTokens?: string[];
    /**
     * Lowercase verbs / phrases the target element is likely to contain in
     * its label, distinct from `semanticTokens` so the resolver can weight
     * them more aggressively for primary-action-style targets.
     */
    actionVerbs?: string[];
    /**
     * Constrains the element tag (defaults to any actionable element).
     *
     * Includes both interactive tags (a, button, input, form, select,
     * textarea) AND semantic-container tags (div, section, article, ul,
     * table) so blueprints can target informational regions (e.g. a
     * dashboard summary card or a transactions list) and not only CTAs.
     *
     * For a container tag to be matched at runtime, the underlying element
     * must still be collected by the resolver's candidate harvester. The
     * harvester collects containers that expose a role/label via standard
     * accessibility attributes (`role="region"`, `role="tabpanel"`,
     * `aria-label`, `aria-labelledby`) or carry a stable test attribute
     * (`data-tour-id`, `data-testid`, `data-cy`, `data-qa`). Cards/sections
     * without any of these will remain invisible to the heuristic engine.
     */
    elementTags?: Array<
      | 'a'
      | 'button'
      | 'input'
      | 'form'
      | 'select'
      | 'textarea'
      | 'div'
      | 'section'
      | 'article'
      | 'ul'
      | 'table'
    >;
  };
}

export interface JourneyBlueprint {
  /** Stable identifier, e.g. `ecommerce.purchase-journey`. */
  id: string;
  /** Human-readable blueprint name (used as draft name fallback). */
  name: string;
  /** Detailed description (used as draft description). */
  description: string;
  /** Vertical this blueprint belongs to. */
  vertical: JourneyVertical;
  /** Mapped onto the underlying `TourDraftIntent`. */
  intent: TourDraftIntent;
  /** Ordered list of steps composing the journey. */
  steps: JourneyStepBlueprint[];
  /**
   * Minimum number of steps (including required ones) that must resolve for
   * the blueprint to produce a viable draft. Defaults to 2.
   */
  minResolvedSteps?: number;
  /**
   * Optional priority within its vertical (higher wins ties during conflict
   * resolution). Defaults to 0.
   */
  priority?: number;
}

export type TourPersona = 'admin' | 'support' | 'manager' | 'editor' | 'viewer' | 'operator' | 'other';

export type ConflictResolutionStrategy = 'highest-confidence' | 'highest-score' | 'intent-priority' | 'hybrid';

export type OnboardingStage = 'discovery' | 'activation' | 'adoption' | 'retention';

export type FlowCompatibilityMode = 'strict' | 'lenient';

export type ContextualScenario = 'simple' | 'medium' | 'dynamic' | 'stress';
export type ContextualAnalysisSeverity = 'strict' | 'balanced' | 'relaxed';

export interface ContextualPublishFallbackPolicy {
  enabled?: boolean;
  maxAttempts?: number;
  retryOnRejectedReasons?: string[];
  relaxedMinConfidence?: number;
  relaxedMinScore?: number;
  includeSupportDraft?: boolean;
  includeNavigationDraft?: boolean;
  includeFormDraft?: boolean;
}

export interface SessionOnboardingContext {
  sessionId?: string;
  userId?: string;
  isNewUser?: boolean;
  onboardingProgress?: number;
  currentStage?: OnboardingStage;
  seenSelectors?: string[];
  completedSelectors?: string[];
  completedTourIds?: string[];
  completedStepIds?: string[];
  preferredIntents?: TourDraftIntent[];
  blockedIntents?: TourDraftIntent[];
}

export interface FlowVersioningMetadata {
  flowVersion: string;
  flowSignature: string;
  compatibilityMode: FlowCompatibilityMode;
  baselineVersion?: string;
  migrationRequired: boolean;
  migrationNotes: string[];
}

export interface PageElementSnapshot {
  selector: string;
  text?: string;
  role?: string;
  tag: string;
  intent?: TourDraftIntent;
  actionable: boolean;
  bbox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export interface PageStructuralSnapshot {
  pageUrl: string;
  pathname: string;
  pageTitle: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  elements: PageElementSnapshot[];
}

export interface TourDraftExplainability {
  generatedFrom: string[];
  sourceCandidateCount: number;
  signalScores: {
    semantic: number;
    sequence: number;
    confidence: number;
    selectorStabilityBonus?: number;
    selectorFragilityPenalty?: number;
    actionabilityPenalty?: number;
  };
  conflictNotes: string[];
}

export type ContextualGenerationMode = 'auto' | 'blueprint' | 'heuristic';

/** Runtime path used for one generation scan (shown in debug UI). */
export type ContextualGenerationPath = 'blueprint' | 'heuristic' | 'single-page';

export type AutoDecisionShortCircuit =
  | 'singlePageTour'
  | 'auto-single-page-detected'
  | 'no-blueprints'
  | 'no-domain-vertical'
  | 'resolution-success'
  | 'resolution-partial'
  | 'resolution-failed'
  | null;

export interface AutoDecisionReport {
  decision: 'blueprint' | 'heuristic';
  reason: string;
  shortCircuit: AutoDecisionShortCircuit;
  blueprintDraftsCount: number;
  resolvedStepsPerDraft: number[];
}

export interface ContextualGenerationDebugReport {
  generatedAt: string;
  elapsedMs: number;
  optionsSnapshot: {
    minScore: number;
    minConfidence: number;
    /** Value from host config (`contextualSuggestions.mode`). */
    mode?: ContextualGenerationMode;
    /**
     * What actually ran this scan (differs from `mode` when `mode` is `auto`).
     * Prefer this for the debug panel label.
     */
    generationPath?: ContextualGenerationPath;
    conflictResolutionEnabled: boolean;
    conflictResolutionStrategy: ConflictResolutionStrategy;
    blueprintStepReservation?: boolean;
    explainabilityEnabled: boolean;
    sessionContextEnabled: boolean;
    flowVersioningEnabled: boolean;
    flowVersion: string;
  };
  candidateMetrics: {
    considered: number;
    accepted: number;
    rejectedInvisible: number;
    rejectedNoise: number;
    rejectedNoLabel: number;
    rejectedNoSelector: number;
    rejectedBySession: number;
    cacheHits: number;
  };
  scoringAdjustments: {
    selectorStabilityBonus: number;
    selectorFragilityPenalty: number;
    actionabilityPenalty: number;
  };
  draftMetrics: {
    beforeConflict: number;
    afterConflict: number;
    afterConfidenceFilter: number;
    afterMaxDrafts: number;
  };
  conflicts: Array<{
    selector: string;
    winnerDraft: string;
    loserDraft: string;
    reason: string;
  }>;
  /**
   * Stability fix E: telemetry about the generator's determinism inputs so
   * developers can diagnose drift when the generator produces different drafts
   * for the same DOM across sessions.
   */
  stability?: {
    /**
     * `viewportWeight` is now computed from the element's position in the
     * document, not in the current viewport. Reported here so future changes
     * can be tracked.
     */
    viewportWeightMode: 'document-relative' | 'viewport-relative';
    /** Whether feedback was used (false when `feedbackEnabled !== true`). */
    feedbackUsed: boolean;
    /**
     * Whether the cross-user remote feedback aggregates were available at scan
     * time. When false, scoring used local-only feedback (or none).
     */
    remoteFeedbackReady: boolean;
    /**
     * Feedback now only contributes to candidate `rankingBoost`, never to
     * the filtering thresholds `>= minScore` / `>= minConfidence`. So the
     * *number* of drafts cannot change because of cumulative feedback.
     */
    feedbackAppliedTo: 'ranking-only' | 'score-and-confidence';
  };
  /**
   * Telemetry about the journey-blueprint resolution stage. Surfaces which
   * blueprints were attempted, how many steps resolved on the current page
   * vs. cross-page, and why a blueprint was rejected when applicable.
   */
  journeyBlueprints?: {
    activeVerticals: JourneyVertical[];
    totalBlueprintsConsidered: number;
    blueprintsProducingDrafts: number;
    blueprintResults: Array<{
      blueprintId: string;
      vertical: JourneyVertical;
      declaredSteps: number;
      resolvedOnCurrentPage: number;
      resolvedCrossPage: number;
      resolvedDeduced: number;
      unresolvedSteps: number;
      produced: boolean;
      rejectionReason?: string;
    }>;
  };
  /**
   * Counts of drafts rejected by the P3 quality filter (single-step nav,
   * heading-only, all-nav etc.). Useful to understand why the SDK doesn't
   * publish more drafts than it does.
   */
  qualityFilter?: {
    rejectedAsTrivial: number;
    rejectedReasons: Array<{ reason: string; count: number }>;
  };
  /** Present when `mode === 'auto'` (resolution-first planner). */
  autoDecision?: AutoDecisionReport;
  /**
   * Top candidates per intent with effective rank and why the winner beat rivals.
   * Format: `place-order · score 45 · lost to: credit-debit-card (score 62)`.
   */
  candidateRankings?: Array<{
    intent: TourDraftIntent;
    lines: string[];
  }>;
  /**
   * Slot-by-slot decisions for `singlePageTour` generic chain (7 slots).
   * Example: "Slot 1: filled (+ Add Project, score 113)".
   */
  singlePageChainSlots?: Array<{
    slot: number;
    slotId: string;
    status: 'filled' | 'skipped';
    line: string;
  }>;
  /**
   * Telemetry for the hybrid semantic enhancement layer. Present only when
   * `semanticEnhancementEnabled` was true at scan time. Always purely
   * informational — never alters publish behavior.
   *
   * IMPORTANT — what "semantic" means here:
   *
   * The **local** engine is NOT a learned semantic model. It is a
   * deterministic *rule + keyword voting* engine on top of structural
   * DOM signals (tagName, form/nav membership, ARIA, lexical patterns).
   * Each step report exposes:
   *  - `localRoleSource: 'rules'` (always today),
   *  - `decisionSource` ('local' | 'backend' | 'merged'): which side
   *    produced the role that was finally applied,
   *  - `lowConfidence`: true when `roleConfidence` is below the safety
   *    threshold; in that case the role is **kept for observability**
   *    but `appliedDelta` is forced to 0 so it cannot move the score.
   *
   * Use these flags to avoid confusing keyword-matched results with
   * actual learned semantic decisions from the backend.
   */
  semanticEnhancement?: {
    enabled: boolean;
    engineMode: 'local' | 'hybrid' | 'backend';
    backendUsed: boolean;
    backendStatus?: 'ok' | 'timeout' | 'error' | 'disabled' | 'unconfigured';
    /** Below this confidence the fusion is suppressed for the step. */
    minRoleConfidence: number;
    /**
     * Honest tag of the roll-out phase. Lab tests run in `phase-1-local`
     * today: both the SDK local engine and the backend endpoint are
     * deterministic rule-vote classifiers. `phase-2-embeddings` will
     * mean the backend has been switched to a learned model (e.g.
     * `ml/rag/semantic_embedder.py`).
     */
    validationPhase: 'phase-1-local' | 'phase-2-embeddings';
    /**
     * Detailed implementation status per backend signal. Surfaces
     * whether the backend hint endpoint is powered by rules (today) or
     * by a learned model. Populated dynamically from the backend
     * response when available, otherwise falls back to the local rule
     * engine description.
     */
    backendImplementation: {
      endpointLive: boolean;
      kind: 'rule-based-mirror' | 'sentence-transformers' | 'unknown';
      /** Free-text note printed verbatim in the lab. */
      disclaimer: string;
      /** Sentence-transformers model id, when the backend used it. */
      model?: string;
      /**
       * When the backend tried the embeddings path but had to fall back
       * to the rule mirror, this reports the reason transparently.
       */
      fallbackReason?:
        | 'embeddings_disabled'
        | 'embeddings_timeout'
        | 'embeddings_error'
        | 'embeddings_worker_unavailable'
        | 'sdk_http_timeout'
        | 'sdk_http_error';
    };
    /**
     * Snapshot of the DOM-stability gate at run time.
     *  - `stable: true` means the semantic layer ran.
     *  - `stable: false` means it was bypassed because the DOM was
     *    still settling (lazy mount, Suspense, streaming). The legacy
     *    heuristic output is returned unchanged.
     */
    domStability: {
      stable: boolean;
      domAgeMs: number;
      requiredAgeMs: number;
      observerInstalled: boolean;
      bypassReason?: 'dom_unsettled' | 'observer_unavailable';
    };
    /**
     * Caveat the lab UI should print verbatim. Set whenever the local
     * engine ran with rule-based classification (always, today). When
     * the SDK ships an embedding-backed engine the threshold above will
     * need to be re-calibrated against the model's score distribution.
     */
    calibrationNote?: string;
    pageSummary: {
      hasForm: boolean;
      hasNavigation: boolean;
      formFieldCount: number;
      navigationLinkCount: number;
      ctaCount: number;
    };
    /** One entry per draft that the semantic layer reviewed. */
    drafts: Array<{
      draftName: string;
      intent: TourDraftIntent;
      steps: Array<{
        selector: string;
        heuristicRole: string;
        semanticRole:
          | 'entry'
          | 'navigation'
          | 'cta-primary'
          | 'form-field'
          | 'form-submit'
          | 'utility'
          | 'secondary'
          | 'result'
          | 'generic-click';
        roleConfidence: number;
        rationale: string[];
        /**
         * Marker for the source of the local decision. Today the SDK
         * only ships a rule-based local engine; this leaves room to
         * swap in a learned model later without breaking telemetry.
         */
        localRoleSource: 'rules';
        /** Which side won the merge for this step. */
        decisionSource: 'local' | 'backend' | 'merged';
        /** True when confidence is below `minRoleConfidence`. */
        lowConfidence: boolean;
        fusion: {
          heuristicScore: number;
          semanticDelta: number;
          appliedDelta: number;
          /** Reason the delta was zeroed, if any. */
          suppressedReason?: 'low_confidence' | 'neutral' | 'cap_clamped';
        };
      }>;
      orderChanged: boolean;
      copyRewriteCount: number;
      /** Steps the fusion silently dropped because of low confidence. */
      suppressedLowConfidence: number;
    }>;
  };
}

export interface SuggestedTourDraft extends GuidedTour {
  generatedBy: 'contextual-tour-generator';
  generatedAt: string;
  intent: TourDraftIntent;
  score: number;
  confidence: number;
  semanticScore?: number;
  sequenceScore?: number;
  reasons: string[];
  detectedSelectors: string[];
  explainability?: TourDraftExplainability;
  flowVersioning?: FlowVersioningMetadata;
  /**
   * Indicates whether this draft was produced from a vertical-specific
   * `JourneyBlueprint` (cross-page friendly, business-meaningful) or from the
   * single-page heuristic generator. Surfaced in the debug panel so the
   * developer can tell at a glance which generation strategy fired.
   */
  origin?:
    | { kind: 'blueprint'; blueprintId: string; vertical: JourneyVertical; resolvedSteps: number; declaredSteps: number }
    | { kind: 'heuristic' };
  metadata?: {
    previewContext?: PageStructuralSnapshot;
    [key: string]: unknown;
  };
  diagnostics?: Record<string, unknown>;
  sessionContextSnapshot?: {
    stage: OnboardingStage;
    progress: number;
    isNewUser: boolean;
  };
}

export interface TourDraftGenerationOptions {
  maxDrafts?: number;
  maxSteps?: number;
  minScore?: number;
  maxCandidates?: number;
  includeSupportDraft?: boolean;
  includeNavigationDraft?: boolean;
  includeFormDraft?: boolean;
  targetUrl?: string;
  userRole?: string;
  persona?: TourPersona | string;
  projectDomain?: string;
  businessObjectives?: string[];
  semanticHints?: string[];
  useSemanticRanking?: boolean;
  enableIncremental?: boolean;
  noiseFilteringEnabled?: boolean;
  ignoreTransientUi?: boolean;
  noiseSelectors?: string[];
  /**
   * Limite le scan DOM aux descendants de ce conteneur (zone app hôte, iframe, panneau).
   * Les éléments hors périmètre sont ignorés. Adapte aussi la génération (ex. pas de 3e draft
   * découverte redondant quand un parcours séquentiel couvre déjà l'entrée).
   */
  analysisRootSelector?: string;
  mutationBatchWindowMs?: number;
  maxDirtyNodesPerBatch?: number;
  enableSequenceDetection?: boolean;
  minConfidence?: number;
  /**
   * Dense single-page UIs (POS, dashboards): one sequence tour, no per-intent drafts.
   * Sets `maxDrafts: 1`, `maxSteps: 7` (unless overridden), disables support/nav/form
   * drafts, and lowers sequence confidence threshold to 35 unless `sequenceMinConfidence` is set.
   */
  singlePageTour?: boolean;
  /**
   * Minimum confidence for `buildSequenceDraft` acceptance. Defaults to 45, or 35 when `singlePageTour` is true.
   */
  sequenceMinConfidence?: number;
  /**
   * Publish scenario hint, used by local pre-publish filters.
   */
  publishScenario?: ContextualScenario;
  feedbackEnabled?: boolean;
  dedupeLabels?: boolean;
  conflictResolutionEnabled?: boolean;
  conflictResolutionStrategy?: ConflictResolutionStrategy;
  explainabilityEnabled?: boolean;
  sessionContext?: SessionOnboardingContext;
  flowVersioningEnabled?: boolean;
  flowVersion?: string;
  baselineFlowVersion?: string;
  flowCompatibilityMode?: FlowCompatibilityMode;
  knownFlowSignatures?: Record<string, string>;
  customKeywords?: Partial<Record<TourDraftIntent, string[]>>;
  analysisSeverity?: ContextualAnalysisSeverity;
  publishFallbackPolicy?: ContextualPublishFallbackPolicy;
  /**
   * Verticals whose blueprints are activated for this scan (built-in catalog
   * plus opt-in packs). When set, `journeyBlueprints` from packs are filtered
   * to matching `blueprint.vertical` values — e.g. `['healthtech']` with
   * `allBlueprintPacks` only resolves healthtech templates in `mode: 'auto'`.
   * Empty array disables blueprint generation entirely.
   *
   * In `mode: 'auto'`, if omitted, verticals may be inferred from `projectDomain`
   * (e.g. "healthcare" → healthtech, "sales crm" → saas). If neither explicit
   * nor inferable verticals exist, the pack catalog is not scanned and the
   * heuristic path is used (domain-first auto).
   */
  journeyVerticals?: JourneyVertical[];
  /**
   * Custom blueprints injected by the host application. Merged with built-in
   * blueprints for the active verticals (pack entries outside those verticals
   * are skipped when `journeyVerticals` is non-empty).
   */
  journeyBlueprints?: JourneyBlueprint[];
  /**
   * When true, the heuristic generator is suppressed if at least one
   * blueprint-based draft was produced. Defaults to false: heuristic drafts
   * are kept as additional suggestions, ranked below blueprint drafts.
   *
   * @deprecated Prefer `mode: 'blueprint'` for blueprint-only drafts. Still
   * honored for backward compatibility (treated like `mode: 'blueprint'` when
   * `mode` is omitted).
   */
  blueprintsExclusive?: boolean;
  /**
   * How blueprint vs heuristic generation is chosen.
   * - `auto` (default): resolution-first — try blueprints, fall back to heuristic
   * - `blueprint`: always run blueprint resolution (+ hybrid unless exclusive)
   * - `heuristic`: ignore blueprints (generic or singlePageTour chain)
   */
  mode?: ContextualGenerationMode;
  /**
   * In `mode: 'auto'` only: minimum share of blueprint steps that must resolve
   * (`resolvedSteps / declaredSteps`) before taking the blueprint path. The
   * resolver's `produced` flag alone only requires `minResolvedSteps` (often 2),
   * which can false-match unrelated pages (generic buttons/tabs). Default `0.8`.
   */
  autoBlueprintMinResolutionRatio?: number;
  /**
   * In `mode: 'auto'` only: when blueprint path is not taken, detect tabbed
   * shallow UIs (CRM, POS) and run the singlePageTour 7-slot chain instead of
   * multi-draft heuristic. Default true. Set false to always use multi-draft
   * heuristic on fallback (like explicit `mode: 'heuristic'` without
   * `--single-page-tour`).
   */
  autoDetectSinglePageTour?: boolean;
  /**
   * In hybrid mode (blueprint + heuristic drafts), reserve DOM targets that
   * appear in a produced blueprint **draft** (steps actually resolved on scan).
   * Declared-but-unresolved blueprint steps are **not** in the draft and stay
   * available to heuristics (e.g. 3/5 resolved → only those 3 targets reserved).
   *
   * - `true` — always reserve when both blueprint and heuristic drafts exist
   * - `false` — legacy behavior (specificity/score may split blueprint steps)
   * - omitted — auto: reserve when hybrid (default, recommended)
   */
  blueprintStepReservation?: boolean;
  /**
   * Hybrid semantic enhancement layer.
   *
   * When enabled (default: false to preserve backward compatibility), an
   * extra semantic reasoning stage runs on top of the heuristic candidates
   * to:
   *
   * - classify each follow-up candidate into a stable role (entry,
   *   navigation, form-field, form-submit, utility, secondary, result),
   * - propose a coherent ordering of the sequence chain,
   * - replace step copy with role-appropriate phrasing.
   *
   * The semantic layer NEVER bypasses publish quality gates or conflict
   * resolution: its output is fused with the heuristic score within bounded
   * deltas. If the semantic stage fails or returns low-confidence signals,
   * the legacy heuristic decision is kept.
   */
  semanticEnhancementEnabled?: boolean;
  /**
   * Engine mode for the semantic layer.
   *
   * - `local`: deterministic role + ordering inference computed in the SDK
   *   from the DOM snapshot and lexical signals. No network call.
   * - `backend`: delegate semantic inference to a server endpoint (typically
   *   reusing the embedding stack in `ml/rag/`). The SDK still uses local
   *   inference as a fallback when the network is unavailable.
   * - `hybrid` (default when `semanticEnhancementEnabled` is true): merge
   *   local + backend signals when both are available, fall back to local
   *   on timeout / error.
   */
  semanticEngineMode?: 'local' | 'hybrid' | 'backend';
  /**
   * Bounded weights applied during fusion. Each weight is clamped to
   * [0, 1]; the resulting score deltas are themselves clamped so they
   * cannot push a draft past `minScore` or `minConfidence` on their own.
   *
   * - `role`: bonus when the semantic role matches the heuristic intent.
   * - `order`: bonus for sequence chains whose order matches the semantic
   *   plan.
   * - `copy`: bonus when the rewritten copy is consistent with the element
   *   type (e.g. form input vs CTA).
   */
  semanticRoleWeights?: {
    role?: number;
    order?: number;
    copy?: number;
  };
  /**
   * Optional backend endpoint used in `hybrid` / `backend` modes.
   * Example: `https://api.example.com/api/v1/contextual/semantic-hints`.
   * Required when `semanticEngineMode === 'backend'`.
   */
  semanticBackendUrl?: string;
  /**
   * Timeout (ms) for backend semantic inference calls. Defaults to 600ms.
   * On timeout the SDK falls back to local inference silently.
   */
  semanticBackendTimeoutMs?: number;
  /**
   * Minimum age (ms) the DOM must have been quiescent before the
   * semantic layer is allowed to run. Defaults to 300ms.
   *
   * Rationale: React lazy mounts, Suspense boundaries and streaming SSR
   * can expose the semantic layer to a "half-loaded" snapshot where
   * critical elements (form fields, nav links) are not yet in the DOM.
   * Running the classifier in that window produces incorrect roles
   * (e.g. labelling a still-rendering button as `generic-click`).
   *
   * The SDK installs a single shared `MutationObserver` (lazily) on the
   * analysis root and bumps `lastMutationAt` on every mutation batch.
   * Before fusion runs the generator checks
   * `Date.now() - lastMutationAt >= semanticSnapshotMinDomAgeMs`. When
   * the DOM is still settling, the semantic layer is bypassed for this
   * run; the legacy heuristic output is returned unchanged and the
   * debug report records the reason. Set to `0` to disable the gate
   * (not recommended).
   */
  semanticSnapshotMinDomAgeMs?: number;
  /**
   * Optional access token forwarder for the semantic backend. The SDK
   * never persists this value; it is passed verbatim as `Authorization`
   * header.
   */
  semanticBackendAccessToken?: string | (() => string | null | undefined);
  /**
   * Optional publish/SDK config used only to resolve `Authorization` for
   * semantic-hints when `semanticBackendAccessToken` is unset (e.g. lab
   * passes `publishConfig` from `useContextualTourSuggestions`).
   */
  publishConfig?: Partial<SDKConfig>;
  /**
   * Fetch custom blueprints from TrustDev API (`GET /tours/contextual/blueprints`).
   * Appended after local `journeyBlueprints`; built-ins are never replaced.
   * On failure the SDK continues with built-ins + local only (no throw).
   */
  journeyBlueprintsRemoteUrl?: string;
  /**
   * When true and `publishConfig.apiUrl` is set, defaults remote URL to
   * `{apiUrl}/tours/contextual/blueprints`. Set false to disable remote fetch.
   */
  journeyBlueprintsRemoteEnabled?: boolean;
  /** Timeout (ms) for remote blueprint fetch. Default 4000. */
  journeyBlueprintsRemoteTimeoutMs?: number;
  /** In-memory cache TTL (ms) for successful fetches. Default 300000. */
  journeyBlueprintsRemoteCacheTtlMs?: number;
  /**
   * Bearer integration token (td_sdk_...) for remote blueprint fetch.
   */
  journeyBlueprintsAccessToken?: string | (() => string | null | undefined);
}

export interface GuidedTour {
  id?: string;
  name: string;
  description?: string;
  targetUrl: string;
  isActive?: boolean;
  isSandboxTestActive?: boolean;
  environment?: string;
  priority?: number;
  triggerConditions?: TriggerConditions;
  steps: Step[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TriggerConditions {
  minTimeOnPage?: number;
  minVisits?: number;
  maxDisplays?: number;
  roles?: string[];
  device?: 'mobile' | 'tablet' | 'desktop';
}

export interface TrackEventInput {
  userId?: string;
  sessionId: string;
  organizationId: string;
  eventType: EventType;
  pageUrl: string;
  elementSelector?: string;
  elementText?: string;
  scrollDepth?: number;
  timeOnPage?: number;
  metadata?: Record<string, unknown>;
}

export interface TrackEventResponse {
  success: boolean;
  message: string;
  accepted: boolean;
}

export interface TrackBatchResponse {
  success: boolean;
  message: string;
  accepted: boolean;
  count: number;
}

export interface ActiveToursResponse {
  success: boolean;
  count: number;
  tours: GuidedTour[];
}

export interface PublishContextualDraftStep {
  title: string;
  content: string;
  targetSelector?: string;
  selectorAlternatives?: string[];
  targetFingerprint?: {
    tagName?: string;
    role?: string;
    ariaLabel?: string;
    textSample?: string;
    placeholder?: string;
    name?: string;
  };
  stabilityScore?: number;
  selfHealCount?: number;
  semanticRoleConfidence?: number;
  stepTargetUrl?: string;
  position?: PositionType;
  action?: ActionType;
  skipAllowed?: boolean;
  highlightElement?: boolean;
  stepType?: StepType;
  isPrimary?: boolean;
  intent?: string;
}

export interface PublishContextualFlowVersioning {
  flowVersion: string;
  flowSignature: string;
}

export interface PublishContextualDraft {
  name: string;
  description?: string;
  targetUrl: string;
  intent?: string;
  confidence: number;
  score: number;
  steps: PublishContextualDraftStep[];
  flowVersioning: PublishContextualFlowVersioning;
  explainability?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PublishContextualDraftsRequest {
  scenario: ContextualScenario;
  drafts: PublishContextualDraft[];
  autoActivate?: boolean;
  /** Evaluate decisions without writing tours (panel status refresh). */
  dryRun?: boolean;
}

export interface ContextualPublishTourState {
  environment: string;
  sandboxStatus: string | null;
  createdBy?: string | null;
  assignedToModeration?: boolean;
}

export type ContextualFeedbackEventType = 'shown' | 'clicked' | 'completed' | 'skipped';

export interface ContextualFeedbackEventInput {
  targetUrl: string;
  selector?: string;
  intent: TourDraftIntent;
  event: ContextualFeedbackEventType;
  count?: number;
}

export interface SubmitContextualFeedbackRequest {
  events: ContextualFeedbackEventInput[];
}

export interface SubmitContextualFeedbackResponse {
  success: boolean;
  accepted: number;
}

export interface ContextualFeedbackAggregate {
  targetUrl: string;
  selector: string;
  intent: string;
  shown: number;
  clicked: number;
  completed: number;
  skipped: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ContextualFeedbackAggregatesResponse {
  success: boolean;
  count: number;
  aggregates: ContextualFeedbackAggregate[];
}

export interface PublishContextualDraftsResponse {
  success: boolean;
  message: string;
  report: {
    processed: number;
    created: number;
    activated: number;
    rejected: number;
    skipped: number;
    blocked?: number;
    refreshed?: number;
    takenOver?: number;
    details: Array<{
      draftName: string;
      outcome: 'created' | 'activated' | 'rejected' | 'skipped' | 'blocked' | 'refreshed' | 'taken_over';
      reasons: string[];
      tourId?: string;
      tourState?: ContextualPublishTourState;
    }>;
    monitoring?: {
      environment: string;
      activationPolicyMode: 'auto' | 'manual_review';
      reasonsBreakdown: Record<string, number>;
      postPublishChecks: string[];
    };
  };
}

export interface TourProgress {
  tourId: string;
  stepIndex: number;
  updatedAt: number;
}

export interface FrictionCounters {
  clickMiss: number;
  scrollHesitation: number;
  timeOnPageExcessive: number;
  formAbandonment: number;
  navigationBack: number;
}

export interface OnboardingDebugLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  payload?: unknown;
}
