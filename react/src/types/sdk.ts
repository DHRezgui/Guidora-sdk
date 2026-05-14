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

export interface SDKConfig {
  apiKey: string;
  apiUrl?: string;
  sdkToken?: string;
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
}

export interface NormalizedSDKConfig {
  apiKey: string;
  apiUrl: string;
  sdkToken?: string;
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
  stepTargetUrl?: string;
  position?: PositionType;
  action?: ActionType;
  skipAllowed?: boolean;
  highlightElement?: boolean;
  waitTimeoutMs?: number;
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
  | 'healthtech';

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
  | 'healthtech.healthcare-reports';

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

export interface ContextualGenerationDebugReport {
  generatedAt: string;
  elapsedMs: number;
  optionsSnapshot: {
    minScore: number;
    minConfidence: number;
    conflictResolutionEnabled: boolean;
    conflictResolutionStrategy: ConflictResolutionStrategy;
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
  mutationBatchWindowMs?: number;
  maxDirtyNodesPerBatch?: number;
  enableSequenceDetection?: boolean;
  minConfidence?: number;
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
   * Verticals whose built-in blueprints are activated for this scan. Enables
   * business-meaningful, possibly multi-page tours (e.g. e-commerce purchase
   * funnel, SaaS first-resource creation, marketing lead capture). When the
   * resolver successfully produces blueprint-based drafts, they are prioritized
   * over the legacy heuristic drafts. Set to an empty array to disable
   * blueprint-based generation entirely. Defaults to no verticals (heuristic
   * only) unless a preset like `ecommerce-default` provides them.
   */
  journeyVerticals?: JourneyVertical[];
  /**
   * Custom blueprints injected by the host application. Merged with built-in
   * blueprints of the active verticals. Use this to model app-specific funnels
   * that aren't covered by the defaults.
   */
  journeyBlueprints?: JourneyBlueprint[];
  /**
   * When true, the heuristic generator is suppressed if at least one
   * blueprint-based draft was produced. Defaults to false: heuristic drafts
   * are kept as additional suggestions, ranked below blueprint drafts.
   */
  blueprintsExclusive?: boolean;
}

export interface GuidedTour {
  id?: string;
  name: string;
  description?: string;
  targetUrl: string;
  isActive?: boolean;
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
    details: Array<{
      draftName: string;
      outcome: 'created' | 'activated' | 'rejected' | 'skipped';
      reasons: string[];
      tourId?: string;
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
