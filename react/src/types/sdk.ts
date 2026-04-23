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
