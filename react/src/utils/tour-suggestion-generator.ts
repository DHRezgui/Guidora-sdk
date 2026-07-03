import {
  ConflictResolutionStrategy,
  ContextualGenerationDebugReport,
  ContextualAnalysisSeverity,
  PageStructuralSnapshot,
  FlowCompatibilityMode,
  FlowVersioningMetadata,
  OnboardingStage,
  PositionType,
  SessionOnboardingContext,
  Step,
  StepType,
  SuggestedTourDraft,
  TourDraftGenerationOptions,
  TourDraftIntent,
  TourPersona,
} from '../types';
import { selectActiveBlueprints } from './journey-blueprints';
import { resolveTourDraftOptionsWithRemoteBlueprints } from './journey-blueprints-remote-client';
import { BlueprintResolutionReport } from './journey-resolver';
import {
  applyProjectScopedBlueprintRankingBoost,
  isActiveProjectScopedBlueprintDraft,
  planContextualGenerationMode,
  resolveEffectiveContextualMode,
  resolveGenerationPathFromPlan,
  selectBlueprintDraftsForAutoHybrid,
} from './contextual-generation-mode';
import {
  buildSemanticPageSnapshot,
  buildSemanticStepCopy,
  classifyCandidate,
  computeSemanticScoreDelta,
  resolveSemanticWeights,
  type SemanticCandidateInput,
  type SemanticCandidateRole,
  type SemanticPageSnapshot,
  type SemanticRole,
} from './semantic-step-intelligence';
import {
  fetchBackendSemanticHints,
  mergeBackendHints,
  type BackendSemanticInferenceStatus,
} from './semantic-backend-client';
import {
  MAX_TARGET_LABEL_LENGTH,
  draftTargetSpecificityScore,
  enforceSemanticStepCopy,
  getCanonicalTargetKeyForStep,
  getShortElementLabel,
  isBloatedCopyText,
  isOversizedStepTarget,
  sanitizeStepCopy,
} from './step-structural-guards';

/** Checkout CTA — must outrank payment-method tiles (cash, card, QR). */
const PLACE_ORDER_CTA_PATTERN = /place\s*order|confirm\s*order|commander/i;
/** Payment instrument selectors — never treat as primary CTA. */
const PAYMENT_METHOD_LABEL_PATTERN =
  /\b(cash|credit\s*\/?\s*debit|debit\s*card|credit\s*card|qr\s*code|carte|encaisser|encaissement|checkout)\b/i;

function isPlaceOrderCtaLabel(label: string): boolean {
  return PLACE_ORDER_CTA_PATTERN.test(normalizeText(label));
}

function isPaymentMethodLabel(label: string): boolean {
  const normalized = normalizeText(label);
  if (isPlaceOrderCtaLabel(normalized)) return false;
  return PAYMENT_METHOD_LABEL_PATTERN.test(normalized);
}

function applySinglePageTourProfile(options?: TourDraftGenerationOptions): TourDraftGenerationOptions | undefined {
  if (!options?.singlePageTour) return options;
  return {
    ...options,
    includeSupportDraft: false,
    includeNavigationDraft: false,
    includeFormDraft: false,
    maxDrafts: 1,
    maxSteps: options.maxSteps ?? 7,
    sequenceMinConfidence: options.sequenceMinConfidence ?? 35,
  };
}

function resolveSequenceMinConfidence(options: TourDraftGenerationOptions | undefined): number {
  if (typeof options?.sequenceMinConfidence === 'number') return options.sequenceMinConfidence;
  if (options?.singlePageTour) return 35;
  return 45;
}

function candidateRankingShortId(candidate: DetectedElement): string {
  const tourId = candidate.selector.match(/\[data-tour-id=["']([^"']+)["']\]/i)?.[1];
  if (tourId) return tourId;
  return (
    normalizeText(candidate.label)
      .slice(0, 28)
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/gi, '') || 'element'
  );
}

function buildCandidateRankingDebug(
  candidates: DetectedElement[],
  winners: Partial<Record<TourDraftIntent, DetectedElement | null>>,
): NonNullable<ContextualGenerationDebugReport['candidateRankings']> {
  const intents: TourDraftIntent[] = ['primary-action', 'support-navigation', 'form-flow', 'discovery'];

  return intents.map((intent) => {
    const pool = candidates.filter((candidate) => {
      if (candidate.intent === intent) return true;
      if (intent === 'primary-action' && isPlaceOrderCtaLabel(candidate.label)) return true;
      return false;
    });

    const sorted = pool.slice().sort((a, b) => effectiveRank(b) - effectiveRank(a));
    const top5 = sorted.slice(0, 5);
    const winner = winners[intent] ?? null;
    const winnerScore = winner ? Math.round(effectiveRank(winner)) : null;
    const winnerId = winner ? candidateRankingShortId(winner) : null;

    const lines = top5.map((candidate) => {
      const id = candidateRankingShortId(candidate);
      const score = Math.round(effectiveRank(candidate));
      if (winner && candidate.selector === winner.selector) {
        return `${id} · score ${score} · selected`;
      }
      if (winner && winnerId && winnerScore !== null && candidate.selector !== winner.selector) {
        return `${id} · score ${score} · lost to: ${winnerId} (score ${winnerScore})`;
      }
      return `${id} · score ${score}`;
    });

    return { intent, lines };
  });
}

export interface DetectedElement {
  element: HTMLElement;
  selector: string;
  selectorCandidates: string[];
  label: string;
  score: number;
  /**
   * Stability fix (instability source C): feedback signal is stored separately
   * from `score` so it never influences `>= minScore` / `>= minConfidence`
   * filtering. It is only added back in candidate-level `sort` comparators as
   * a *ranking* bias (i.e. tie/near-tie nudging which selector becomes
   * primary), so the *number* of drafts produced for a given DOM stays stable
   * across sessions while the *order/choice* still benefits from
   * cross-user feedback (`combinedFeedbackWeight`).
   */
  rankingBoost: number;
  confidence: number;
  intent: TourDraftIntent;
  reasons: string[];
  tokenHits: number;
  zone: CandidateZone;
  semanticScore: number;
  personaScore: number;
  sequenceScore: number;
  selectorStabilityScore: number;
  selectorStabilityBonus: number;
  selectorFragilityPenalty: number;
  actionabilityPenalty: number;
}

interface FeedbackStats {
  shown: number;
  clicked: number;
  completed: number;
  skipped: number;
}

interface FeedbackStore {
  selectors: Record<string, FeedbackStats>;
  intents: Record<TourDraftIntent, FeedbackStats>;
  /**
   * Per-blueprint aggregates. Populated when `recordTourSuggestionFeedback`
   * receives a `blueprintId` (from blueprint-origin drafts). Used by
   * `blueprintFeedbackBoost` to de-prioritize blueprints that historically
   * underperform (low click/completion rate or high skip rate) without
   * removing them from the catalog. Optional for backward compat — older
   * stored payloads have no `blueprints` key.
   */
  blueprints?: Record<string, FeedbackStats>;
}

interface CandidateCacheEntry {
  domVersion: number;
  detected: DetectedElement | null;
}

type CandidateZone = 'header' | 'main' | 'navigation' | 'sidebar' | 'modal' | 'form' | 'footer' | 'other';

interface ScoreFeatures {
  disabled: boolean;
  area: number;
  viewportWeight: number;
  zoneWeight: number;
  interactionWeight: number;
}

interface RuntimeState {
  domVersion: number;
  fullRescanNeeded: boolean;
  dirtyNodes: Set<HTMLElement>;
  batchedDirtyNodes: Set<HTMLElement>;
  trackedElements: Set<HTMLElement>;
  scoreCache: WeakMap<HTMLElement, CandidateCacheEntry>;
  selectorCache: WeakMap<HTMLElement, string>;
  mutationFlushTimer?: ReturnType<typeof setTimeout>;
  mutationBatchWindowMs: number;
  maxDirtyNodesPerBatch: number;
  observer?: MutationObserver;
  /** Root currently observed by `observer` (for scoped teardown/rebind). */
  observedRoot?: ParentNode;
  /** Last scan scope (pathname + analysis root) — invalidates incremental cache on lab navigation. */
  lastAnalysisScopeKey: string;
}

type Lexicon = Record<TourDraftIntent, string[]>;

interface SemanticMatchResult {
  tokenHits: Record<TourDraftIntent, number>;
  totalHits: number;
}

interface SemanticVector {
  dimensions: Map<string, number>;
  magnitude: number;
}

interface GenerationDiagnostics {
  considered: number;
  accepted: number;
  rejectedInvisible: number;
  rejectedNoise: number;
  rejectedNoLabel: number;
  rejectedNoSelector: number;
  rejectedBySession: number;
  cacheHits: number;
  selectorStabilityBonus: number;
  selectorFragilityPenalty: number;
  actionabilityPenalty: number;
}

interface ConflictEvent {
  selector: string;
  winnerDraft: string;
  loserDraft: string;
  reason: string;
  /** Canonical DOM target key when conflict is element-level (not only selector string). */
  targetKey?: string;
}

interface FlowRegistryEntry {
  version: string;
  signature: string;
  generatedAt: string;
  targetUrl: string;
}

interface GenerationSeverityProfile {
  minScore: number;
  minConfidence: number;
  includeSupportDraft: boolean;
  includeNavigationDraft: boolean;
  includeFormDraft: boolean;
  maxDrafts: number;
}

const FEEDBACK_STORAGE_KEY = '__trustdev_contextual_tour_feedback_v2';
const FEEDBACK_COUNTER_CAP = 10_000;
const FEEDBACK_MAX_SELECTORS = 500;
const FLOW_VERSION_REGISTRY_STORAGE_KEY = '__trustdev_contextual_flow_registry_v1';
const MAX_TRACKED_ELEMENTS = 1200;
/** Minimum debounce between mutation batches — keeps snapshot work under ~3/s. */
const MIN_MUTATION_BATCH_WINDOW_MS = 300;
const DEFAULT_MUTATION_BATCH_WINDOW_MS = MIN_MUTATION_BATCH_WINDOW_MS;
const DEFAULT_MAX_DIRTY_NODES_PER_BATCH = 280;
const DEFAULT_NOISE_SELECTORS = [
  '[aria-busy="true"]',
  '[role="progressbar"]',
  '[role="tooltip"]',
  '[role="status"]',
  '[role="alert"]',
  '.tooltip',
  '.popover',
  '.toast',
  '.snackbar',
  '.skeleton',
  '.loader',
  '.loading',
  '.spinner',
  '.shimmer',
  '[data-loading="true"]',
  '[class*="tooltip"]',
  '[class*="toast"]',
  '[class*="spinner"]',
  '[class*="skeleton"]',
  '[id*="tooltip"]',
  '[id*="toast"]',
  '[id*="loader"]',
  // Trustdev contextual suggestions publisher (fixed bottom-right debug panel).
  '.trustdev-contextual-debug-panel',
  '[data-tour-id="contextual-debug-panel"]',
  '[data-trustdev-contextual-panel]',
  '[aria-label="Trustdev contextual suggestions panel"]',
  // Trustdev FAQ / help chrome.
  '.trustdev-faq-widget',
  '[data-tour-id="trustdev-faq-widget"]',
  '[data-trustdev-faq-panel]',
  '.trustdev-help-sidebar',
  '[data-tour-id="trustdev-help-sidebar"]',
  '[data-trustdev-help-sidebar]',
];

/** Host-facing debug panel — never a tour target (even with legacy data-tour-id). */
const CONTEXTUAL_PANEL_SELECTOR_MARKERS = [
  'contextual-debug-panel',
  'trustdev-contextual-panel',
  'trustdev-contextual-debug-panel',
  'trustdev-faq-widget',
  'trustdev-help-sidebar',
] as const;

function isTrustdevContextualPanelElement(element: HTMLElement): boolean {
  if (element.closest('[data-trustdev-contextual-panel]')) return true;
  if (element.closest('[data-trustdev-faq-panel]')) return true;
  if (element.closest('[data-trustdev-help-sidebar]')) return true;
  if (element.closest('.trustdev-faq-widget')) return true;
  if (element.closest('.trustdev-help-sidebar')) return true;
  if (element.closest('.trustdev-contextual-debug-panel')) return true;
  if (element.getAttribute('data-tour-id') === 'contextual-debug-panel') return true;
  if (element.getAttribute('data-tour-id') === 'trustdev-faq-widget') return true;
  if (element.getAttribute('data-tour-id') === 'trustdev-help-sidebar') return true;
  if (element.closest('[data-tour-id="contextual-debug-panel"]')) return true;
  if (element.closest('[data-tour-id="trustdev-faq-widget"]')) return true;
  if (element.closest('[data-tour-id="trustdev-help-sidebar"]')) return true;
  const aria = normalizeText(element.getAttribute('aria-label') || '');
  if (aria === 'trustdev contextual suggestions panel') return true;
  return false;
}

export function isTrustdevContextualPanelSelector(selector?: string): boolean {
  if (!selector) return false;
  const normalized = normalizeText(selector);
  if (normalized.includes('trustdev contextual suggestions panel')) return true;
  return CONTEXTUAL_PANEL_SELECTOR_MARKERS.some((marker) => selector.includes(marker));
}

const TRANSIENT_UI_KEYWORDS = ['tooltip', 'toast', 'snackbar', 'loader', 'loading', 'spinner', 'skeleton', 'coachmark', 'onboarding'];
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  'input[type="submit"]',
  'input[type="button"]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[contenteditable="true"]',
  'nav a',
  'nav button',
  'aside a',
  'aside button',
  '[data-tour-id]',
  '[data-testid]',
  '[data-cy]',
  '[data-qa]',
  '[aria-label]',
  // Semantic containers — collected so blueprints targeting informational
  // regions (dashboards, transactions lists, settings panels) can resolve
  // even when the host app does not pose `data-tour-id` on the wrapper.
  // We deliberately only collect containers that follow standard a11y
  // conventions: `role="region"` (a labelled informational landmark) and
  // `role="tabpanel"` (a Radix / Headless UI / Reach UI tab content).
  // Plain `<div>` / `<section>` without ARIA roles are intentionally left
  // out to keep noise and DOM-walk cost bounded.
  '[role="region"]',
  '[role="tabpanel"]',
  '[aria-labelledby]',
].join(', ');

const STABLE_ATTRIBUTES = ['data-tour-id', 'data-testid', 'data-cy', 'data-qa', 'name', 'aria-label'] as const;

const BASE_LEXICON: Lexicon = {
  'discovery': [
    'discover',
    'decouvr',
    'explor',
    'overview',
    'apercu',
    'tour',
    'guide',
    'اكتشف',
    'استكش',
  ],
  'primary-action': [
    'create',
    'add',
    'new',
    'publish',
    'save',
    'submit',
    'invite',
    'start',
    'continue',
    'launch',
    'cre',
    'ajout',
    'publ',
    'soumet',
    'envoy',
    'demarr',
    'ajouter',
    'creer',
    'enregistrer',
    'lancer',
    'invitez',
    'انش',
    'اضاف',
    'ابد',
    'ارس',
    'تابع',
  ],
  'support-navigation': [
    'support',
    'help',
    'faq',
    'assistant',
    'contact',
    'chat',
    'overview',
    'dashboard',
    'members',
    'settings',
    'menu',
    'sidebar',
    'navigation',
    'aide',
    'assistance',
    'contacter',
    'tableau',
    'membre',
    'parametr',
    'menu',
    'navigat',
    'support',
    'مساعد',
    'دعم',
    'اتصل',
    'اعداد',
    'تنقل',
    'قائم',
  ],
  'form-flow': [
    'search',
    'filter',
    'input',
    'form',
    'password',
    'email',
    'name',
    'login',
    'signup',
    'register',
    'recherch',
    'filtr',
    'saisi',
    'formul',
    'motdepasse',
    'connexion',
    'inscript',
    'nom',
    'بحث',
    'تصف',
    'نموذج',
    'كلمة',
    'بريد',
    'دخول',
    'تسجيل',
  ],
};

const PERSONA_HINTS: Record<TourPersona, string[]> = {
  admin: ['admin', 'owner', 'manager', 'approve', 'publish', 'create', 'settings', 'billing'],
  support: ['support', 'help', 'ticket', 'chat', 'faq', 'contact', 'resolve', 'assist'],
  manager: ['overview', 'dashboard', 'report', 'analytics', 'performance', 'members', 'approval'],
  editor: ['edit', 'draft', 'content', 'save', 'update', 'publish', 'review'],
  viewer: ['view', 'overview', 'read', 'inspect', 'details', 'report'],
  operator: ['task', 'workflow', 'execute', 'monitor', 'process', 'queue', 'status'],
  other: [],
};

const SEQUENCE_KEYWORDS = {
  entry: ['discover', 'overview', 'welcome', 'home', 'start', 'get started', 'aperçu', 'démarrer', 'ابدأ', 'الرئيسية'],
  action: ['create', 'add', 'submit', 'save', 'invite', 'launch', 'publish', 'créer', 'ajouter', 'soumettre', 'إنشاء'],
  validate: ['confirm', 'validate', 'check', 'review', 'submit', 'approve', 'confirm', 'valider', 'vérifier', 'تأكيد'],
  result: ['result', 'success', 'done', 'complete', 'status', 'updated', 'published', 'résultat', 'terminé', 'نجح'],
} as const;

const GENERATION_SEVERITY_PROFILES: Record<ContextualAnalysisSeverity, GenerationSeverityProfile> = {
  strict: {
    minScore: 30,
    minConfidence: 62,
    includeSupportDraft: false,
    includeNavigationDraft: false,
    includeFormDraft: false,
    maxDrafts: 2,
  },
  balanced: {
    minScore: 25,
    minConfidence: 55,
    includeSupportDraft: true,
    includeNavigationDraft: true,
    includeFormDraft: false,
    maxDrafts: 3,
  },
  relaxed: {
    minScore: 16,
    minConfidence: 24,
    includeSupportDraft: true,
    includeNavigationDraft: true,
    includeFormDraft: true,
    maxDrafts: 4,
  },
};

const runtime: RuntimeState = {
  domVersion: 0,
  fullRescanNeeded: true,
  dirtyNodes: new Set<HTMLElement>(),
  batchedDirtyNodes: new Set<HTMLElement>(),
  trackedElements: new Set<HTMLElement>(),
  scoreCache: new WeakMap<HTMLElement, CandidateCacheEntry>(),
  selectorCache: new WeakMap<HTMLElement, string>(),
  mutationBatchWindowMs: DEFAULT_MUTATION_BATCH_WINDOW_MS,
  maxDirtyNodesPerBatch: DEFAULT_MAX_DIRTY_NODES_PER_BATCH,
  lastAnalysisScopeKey: '',
};

let activeDiagnostics: GenerationDiagnostics | null = null;
let lastGenerationDebugReport: ContextualGenerationDebugReport | null = null;

type GenericSinglePageSlotId =
  | 'primary-action'
  | 'search'
  | 'secondary-action'
  | 'navigation'
  | 'analytics-or-result'
  | 'utility'
  | 'settings-or-profile';

type SinglePageSlotDecision = {
  slot: number;
  slotId: GenericSinglePageSlotId;
  status: 'filled' | 'skipped';
  line: string;
};

let lastSinglePageChainSlotDecisions: SinglePageSlotDecision[] = [];

/**
 * Stability fix (instability source B): feedback store snapshot captured ONCE
 * at the start of each `generateTourSuggestions` invocation. All `scoreCandidate`
 * calls during the same scan read from this snapshot instead of re-parsing
 * `localStorage` for every candidate. This guarantees that scores cannot drift
 * mid-scan if the user interacts with a tour while the generator is running.
 *
 * Reset to `null` in the `finally` block of `generateTourSuggestions` so any
 * call to `scoreCandidate` outside a generation cycle falls back to the
 * live store (used by the incremental MutationObserver path).
 */
let currentFeedbackSnapshot: FeedbackStore | null = null;

/**
 * Stability fix (instability source D, debug field E): true once the remote
 * feedback aggregates have been bootstrapped at least once for this session.
 * Used by the debug report so the developer can see whether the current
 * scoring leveraged cross-user remote feedback or only local data.
 */
let remoteFeedbackBootstrapped = false;

let stepCounter = 0;

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function removeDiacritics(value: string): string {
  try {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return value;
  }
}

function normalizeText(value?: string | null): string {
  return removeDiacritics(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stemToken(token: string): string {
  if (token.length <= 3) return token;

  const englishSuffixes = ['ing', 'ers', 'ies', 'ed', 'er', 'es', 's'];
  const frenchSuffixes = ['ement', 'ation', 'ateur', 'atrice', 'euse', 'euses', 'ment', 'tion', 'age', 'es', 'e'];
  const arabicSuffixes = ['ات', 'ون', 'ين', 'ة', 'ه', 'ي'];

  for (const suffix of englishSuffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) return token.slice(0, -suffix.length);
  }

  for (const suffix of frenchSuffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) return token.slice(0, -suffix.length);
  }

  for (const suffix of arabicSuffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) return token.slice(0, -suffix.length);
  }

  return token;
}

function tokenize(value: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stemToken);
}

function getLexicon(options?: TourDraftGenerationOptions): Lexicon {
  const customKeywords = options?.customKeywords;
  if (!customKeywords) return BASE_LEXICON;

  return {
    'discovery': [...BASE_LEXICON.discovery, ...(customKeywords.discovery || [])].map((item) => stemToken(normalizeText(item))),
    'primary-action': [...BASE_LEXICON['primary-action'], ...(customKeywords['primary-action'] || [])].map((item) =>
      stemToken(normalizeText(item)),
    ),
    'support-navigation': [...BASE_LEXICON['support-navigation'], ...(customKeywords['support-navigation'] || [])].map((item) =>
      stemToken(normalizeText(item)),
    ),
    'form-flow': [...BASE_LEXICON['form-flow'], ...(customKeywords['form-flow'] || [])].map((item) =>
      stemToken(normalizeText(item)),
    ),
  };
}

function normalizePersona(value?: string): TourPersona {
  const normalized = normalizeText(value);
  if (!normalized) return 'other';
  if (normalized.includes('manager') || normalized.includes('lead')) return 'manager';
  if (normalized.includes('admin') || normalized.includes('owner')) return 'admin';
  if (normalized.includes('support') || normalized.includes('help') || normalized.includes('agent')) return 'support';
  if (normalized.includes('editor') || normalized.includes('content')) return 'editor';
  if (normalized.includes('viewer') || normalized.includes('read')) return 'viewer';
  if (normalized.includes('operator') || normalized.includes('ops')) return 'operator';
  return 'other';
}

function collectContextTokens(options?: TourDraftGenerationOptions): string[] {
  const tokens: string[] = [];

  if (options?.projectDomain) tokens.push(...tokenize(options.projectDomain));
  if (options?.semanticHints) tokens.push(...options.semanticHints.flatMap((hint) => tokenize(hint)));
  if (options?.businessObjectives) tokens.push(...options.businessObjectives.flatMap((objective) => tokenize(objective)));
  if (options?.persona) tokens.push(...tokenize(String(options.persona)));
  if (options?.userRole) tokens.push(...tokenize(options.userRole));

  if (typeof document !== 'undefined') {
    const title = document.title || '';
    const heading = document.querySelector('main h1, h1, main h2, h2, [role="heading"]')?.textContent || '';
    tokens.push(...tokenize(title));
    tokens.push(...tokenize(heading));
  }

  return tokens.map(stemToken).filter(Boolean);
}

function buildSemanticVector(tokens: string[]): SemanticVector {
  const dimensions = new Map<string, number>();
  for (const token of tokens) {
    const normalized = stemToken(normalizeText(token));
    if (!normalized) continue;
    dimensions.set(normalized, (dimensions.get(normalized) || 0) + 1);
  }

  let magnitude = 0;
  for (const value of dimensions.values()) {
    magnitude += value * value;
  }

  return {
    dimensions,
    magnitude: Math.sqrt(magnitude),
  };
}

function resolveGenerationProfile(options?: TourDraftGenerationOptions): GenerationSeverityProfile {
  const severity = options?.analysisSeverity ?? 'balanced';
  const profile = GENERATION_SEVERITY_PROFILES[severity];

  return {
    minScore: options?.minScore ?? profile.minScore,
    minConfidence: options?.minConfidence ?? profile.minConfidence,
    includeSupportDraft: options?.includeSupportDraft ?? profile.includeSupportDraft,
    includeNavigationDraft: options?.includeNavigationDraft ?? profile.includeNavigationDraft,
    includeFormDraft: options?.includeFormDraft ?? profile.includeFormDraft,
    maxDrafts: options?.maxDrafts ?? profile.maxDrafts,
  };
}

function cosineSimilarity(vectorA: SemanticVector, vectorB: SemanticVector): number {
  if (!vectorA.magnitude || !vectorB.magnitude) return 0;

  let dot = 0;
  for (const [dimension, value] of vectorA.dimensions.entries()) {
    const other = vectorB.dimensions.get(dimension);
    if (other) dot += value * other;
  }

  return dot / (vectorA.magnitude * vectorB.magnitude);
}

function buildSemanticAffinity(label: string, options?: TourDraftGenerationOptions): number {
  if (options?.useSemanticRanking === false) return 0;

  const labelVector = buildSemanticVector(tokenize(label));
  const contextVector = buildSemanticVector(collectContextTokens(options));
  const similarity = cosineSimilarity(labelVector, contextVector);

  if (similarity > 0.85) return 1;
  return similarity;
}

function buildPersonaAffinity(intent: TourDraftIntent, options?: TourDraftGenerationOptions): number {
  const persona = normalizePersona(options?.persona || options?.userRole);
  const personaHints = PERSONA_HINTS[persona] || [];
  const contextTokens = collectContextTokens(options);
  const tokenSet = new Set(contextTokens);

  const matchedHints = personaHints.filter((hint) => tokenSet.has(stemToken(normalizeText(hint))) || contextTokens.some((token) => token.includes(stemToken(normalizeText(hint))))).length;

  let affinity = matchedHints * 0.18;

  if (persona === 'admin' && (intent === 'primary-action' || intent === 'form-flow')) affinity += 0.35;
  if (persona === 'support' && intent === 'support-navigation') affinity += 0.45;
  if (persona === 'manager' && intent === 'discovery') affinity += 0.25;
  if (persona === 'editor' && intent === 'primary-action') affinity += 0.3;
  if (persona === 'viewer' && intent === 'discovery') affinity += 0.25;
  if (persona === 'operator' && (intent === 'primary-action' || intent === 'form-flow')) affinity += 0.2;

  return Math.min(1, affinity);
}

function buildSequenceAffinity(element: HTMLElement, intent: TourDraftIntent, options?: TourDraftGenerationOptions): number {
  if (options?.enableSequenceDetection === false) return 0;

  const label = normalizeText(getLabel(element));
  const orderScore = Math.max(0, 1 - Math.min(1, element.getBoundingClientRect().top / Math.max(1, window.innerHeight || 1)));

  const entryHit = SEQUENCE_KEYWORDS.entry.some((keyword) => label.includes(normalizeText(keyword)));
  const actionHit = SEQUENCE_KEYWORDS.action.some((keyword) => label.includes(normalizeText(keyword)));
  const validateHit = SEQUENCE_KEYWORDS.validate.some((keyword) => label.includes(normalizeText(keyword)));
  const resultHit = SEQUENCE_KEYWORDS.result.some((keyword) => label.includes(normalizeText(keyword)));

  let sequenceScore = orderScore * 0.35;
  if (intent === 'discovery' && entryHit) sequenceScore += 0.4;
  if (intent === 'primary-action' && actionHit) sequenceScore += 0.45;
  if (intent === 'form-flow' && validateHit) sequenceScore += 0.4;
  if (intent === 'support-navigation' && resultHit) sequenceScore += 0.2;

  return Math.min(1, sequenceScore);
}

function confidenceFromSignals(score: number, semanticScore: number, personaScore: number, sequenceScore: number, feedbackBonus: number): number {
  const raw = score * 0.45 + semanticScore * 28 + personaScore * 14 + sequenceScore * 16 + feedbackBonus * 10;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function createDiagnostics(): GenerationDiagnostics {
  return {
    considered: 0,
    accepted: 0,
    rejectedInvisible: 0,
    rejectedNoise: 0,
    rejectedNoLabel: 0,
    rejectedNoSelector: 0,
    rejectedBySession: 0,
    cacheHits: 0,
    selectorStabilityBonus: 0,
    selectorFragilityPenalty: 0,
    actionabilityPenalty: 0,
  };
}

function normalizeStage(value?: string): OnboardingStage {
  const normalized = normalizeText(value);
  if (normalized.includes('retention') || normalized.includes('retent')) return 'retention';
  if (normalized.includes('adoption') || normalized.includes('adopt')) return 'adoption';
  if (normalized.includes('activation') || normalized.includes('activ')) return 'activation';
  return 'discovery';
}

function getSessionContext(options?: TourDraftGenerationOptions): SessionOnboardingContext | null {
  return options?.sessionContext || null;
}

function getProgress(sessionContext: SessionOnboardingContext | null): number {
  if (!sessionContext?.onboardingProgress && sessionContext?.onboardingProgress !== 0) return 0;
  return Math.max(0, Math.min(1, sessionContext.onboardingProgress));
}

function isSelectorCompleted(selector: string, sessionContext: SessionOnboardingContext | null): boolean {
  if (!sessionContext?.completedSelectors || sessionContext.completedSelectors.length === 0) return false;
  return sessionContext.completedSelectors.includes(selector);
}

function wasSelectorSeen(selector: string, sessionContext: SessionOnboardingContext | null): boolean {
  if (!sessionContext?.seenSelectors || sessionContext.seenSelectors.length === 0) return false;
  return sessionContext.seenSelectors.includes(selector);
}

function isIntentBlocked(intent: TourDraftIntent, sessionContext: SessionOnboardingContext | null): boolean {
  if (!sessionContext?.blockedIntents || sessionContext.blockedIntents.length === 0) return false;
  return sessionContext.blockedIntents.includes(intent);
}

function intentSessionAffinity(intent: TourDraftIntent, sessionContext: SessionOnboardingContext | null): number {
  if (!sessionContext) return 0;

  const stage = normalizeStage(sessionContext.currentStage);
  const progress = getProgress(sessionContext);
  const preferred = sessionContext.preferredIntents || [];
  let affinity = 0;

  if (preferred.includes(intent)) affinity += 0.25;

  if (stage === 'discovery') {
    if (intent === 'discovery' || intent === 'support-navigation') affinity += 0.18;
    if (intent === 'primary-action') affinity += 0.06;
  }

  if (stage === 'activation') {
    if (intent === 'primary-action' || intent === 'form-flow') affinity += 0.22;
  }

  if (stage === 'adoption') {
    if (intent === 'primary-action') affinity += 0.18;
    if (intent === 'support-navigation') affinity += 0.08;
  }

  if (stage === 'retention') {
    if (intent === 'support-navigation') affinity += 0.2;
    if (intent === 'discovery') affinity -= 0.08;
  }

  if (progress > 0.7 && intent === 'discovery') affinity -= 0.2;
  if (progress < 0.3 && intent === 'discovery') affinity += 0.12;
  if (progress > 0.5 && intent === 'primary-action') affinity += 0.06;

  if (sessionContext.isNewUser === false && intent === 'discovery') affinity -= 0.12;
  if (sessionContext.isNewUser === true && intent === 'discovery') affinity += 0.12;

  return Math.max(-0.35, Math.min(0.45, affinity));
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function computeFlowSignature(draft: SuggestedTourDraft): string {
  const signatureInput = [
    draft.intent,
    draft.targetUrl,
    ...draft.detectedSelectors.slice().sort(),
    ...draft.steps.map((step) => `${step.action || ''}:${step.targetSelector || ''}:${normalizeText(step.title)}`),
  ].join('|');
  return simpleHash(signatureInput);
}

function getFlowRegistry(): FlowRegistryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FLOW_VERSION_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FlowRegistryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveFlowRegistry(entries: FlowRegistryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FLOW_VERSION_REGISTRY_STORAGE_KEY, JSON.stringify(entries.slice(-100)));
  } catch {
    // Ignore storage errors.
  }
}

function buildFlowVersioningMetadata(
  draft: SuggestedTourDraft,
  options?: TourDraftGenerationOptions,
): FlowVersioningMetadata | undefined {
  if (options?.flowVersioningEnabled === false) return undefined;

  const flowVersion = options?.flowVersion || 'v1';
  const compatibilityMode: FlowCompatibilityMode = options?.flowCompatibilityMode || 'lenient';
  const signature = computeFlowSignature(draft);
  const knownSignature = options?.knownFlowSignatures?.[flowVersion];

  const migrationNotes: string[] = [];
  let migrationRequired = false;

  if (knownSignature && knownSignature !== signature) {
    migrationRequired = true;
    migrationNotes.push(`Known signature changed for ${flowVersion}.`);
  }

  if (options?.baselineFlowVersion && options.baselineFlowVersion !== flowVersion) {
    migrationRequired = true;
    migrationNotes.push(`Baseline ${options.baselineFlowVersion} to ${flowVersion} migration.`);
  }

  const registry = getFlowRegistry();
  const previousSameVersion = registry.find((entry) => entry.version === flowVersion);
  if (previousSameVersion && previousSameVersion.signature !== signature) {
    migrationRequired = true;
    migrationNotes.push(`Local flow registry detected a different signature for ${flowVersion}.`);
  }

  return {
    flowVersion,
    flowSignature: signature,
    compatibilityMode,
    baselineVersion: options?.baselineFlowVersion,
    migrationRequired,
    migrationNotes,
  };
}

function persistFlowVersioningMetadata(drafts: SuggestedTourDraft[]): void {
  const entries = getFlowRegistry();
  // Deduplicate by (version + signature + targetUrl). When a draft yields the
  // same fingerprint as a previously registered entry, we refresh its
  // `generatedAt` and move it to the most-recent slot instead of accumulating
  // a duplicate copy. This keeps the registry small and avoids the
  // "Flow Registry (100) with the same row repeated" pollution.
  const byKey = new Map<string, FlowRegistryEntry>();
  for (const entry of entries) {
    const key = `${entry.version}|${entry.signature}|${entry.targetUrl}`;
    byKey.set(key, entry);
  }

  for (const draft of drafts) {
    if (!draft.flowVersioning) continue;
    const key = `${draft.flowVersioning.flowVersion}|${draft.flowVersioning.flowSignature}|${draft.targetUrl}`;
    byKey.delete(key);
    byKey.set(key, {
      version: draft.flowVersioning.flowVersion,
      signature: draft.flowVersioning.flowSignature,
      generatedAt: draft.generatedAt,
      targetUrl: draft.targetUrl,
    });
  }

  saveFlowRegistry(Array.from(byKey.values()));
}

export function getContextualFlowRegistry(): Array<{
  version: string;
  signature: string;
  generatedAt: string;
  targetUrl: string;
}> {
  return getFlowRegistry();
}

function resolveConflictStrategy(options?: TourDraftGenerationOptions): ConflictResolutionStrategy {
  return options?.conflictResolutionStrategy || 'hybrid';
}

function intentPriority(intent: TourDraftIntent): number {
  switch (intent) {
    case 'primary-action':
      return 4;
    case 'form-flow':
      return 3;
    case 'support-navigation':
      return 2;
    case 'discovery':
      return 1;
    default:
      return 0;
  }
}

function draftPriorityScore(draft: SuggestedTourDraft, strategy: ConflictResolutionStrategy): number {
  if (strategy === 'highest-confidence') return draft.confidence;
  if (strategy === 'highest-score') return draft.score;
  if (strategy === 'intent-priority') return intentPriority(draft.intent) * 100 + draft.confidence * 0.2;

  const combined = draft.score * 0.6 + draft.confidence * 0.4;
  const intentBoost = intentPriority(draft.intent) * 5;
  // semanticScore/sequenceScore are exposed as 0..100 in drafts; normalize before weighting
  const semantic = Math.max(0, Math.min(1, (draft.semanticScore || 0) / 100));
  const sequence = Math.max(0, Math.min(1, (draft.sequenceScore || 0) / 100));
  return combined + semantic * 12 + sequence * 10 + intentBoost;
}

function explainabilityEnabled(options?: TourDraftGenerationOptions): boolean {
  return options?.explainabilityEnabled === true;
}

function dedupeStepsBySelector(steps: Step[]): Step[] {
  const seen = new Set<string>();
  const output: Step[] = [];

  for (const step of steps) {
    const selector = step.targetSelector || '';
    if (!selector) continue;
    if (seen.has(selector)) continue;
    seen.add(selector);
    output.push(step);
  }

  return output;
}

function isBlueprintDraft(draft: SuggestedTourDraft): boolean {
  return draft.origin?.kind === 'blueprint';
}

/**
 * Hybrid default: only targets present in a produced blueprint draft are reserved
 * (see journey-resolver: unresolved declared steps never enter `draft.steps`).
 * Heuristics may still target DOM elements the blueprint failed to resolve.
 */
function shouldReserveBlueprintTargets(
  drafts: SuggestedTourDraft[],
  options?: TourDraftGenerationOptions,
): boolean {
  if (options?.blueprintsExclusive === true) return false;
  if (options?.blueprintStepReservation === false) return false;

  const hasBlueprint = drafts.some(isBlueprintDraft);
  if (!hasBlueprint) return false;

  if (options?.blueprintStepReservation === true) return true;

  const hasHeuristic = drafts.some((draft) => !isBlueprintDraft(draft));
  return hasHeuristic;
}

function resolveDraftConflicts(
  drafts: SuggestedTourDraft[],
  options?: TourDraftGenerationOptions,
): { drafts: SuggestedTourDraft[]; conflicts: ConflictEvent[] } {
  if (options?.conflictResolutionEnabled === false) {
    return { drafts, conflicts: [] };
  }

  const strategy = resolveConflictStrategy(options);
  const reserveBlueprintTargets = shouldReserveBlueprintTargets(drafts, options);
  const conflicts: ConflictEvent[] = [];

  interface TargetClaim {
    draft: SuggestedTourDraft;
    draftIndex: number;
    draftPriority: number;
    step: Step;
    stepSpecificity: number;
    targetKey: string;
    selector: string;
  }

  const claimsByTarget = new Map<string, TargetClaim[]>();

  drafts.forEach((draft, draftIndex) => {
    const draftPriority = draftPriorityScore(draft, strategy);
    const localSeenSelectors = new Set<string>();
    const localSeenTargets = new Set<string>();

    for (const step of dedupeStepsBySelector(draft.steps)) {
      const selector = step.targetSelector || '';
      if (!selector || localSeenSelectors.has(selector)) continue;
      localSeenSelectors.add(selector);

      const targetKey = getCanonicalTargetKeyForStep(step);
      if (localSeenTargets.has(targetKey)) continue;
      localSeenTargets.add(targetKey);

      const claim: TargetClaim = {
        draft,
        draftIndex,
        draftPriority,
        step,
        stepSpecificity: draftTargetSpecificityScore(draft, step),
        targetKey,
        selector,
      };
      const bucket = claimsByTarget.get(targetKey) || [];
      bucket.push(claim);
      claimsByTarget.set(targetKey, bucket);
    }
  });

  const winningClaims: TargetClaim[] = [];

  for (const [targetKey, claims] of claimsByTarget.entries()) {
    claims.sort((a, b) => {
      // Reservation applies only to claims from blueprint draft steps (resolved
      // at scan time). Unresolved blueprint slots are absent from draft.steps.
      if (reserveBlueprintTargets) {
        const aBlueprint = isBlueprintDraft(a.draft);
        const bBlueprint = isBlueprintDraft(b.draft);
        if (aBlueprint !== bBlueprint) return aBlueprint ? -1 : 1;
      }
      if (b.stepSpecificity !== a.stepSpecificity) return b.stepSpecificity - a.stepSpecificity;
      if (b.draftPriority !== a.draftPriority) return b.draftPriority - a.draftPriority;
      return a.draftIndex - b.draftIndex;
    });

    const winner = claims[0];
    winningClaims.push(winner);

    for (let i = 1; i < claims.length; i += 1) {
      const loser = claims[i];
      const blueprintReserved =
        reserveBlueprintTargets && isBlueprintDraft(winner.draft) && !isBlueprintDraft(loser.draft);
      const conflict: ConflictEvent = {
        selector: loser.selector,
        winnerDraft: winner.draft.name,
        loserDraft: loser.draft.name,
        targetKey,
        reason: blueprintReserved
          ? `blueprint-reserved target (${targetKey})`
          : `dom-target conflict (${targetKey}): kept more specific tour (${strategy})`,
      };
      conflicts.push(conflict);
      if (typeof console !== 'undefined') {
        console.warn('[TrustDev SDK] Tour target conflict — one DOM target, one tour', {
          targetKey,
          winnerTour: winner.draft.name,
          loserTour: loser.draft.name,
          winnerSelector: winner.selector,
          loserSelector: loser.selector,
        });
      }
    }
  }

  const stepsByDraftName = new Map<string, Step[]>();
  for (const claim of winningClaims) {
    const list = stepsByDraftName.get(claim.draft.name) || [];
    list.push(claim.step);
    stepsByDraftName.set(claim.draft.name, list);
  }

  const resolvedDrafts = drafts
    .map((draft, index) => {
      const keptSteps = recomputeStepOrderIndex(
        sortStepsByAuthoredOrder(stepsByDraftName.get(draft.name) || []),
      );
      const conflictNotes = conflicts
        .filter((conflict) => conflict.loserDraft === draft.name || conflict.winnerDraft === draft.name)
        .map((conflict) => `${conflict.selector}: ${conflict.reason}`);

      return {
        index,
        draft: {
          ...draft,
          steps: keptSteps,
          detectedSelectors: keptSteps.map((step) => step.targetSelector).filter(Boolean) as string[],
          explainability: draft.explainability
            ? {
                ...draft.explainability,
                conflictNotes: [...draft.explainability.conflictNotes, ...conflictNotes],
              }
            : draft.explainability,
        },
      };
    })
    .filter((entry) => entry.draft.steps.length > 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.draft);

  return { drafts: resolvedDrafts, conflicts };
}

export function getLastContextualGenerationDebugReport(): ContextualGenerationDebugReport | null {
  return lastGenerationDebugReport;
}

export function restoreLastContextualGenerationDebugReport(
  report: ContextualGenerationDebugReport | null,
): void {
  lastGenerationDebugReport = report;
}

export function clearLastContextualGenerationDebugReport(): void {
  lastGenerationDebugReport = null;
}

function getAnalysisScopeKey(options?: TourDraftGenerationOptions): string {
  const selector = normalizeText(options?.analysisRootSelector) || '__document__';
  const pathname =
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '__ssr__';
  return `${pathname}::${selector}`;
}

function countConnectedTrackedInAnalysisRoot(options?: TourDraftGenerationOptions): number {
  let count = 0;
  for (const element of runtime.trackedElements) {
    if (!element.isConnected) continue;
    if (!isWithinAnalysisRoot(element, options)) continue;
    count += 1;
  }
  return count;
}

/**
 * Clears incremental candidate cache. Call before a manual lab analysis or when
 * switching host surfaces so `trackedElements` from a previous page cannot yield 0 candidates.
 */
export function invalidateContextualCandidateScanState(): void {
  runtime.fullRescanNeeded = true;
  runtime.lastAnalysisScopeKey = '';
  runtime.trackedElements.clear();
  runtime.dirtyNodes.clear();
  runtime.batchedDirtyNodes.clear();
  runtime.domVersion += 1;
}

function prepareCandidateScan(options?: TourDraftGenerationOptions): void {
  const scopeKey = getAnalysisScopeKey(options);
  if (scopeKey !== runtime.lastAnalysisScopeKey) {
    runtime.lastAnalysisScopeKey = scopeKey;
    runtime.fullRescanNeeded = true;
    runtime.trackedElements.clear();
    runtime.dirtyNodes.clear();
    runtime.batchedDirtyNodes.clear();
    runtime.domVersion += 1;
    return;
  }

  if (runtime.trackedElements.size > 0 && countConnectedTrackedInAnalysisRoot(options) === 0) {
    runtime.fullRescanNeeded = true;
    runtime.trackedElements.clear();
    runtime.dirtyNodes.clear();
    runtime.batchedDirtyNodes.clear();
    runtime.domVersion += 1;
  }
}

function getDefaultFeedbackStats(): FeedbackStats {
  return { shown: 0, clicked: 0, completed: 0, skipped: 0 };
}

function createDefaultFeedbackStore(): FeedbackStore {
  return {
    selectors: {},
    intents: {
      discovery: getDefaultFeedbackStats(),
      'primary-action': getDefaultFeedbackStats(),
      'support-navigation': getDefaultFeedbackStats(),
      'form-flow': getDefaultFeedbackStats(),
    },
    blueprints: {},
  };
}

function getFeedbackStore(): FeedbackStore {
  if (typeof window === 'undefined') return createDefaultFeedbackStore();

  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return createDefaultFeedbackStore();

    const parsed = JSON.parse(raw) as Partial<FeedbackStore>;
    return {
      selectors: parsed.selectors || {},
      intents: {
        discovery: parsed.intents?.discovery || getDefaultFeedbackStats(),
        'primary-action': parsed.intents?.['primary-action'] || getDefaultFeedbackStats(),
        'support-navigation': parsed.intents?.['support-navigation'] || getDefaultFeedbackStats(),
        'form-flow': parsed.intents?.['form-flow'] || getDefaultFeedbackStats(),
      },
      blueprints: parsed.blueprints || {},
    };
  } catch {
    return createDefaultFeedbackStore();
  }
}

function saveFeedbackStore(store: FeedbackStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore localStorage write errors silently.
  }
}

function incrementFeedbackStats(stats: FeedbackStats, event: 'shown' | 'clicked' | 'completed' | 'skipped'): void {
  // Bounded counter to prevent unbounded growth and ratio collapse.
  // Once we hit the cap, further events are ignored for this counter so the
  // signal remains usable (ratios stay meaningful at the chosen scale).
  const current = stats[event] || 0;
  if (current >= FEEDBACK_COUNTER_CAP) return;
  stats[event] = current + 1;
}

function pruneSelectorsIfNeeded(store: FeedbackStore): void {
  const keys = Object.keys(store.selectors);
  if (keys.length <= FEEDBACK_MAX_SELECTORS) return;

  const scored = keys
    .map((key) => {
      const s = store.selectors[key];
      const activity = s.shown + s.clicked + s.completed + s.skipped;
      return [key, activity] as const;
    })
    .sort((a, b) => a[1] - b[1]);

  const toRemove = scored.slice(0, keys.length - FEEDBACK_MAX_SELECTORS);
  for (const [key] of toRemove) {
    delete store.selectors[key];
  }
}

export function recordTourSuggestionFeedback(input: {
  selector?: string;
  intent: TourDraftIntent;
  event: 'shown' | 'clicked' | 'completed' | 'skipped';
  /**
   * Optional. When provided (drafts from a journey blueprint), the feedback
   * also feeds the per-blueprint aggregates used by `blueprintFeedbackBoost`
   * during draft scoring. Pass `draft.origin.blueprintId` when calling from a
   * blueprint-origin draft, undefined otherwise.
   */
  blueprintId?: string;
}): void {
  const store = getFeedbackStore();

  incrementFeedbackStats(store.intents[input.intent], input.event);

  if (input.selector) {
    const existing = store.selectors[input.selector] || getDefaultFeedbackStats();
    incrementFeedbackStats(existing, input.event);
    store.selectors[input.selector] = existing;
    pruneSelectorsIfNeeded(store);
  }

  if (input.blueprintId) {
    if (!store.blueprints) store.blueprints = {};
    const existingBp = store.blueprints[input.blueprintId] || getDefaultFeedbackStats();
    incrementFeedbackStats(existingBp, input.event);
    store.blueprints[input.blueprintId] = existingBp;
  }

  saveFeedbackStore(store);
}

export function resetTourSuggestionFeedback(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FEEDBACK_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Read the local (per-browser) feedback counters for a selector.
 * Used by debug UI to display live, per-draft counters that reflect each
 * Feedback shown/clicked button press immediately.
 */
export function getLocalFeedbackForSelector(
  selector: string | undefined,
): { shown: number; clicked: number; completed: number; skipped: number } | null {
  if (!selector) return null;
  const store = getFeedbackStore();
  const stats = store.selectors[selector];
  if (!stats) return null;
  return {
    shown: stats.shown,
    clicked: stats.clicked,
    completed: stats.completed,
    skipped: stats.skipped,
  };
}

function feedbackWeight(stats?: FeedbackStats): number {
  if (!stats) return 0;
  const shown = Math.max(1, stats.shown);
  const clickRate = stats.clicked / shown;
  const completionRate = stats.completed / shown;
  const skipRate = stats.skipped / shown;
  return completionRate * 24 + clickRate * 10 - skipRate * 18;
}

/**
 * Remote feedback aggregates cache.
 * Populated by `setRemoteContextualFeedback` (called from the React hook after
 * fetching `/tours/contextual/feedback/aggregates`). Consumed synchronously by
 * `combinedFeedbackWeight` during draft scoring.
 *
 * Structure mirrors `FeedbackStore` but keyed on the same primary keys we use
 * remotely: per-selector and per-intent rollups.
 */
interface RemoteFeedbackEntry {
  shown: number;
  clicked: number;
  completed: number;
  skipped: number;
}

interface RemoteFeedbackStore {
  selectors: Record<string, RemoteFeedbackEntry>;
  intents: Partial<Record<TourDraftIntent, RemoteFeedbackEntry>>;
}

let remoteFeedbackStore: RemoteFeedbackStore | null = null;

export function setRemoteContextualFeedback(
  rawAggregates: Array<{
    selector: string;
    intent: string;
    shown: number;
    clicked: number;
    completed: number;
    skipped: number;
  }>,
): void {
  const selectors: Record<string, RemoteFeedbackEntry> = {};
  const intents: Partial<Record<TourDraftIntent, RemoteFeedbackEntry>> = {};

  for (const row of rawAggregates) {
    const intentKey = row.intent as TourDraftIntent;
    if (row.selector && row.selector !== '__unknown__') {
      const existing = selectors[row.selector] ?? { shown: 0, clicked: 0, completed: 0, skipped: 0 };
      existing.shown += row.shown;
      existing.clicked += row.clicked;
      existing.completed += row.completed;
      existing.skipped += row.skipped;
      selectors[row.selector] = existing;
    }
    const intentBucket = intents[intentKey] ?? { shown: 0, clicked: 0, completed: 0, skipped: 0 };
    intentBucket.shown += row.shown;
    intentBucket.clicked += row.clicked;
    intentBucket.completed += row.completed;
    intentBucket.skipped += row.skipped;
    intents[intentKey] = intentBucket;
  }

  remoteFeedbackStore = { selectors, intents };
  remoteFeedbackBootstrapped = true;
}

export function clearRemoteContextualFeedback(): void {
  remoteFeedbackStore = null;
  remoteFeedbackBootstrapped = false;
}

/**
 * Stability fix (instability source D): expose whether remote feedback was
 * bootstrapped, so the React hook can gate the first auto-generation on it
 * (avoids "cold start" race where the first scan uses 100% local feedback and
 * the next scan uses 70% remote / 30% local, leading to different drafts on
 * identical DOMs).
 */
export function isRemoteContextualFeedbackBootstrapped(): boolean {
  return remoteFeedbackBootstrapped;
}

function remoteFeedbackWeight(entry?: RemoteFeedbackEntry): number {
  if (!entry) return 0;
  const shown = Math.max(1, entry.shown);
  const clickRate = entry.clicked / shown;
  const completionRate = entry.completed / shown;
  const skipRate = entry.skipped / shown;
  return completionRate * 24 + clickRate * 10 - skipRate * 18;
}

/**
 * Blended feedback bonus combining cross-user remote aggregates (when
 * available) with the fresher per-browser local store.
 *
 * Weights:
 * - Remote signal (more reliable, larger sample): 0.7
 * - Local signal (fresher, single-browser): 0.3
 *
 * When no remote data is available, falls back fully to local. This avoids a
 * "cold start zero-bonus" while remote is still bootstrapping.
 */
function combinedFeedbackWeight(args: {
  selector: string;
  intent: TourDraftIntent;
  localStore: FeedbackStore;
}): number {
  if (isTrustdevContextualPanelSelector(args.selector)) return 0;

  const localSelector = args.localStore.selectors[args.selector];
  const localIntent = args.localStore.intents[args.intent];
  const localScore = feedbackWeight(localSelector) + feedbackWeight(localIntent) * 0.6;

  if (!remoteFeedbackStore) return localScore;

  const remoteSelector = remoteFeedbackStore.selectors[args.selector];
  const remoteIntent = remoteFeedbackStore.intents[args.intent];
  const remoteScore =
    remoteFeedbackWeight(remoteSelector) + remoteFeedbackWeight(remoteIntent) * 0.6;

  return remoteScore * 0.7 + localScore * 0.3;
}

/**
 * Stability fix C helper: effective rank value combining the deterministic
 * `score` (DOM/lexical only) with the `rankingBoost` (feedback bias). Used in
 * candidate `sort()` comparators to let cross-user feedback influence which
 * candidate becomes primary/support/etc., WITHOUT touching the filter
 * thresholds (`>= minScore` / `>= minConfidence`) that determine whether a
 * draft is produced at all.
 */
function effectiveRank(candidate: DetectedElement): number {
  return candidate.score + candidate.rankingBoost;
}

/**
 * Returns a bounded score delta in the range [-10, +10] that should be added
 * to a blueprint draft's score based on its historical performance with end
 * users. The signal is built from the same `feedbackWeight` formula used for
 * selectors / intents (completion strongly positive, click positive, skip
 * negative) to keep the ranking philosophy consistent across signals.
 *
 * Behavior:
 *  - Unknown blueprint (never shown): returns 0 — no boost, no penalty
 *    (otherwise we'd permanently bury freshly added blueprints).
 *  - Confident positive signal (many completions, low skip): up to +10
 *  - Confident negative signal (many skips, ~0 completion): down to -10
 *
 * This boost is applied AFTER the deterministic `computeBlueprintScore` so it
 * cannot turn a viable blueprint into a sub-`minScore` one (which would break
 * the stability guarantees of Phase 2). It only affects the final ordering /
 * tiebreak between competing blueprint drafts.
 */
function blueprintFeedbackBoost(
  blueprintId: string,
  localStore: FeedbackStore,
): number {
  const localStats = localStore.blueprints?.[blueprintId];
  // Remote feedback for blueprints isn't carried by the current `aggregates`
  // endpoint schema (selector + intent only). For now we rely on local-only,
  // and when the backend is extended to expose per-blueprint aggregates we
  // can blend remote 0.7 / local 0.3 here (mirroring `combinedFeedbackWeight`).
  if (!localStats) return 0;

  // Require a minimum sample size before we trust the signal, otherwise a
  // single accidental "skipped" event would bury the blueprint permanently.
  const totalEvents = localStats.shown + localStats.clicked + localStats.completed + localStats.skipped;
  if (totalEvents < 3) return 0;

  // Use the same weight function as selectors/intents for consistency. The
  // raw output of `feedbackWeight` is bounded by clickRate * 10 + completion *
  // 24 - skip * 18, i.e. roughly [-18, +34]. We clamp to [-10, +10] so the
  // blueprint score (60-100) is only nudged, not dominated.
  const raw = feedbackWeight(localStats);
  return Math.max(-10, Math.min(10, raw));
}

function isDisabled(element: HTMLElement): boolean {
  if ((element as HTMLButtonElement).disabled || (element as HTMLInputElement).disabled) return true;
  if (element.getAttribute('aria-disabled') === 'true') return true;
  if (element.getAttribute('disabled') !== null) return true;
  return false;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 16) return false;

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0) return false;

  const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"]');
  if (hiddenAncestor) return false;

  return true;
}

function getNoiseSelectors(options?: TourDraftGenerationOptions): string[] {
  if (!options?.noiseSelectors || options.noiseSelectors.length === 0) return DEFAULT_NOISE_SELECTORS;
  return Array.from(new Set([...DEFAULT_NOISE_SELECTORS, ...options.noiseSelectors]));
}

function resolveAnalysisRoot(options?: TourDraftGenerationOptions): ParentNode {
  const selector = normalizeText(options?.analysisRootSelector);
  if (!selector || typeof document === 'undefined') return document;

  try {
    const root = document.querySelector(selector);
    if (root instanceof HTMLElement && root.isConnected) return root;
  } catch {
    // invalid selector — fall back to full document
  }

  return document;
}

function isWithinAnalysisRoot(element: HTMLElement, options?: TourDraftGenerationOptions): boolean {
  const selector = normalizeText(options?.analysisRootSelector);
  if (!selector) return true;

  const root = resolveAnalysisRoot(options);
  if (root === document) return true;
  return root instanceof Element && root.contains(element);
}

function hasTransientKeyword(value?: string | null): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return TRANSIENT_UI_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function shouldIgnoreTransientContainer(element: HTMLElement): boolean {
  const container = element.closest('[role="dialog"], [aria-modal="true"], .modal, .drawer') as HTMLElement | null;
  if (!container) return false;

  const hasStableAnchor = STABLE_ATTRIBUTES.some((attribute) => container.hasAttribute(attribute));
  const className = typeof container.className === 'string' ? container.className : '';
  const containerTag = `${container.id || ''} ${className}`;
  const taggedTransient = hasTransientKeyword(containerTag) || container.getAttribute('data-temporary') === 'true';

  return taggedTransient && !hasStableAnchor;
}

function isNoiseElement(element: HTMLElement, options?: TourDraftGenerationOptions): boolean {
  if (!isWithinAnalysisRoot(element, options)) return true;
  // SDK debug panel: always noise (do not exempt data-tour-id on the panel root).
  if (isTrustdevContextualPanelElement(element)) return true;

  const selectors = getNoiseSelectors(options);
  const noiseMatch = selectors.some((selector) => {
    try {
      return element.matches(selector) || Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });

  if (noiseMatch) {
    const hasStableTourAnchor = STABLE_ATTRIBUTES.some((attributeName) => element.hasAttribute(attributeName));
    if (!hasStableTourAnchor) return true;
  }

  if (element.closest('[aria-hidden="true"], [hidden], [inert]')) return true;
  if (element.closest('[data-testid*="loader"], [data-testid*="tooltip"], [data-testid*="toast"]')) return true;

  const ariaLive = normalizeText(element.getAttribute('aria-live'));
  if (ariaLive === 'polite' || ariaLive === 'assertive') {
    const role = normalizeText(element.getAttribute('role'));
    if (role === 'status' || role === 'alert') return true;
  }

  if (options?.ignoreTransientUi !== false && shouldIgnoreTransientContainer(element)) {
    return true;
  }

  const label = normalizeText(getLabel(element));
  if (hasTransientKeyword(label)) return true;

  return false;
}

function getLabel(element: HTMLElement): string {
  return getShortElementLabel(element);
}

function detectZone(element: HTMLElement): CandidateZone {
  if (element.closest('[role="dialog"], [aria-modal="true"], .modal, .drawer')) return 'modal';
  if (element.closest('aside, [data-sidebar], [role="complementary"]')) return 'sidebar';
  if (element.closest('nav, [role="navigation"], [data-navigation]')) return 'navigation';
  if (element.closest('header, [role="banner"]')) return 'header';
  if (element.closest('form')) return 'form';
  if (element.closest('main, [role="main"]')) return 'main';
  if (element.closest('footer, [role="contentinfo"]')) return 'footer';
  return 'other';
}

function zoneWeight(zone: CandidateZone): number {
  switch (zone) {
    case 'main':
      return 16;
    case 'form':
      return 14;
    case 'navigation':
      return 12;
    case 'sidebar':
      return 10;
    case 'modal':
      return 9;
    case 'header':
      return 8;
    case 'footer':
      return 3;
    default:
      return 5;
  }
}

function interactionWeight(tagName: string): number {
  switch (tagName) {
    case 'button':
      return 14;
    case 'a':
      return 10;
    case 'input':
      return 9;
    case 'select':
      return 8;
    case 'textarea':
      return 7;
    default:
      return 5;
  }
}

function isActionableElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'button') return true;
  if (tagName === 'a') return Boolean((element as HTMLAnchorElement).href || element.getAttribute('href'));
  if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') return true;

  const role = (element.getAttribute('role') || '').toLowerCase();
  if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') return true;

  if (typeof element.onclick === 'function') return true;
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') return true;
  return element.tabIndex >= 0;
}

function isFormControlElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'textarea';
}

function selectorStabilityDelta(selector: string): number {
  if (!selector) return 0;

  if (selector.includes('[data-tour-id=')) return 18;
  if (selector.includes('[data-testid=')) return 12;
  if (selector.includes('[data-cy=') || selector.includes('[data-qa=')) return 10;
  if (selector.startsWith('#')) return 6;

  if (selector.includes(':nth-of-type(') || selector.includes(':nth-child(')) return -20;
  return 0;
}

function getScoreFeatures(element: HTMLElement): ScoreFeatures {
  const rect = element.getBoundingClientRect();
  const area = rect.width * rect.height;

  // Stability fix (instability source A): use document-relative position instead
  // of viewport-relative. `rect.top` shifts with the user's current scrollY, so
  // a same element would gain/lose up to +12 score points between two
  // generations (and consequently change which draft becomes primary, which
  // changes the number of steps and number of drafts). We now reward elements
  // located in the first viewport-height of the document ("above the fold"),
  // which is stable regardless of the user's scroll position.
  const scrollY = typeof window !== 'undefined' ? window.scrollY || 0 : 0;
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const absoluteCenterY = rect.top + scrollY + rect.height / 2;
  // Distance from the natural "first fold" center (i.e. viewportHeight/2 inside
  // the document, independent of current scroll).
  const distanceFromHeader = Math.abs(absoluteCenterY - viewportHeight / 2);
  const viewportWeight = Math.max(0, 12 - (distanceFromHeader / viewportHeight) * 8);
  const zone = detectZone(element);

  return {
    disabled: isDisabled(element),
    area,
    viewportWeight,
    zoneWeight: zoneWeight(zone),
    interactionWeight: interactionWeight(element.tagName.toLowerCase()),
  };
}

function buildStableAttributeSelector(tagName: string, attributeName: string, attributeValue: string): string {
  return `${tagName}[${attributeName}="${escapeAttributeValue(attributeValue)}"]`;
}

function tryUniqueSelector(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function isStableSelectorForPublish(selector?: string): boolean {
  if (!selector) return false;
  return (
    /data-tour-id|data-testid|data-cy|data-qa|#[A-Za-z][\w-]*\b|\[aria-label/i.test(selector) ||
    /\[placeholder=["'][^"']+["']\]/i.test(selector) ||
    /a\[href[\^*$|~]?=["']\/[^"']*["']\]/i.test(selector)
  );
}

function pickPreferredSelector(element: HTMLElement, selectorCandidates: string[]): string {
  const ranked = [...selectorCandidates].sort((a, b) => selectorStabilityScore(b) - selectorStabilityScore(a));
  return ranked.find((selector) => isStableSelectorForPublish(selector)) || ranked[0] || buildUniqueSelector(element);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function selectorStabilityScore(selector?: string): number {
  if (!selector) return 0;
  if (selector.includes('[data-tour-id=')) return 96;
  if (selector.includes('[data-testid=')) return 90;
  if (selector.includes('[data-cy=') || selector.includes('[data-qa=')) return 86;
  if (selector.startsWith('#')) return 78;
  if (selector.includes('[aria-label=')) return 68;
  if (selector.includes('[role=')) return 60;
  if (selector.includes(':nth-of-type(') || selector.includes(':nth-child(')) return 22;
  return clamp(50 + selectorStabilityDelta(selector), 20, 82);
}

function buildSelectorPart(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  for (const attributeName of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attributeName);
    if (!value) continue;

    const selector = buildStableAttributeSelector(tagName, attributeName, value);
    if (tryUniqueSelector(selector)) {
      return selector;
    }
  }

  if (element.id) {
    const escapedId = CSS.escape(element.id);
    const idSelector = `#${escapedId}`;
    if (tryUniqueSelector(idSelector)) {
      return idSelector;
    }

    const tagIdSelector = `${tagName}#${escapedId}`;
    if (tryUniqueSelector(tagIdSelector)) {
      return tagIdSelector;
    }
  }

  const role = element.getAttribute('role');
  if (role) {
    const roleSelector = `${tagName}[role="${escapeAttributeValue(role)}"]`;
    if (tryUniqueSelector(roleSelector)) return roleSelector;
  }

  const parent = element.parentElement;
  if (!parent) return tagName;

  const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  const index = sameTagSiblings.indexOf(element) + 1;
  return `${tagName}:nth-of-type(${Math.max(1, index)})`;
}

function getUniqueSelectorOrNull(selector: string): string | null {
  return tryUniqueSelector(selector) ? selector : null;
}

function buildSelectorCandidates(element: HTMLElement): string[] {
  const tagName = element.tagName.toLowerCase();
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (selector: string | null | undefined) => {
    if (!selector) return;
    if (seen.has(selector)) return;
    seen.add(selector);
    candidates.push(selector);
  };

  for (const attributeName of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attributeName);
    if (!value) continue;
    push(getUniqueSelectorOrNull(buildStableAttributeSelector(tagName, attributeName, value)));
  }

  if (element.id) {
    push(getUniqueSelectorOrNull(`#${CSS.escape(element.id)}`));
    push(getUniqueSelectorOrNull(`${tagName}#${CSS.escape(element.id)}`));
  }

  const role = element.getAttribute('role');
  if (role) {
    push(getUniqueSelectorOrNull(`${tagName}[role="${escapeAttributeValue(role)}"]`));
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    push(getUniqueSelectorOrNull(`${tagName}[aria-label="${escapeAttributeValue(ariaLabel)}"]`));
  }

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && (tagName === 'input' || tagName === 'textarea')) {
    push(getUniqueSelectorOrNull(`${tagName}[placeholder="${escapeAttributeValue(placeholder)}"]`));
  }

  const href = element.getAttribute('href');
  if (href && tagName === 'a') {
    push(getUniqueSelectorOrNull(`a[href="${escapeAttributeValue(href)}"]`));
  }

  const path: string[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;
  while (current && current !== document.body && depth < 7) {
    path.unshift(buildSelectorPart(current));
    push(getUniqueSelectorOrNull(path.join(' > ')));
    if (STABLE_ATTRIBUTES.some((attributeName) => current?.hasAttribute(attributeName))) break;
    current = current.parentElement;
    depth += 1;
  }

  const fallback = path.join(' > ') || tagName;
  push(fallback);
  return candidates;
}

function buildUniqueSelector(element: HTMLElement): string {
  const cached = runtime.selectorCache.get(element);
  if (cached && tryUniqueSelector(cached)) return cached;
  const candidates = buildSelectorCandidates(element);
  const selected = candidates[0] || element.tagName.toLowerCase();
  runtime.selectorCache.set(element, selected);
  return selected;
}

/** Avoid false positives such as discovery term `tour` matching token `projet`. */
function lexiconTermMatchesToken(token: string, term: string): boolean {
  if (!token || !term) return false;
  if (token === term) return true;
  // Short stems (e.g. `tour`, `cre`) only match whole tokens, not substrings of other words.
  if (term.length < 4) return false;
  return token.includes(term);
}

function computeSemanticMatches(label: string, lexicon: Lexicon): SemanticMatchResult {
  const tokens = tokenize(label);
  const tokenSet = new Set(tokens);
  const tokenHits: Record<TourDraftIntent, number> = {
    discovery: 0,
    'primary-action': 0,
    'support-navigation': 0,
    'form-flow': 0,
  };

  for (const intent of Object.keys(lexicon) as TourDraftIntent[]) {
    const terms = lexicon[intent];
    for (const term of terms) {
      const normalizedTerm = stemToken(normalizeText(term));
      if (!normalizedTerm) continue;

      if (tokenSet.has(normalizedTerm) || Array.from(tokenSet).some((token) => lexiconTermMatchesToken(token, normalizedTerm))) {
        tokenHits[intent] += 1;
      }
    }
  }

  const totalHits = tokenHits.discovery + tokenHits['primary-action'] + tokenHits['support-navigation'] + tokenHits['form-flow'];
  return { tokenHits, totalHits };
}

function getIntentFromSemanticHits(result: SemanticMatchResult, zone: CandidateZone): TourDraftIntent {
  const intentPriority: TourDraftIntent[] = ['primary-action', 'form-flow', 'support-navigation', 'discovery'];
  let bestIntent: TourDraftIntent = 'discovery';
  let bestScore = -1;

  for (const intent of intentPriority) {
    const value = result.tokenHits[intent];
    if (value > bestScore) {
      bestIntent = intent;
      bestScore = value;
    }
  }

  if (bestScore === 0) {
    if (zone === 'form') return 'form-flow';
    if (zone === 'navigation' || zone === 'sidebar' || zone === 'header') return 'support-navigation';
  }

  return bestIntent;
}

function enrichReasonsWithRoleAndZone(reasons: string[], intent: TourDraftIntent, zone: CandidateZone, role?: string): void {
  reasons.push(`intent inferred: ${intent}`);
  reasons.push(`zone detected: ${zone}`);

  if (!role) return;

  if (role.toLowerCase().includes('admin') && (intent === 'primary-action' || intent === 'form-flow')) {
    reasons.push('role boost: admin workflow relevance');
  }

  if (role.toLowerCase().includes('support') && intent === 'support-navigation') {
    reasons.push('role boost: support workflow relevance');
  }
}

function scoreElement(element: HTMLElement, options?: TourDraftGenerationOptions): DetectedElement | null {
  if (activeDiagnostics) activeDiagnostics.considered += 1;

  const cached = runtime.scoreCache.get(element);
  if (cached && cached.domVersion === runtime.domVersion) {
    if (activeDiagnostics) {
      activeDiagnostics.cacheHits += 1;
      if (cached.detected) {
        activeDiagnostics.accepted += 1;
        activeDiagnostics.selectorStabilityBonus += cached.detected.selectorStabilityBonus;
        activeDiagnostics.selectorFragilityPenalty += cached.detected.selectorFragilityPenalty;
        activeDiagnostics.actionabilityPenalty += cached.detected.actionabilityPenalty;
      }
    }
    return cached.detected;
  }

  if (!isVisible(element)) {
    if (activeDiagnostics) activeDiagnostics.rejectedInvisible += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  if (options?.noiseFilteringEnabled !== false && isNoiseElement(element, options)) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoise += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  if (isOversizedStepTarget(element)) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoise += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const label = getLabel(element);
  if (!label) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoLabel += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const lexicon = getLexicon(options);
  const semantic = computeSemanticMatches(label, lexicon);
  const semanticScore = buildSemanticAffinity(label, options);

  const selectorCandidates = buildSelectorCandidates(element);
  const selector = pickPreferredSelector(element, selectorCandidates);
  if (!selector) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoSelector += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const zone = detectZone(element);
  const features = getScoreFeatures(element);
  const tagName = element.tagName.toLowerCase();
  const inputType = (element.getAttribute('type') || '').toLowerCase();
  let intent = getIntentFromSemanticHits(semantic, zone);
  const sessionContext = getSessionContext(options);
  const isActionable = isActionableElement(element);
  const isFormControl = isFormControlElement(element);
  const normalizedLabel = normalizeText(label);
  const isPlaceOrderCta =
    isPlaceOrderCtaLabel(normalizedLabel) &&
    (tagName === 'button' ||
      (tagName === 'input' && (inputType === 'submit' || inputType === 'button' || inputType === '')));
  const isPaymentMethod = isPaymentMethodLabel(normalizedLabel) && tagName === 'button';

  if (isPlaceOrderCta) {
    intent = 'primary-action';
  } else if (isPaymentMethod && intent === 'primary-action') {
    intent = 'discovery';
  }

  if (intent === 'primary-action' && !isActionable) {
    intent = zone === 'navigation' || zone === 'sidebar' || zone === 'header' ? 'support-navigation' : 'discovery';
  }

  if (intent === 'form-flow' && !isFormControl) {
    intent = 'discovery';
  }

  if (isIntentBlocked(intent, sessionContext)) {
    if (activeDiagnostics) activeDiagnostics.rejectedBySession += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  if (isSelectorCompleted(selector, sessionContext)) {
    if (activeDiagnostics) activeDiagnostics.rejectedBySession += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const reasons: string[] = [];
  const personaScore = buildPersonaAffinity(intent, options);
  const sequenceScore = buildSequenceAffinity(element, intent, options);
  // Stability fix B: prefer the per-generation snapshot to a fresh localStorage
  // read so all candidates in the same scan see the same feedback state.
  const feedbackStore = currentFeedbackSnapshot ?? getFeedbackStore();
  const feedbackBonus = combinedFeedbackWeight({ selector, intent, localStore: feedbackStore });

  let score = 0;
  score += semantic.totalHits * 10;
  score += semanticScore * 30;
  score += personaScore * 20;
  score += sequenceScore * 18;
  score += intentSessionAffinity(intent, sessionContext) * 24;
  score += features.zoneWeight;
  score += features.interactionWeight;
  score += Math.min(14, Math.log10(Math.max(10, features.area)) * 4);
  score += features.viewportWeight;

  const stabilityDelta = selectorStabilityDelta(selector);
  const stabilityScore = selectorStabilityScore(selector);
  const selectorStabilityBonus = Math.max(0, stabilityDelta);
  const selectorFragilityPenalty = Math.min(0, stabilityDelta);
  let actionabilityPenalty = 0;
  score += stabilityDelta;
  if (stabilityDelta > 0) reasons.push(`selector stability bonus: +${stabilityDelta}`);
  if (stabilityDelta < 0) reasons.push(`selector stability penalty: ${stabilityDelta}`);

  if (zone === 'navigation' || zone === 'sidebar') {
    score += 6;
    reasons.push('navigation context');
  }

  if (zone === 'form') {
    score += 8;
    reasons.push('form context');
  }

  if (intent === 'primary-action') {
    if (zone === 'form' || zone === 'main') {
      score += 14;
      reasons.push('primary-action boost: form/main zone');
    }

    if (isPlaceOrderCta) {
      score += 55;
      reasons.push('cta-primary boost: place order control');
    }

    if (isPaymentMethod) {
      score -= 45;
      reasons.push('utility penalty: payment method misclassified as primary');
    }

    if (tagName === 'button' || (tagName === 'input' && (inputType === 'submit' || inputType === 'button'))) {
      score += 14;
      reasons.push('primary-action boost: actionable control');
    }

    if (/(create|creer|d[ée]marrer|start|lancer|save|enregistrer|validate|valider|submit|soumettre|confirm|confirmer|publish|publier|refresh|relancer)/i.test(normalizedLabel)) {
      score += 12;
      reasons.push('primary-action boost: high-intent action verb');
    }

    if (tagName === 'a' && /(discover|d[ée]couvrir|guide|explore|documentation|docs|help|aide)/i.test(normalizedLabel)) {
      score -= 30;
      reasons.push('primary-action penalty: discovery/support link');
    }

    // Dynamic UIs (transient DOM, noise filtering enabled) need a slight bias
    // toward stable main actions instead of entry headings.
    const dynamicContext = options?.noiseFilteringEnabled !== false && options?.ignoreTransientUi !== false;
    const isActionControl = tagName === 'button' || (tagName === 'input' && (inputType === 'submit' || inputType === 'button'));
    if (dynamicContext && zone === 'main' && isActionControl) {
      score += 8;
      reasons.push('dynamic-context boost: main action control');
    }

    if (zone === 'navigation' || zone === 'sidebar' || zone === 'header') {
      score -= 28;
      reasons.push('primary-action penalty: navigation-like zone');
    }

    if (tagName === 'a' && (zone === 'navigation' || zone === 'sidebar' || zone === 'header')) {
      score -= 14;
      reasons.push('primary-action penalty: navigation link over action control');
    }
  }

  if (features.disabled) {
    score -= 28;
    reasons.push('penalty: disabled element');
  }

  if ((intent === 'primary-action' || intent === 'form-flow') && !isActionable) {
    actionabilityPenalty -= 42;
    score -= 42;
    reasons.push('penalty: non-actionable element for action intent');
  }

  if (intent === 'support-navigation' && !isActionable) {
    actionabilityPenalty -= 20;
    score -= 20;
    reasons.push('penalty: non-actionable element for navigation intent');
  }

  // Stability fix C: feedbackBonus is NOT added to `score`. The `score` is the
  // deterministic, DOM-only signal that drives `>= minScore` / `>= minConfidence`
  // filtering, so the *number* of drafts produced for a given DOM stays stable
  // across sessions. The feedback signal is stored in `rankingBoost` and only
  // applied inside `.sort()` comparators (see `pickBest*` / `pickAny*`) to
  // nudge which candidate becomes primary/support, without ever silently
  // promoting or demoting a draft below a filter threshold.
  const placeOrderRankingBoost = isPlaceOrderCta ? 80 : isPaymentMethod ? -60 : 0;
  const rankingBoost = feedbackBonus + placeOrderRankingBoost;
  if (placeOrderRankingBoost !== 0) {
    reasons.push(`place-order ranking bias: ${placeOrderRankingBoost > 0 ? '+' : ''}${placeOrderRankingBoost}`);
  }
  if (feedbackBonus !== 0) {
    reasons.push(`feedback ranking bias (not filter): ${feedbackBonus > 0 ? '+' : ''}${feedbackBonus.toFixed(1)}`);
  }

  if (wasSelectorSeen(selector, sessionContext)) {
    score -= 8;
    reasons.push('session penalty: selector already seen in session');
  }

  if (isActionable) {
    reasons.push('interactive element');
  }

  if (semantic.totalHits > 0) {
    reasons.push(`semantic token hits: ${semantic.totalHits}`);
  }

  if (sessionContext?.currentStage) {
    reasons.push(`session stage: ${normalizeStage(sessionContext.currentStage)}`);
  }

  enrichReasonsWithRoleAndZone(reasons, intent, zone, options?.userRole);

  if (options?.userRole) {
    const role = options.userRole.toLowerCase();
    if (role.includes('admin') && intent === 'primary-action') score += 8;
    if (role.includes('support') && intent === 'support-navigation') score += 8;
    if (role.includes('manager') && (intent === 'discovery' || intent === 'support-navigation')) score += 5;
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  // Stability fix C: confidence is computed from deterministic DOM/lexical
  // signals only. Passing 0 as the feedbackBonus argument keeps backward
  // compatibility with the `confidenceFromSignals` shape but removes the
  // ±10-point oscillation that previously made drafts cross the
  // `>= minConfidence` threshold between two sessions for unchanged DOMs.
  const confidence = confidenceFromSignals(normalizedScore, semanticScore, personaScore, sequenceScore, 0);
  const detected: DetectedElement = {
    element,
    selector,
    selectorCandidates,
    label,
    score: normalizedScore,
    rankingBoost,
    confidence,
    intent,
    reasons,
    tokenHits: semantic.totalHits,
    zone,
    semanticScore,
    personaScore,
    sequenceScore,
    selectorStabilityScore: stabilityScore,
    selectorStabilityBonus,
    selectorFragilityPenalty,
    actionabilityPenalty,
  };

  if (activeDiagnostics) {
    activeDiagnostics.accepted += 1;
    activeDiagnostics.selectorStabilityBonus += selectorStabilityBonus;
    activeDiagnostics.selectorFragilityPenalty += selectorFragilityPenalty;
    activeDiagnostics.actionabilityPenalty += actionabilityPenalty;
  }

  runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected });
  return detected;
}

function configureBatching(options?: TourDraftGenerationOptions): void {
  const requestedWindow = options?.mutationBatchWindowMs ?? DEFAULT_MUTATION_BATCH_WINDOW_MS;
  const requestedLimit = options?.maxDirtyNodesPerBatch ?? DEFAULT_MAX_DIRTY_NODES_PER_BATCH;

  runtime.mutationBatchWindowMs = Math.max(MIN_MUTATION_BATCH_WINDOW_MS, Math.min(1500, requestedWindow));
  runtime.maxDirtyNodesPerBatch = Math.max(50, Math.min(5000, requestedLimit));
}

function isMeaningfulCandidateMutation(mutation: MutationRecord): boolean {
  if (mutation.type === 'childList') {
    return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
  }
  return false;
}

/**
 * Disconnect the incremental candidate observer so it does not keep watching
 * `document.body` (or a large subtree) after a generation pass completes.
 */
export function releaseCandidateMutationObserver(): void {
  if (runtime.mutationFlushTimer) {
    clearTimeout(runtime.mutationFlushTimer);
    runtime.mutationFlushTimer = undefined;
  }
  if (runtime.observer) {
    try {
      runtime.observer.disconnect();
    } catch {
      /* noop */
    }
    runtime.observer = undefined;
    runtime.observedRoot = undefined;
  }
  runtime.batchedDirtyNodes.clear();
  runtime.trackedElements.clear();
  runtime.fullRescanNeeded = true;
}

function flushBatchedMutations(forceFullRescan = false): void {
  if (runtime.mutationFlushTimer) {
    clearTimeout(runtime.mutationFlushTimer);
    runtime.mutationFlushTimer = undefined;
  }

  if (forceFullRescan) {
    runtime.fullRescanNeeded = true;
    runtime.batchedDirtyNodes.clear();
    runtime.dirtyNodes.clear();
    runtime.domVersion += 1;
    return;
  }

  if (runtime.batchedDirtyNodes.size === 0) return;

  if (runtime.batchedDirtyNodes.size > runtime.maxDirtyNodesPerBatch) {
    runtime.fullRescanNeeded = true;
    runtime.batchedDirtyNodes.clear();
    runtime.dirtyNodes.clear();
    runtime.domVersion += 1;
    return;
  }

  for (const node of runtime.batchedDirtyNodes) {
    runtime.dirtyNodes.add(node);
  }

  runtime.batchedDirtyNodes.clear();
  runtime.domVersion += 1;
}

function scheduleMutationFlush(): void {
  if (runtime.mutationFlushTimer) return;

  runtime.mutationFlushTimer = setTimeout(() => {
    runtime.mutationFlushTimer = undefined;
    flushBatchedMutations();
  }, runtime.mutationBatchWindowMs);
}

function resolveMutationObserverRoot(options?: TourDraftGenerationOptions): ParentNode {
  const analysisRoot = resolveAnalysisRoot(options);
  if (analysisRoot instanceof HTMLElement && analysisRoot.isConnected) {
    return analysisRoot;
  }
  if (typeof document !== 'undefined') {
    const main = document.querySelector('main');
    if (main instanceof HTMLElement && main.isConnected) return main;
    if (document.body) return document.body;
  }
  return document;
}

function ensureMutationObserver(options?: TourDraftGenerationOptions): void {
  if (typeof document === 'undefined') return;
  configureBatching(options);

  const observeRoot = resolveMutationObserverRoot(options);
  if (runtime.observer && runtime.observedRoot === observeRoot) return;

  releaseCandidateMutationObserver();

  runtime.observer = new MutationObserver((mutations) => {
    let structuralCount = 0;
    for (const mutation of mutations) {
      if (!isMeaningfulCandidateMutation(mutation)) continue;
      structuralCount += 1;
      if (mutation.target instanceof HTMLElement) {
        runtime.batchedDirtyNodes.add(mutation.target);
      }

      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLElement) runtime.batchedDirtyNodes.add(node);
      }

      for (const node of Array.from(mutation.removedNodes)) {
        if (node instanceof HTMLElement) runtime.trackedElements.delete(node);
      }
    }

    if (structuralCount === 0) return;

    if (mutations.length > runtime.maxDirtyNodesPerBatch * 2) {
      flushBatchedMutations(true);
      return;
    }

    scheduleMutationFlush();
  });

  const observeTarget =
    observeRoot instanceof Document ? observeRoot.documentElement || observeRoot.body : observeRoot;
  if (!observeTarget) return;

  runtime.observer.observe(observeTarget, {
    subtree: true,
    childList: true,
  });
  runtime.observedRoot = observeRoot;
}

function harvestInteractiveNodesFromRoot(root: ParentNode): HTMLElement[] {
  if (!(root instanceof Element) && !(root instanceof Document)) return [];
  return Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR)) as HTMLElement[];
}

function collectCandidates(
  options?: TourDraftGenerationOptions,
  rescanAttempt = 0,
): DetectedElement[] {
  prepareCandidateScan(options);
  ensureMutationObserver(options);
  flushBatchedMutations();

  const maxCandidates = options?.maxCandidates ?? 300;
  const useIncremental = options?.enableIncremental !== false;
  const nodesToEvaluate: Set<HTMLElement> = new Set<HTMLElement>();

  const needsFullRescan =
    !useIncremental ||
    runtime.fullRescanNeeded ||
    runtime.trackedElements.size === 0 ||
    countConnectedTrackedInAnalysisRoot(options) === 0;

  if (needsFullRescan) {
    runtime.fullRescanNeeded = false;
    runtime.batchedDirtyNodes.clear();
    runtime.dirtyNodes.clear();
    runtime.domVersion += 1;

    const scanRoot = resolveAnalysisRoot(options);
    const all = harvestInteractiveNodesFromRoot(scanRoot).slice(0, MAX_TRACKED_ELEMENTS);
    runtime.trackedElements = new Set(all);

    for (const element of runtime.trackedElements) nodesToEvaluate.add(element);
  } else {
    for (const dirtyRoot of runtime.dirtyNodes) {
      if (!dirtyRoot.isConnected) continue;

      if (dirtyRoot.matches(INTERACTIVE_SELECTOR)) {
        runtime.trackedElements.add(dirtyRoot);
        nodesToEvaluate.add(dirtyRoot);
      }

      for (const element of harvestInteractiveNodesFromRoot(dirtyRoot)) {
        runtime.trackedElements.add(element);
        nodesToEvaluate.add(element);
      }
    }

    runtime.dirtyNodes.clear();

    // Re-score already tracked elements that remain connected when incremental updates are sparse.
    if (nodesToEvaluate.size < 12) {
      let count = 0;
      for (const element of runtime.trackedElements) {
        if (!element.isConnected) continue;
        nodesToEvaluate.add(element);
        count += 1;
        if (count > 120) break;
      }
    }
  }

  const detected: DetectedElement[] = [];
  for (const element of nodesToEvaluate) {
    if (!element.isConnected) {
      runtime.trackedElements.delete(element);
      continue;
    }

    const candidate = scoreElement(element, options);
    if (candidate) detected.push(candidate);
  }

  const deduped = dedupeCandidates(detected, options);

  if (deduped.length === 0 && needsFullRescan && rescanAttempt === 0) {
    const scanRoot = resolveAnalysisRoot(options);
    if (scanRoot instanceof HTMLElement && scanRoot.isConnected) {
      const probeCount = harvestInteractiveNodesFromRoot(scanRoot).length;
      if (probeCount > 0) {
        runtime.fullRescanNeeded = true;
        runtime.trackedElements.clear();
        runtime.domVersion += 1;
        return collectCandidates({ ...(options ?? {}), enableIncremental: false }, 1);
      }
    }
  }

  return deduped
    .sort((a, b) => effectiveRank(b) - effectiveRank(a))
    .slice(0, maxCandidates);
}

function dedupeCandidates(candidates: DetectedElement[], options?: TourDraftGenerationOptions): DetectedElement[] {
  const dedupeLabels = options?.dedupeLabels !== false;
  const selectorMap = new Map<string, DetectedElement>();
  const labelMap = new Map<string, DetectedElement>();

  for (const candidate of candidates) {
    const existingBySelector = selectorMap.get(candidate.selector);
    if (!existingBySelector || existingBySelector.score < candidate.score) {
      selectorMap.set(candidate.selector, candidate);
    }
  }

  if (!dedupeLabels) {
    return Array.from(selectorMap.values());
  }

  for (const candidate of selectorMap.values()) {
    const labelKey = normalizeText(candidate.label);
    const existing = labelMap.get(labelKey);
    if (!existing || existing.score < candidate.score) {
      labelMap.set(labelKey, candidate);
    }
  }

  return Array.from(labelMap.values());
}

function primaryActionTieBreakerRank(candidate: DetectedElement): number {
  const label = normalizeText(candidate.label);
  if (isPlaceOrderCtaLabel(label)) return 200;
  if (isPaymentMethodLabel(label)) return -80;

  const tag = candidate.element.tagName.toLowerCase();
  const inputType = (candidate.element.getAttribute('type') || '').toLowerCase();

  // Strong preference for actionable controls in form/main areas
  const controlRank = tag === 'button'
    ? 4
    : (tag === 'input' && (inputType === 'submit' || inputType === 'button'))
      ? 3
      : tag === 'a'
        ? 1
        : 0;

  const zoneRank = candidate.zone === 'form'
    ? 3
    : candidate.zone === 'main'
      ? 2
      : candidate.zone === 'header'
        ? 4
      : (candidate.zone === 'navigation' || candidate.zone === 'sidebar')
        ? 0
        : 1;

  return controlRank * 10 + zoneRank;
}

/** Prefer top-of-page / header CTAs for generic singlePageTour slot 1 (e.g. + Add Project over Add Member). */
function genericPrimarySlotRank(candidate: DetectedElement): number {
  let rank = effectiveRank(candidate) + primaryActionTieBreakerRank(candidate) * 3;
  const label = normalizeText(candidate.label);
  const rect = candidate.element.getBoundingClientRect();

  if (candidate.zone === 'header') rank += 45;
  if (candidate.zone === 'main' && rect.top < 300) rank += 30;
  if (rect.top < 200) rank += 20;
  if (rect.top > 500) rank -= 28;
  if (/^\+?\s*add project|^create project|^new project/i.test(label)) rank += 40;
  if (/^import data|^import\b/i.test(label)) rank += 18;
  if (/add project|new project|create project|import data|get started|commencer/i.test(label)) rank += 22;
  if (/start meeting|join meeting|meeting with|reminder/i.test(label)) rank -= 50;
  if (/^new$/i.test(label) && rect.top > 250) rank -= 25;
  if (/add member|invite member|invite team/i.test(label) && rect.top > 380) rank -= 35;
  if (candidate.zone === 'sidebar' && candidate.intent === 'primary-action') rank -= 30;

  return rank;
}

function candidateConfidenceRatio(candidate: DetectedElement): number {
  return Math.max(0, Math.min(1, candidate.confidence / 100));
}

function isSameDomTarget(a: DetectedElement, b: DetectedElement): boolean {
  return a.selector === b.selector || a.element === b.element;
}

function isBlockedByChain(candidate: DetectedElement, chain: DetectedElement[]): boolean {
  return chain.some((item) => isSameDomTarget(item, candidate));
}

function isStrictSearchSlotCandidate(candidate: DetectedElement): boolean {
  const element = candidate.element;
  const tag = element.tagName.toLowerCase();
  if (element.getAttribute('role') === 'searchbox') return true;
  if (tag !== 'input' && tag !== 'textarea') return false;

  const type = (element.getAttribute('type') || '').toLowerCase();
  if (type === 'search') return true;

  const placeholder = normalizeText(element.getAttribute('placeholder'));
  const ariaLabel = normalizeText(element.getAttribute('aria-label'));
  return /search|recherch|filter|filtr|find|lookup|query/.test(`${placeholder} ${ariaLabel}`);
}

function isTabNavigationCandidate(candidate: DetectedElement): boolean {
  if (!isInNavigationArea(candidate)) return false;
  const role = (candidate.element.getAttribute('role') || '').toLowerCase();
  if (role === 'tab') return true;
  return Boolean(candidate.element.closest('[role="tablist"]'));
}

function isSidebarNavigationCandidate(candidate: DetectedElement): boolean {
  return (
    isInNavigationArea(candidate) &&
    candidate.element.tagName.toLowerCase() === 'a' &&
    !isTabNavigationCandidate(candidate)
  );
}

function navigationSlotRank(candidate: DetectedElement): number {
  let rank = effectiveRank(candidate);
  if (isTabNavigationCandidate(candidate)) rank += 35;
  const label = normalizeText(candidate.label);
  if (/^(dashboard|home|overview|accueil)$/i.test(label)) rank += 42;
  if (/^(tasks?|analytics|calendar|team|projects?|reports?)$/i.test(label)) rank += 30;
  if (/^(help|support|documentation|logout|log out|sign out)$/i.test(label)) rank -= 48;
  return rank;
}

function isExplicitSettingsOrProfileCandidate(candidate: DetectedElement): boolean {
  const label = normalizeText(candidate.label);
  const aria = normalizeText(candidate.element.getAttribute('aria-label'));
  const combined = `${label} ${aria}`.trim();
  if (!combined) return false;

  if (/^(settings|setting|preferences|préférences|profile|profil|account|compte|my account|mon compte)$/i.test(combined)) {
    return true;
  }

  return /user settings|account settings|profil utilisateur|mon profil/i.test(combined);
}

function isAnalyticsOrResultSlotCandidate(candidate: DetectedElement): boolean {
  if (isExplicitSettingsOrProfileCandidate(candidate)) return false;

  const label = normalizeText(candidate.label);
  if (/add member|invite member|invite team|add user|member$/i.test(label)) return false;
  if (candidate.intent === 'primary-action' || candidate.intent === 'support-navigation') return false;

  if (candidate.intent === 'discovery') return true;
  if (
    /analytics|analytique|chart|graph|overview|insight|stat|kpi|revenue|progress|metric|report|activity|weekly|dashboard card/i.test(
      label,
    )
  ) {
    return true;
  }

  if (candidate.element.querySelector('canvas, svg')) return true;
  return false;
}

function isUtilitySlotCandidate(candidate: DetectedElement): boolean {
  if (isExplicitSettingsOrProfileCandidate(candidate)) return false;

  const label = normalizeText(candidate.label);
  if (/filter|sort|trier|date range|calendar|view toggle|picker|range|export|import data/i.test(label)) {
    const tag = candidate.element.tagName.toLowerCase();
    return tag === 'button' || tag === 'input' || tag === 'select';
  }

  if (SEQUENCE_UTILITY_LABEL.test(label) && !isFormControlElement(candidate.element)) {
    return true;
  }

  return false;
}

function isSecondaryActionSlotCandidate(
  candidate: DetectedElement,
  primary: DetectedElement | null,
): boolean {
  if (primary && isSameDomTarget(candidate, primary)) return false;
  if (isStrictSearchSlotCandidate(candidate)) return false;
  if (isExplicitSettingsOrProfileCandidate(candidate)) return false;

  if (candidate.intent === 'primary-action') return true;

  const label = normalizeText(candidate.label);
  if (/import|export|download|upload|invite|duplicate|share/i.test(label) && isActionableElement(candidate.element)) {
    return true;
  }

  return candidate.element.tagName.toLowerCase() === 'button' && candidate.intent === 'support-navigation';
}

function pickBestCandidate(candidates: DetectedElement[], intent: TourDraftIntent, excludedSelectors: string[] = []): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  return (
    candidates
      .filter((candidate) => candidate.intent === intent && !blocked.has(candidate.selector))
      .sort((a, b) => {
        const rankDiff = effectiveRank(b) - effectiveRank(a);
        if (rankDiff !== 0) return rankDiff;
        if (intent === 'primary-action') {
          const tie = primaryActionTieBreakerRank(b) - primaryActionTieBreakerRank(a);
          if (tie !== 0) return tie;
        }
        return b.confidence - a.confidence;
      })[0] || null
  );
}

function pickBestActionableCandidate(candidates: DetectedElement[], excludedSelectors: string[] = []): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  return (
    candidates
      .filter((candidate) => !blocked.has(candidate.selector) && isActionableElement(candidate.element))
      .sort((a, b) => {
        const rankDiff = effectiveRank(b) - effectiveRank(a);
        if (rankDiff !== 0) return rankDiff;
        const tie = primaryActionTieBreakerRank(b) - primaryActionTieBreakerRank(a);
        if (tie !== 0) return tie;
        return b.confidence - a.confidence;
      })[0] || null
  );
}

function pickBestPrimaryActionCandidate(candidates: DetectedElement[], excludedSelectors: string[] = []): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  const actionable = candidates.filter((candidate) => {
    if (blocked.has(candidate.selector)) return false;
    if (candidate.intent === 'primary-action') return true;
    return (
      isPlaceOrderCtaLabel(candidate.label) && candidate.element.tagName.toLowerCase() === 'button'
    );
  });
  const controls = actionable.filter((candidate) => {
    const tag = candidate.element.tagName.toLowerCase();
    const inputType = (candidate.element.getAttribute('type') || '').toLowerCase();
    return tag === 'button' || (tag === 'input' && (inputType === 'submit' || inputType === 'button'));
  });

  const pool = controls.length > 0 ? controls : actionable;
  return (
    pool
      .sort((a, b) => {
        const rankDiff = effectiveRank(b) - effectiveRank(a);
        if (rankDiff !== 0) return rankDiff;
        const tie = primaryActionTieBreakerRank(b) - primaryActionTieBreakerRank(a);
        if (tie !== 0) return tie;
        return b.confidence - a.confidence;
      })[0] || null
  );
}

function pickAnyCandidate(
  candidates: DetectedElement[],
  excludedSelectors: string[] = [],
  preferredZones: CandidateZone[] = ['main', 'form', 'navigation', 'sidebar'],
): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  return (
    candidates
      .filter((candidate) => !blocked.has(candidate.selector))
      .sort((a, b) => {
        const zoneDiff = preferredZones.indexOf(a.zone) - preferredZones.indexOf(b.zone);
        if (zoneDiff !== 0) return zoneDiff;
        return effectiveRank(b) - effectiveRank(a);
      })[0] || null
  );
}

function buildSecondaryStepCopy(candidate: DetectedElement, draftIntent: TourDraftIntent): { title: string; content: string } {
  const rawLabel = candidate.label || getShortElementLabel(candidate.element) || 'element courant';
  const label = isBloatedCopyText(rawLabel) ? getShortElementLabel(candidate.element) || 'cet élément' : rawLabel;
  const normalizedLabel = normalizeText(label).slice(0, MAX_TARGET_LABEL_LENGTH);
  const paymentLike = PAYMENT_METHOD_LABEL_PATTERN.test(normalizedLabel);
  const searchLike = /recherche|search|filtre|filter|sort|trier|chercher/i.test(normalizedLabel);
  const summaryLike = /panier|cart|ticket|subtotal|total|commande|table \d+/i.test(normalizedLabel);

  let draft: { title: string; content: string };
  if (paymentLike) {
    draft = {
      title: 'Paiement et encaissement',
      content: `Finalisez la commande ou choisissez le moyen de paiement avec: ${normalizedLabel}.`,
    };
  } else if (searchLike) {
    draft = {
      title: 'Recherche et filtrage',
      content: `Utilisez ce contrôle pour retrouver rapidement les éléments pertinents: ${normalizedLabel}.`,
    };
  } else if (summaryLike) {
    draft = {
      title: 'Suivi de la commande',
      content: `Consultez cette zone pour suivre l'état de la commande en cours: ${normalizedLabel}.`,
    };
  } else if (
    candidate.intent === 'form-flow' ||
    /form|champ|saisie|validation|email|company|organisation|organisation|notes/i.test(normalizedLabel)
  ) {
    draft = {
      title: 'Acceder au formulaire',
      content: `Poursuivez vers la zone de configuration pour renseigner ou verifier les informations metier: ${normalizedLabel}.`,
    };
  } else if (candidate.intent === 'support-navigation' || candidate.zone === 'navigation' || candidate.zone === 'sidebar') {
    draft = {
      title: 'Consulter la navigation metier',
      content: `Utilisez cette zone pour rejoindre les sections utiles du parcours: ${normalizedLabel}.`,
    };
  } else if (draftIntent === 'primary-action') {
    draft = {
      title: 'Poursuivre le flux metier',
      content: `Cet element complete le parcours principal et permet de continuer le flux: ${normalizedLabel}.`,
    };
  } else {
    draft = {
      title: 'Etape suivante',
      content: `Poursuivez avec cet element du contexte: ${normalizedLabel}.`,
    };
  }

  const enforced = enforceSemanticStepCopy(draft.title, draft.content, {
    element: candidate.element,
    fallbackLabel: normalizedLabel,
    draftIntent,
  });
  return { title: enforced.title, content: enforced.content };
}

function scoreEntryHeadingCandidate(element: HTMLElement, options?: TourDraftGenerationOptions): number {
  const text = normalizeText(element.textContent || element.getAttribute('aria-label') || '');
  if (!text || text.length < 2) return Number.NEGATIVE_INFINITY;

  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const widthRatio = rect.width / viewportWidth;
  const topRatio = Math.max(0, Math.min(1, rect.top / viewportHeight));

  let score = 0;

  if (element.closest('main')) score += 30;
  else if (element.closest('header')) score += 16;

  if (element.closest('aside, nav, [role="navigation"], [role="complementary"], [role="dialog"]')) {
    score -= 44;
  }

  if (/^table\s*\d+$/i.test(text) || /^\d+$/.test(text)) score -= 34;

  if (widthRatio >= 0.45) score += 18;
  else if (widthRatio >= 0.28) score += 10;
  else if (widthRatio <= 0.18) score -= 12;

  score += (1 - topRatio) * 16;
  if (rect.left <= viewportWidth * 0.4) score += 8;

  const selector = buildUniqueSelector(element);
  if (selector && isStableSelectorForPublish(selector)) score += 8;

  if (!isWithinAnalysisRoot(element, options) || !isVisible(element)) return Number.NEGATIVE_INFINITY;
  return score;
}

function getPageHeading(options?: TourDraftGenerationOptions): HTMLElement | null {
  const headingSelectors = ['main h1', 'main h2', 'h1', 'h2', '[role="heading"]'];
  const scopes: ParentNode[] = [];
  const root = resolveAnalysisRoot(options);
  scopes.push(root);
  if (root !== document) scopes.push(document);

  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  for (const scope of scopes) {
    for (const selector of headingSelectors) {
      const matches = scope.querySelectorAll(selector);
      for (const node of matches) {
        if (!(node instanceof HTMLElement)) continue;
        if (seen.has(node)) continue;
        seen.add(node);
        candidates.push(node);
      }
    }
  }

  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((element) => ({ element, score: scoreEntryHeadingCandidate(element, options) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  return ranked[0].score >= 8 ? ranked[0].element : null;
}

type SnapshotSource = {
  element: HTMLElement;
  selector: string;
  label?: string;
  intent?: TourDraftIntent;
};

function clampSnapshotText(value?: string): string | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  return text.slice(0, 180);
}

function buildPreviewContextSnapshot(sources: SnapshotSource[]): PageStructuralSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;

  const deduped: SnapshotSource[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source?.selector || !source.element?.isConnected) continue;
    if (seen.has(source.selector)) continue;
    seen.add(source.selector);
    deduped.push(source);
    if (deduped.length >= 40) break;
  }

  const elements = deduped.map((source) => {
    const rect = source.element.getBoundingClientRect();
    const role = source.element.getAttribute('role') || undefined;
    return {
      selector: source.selector,
      text: clampSnapshotText(source.label || source.element.textContent || source.element.getAttribute('aria-label') || ''),
      role,
      tag: source.element.tagName.toLowerCase(),
      intent: source.intent,
      actionable: isActionableElement(source.element),
      bbox: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  });

  return {
    pageUrl: window.location.href,
    pathname: window.location.pathname,
    pageTitle: document.title || 'Untitled page',
    capturedAt: new Date().toISOString(),
    viewport: {
      width: Math.round(window.innerWidth || 0),
      height: Math.round(window.innerHeight || 0),
    },
    elements,
  };
}

function inferStepPosition(element: HTMLElement): PositionType {
  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(1, window.innerWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || 1);

  const spaceTop = rect.top;
  const spaceBottom = viewportHeight - rect.bottom;
  const spaceLeft = rect.left;
  const spaceRight = viewportWidth - rect.right;

  const minVerticalSpace = 180;
  const minHorizontalSpace = 220;

  if (spaceBottom >= minVerticalSpace) {
    if (rect.left < viewportWidth * 0.25) return 'BOTTOM_LEFT';
    if (rect.right > viewportWidth * 0.75) return 'BOTTOM_RIGHT';
    return 'BOTTOM';
  }

  if (spaceTop >= minVerticalSpace) {
    if (rect.left < viewportWidth * 0.25) return 'TOP_LEFT';
    if (rect.right > viewportWidth * 0.75) return 'TOP_RIGHT';
    return 'TOP';
  }

  if (spaceRight >= minHorizontalSpace) {
    return 'RIGHT';
  }

  if (spaceLeft >= minHorizontalSpace) {
    return 'LEFT';
  }

  return spaceBottom >= spaceTop ? 'BOTTOM' : 'TOP';
}

interface StepBuildContext {
  intent?: TourDraftIntent;
  stepIndex?: number;
  totalSteps?: number;
}

function inferStepType(
  title: string,
  content: string,
  element: HTMLElement,
  action: Step['action'],
  context?: StepBuildContext,
): StepType {
  const normalizedTitle = normalizeText(title);
  const combined = normalizeText(`${title} ${content} ${getLabel(element)}`);
  const zone = detectZone(element);
  const tagName = element.tagName.toLowerCase();
  const role = normalizeText(element.getAttribute('role'));
  const inputType = normalizeText(element.getAttribute('type'));
  const ariaHasPopup = normalizeText(element.getAttribute('aria-haspopup'));
  const isModalZone =
    zone === 'modal' || Boolean(element.closest('[role="dialog"], [aria-modal="true"], .modal, .drawer'));
  const isFormElement = isFormControlElement(element) || Boolean(element.closest('form'));
  const isButtonLike =
    tagName === 'button' ||
    tagName === 'a' ||
    (tagName === 'input' && (inputType === 'button' || inputType === 'submit' || inputType === 'reset')) ||
    role === 'button' ||
    role === 'link' ||
    role === 'menuitem' ||
    role === 'tab';
  const isChecklistElement =
    tagName === 'ul' ||
    tagName === 'ol' ||
    tagName === 'li' ||
    (tagName === 'input' && (inputType === 'checkbox' || inputType === 'radio')) ||
    role === 'checkbox' ||
    role === 'menuitemcheckbox' ||
    role === 'treeitem';
  const hasVideoTarget =
    tagName === 'video' ||
    tagName === 'iframe' ||
    Boolean(element.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="loom"]'));
  const looksLikeTutorial =
    hasVideoTarget || /tutorial|video|walkthrough|demo|youtube|vimeo|loom|formation/.test(combined);
  const strongChecklistVocabulary = /checklist|to-do|todo|a faire|step by step|liste de taches|task list/.test(combined);
  const formVocabulary = /zone de saisie|formulaire|champ|saisie|input|email|mot de passe|password|select|dropdown|texte|notes/.test(combined);
  const validationVocabulary = /validation|valider|submit|soumettre|confirmer|confirm|enregistrer|save/.test(combined);
  const sequenceChecklistHint =
    (context?.totalSteps || 0) >= 4 && (context?.stepIndex || 0) > 0 && context?.intent === 'discovery';

  // Explicit semantic rules for generator-produced labels and common onboarding copy.
  if (/decouvrir la page|point d'entree|point d entree|acceder a l'aide|acceder a l aide|consulter la navigation/.test(normalizedTitle)) {
    return 'tooltip';
  }

  if (looksLikeTutorial) return 'tutorial';
  if (isModalZone || ariaHasPopup === 'dialog') return 'modal';

  // Checklist should be rare and tied to explicit checklist semantics.
  if (strongChecklistVocabulary && (isChecklistElement || !isActionableElement(element))) return 'checklist';
  if (sequenceChecklistHint && !isButtonLike && !isFormElement) return 'checklist';

  // Form should map to actual form controls/contexts, not generic action buttons.
  if (isFormControlElement(element)) return 'form';
  if (context?.intent === 'form-flow' && !isButtonLike && (isFormElement || formVocabulary)) return 'form';
  if ((formVocabulary || validationVocabulary) && !isButtonLike && Boolean(element.closest('form'))) return 'form';

  if (context?.intent === 'support-navigation' && (zone === 'navigation' || zone === 'sidebar' || zone === 'header')) {
    return 'tooltip';
  }

  // Validation labels on buttons are usually key actions rather than form fields.
  if (validationVocabulary && isButtonLike) return 'highlight';

  if (action === 'HOVER' || (context?.intent === 'discovery' && (context?.stepIndex || 0) === 0)) return 'tooltip';
  return 'highlight';
}

/** Parcours autogénérés : surbrillance cible toujours active (runtime + publish). */
function ensureContextualHighlightOnSteps(steps: Step[]): Step[] {
  return steps.map((step) => (step.highlightElement === true ? step : { ...step, highlightElement: true }));
}

function ensureContextualHighlightOnDraft(draft: SuggestedTourDraft): SuggestedTourDraft {
  if (!draft.steps?.length) return draft;
  return { ...draft, steps: ensureContextualHighlightOnSteps(draft.steps) };
}

function buildStep(
  title: string,
  content: string,
  element: HTMLElement,
  position?: PositionType,
  action: Step['action'] = 'NEXT',
  context?: StepBuildContext,
  options?: {
    isPrimary?: boolean;
    targetSelector?: string;
    selectorCandidates?: string[];
    stabilityScore?: number;
  },
): Step {
  const inferredPosition = inferStepPosition(element);
  const resolvedPosition = !position || position === 'BOTTOM' ? inferredPosition : position;
  const stepType = inferStepType(title, content, element, action, context);

  stepCounter += 1;
  const primarySelector = options?.targetSelector ?? buildUniqueSelector(element);
  const selectorCandidates = (options?.selectorCandidates ?? buildSelectorCandidates(element)).filter(Boolean);
  const selectorAlternatives = selectorCandidates.filter((selector) => selector !== primarySelector).slice(0, 5);
  const textSample = normalizeText(getLabel(element)).slice(0, MAX_TARGET_LABEL_LENGTH);
  const sanitizedCopy = enforceSemanticStepCopy(title, content, {
    element,
    draftIntent: context?.intent,
  });

  return {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${stepCounter}`,
    title: sanitizedCopy.title,
    content: sanitizedCopy.content,
    stepType,
    targetSelector: primarySelector,
    ...(selectorAlternatives.length > 0 ? { selectorAlternatives } : {}),
    targetFingerprint: {
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || undefined,
      ariaLabel: element.getAttribute('aria-label') || undefined,
      placeholder: element.getAttribute('placeholder') || undefined,
      name: element.getAttribute('name') || undefined,
      ...(textSample ? { textSample } : {}),
    },
    stabilityScore: options?.stabilityScore ?? selectorStabilityScore(primarySelector),
    selfHealCount: 0,
    position: resolvedPosition,
    action,
    skipAllowed: true,
    highlightElement: true,
    isPrimary: options?.isPrimary,
  };
}

function computeHeuristicDraftScores(
  intent: TourDraftIntent,
  steps: Step[],
  sourceCandidates: DetectedElement[],
  reasons: string[],
  options?: TourDraftGenerationOptions,
): {
  score: number;
  confidence: number;
  semanticScore: number;
  sequenceScore: number;
  selectorStabilityBonus: number;
  selectorFragilityPenalty: number;
  actionabilityPenalty: number;
  adjustments: string[];
} {
  const adjustments: string[] = [];
  const averageCandidateScore = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.score, 0) / sourceCandidates.length
    : 0;
  const averageSemanticScore = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.semanticScore, 0) / sourceCandidates.length
    : 0;
  const averagePersonaScore = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.personaScore, 0) / sourceCandidates.length
    : 0;
  const averageSequenceScore = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.sequenceScore, 0) / sourceCandidates.length
    : 0;
  const averageSelectorStabilityBonus = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.selectorStabilityBonus, 0) / sourceCandidates.length
    : 0;
  const averageSelectorFragilityPenalty = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.selectorFragilityPenalty, 0) / sourceCandidates.length
    : 0;
  const averageActionabilityPenalty = sourceCandidates.length
    ? sourceCandidates.reduce((total, candidate) => total + candidate.actionabilityPenalty, 0) / sourceCandidates.length
    : 0;

  let score = Math.min(100, Math.round(averageCandidateScore * 0.55 + steps.length * 10 + reasons.length * 3));
  if (intent === 'discovery') {
    score = Math.min(score, 92);
  }

  const stableStepCount = steps.filter(
    (step) => step.targetSelector && isStableSelectorForPublish(step.targetSelector),
  ).length;
  if (intent === 'discovery' && steps.length >= 2 && stableStepCount >= 2) {
    score = Math.min(92, score + 10);
    adjustments.push('multi-step stable sequence boost');
  }

  let confidence = confidenceFromSignals(score, averageSemanticScore, averagePersonaScore, averageSequenceScore, 0);

  if (intent === 'discovery' && steps.length >= 2 && stableStepCount >= 2) {
    confidence = Math.min(100, Math.max(confidence, 62));
    adjustments.push('multi-step sequence confidence boost');
  }

  const dynamicContext = options?.noiseFilteringEnabled !== false && options?.ignoreTransientUi !== false;
  const hasStableActionControl = sourceCandidates.some((candidate) => {
    const tagName = candidate.element.tagName.toLowerCase();
    const inputType = (candidate.element.getAttribute('type') || '').toLowerCase();
    const isActionControl = tagName === 'button' || (tagName === 'input' && (inputType === 'submit' || inputType === 'button'));
    const isStableSelector =
      candidate.selector.includes('[data-tour-id=') ||
      candidate.selector.includes('[data-testid=') ||
      candidate.selector.startsWith('#');
    return isActionControl && isStableSelector;
  });

  const hasDynamicActionMarker = sourceCandidates.some((candidate) => candidate.selector.includes('tour-dynamic-action-'));

  if (intent === 'primary-action' && dynamicContext && hasStableActionControl) {
    confidence = Math.min(100, confidence + 12);
    adjustments.push('dynamic-context confidence boost: stable action control');
  }

  if (intent === 'primary-action' && dynamicContext && hasDynamicActionMarker) {
    confidence = Math.min(100, confidence + 6);
    adjustments.push('dynamic-context confidence boost: explicit dynamic action marker');
  }

  return {
    score,
    confidence,
    semanticScore: Math.round(averageSemanticScore * 100),
    sequenceScore: Math.round(averageSequenceScore * 100),
    selectorStabilityBonus: Math.round(averageSelectorStabilityBonus),
    selectorFragilityPenalty: Math.round(averageSelectorFragilityPenalty),
    actionabilityPenalty: Math.round(averageActionabilityPenalty),
    adjustments,
  };
}

// ============================================================================
// Hybrid semantic fusion (Phase 4)
// ============================================================================

/**
 * Module-level handoff used by `generateContextualTourDraftsAsync`. The
 * async wrapper computes/awaits backend semantic hints, stashes the
 * result here, then invokes the synchronous generator. The synchronous
 * generator consumes the value once (and clears it) when constructing
 * its semantic context. This keeps `generateContextualTourDrafts` fully
 * synchronous while still allowing backend enrichment.
 */
let pendingBackendSemanticHints: {
  status: BackendSemanticInferenceStatus;
  hints: import('./semantic-backend-client').BackendSemanticHint[];
  preferredOrder: string[] | null;
  implementation: import('./semantic-backend-client').BackendSemanticImplementation | null;
} | null = null;

interface SemanticContext {
  enabled: boolean;
  engineMode: 'local' | 'hybrid' | 'backend';
  snapshot: SemanticPageSnapshot;
  rolesBySelector: Map<string, SemanticCandidateRole>;
  /** Selectors whose role was decided by the backend (its confidence dominated). */
  backendSelectors: Set<string>;
  /** Selectors whose role was averaged between local and backend. */
  mergedSelectors: Set<string>;
  preferredOrder: string[] | null;
  backendStatus: BackendSemanticInferenceStatus;
  /**
   * Self-description of the backend engine that produced the response
   * (when there is one). Used by the debug report to advertise whether
   * the run was Phase 1 (rule-mirror) or Phase 2 (sentence-transformers).
   */
  backendImplementation: import('./semantic-backend-client').BackendSemanticImplementation | null;
  domStability: DomStabilitySnapshot;
  draftReports: NonNullable<ContextualGenerationDebugReport['semanticEnhancement']>['drafts'];
}

const MAX_DRAFT_SEMANTIC_DELTA = 10;

/**
 * Minimum role confidence required for the semantic layer to influence
 * a step. Below this value the fusion zero-clamps the delta and refuses
 * to rewrite copy: the heuristic decision wins. The role is still
 * surfaced in the debug report (with `lowConfidence: true`) so the lab
 * can identify silent-bad classifications.
 *
 * NOTE: today the local engine is a rule-vote classifier where the
 * "confidence" is the max single vote weight, already normalised to
 * [0, 1]. If/when we wire an embedding-based engine (e.g.
 * sentence-transformers), this threshold MUST be re-calibrated against
 * the model's score distribution — typical same-domain embedding
 * similarity sits in [0.3, 0.7] so 0.55 may be too aggressive.
 */
const MIN_SEMANTIC_ROLE_CONFIDENCE = 0.55;

const DEFAULT_SEMANTIC_DOM_SETTLE_MS = 300;

const LOCAL_ENGINE_CALIBRATION_NOTE =
  "Le moteur local est un classifieur par règles + mots-clés (pas d'embeddings). " +
  'La confiance est le poids maximal de vote, normalisée sur [0, 1]. ' +
  'Si un moteur à embeddings est introduit, recalibrer ce seuil contre la distribution réelle ' +
  'du modèle (les similarités cosinus pratiques se situent souvent dans [0.3, 0.7]).';

/**
 * Phase 1 disclaimer used when the backend ran the rule-vote mirror
 * (either because the embeddings path is disabled, timed out, or
 * failed, or because the engine mode is `local`). Lab tests with this
 * label validate the fusion mechanics + rule classifier precision, not
 * learned semantic quality.
 */
const BACKEND_IMPLEMENTATION_DISCLAIMER_RULES =
  "Backend endpoint actif. Implémentation actuelle : règles miroir du moteur local (pas d'embeddings). " +
  'Les tests lab valident la mécanique de fusion + la précision du classifieur par règles, ' +
  'pas la qualité sémantique apprise.';

/**
 * Phase 2 disclaimer used when the backend actually ran the
 * sentence-transformers embeddings path. The confidence reported is
 * margin-calibrated so the SDK's 0.55 guard stays meaningful even
 * though raw cosine similarities live in a tighter [0.2, 0.7] range.
 */
const BACKEND_IMPLEMENTATION_DISCLAIMER_EMBEDDINGS =
  'Backend endpoint actif. Implémentation actuelle : sentence-transformers (embeddings) avec ' +
  'recalibration par marge top-1/top-2. Les tests lab valident la mécanique de fusion + la qualité ' +
  'sémantique apprise sur des prototypes de rôles multilingues.';

/**
 * Derive the validation phase from the backend self-description. Phase
 * 2 only when the backend actually ran sentence-transformers — a
 * silent fallback to the rule mirror still reports phase-1-local so
 * the lab and the reviewer can tell the difference at a glance.
 */
function deriveValidationPhase(
  context: SemanticContext,
): 'phase-1-local' | 'phase-2-embeddings' {
  if (context.backendImplementation?.kind === 'sentence-transformers') {
    return 'phase-2-embeddings';
  }
  return 'phase-1-local';
}

/**
 * Build the backend implementation block surfaced in the debug report.
 * Mirrors what the backend actually advertised; when no backend was
 * called (local mode), we report the rule mirror as the implicit
 * baseline so the lab UI always shows a complete record.
 */
function deriveBackendImplementationReport(
  context: SemanticContext,
): NonNullable<ContextualGenerationDebugReport['semanticEnhancement']>['backendImplementation'] {
  const impl = context.backendImplementation;
  if (impl?.kind === 'sentence-transformers') {
    return {
      endpointLive: true,
      kind: 'sentence-transformers',
      disclaimer: impl.note ?? BACKEND_IMPLEMENTATION_DISCLAIMER_EMBEDDINGS,
      ...(impl.model ? { model: impl.model } : {}),
    };
  }
  if (impl?.kind === 'rule-based-mirror') {
    return {
      endpointLive: context.backendStatus !== 'timeout',
      kind: 'rule-based-mirror',
      disclaimer: impl.note ?? BACKEND_IMPLEMENTATION_DISCLAIMER_RULES,
      ...(impl.fallbackReason ? { fallbackReason: impl.fallbackReason } : {}),
    };
  }
  if (context.backendStatus === 'timeout') {
    return {
      endpointLive: false,
      kind: 'rule-based-mirror',
      disclaimer:
        'SDK HTTP timeout before backend semantic-hints responded. Fusion uses the local rule engine only.',
      fallbackReason: 'sdk_http_timeout',
    };
  }
  return {
    endpointLive: context.backendStatus !== 'unconfigured' && context.backendStatus !== 'disabled',
    kind: context.backendStatus === 'ok' ? 'unknown' : 'rule-based-mirror',
    disclaimer: BACKEND_IMPLEMENTATION_DISCLAIMER_RULES,
    ...(context.backendStatus === 'error' ? { fallbackReason: 'sdk_http_error' as const } : {}),
  };
}

/**
 * Minimal semantic telemetry when no tour drafts were produced (e.g. zero
 * candidates). Keeps the lab UI from showing "Couche sémantique (off)".
 */
function buildSemanticEnhancementDebugShell(
  options: TourDraftGenerationOptions | undefined,
  semanticContext: SemanticContext | null,
): NonNullable<ContextualGenerationDebugReport['semanticEnhancement']> {
  const mode = (options?.semanticEngineMode ?? 'hybrid') as 'local' | 'hybrid' | 'backend';
  const domStability = semanticContext?.domStability ?? evaluateDomStability(options);
  const snapshot: SemanticPageSnapshot =
    semanticContext?.snapshot ?? {
      hasForm: false,
      hasNavigation: false,
      formFieldCount: 0,
      navigationLinkCount: 0,
      ctaCount: 0,
      pageTitle: '',
      pageHeading: '',
      contextTokens: [],
    };
  const ctx: SemanticContext =
    semanticContext ?? {
      enabled: domStability.stable,
      engineMode: mode,
      snapshot,
      rolesBySelector: new Map(),
      backendSelectors: new Set(),
      mergedSelectors: new Set(),
      preferredOrder: null,
      backendStatus: mode === 'local' ? 'disabled' : 'unconfigured',
      backendImplementation: null,
      domStability,
      draftReports: [],
    };

  return {
    enabled: ctx.enabled,
    engineMode: ctx.engineMode,
    backendUsed: ctx.backendStatus === 'ok',
    backendStatus: ctx.backendStatus,
    minRoleConfidence: MIN_SEMANTIC_ROLE_CONFIDENCE,
    validationPhase: deriveValidationPhase(ctx),
    backendImplementation: deriveBackendImplementationReport(ctx),
    domStability: {
      stable: domStability.stable,
      domAgeMs:
        domStability.domAgeMs === Number.POSITIVE_INFINITY
          ? -1
          : Math.round(domStability.domAgeMs),
      requiredAgeMs: domStability.requiredAgeMs,
      observerInstalled: domStability.observerInstalled,
      ...(domStability.bypassReason ? { bypassReason: domStability.bypassReason } : {}),
    },
    calibrationNote: LOCAL_ENGINE_CALIBRATION_NOTE,
    pageSummary: {
      hasForm: snapshot.hasForm,
      hasNavigation: snapshot.hasNavigation,
      formFieldCount: snapshot.formFieldCount,
      navigationLinkCount: snapshot.navigationLinkCount,
      ctaCount: snapshot.ctaCount,
    },
    drafts: ctx.draftReports,
  };
}

/**
 * Lazy shared MutationObserver used to track the last DOM mutation
 * timestamp. The observer is installed once per host page; subsequent
 * calls reuse it. We deliberately observe a wide subtree because the
 * analysis root may change between scans (the host can update
 * `analysisRootSelector` at runtime).
 */
interface DomMutationTracker {
  observer: MutationObserver | null;
  lastMutationAt: number;
  installedAt: number;
  mutationCount: number;
  observerAvailable: boolean;
}

let domMutationTracker: DomMutationTracker | null = null;

function resolveDomStabilityObserverRoot(): Node {
  if (typeof document === 'undefined') return document;
  const main = document.querySelector('main');
  if (main instanceof HTMLElement && main.isConnected) return main;
  return document.body || document.documentElement;
}

function ensureDomMutationTracker(): DomMutationTracker {
  if (domMutationTracker) return domMutationTracker;
  const now = Date.now();
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    const headless: DomMutationTracker = {
      observer: null,
      lastMutationAt: now,
      installedAt: now,
      mutationCount: 0,
      observerAvailable: false,
    };
    domMutationTracker = headless;
    return headless;
  }
  const tracker: DomMutationTracker = {
    observer: null,
    lastMutationAt: now,
    installedAt: now,
    mutationCount: 0,
    observerAvailable: true,
  };
  try {
    const target = resolveDomStabilityObserverRoot();
    if (target) {
      // We only care about *structural* mutations to detect a page still
      // streaming content. Tracking attribute changes (class, style,
      // aria-*) would flag every :hover, focus ring, or React render
      // caused by clicking the Analyse button — that is way too
      // sensitive for a "is the page still loading?" signal.
      const observer = new MutationObserver((mutations) => {
        let structural = 0;
        for (const mutation of mutations) {
          if (!isMeaningfulCandidateMutation(mutation)) continue;
          structural += 1;
          if (structural >= 24) break;
        }
        if (structural === 0) return;
        tracker.mutationCount += structural;
        tracker.lastMutationAt = Date.now();
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
      });
      tracker.observer = observer;
    } else {
      tracker.observerAvailable = false;
    }
  } catch {
    tracker.observerAvailable = false;
  }
  domMutationTracker = tracker;
  return tracker;
}

/**
 * Visible only for tests: clear the shared mutation tracker so each
 * test can simulate a fresh environment.
 */
export function __resetSemanticDomMutationTrackerForTests(): void {
  if (domMutationTracker?.observer) {
    try {
      domMutationTracker.observer.disconnect();
    } catch {
      /* noop */
    }
  }
  domMutationTracker = null;
}

interface DomStabilitySnapshot {
  stable: boolean;
  domAgeMs: number;
  requiredAgeMs: number;
  observerInstalled: boolean;
  bypassReason?: 'dom_unsettled' | 'observer_unavailable';
}

function evaluateDomStability(options?: TourDraftGenerationOptions): DomStabilitySnapshot {
  const required = Math.max(0, options?.semanticSnapshotMinDomAgeMs ?? DEFAULT_SEMANTIC_DOM_SETTLE_MS);
  if (required === 0) {
    return { stable: true, domAgeMs: Number.POSITIVE_INFINITY, requiredAgeMs: 0, observerInstalled: false };
  }
  const tracker = ensureDomMutationTracker();
  if (!tracker.observerAvailable) {
    // Without an observer we cannot prove the DOM is settled. We choose
    // the conservative path here: bypass the semantic layer rather than
    // run on a potentially half-loaded DOM. This matches the safer
    // behavior the user asked for in the verification pass.
    return {
      stable: false,
      domAgeMs: 0,
      requiredAgeMs: required,
      observerInstalled: false,
      bypassReason: 'observer_unavailable',
    };
  }
  // If we have never observed a structural mutation since the tracker
  // was installed, the host page is presumably static — treat it as
  // stable immediately. Reporting a quiescence age of "infinity" is
  // factually accurate here (no mutation has *ever* been seen).
  if (tracker.mutationCount === 0) {
    return {
      stable: true,
      domAgeMs: Number.POSITIVE_INFINITY,
      requiredAgeMs: required,
      observerInstalled: true,
    };
  }
  const now = Date.now();
  const domAgeMs = now - tracker.lastMutationAt;
  if (domAgeMs >= required) {
    return { stable: true, domAgeMs, requiredAgeMs: required, observerInstalled: true };
  }
  return {
    stable: false,
    domAgeMs,
    requiredAgeMs: required,
    observerInstalled: true,
    bypassReason: 'dom_unsettled',
  };
}

/**
 * Async helper used by `generateContextualTourDraftsAsync` to actively
 * wait for the DOM to settle before running the semantic backend hop.
 * Returns the stability snapshot once the DOM has been quiescent for
 * `requiredAgeMs`, or after `maxWaitMs` (in which case `stable` may
 * still be false and the caller can decide to fall back).
 */
async function waitForDomToSettle(
  options?: TourDraftGenerationOptions,
  maxWaitMs?: number,
): Promise<DomStabilitySnapshot> {
  const requiredAge = Math.max(0, options?.semanticSnapshotMinDomAgeMs ?? DEFAULT_SEMANTIC_DOM_SETTLE_MS);
  const effectiveMaxWait =
    maxWaitMs ?? Math.max(2500, requiredAge * 4 + 800);
  let snapshot = evaluateDomStability(options);
  if (snapshot.stable || snapshot.bypassReason === 'observer_unavailable') return snapshot;
  const start = Date.now();
  while (!snapshot.stable && Date.now() - start < effectiveMaxWait) {
    const wait = Math.max(20, snapshot.requiredAgeMs - snapshot.domAgeMs);
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
    snapshot = evaluateDomStability(options);
  }
  return snapshot;
}

function buildSemanticInputs(candidates: DetectedElement[]): SemanticCandidateInput[] {
  return candidates.map((candidate) => ({
    element: candidate.element,
    selector: candidate.selector,
    label: candidate.label,
    intent: candidate.intent,
    zone: candidate.zone,
    isActionable: isActionableElement(candidate.element),
    isFormControl: isFormControlElement(candidate.element),
    documentTop: (() => {
      try {
        return candidate.element.getBoundingClientRect().top + (typeof window !== 'undefined' ? window.scrollY : 0);
      } catch {
        return 0;
      }
    })(),
  }));
}

function shouldRewriteCopyForRole(role: SemanticRole, confidence: number, step: Step): boolean {
  if (confidence < 0.6) return false;
  if (role === 'generic-click') return false;
  const title = (step.title || '').toLowerCase();
  const content = (step.content || '').toLowerCase();
  const blob = `${title} ${content}`;

  switch (role) {
    case 'form-field':
      return !/form|champ|saisir|renseign|remplir/i.test(blob);
    case 'form-submit':
      return !/valid|enregistr|publier|confirmer|soumettre|sauvegarder/i.test(blob);
    case 'navigation':
      return !/navigation|menu|aller|section/i.test(blob);
    case 'utility':
      return !/réglage|reglage|options|paramètr|parametr|préférence|preference/i.test(blob);
    case 'secondary':
      return !/aide|découv|decouv|guide|tutoriel|tutorial/i.test(blob);
    case 'entry':
      return !/entrée|entree|commencer|début|debut|prise en main|bienvenue/i.test(blob);
    case 'cta-primary':
      return !/action principale|action clé|action cle|cta principal|lancez|déclenchez|declenchez|démarrez|demarrez/i.test(blob);
    case 'result':
      return !/résultat|resultat|statut|status|terminé|termine|fini/i.test(blob);
    default:
      return false;
  }
}

function resolveStepSemanticLabel(step: Step): string {
  const fromFingerprint = normalizeText(
    step.targetFingerprint?.ariaLabel || step.targetFingerprint?.textSample || step.targetFingerprint?.tagName || '',
  );
  if (fromFingerprint) return fromFingerprint;
  return normalizeText(step.title || step.content || 'cet élément') || 'cet élément';
}

function hasCompleteFingerprintForSemanticCompensation(step: Step): boolean {
  const fp = step.targetFingerprint;
  const tagName = normalizeText(fp?.tagName || '');
  const role = normalizeText(fp?.role || '');
  const textSample = normalizeText(fp?.textSample || '');
  return Boolean(tagName && role && textSample.length >= 3);
}

function isSemanticCompensationEligible(step: Step, options?: TourDraftGenerationOptions): boolean {
  const scenario = options?.publishScenario ?? 'medium';
  if (scenario === 'stress') return false;
  const confidence = typeof step.semanticRoleConfidence === 'number' ? step.semanticRoleConfidence : 0;
  const stabilityScore = typeof step.stabilityScore === 'number' ? step.stabilityScore : 0;
  return confidence >= 0.75 && stabilityScore >= 40 && hasCompleteFingerprintForSemanticCompensation(step);
}

function recomputeStepOrderIndex(steps: Step[]): Step[] {
  return steps.map((step, index) => ({ ...step, orderIndex: index }));
}

/** Restore authored step order after conflict resolution (map iteration is nondeterministic). */
function sortStepsByAuthoredOrder(steps: Step[]): Step[] {
  return [...steps].sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));
}

function dedupeDraftStepTitles(steps: Step[]): Step[] {
  const counts = new Map<string, number>();
  return steps.map((step) => {
    const baseTitle = (step.title || '').trim() || 'Étape';
    const key = normalizeText(baseTitle);
    const next = (counts.get(key) || 0) + 1;
    counts.set(key, next);
    if (next === 1) return { ...step, title: baseTitle };
    const suffixSource =
      step.targetFingerprint?.ariaLabel ||
      step.targetFingerprint?.textSample ||
      step.targetFingerprint?.role ||
      step.position ||
      `${next}`;
    const suffix = normalizeText(String(suffixSource)).replace(/\s+/g, '-').slice(0, 20) || `${next}`;
    return { ...step, title: `${baseTitle} (${suffix || next})` };
  });
}

function applyPreferredSemanticOrder(
  steps: Step[],
  preferredOrder: string[] | null,
): { steps: Step[]; changed: boolean } {
  if (!preferredOrder || preferredOrder.length === 0 || steps.length <= 1) {
    return { steps, changed: false };
  }
  const bucketBySelector = new Map<string, Step[]>();
  for (const step of steps) {
    const selector = normalizeText(step.targetSelector);
    if (!selector) continue;
    const existing = bucketBySelector.get(selector) || [];
    existing.push(step);
    bucketBySelector.set(selector, existing);
  }

  const ordered: Step[] = [];
  for (const selector of preferredOrder) {
    const key = normalizeText(selector);
    if (!key) continue;
    const queue = bucketBySelector.get(key);
    if (!queue || queue.length === 0) continue;
    ordered.push(queue.shift() as Step);
  }

  for (const step of steps) {
    if (ordered.includes(step)) continue;
    ordered.push(step);
  }

  const originalSelectors = steps.map((step) => step.targetSelector || '__none__');
  const orderedSelectors = ordered.map((step) => step.targetSelector || '__none__');
  const changed = orderedSelectors.some((selector, index) => selector !== originalSelectors[index]);
  return changed ? { steps: ordered, changed: true } : { steps, changed: false };
}

function applySemanticFusionToDraft(
  draft: SuggestedTourDraft,
  context: SemanticContext | null,
  options?: TourDraftGenerationOptions,
): void {
  if (!context || !context.enabled) return;
  if (!draft.steps || draft.steps.length === 0) return;

  const weights = resolveSemanticWeights(options);
  const stepReports: NonNullable<ContextualGenerationDebugReport['semanticEnhancement']>['drafts'][number]['steps'] = [];

  let effectiveTotalDelta = 0;
  let copyRewriteCount = 0;
  let suppressedLowConfidence = 0;
  let bestSemanticCompensationConfidence = 0;
  const originalOrder = draft.steps
    .map((step) => step.targetSelector)
    .filter((value): value is string => Boolean(value));
  let semanticOrderApplied = false;

  /** Same DOM node must not be fused or reported twice (blueprints can emit duplicate steps). */
  const semanticFusionSeenSelectors = new Set<string>();

  for (let i = 0; i < draft.steps.length; i += 1) {
    const step = draft.steps[i];
    const selector = step.targetSelector;
    if (!selector) continue;
    const role = context.rolesBySelector.get(selector);
    if (!role) continue;
    const stepWithRoleConfidence: Step = { ...step, semanticRoleConfidence: role.confidence };
    draft.steps[i] = stepWithRoleConfidence;

    const duplicateSemanticStep = semanticFusionSeenSelectors.has(selector);
    if (!duplicateSemanticStep) {
      semanticFusionSeenSelectors.add(selector);
    }

    const fusion = computeSemanticScoreDelta({
      heuristicIntent: draft.intent,
      semanticRole: role.role,
      confidence: role.confidence,
      weights,
    });

    const lowConfidence = role.confidence < MIN_SEMANTIC_ROLE_CONFIDENCE;
    const effectiveDelta = lowConfidence ? 0 : fusion.delta;
    if (!duplicateSemanticStep) {
      effectiveTotalDelta += effectiveDelta;
      if (lowConfidence) suppressedLowConfidence += 1;
    }

    let suppressedReason: 'low_confidence' | 'neutral' | undefined;
    if (lowConfidence) suppressedReason = 'low_confidence';
    else if (fusion.delta === 0) suppressedReason = 'neutral';

    if (
      !duplicateSemanticStep &&
      !lowConfidence &&
      shouldRewriteCopyForRole(role.role, role.confidence, stepWithRoleConfidence)
    ) {
      const semanticLabel = resolveStepSemanticLabel(stepWithRoleConfidence);
      const copy = buildSemanticStepCopy(role.role, semanticLabel);
      const rewrittenStep: Step = {
        ...stepWithRoleConfidence,
        title: copy.title,
        content: copy.content,
      };
      draft.steps[i] = rewrittenStep;
      copyRewriteCount += 1;
    }

    const decisionSource = context.backendSelectors.has(selector)
      ? 'backend'
      : context.mergedSelectors.has(selector)
        ? 'merged'
        : 'local';

    if (!duplicateSemanticStep) {
      stepReports.push({
        selector,
        heuristicRole: draft.intent,
        semanticRole: role.role,
        roleConfidence: Number(role.confidence.toFixed(3)),
        rationale: role.rationale.slice(0, 3),
        localRoleSource: 'rules',
        decisionSource,
        lowConfidence,
        fusion: {
          heuristicScore: draft.score,
          semanticDelta: Number(fusion.delta.toFixed(2)),
          appliedDelta: 0,
          ...(suppressedReason ? { suppressedReason } : {}),
        },
      });
    }
  }

  draft.steps = draft.steps.map((step) => {
    const role = step.targetSelector ? context.rolesBySelector.get(step.targetSelector) : undefined;
    return sanitizeStepCopy(step, {
      draftIntent: draft.intent,
      semanticRole: role?.role,
    });
  });

  const preserveDiscoveryEntryOrder =
    draft.intent === 'discovery' && hasDiscoveryEntryStep(draft.steps);
  if (
    !options?.singlePageTour &&
    !preserveDiscoveryEntryOrder &&
    context.preferredOrder &&
    context.preferredOrder.length > 0
  ) {
    const reordered = applyPreferredSemanticOrder(draft.steps, context.preferredOrder);
    if (reordered.changed) {
      draft.steps = reordered.steps;
      semanticOrderApplied = true;
    }
  }
  draft.steps = dedupeDraftStepTitles(recomputeStepOrderIndex(draft.steps));
  if (options?.singlePageTour) {
    draft.steps = pinSinglePageTourStepOrder(draft.steps);
  } else if (preserveDiscoveryEntryOrder) {
    draft.steps = pinDiscoveryEntryFirstStepOrder(draft.steps);
  }
  for (const step of draft.steps) {
    if (!isSemanticCompensationEligible(step, options)) continue;
    bestSemanticCompensationConfidence = Math.max(
      bestSemanticCompensationConfidence,
      step.semanticRoleConfidence || 0,
    );
  }
  if (bestSemanticCompensationConfidence >= 0.75) {
    const reason = `published via semantic compensation (confidence: ${bestSemanticCompensationConfidence.toFixed(2)})`;
    if (!draft.reasons.includes(reason)) {
      draft.reasons = [...draft.reasons, reason];
    }
  }

  const cappedDelta = Math.max(
    -MAX_DRAFT_SEMANTIC_DELTA,
    Math.min(MAX_DRAFT_SEMANTIC_DELTA, effectiveTotalDelta),
  );
  const wasClamped = cappedDelta !== effectiveTotalDelta;
  if (cappedDelta !== 0) {
    const adjustedScore = Math.max(0, Math.min(100, draft.score + cappedDelta));
    const adjustedConfidence = Math.max(
      0,
      Math.min(100, draft.confidence + Math.round(cappedDelta * 0.6)),
    );
    draft.score = adjustedScore;
    draft.confidence = adjustedConfidence;
    if (draft.explainability) {
      draft.explainability = {
        ...draft.explainability,
        signalScores: {
          ...draft.explainability.signalScores,
          confidence: adjustedConfidence,
        },
        generatedFrom: [
          ...draft.explainability.generatedFrom,
          `semantic fusion: ${cappedDelta > 0 ? '+' : ''}${cappedDelta.toFixed(1)}${wasClamped ? ' (capped)' : ''}`,
        ].slice(0, 12),
      };
    }
  }

  for (const stepReport of stepReports) {
    const rawDelta = stepReport.fusion.semanticDelta;
    // Distribute the capped delta proportionally across the contributing
    // steps. Low-confidence steps already have a 0 raw delta, so they
    // also get 0 applied delta naturally.
    stepReport.fusion.appliedDelta = Number(
      ((cappedDelta * (stepReport.lowConfidence ? 0 : rawDelta)) / (effectiveTotalDelta || 1)).toFixed(2),
    );
    if (wasClamped && stepReport.fusion.appliedDelta !== 0 && !stepReport.fusion.suppressedReason) {
      stepReport.fusion.suppressedReason = 'cap_clamped';
    }
  }

  const finalOrder = draft.steps
    .map((step) => step.targetSelector)
    .filter((value): value is string => Boolean(value));
  const stillMatchesOrder = originalOrder.every((selector, idx) => selector === finalOrder[idx]);

  context.draftReports.push({
    draftName: draft.name,
    intent: draft.intent,
    steps: stepReports,
    orderChanged: semanticOrderApplied || !stillMatchesOrder,
    copyRewriteCount,
    suppressedLowConfidence,
  });
}

function resolveStepTargetElement(step: Step): HTMLElement | null {
  const selector = normalizeText(step.targetSelector);
  if (!selector || typeof document === 'undefined') return null;
  try {
    const node = document.querySelector(selector);
    return node instanceof HTMLElement ? node : null;
  } catch {
    return null;
  }
}

function stepSpatialRank(step: Step): { top: number; left: number; fallback: number } {
  const element = resolveStepTargetElement(step);
  if (!element) return { top: Number.POSITIVE_INFINITY, left: Number.POSITIVE_INFINITY, fallback: 1 };
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, fallback: 0 };
}

/** Discovery drafts: entry heading before follow-up steps titled "Découverte et aide". */
function resolveDiscoveryDraftAnchorIndex(steps: Step[]): number {
  const entryPoint = steps.findIndex((step) =>
    /point d['']entr[ée]e/i.test(normalizeText(step.title)),
  );
  if (entryPoint >= 0) return entryPoint;

  return steps.findIndex((step) => /d[ée]couvrir|entry/i.test(normalizeText(step.title)));
}

function resolveDiscoveryEntryStepIndex(steps: Step[]): number {
  const byTitle = steps.findIndex((step) =>
    /point d['']entr[ée]e/i.test(normalizeText(step.title)),
  );
  if (byTitle >= 0) return byTitle;
  return steps.findIndex((step) =>
    /le parcours commence ici|commence ici avec le contexte visible/i.test(normalizeText(step.content)),
  );
}

function hasDiscoveryEntryStep(steps: Step[]): boolean {
  return resolveDiscoveryEntryStepIndex(steps) >= 0;
}

/** Keep "Point d'entrée" first after semantic preferredOrder or spatial sort. */
function pinDiscoveryEntryFirstStepOrder(steps: Step[]): Step[] {
  const entryIdx = resolveDiscoveryEntryStepIndex(steps);
  if (entryIdx <= 0) return steps;
  const entry = steps[entryIdx];
  const rest = steps.filter((_, index) => index !== entryIdx);
  return recomputeStepOrderIndex([entry, ...rest]);
}

function normalizeDraftStepOrder(steps: Step[], intent: TourDraftIntent): Step[] {
  if (!steps || steps.length <= 1) return steps;

  const sortable = steps
    .map((step, index) => ({ step, index, rank: stepSpatialRank(step) }))
    .sort((a, b) => {
      if (a.rank.fallback !== b.rank.fallback) return a.rank.fallback - b.rank.fallback;
      const topDiff = a.rank.top - b.rank.top;
      if (Math.abs(topDiff) > 12) return topDiff;
      const leftDiff = a.rank.left - b.rank.left;
      if (Math.abs(leftDiff) > 12) return leftDiff;
      return a.index - b.index;
    });

  const restFromAnchor = (anchor: Step) =>
    sortable.map((entry) => entry.step).filter((step) => step !== anchor);

  // Discovery + "Point d'entrée": entry before follow-up CLICK steps marked isPrimary (e.g. guide link).
  if (intent === 'discovery') {
    const discoveryEntryIndex = resolveDiscoveryDraftAnchorIndex(steps);
    if (discoveryEntryIndex >= 0) {
      const anchor = steps[discoveryEntryIndex];
      return [anchor, ...restFromAnchor(anchor)];
    }
  }

  const primaryIndex = steps.findIndex((step) => step.isPrimary);
  if (primaryIndex >= 0) {
    const anchor = steps[primaryIndex];
    return [anchor, ...restFromAnchor(anchor)];
  }

  const anchorIndex =
    intent === 'primary-action' ? steps.findIndex((step) => step.isPrimary) : -1;

  if (anchorIndex < 0) return sortable.map((entry) => entry.step);
  const anchor = steps[anchorIndex];
  return [anchor, ...restFromAnchor(anchor)];
}

function createDraft(
  name: string,
  description: string,
  intent: TourDraftIntent,
  steps: Step[],
  sourceCandidates: DetectedElement[],
  reasons: string[],
  targetUrl: string,
  options?: TourDraftGenerationOptions,
): SuggestedTourDraft {
  const reasonsWithAdjustments = reasons.slice();
  const orderedSteps = normalizeDraftStepOrder(steps, intent);
  const sanitizedSteps = orderedSteps.map((step) => sanitizeStepCopy(step, { draftIntent: intent }));
  const normalizedSteps = dedupeDraftStepTitles(recomputeStepOrderIndex(sanitizedSteps));
  const metrics = computeHeuristicDraftScores(intent, normalizedSteps, sourceCandidates, reasons, options);
  reasonsWithAdjustments.push(...metrics.adjustments);
  const score = metrics.score;
  const confidence = metrics.confidence;

  const sessionContext = getSessionContext(options);
  const stage = normalizeStage(sessionContext?.currentStage);
  const progress = getProgress(sessionContext);
  const previewContext = buildPreviewContextSnapshot(
    sourceCandidates.map((candidate) => ({
      element: candidate.element,
      selector: candidate.selector,
      label: candidate.label,
      intent: candidate.intent,
    })),
  );
  const instrumentationSuggestions = buildInstrumentationSuggestions(sourceCandidates);

  const draftBase: SuggestedTourDraft = {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    intent,
    score,
    confidence,
    semanticScore: metrics.semanticScore,
    sequenceScore: metrics.sequenceScore,
    reasons: reasonsWithAdjustments,
    detectedSelectors: sourceCandidates.map((candidate) => candidate.selector),
    explainability: explainabilityEnabled(options)
      ? {
          generatedFrom: reasonsWithAdjustments.slice(0, 8),
          sourceCandidateCount: sourceCandidates.length,
          signalScores: {
            semantic: metrics.semanticScore,
            sequence: metrics.sequenceScore,
            confidence,
            selectorStabilityBonus: metrics.selectorStabilityBonus,
            selectorFragilityPenalty: metrics.selectorFragilityPenalty,
            actionabilityPenalty: metrics.actionabilityPenalty,
          },
          conflictNotes: [],
        }
      : undefined,
    metadata:
      previewContext || instrumentationSuggestions.length > 0
        ? {
            ...(previewContext ? { previewContext } : {}),
            ...(instrumentationSuggestions.length > 0 ? { instrumentationSuggestions } : {}),
          }
        : undefined,
    name,
    description,
    targetUrl,
    isActive: false,
    priority: 0,
    steps: normalizedSteps,
    sessionContextSnapshot: {
      stage,
      progress,
      isNewUser: sessionContext?.isNewUser !== false,
    },
  };

  const flowVersioning = buildFlowVersioningMetadata(draftBase, options);

  return {
    ...draftBase,
    flowVersioning,
  };
}

function toSuggestedTourId(label: string): string {
  const normalized = normalizeText(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized ? `tour-${normalized.slice(0, 40)}` : 'tour-action';
}

function buildInstrumentationSuggestions(
  sourceCandidates: DetectedElement[],
): Array<{ selector: string; suggestedTourId: string; stabilityScore: number; label: string }> {
  const out: Array<{ selector: string; suggestedTourId: string; stabilityScore: number; label: string }> = [];
  const seen = new Set<string>();
  for (const candidate of sourceCandidates) {
    const selector = candidate.selector;
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    if (candidate.selectorStabilityScore >= 70) continue;
    if (!isActionableElement(candidate.element)) continue;
    out.push({
      selector,
      suggestedTourId: toSuggestedTourId(candidate.label),
      stabilityScore: candidate.selectorStabilityScore,
      label: candidate.label,
    });
    if (out.length >= 5) break;
  }
  return out;
}

function chainMemberToDetected(
  candidate: DetectedElement & { rankingBoost?: number },
): DetectedElement {
  if (typeof candidate.rankingBoost === 'number') return candidate as DetectedElement;
  return { ...candidate, rankingBoost: 0 };
}

function isSequenceCandidate(candidate: DetectedElement): boolean {
  return candidate.semanticScore > 0.08 || candidate.sequenceScore > 0.08 || candidate.tokenHits > 0;
}

function isHeaderEligibleForSinglePageChain(candidate: DetectedElement): boolean {
  if (isStrictSearchSlotCandidate(candidate)) return true;
  if (candidate.intent === 'primary-action' && isActionableElement(candidate.element)) return true;
  const label = normalizeText(candidate.label);
  return (
    isActionableElement(candidate.element) &&
    /add |create |new project|import |export |save |submit /i.test(`${label} `)
  );
}

function isCoreSequenceCandidate(candidate: DetectedElement, options?: TourDraftGenerationOptions): boolean {
  // Chrome navigation (dashboard shell) is already excluded by `analysisRootSelector`.
  // In-app menus (`aside` > `nav` > `a`) are tagged `navigation` but must stay in sequence chains.
  if (!isWithinAnalysisRoot(candidate.element, options)) return false;
  if (candidate.zone !== 'header') return true;
  return Boolean(options?.singlePageTour && isHeaderEligibleForSinglePageChain(candidate));
}

function hasScopedAnalysis(options?: TourDraftGenerationOptions): boolean {
  return Boolean(normalizeText(options?.analysisRootSelector));
}

function excludesPrimaryFromSequence(
  candidate: DetectedElement,
  primary: DetectedElement | null,
): boolean {
  return Boolean(primary?.selector && candidate.selector === primary.selector) || candidate.intent === 'primary-action';
}

const SEQUENCE_UTILITY_LABEL =
  /réglages|settings|reglages|preferences|préférences|options|configuration|configurer|paramètres|parametres/i;
const SEQUENCE_SECONDARY_LABEL =
  /guide|learn|découvrir|decouvrir|discover|aide|help|documentation|doc\b|en savoir|tutoriel|tutorial/i;
const SEQUENCE_SUBMIT_LABEL =
  /confirm|validate|submit|valider|confirmer|soumettre|enregistrer|publier|sauvegarder|save|prévisualiser|preview|appliquer|apply/i;
const SEQUENCE_RESULT_LABEL = /result|status|done|complete|success|résultat|terminé|termine|fini/i;
const SEQUENCE_PAYMENT_LABEL = PAYMENT_METHOD_LABEL_PATTERN;
const SEQUENCE_SEARCH_LABEL = /recherche|search|filtre|filter|sort|trier|chercher/i;
const SEQUENCE_SUMMARY_LABEL = /panier|cart|ticket|subtotal|total|commande|table \d+/i;

type SequenceFollowUpRole = 'form-field' | 'form-submit' | 'utility' | 'secondary' | 'navigation' | 'generic-click';

const SEQUENCE_FORM_NAV_LABEL = /formulaire|form|configuration|validation|aperçu|overview|saisie/i;

function isSubmitLikeControl(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'button') return true;
  if (tagName === 'a' && SEQUENCE_SUBMIT_LABEL.test(normalizeText(getLabel(element)))) return true;
  if (tagName === 'input') {
    const inputType = (element.getAttribute('type') || '').toLowerCase();
    return inputType === 'submit' || inputType === 'button';
  }
  return false;
}

function hasFormContextInCandidates(candidates: DetectedElement[]): boolean {
  return candidates.some(
    (candidate) =>
      candidate.intent === 'form-flow' ||
      isFormControlElement(candidate.element) ||
      Boolean(candidate.element.closest('form')),
  );
}

function isInNavigationArea(candidate: DetectedElement): boolean {
  return (
    candidate.zone === 'navigation' ||
    candidate.zone === 'sidebar' ||
    Boolean(candidate.element.closest('nav, aside, [role="navigation"]'))
  );
}

function hasNavigationContextInCandidates(candidates: DetectedElement[]): boolean {
  return candidates.some((candidate) => isInNavigationArea(candidate) && isActionableElement(candidate.element));
}

function isSearchLikeCandidate(candidate: DetectedElement): boolean {
  const label = normalizeText(candidate.label);
  if (/search|recherch|filter|filtr|lookup|find|query/.test(label)) return true;
  const el = candidate.element;
  const type = normalizeText(el.getAttribute('type'));
  const placeholder = normalizeText(el.getAttribute('placeholder'));
  const ariaLabel = normalizeText(el.getAttribute('aria-label'));
  return type === 'search' || /search|recherch|filter|filtr/.test(`${placeholder} ${ariaLabel}`);
}

function pickSequenceNavigationStep(
  pools: DetectedElement[][],
  options: TourDraftGenerationOptions | undefined,
  primary: DetectedElement | null,
): DetectedElement | null {
  const formSectionNav = pickBestSequenceFollowUpFromPools(
    pools,
    options,
    primary,
    (candidate) =>
      isInNavigationArea(candidate) &&
      (SEQUENCE_FORM_NAV_LABEL.test(candidate.label) ||
        /#form|form-section|validation/i.test(candidate.element.getAttribute('href') || '')),
  );
  if (formSectionNav) return formSectionNav;

  return pickBestSequenceFollowUpFromPools(
    pools,
    options,
    primary,
    (candidate) => isInNavigationArea(candidate) && candidate.element.tagName.toLowerCase() === 'a',
  );
}

function classifySequenceFollowUpRole(candidate: DetectedElement): SequenceFollowUpRole {
  const label = normalizeText(candidate.label) || '';
  const element = candidate.element;

  if (isPaymentMethodLabel(label) && !isPlaceOrderCtaLabel(label)) {
    return 'utility';
  }

  if (isFormControlElement(element) && !isSubmitLikeControl(element)) {
    return 'form-field';
  }

  if (isSubmitLikeControl(element) && SEQUENCE_SUBMIT_LABEL.test(label)) {
    return 'form-submit';
  }

  if (SEQUENCE_UTILITY_LABEL.test(label)) {
    return 'utility';
  }

  if (isInNavigationArea(candidate) && candidate.element.tagName.toLowerCase() === 'a') {
    return 'navigation';
  }

  if (candidate.intent === 'support-navigation' || SEQUENCE_SECONDARY_LABEL.test(label)) {
    return 'secondary';
  }

  if (candidate.intent === 'form-flow' && !isSubmitLikeControl(element)) {
    return 'form-field';
  }

  if (isSubmitLikeControl(element)) {
    return 'form-submit';
  }

  return 'generic-click';
}

function buildSequenceFollowUpStepCopy(
  candidate: DetectedElement,
  role: SequenceFollowUpRole,
): { title: string; content: string; action: Step['action'] } {
  const label = candidate.label || 'cet élément';

  switch (role) {
    case 'form-field':
      return {
        title: 'Renseigner le formulaire',
        content: `Saisissez ou vérifiez les informations attendues dans ce champ: ${label}.`,
        action: 'NEXT',
      };
    case 'form-submit':
      return {
        title: 'Valider et enregistrer',
        content: `Une fois les champs complétés, confirmez l’étape avec: ${label}.`,
        action: 'CLICK',
      };
    case 'utility':
      if (SEQUENCE_PAYMENT_LABEL.test(label)) {
        return {
          title: 'Paiement et encaissement',
          content: `Ce contrôle concerne la finalisation de commande ou le moyen de paiement: ${label}.`,
          action: 'CLICK',
        };
      }
      if (SEQUENCE_SEARCH_LABEL.test(label)) {
        return {
          title: 'Recherche et filtrage',
          content: `Utilisez ce contrôle pour retrouver rapidement les éléments pertinents: ${label}.`,
          action: 'CLICK',
        };
      }
      if (SEQUENCE_SUMMARY_LABEL.test(label)) {
        return {
          title: 'Suivi de la commande',
          content: `Cette zone synthétise l'état de la commande en cours: ${label}.`,
          action: 'CLICK',
        };
      }
      return {
        title: 'Réglages et options',
        content: `Ce contrôle ouvre les préférences ou réglages associés au parcours: ${label}.`,
        action: 'CLICK',
      };
    case 'secondary':
      return {
        title: 'Découverte et aide',
        content: `Consultez les ressources d’aide ou de découverte liées à: ${label}.`,
        action: 'CLICK',
      };
    case 'navigation':
      return {
        title: 'Navigation métier',
        content: `Ce lien de navigation permet d’accéder à la section utile du parcours: ${label}.`,
        action: 'CLICK',
      };
    default:
      return {
        title: 'Étape suivante',
        content: `Poursuivez le parcours avec: ${label}.`,
        action: 'CLICK',
      };
  }
}

function buildSyntheticSequenceCandidate(element: HTMLElement): DetectedElement {
  const selectorCandidates = buildSelectorCandidates(element);
  const selector = pickPreferredSelector(element, selectorCandidates);
  const label = normalizeText(getLabel(element)) || selector;
  const zone = detectZone(element);
  let intent: TourDraftIntent = 'discovery';
  if (isFormControlElement(element) && !isSubmitLikeControl(element)) {
    intent = 'form-flow';
  } else if (SEQUENCE_UTILITY_LABEL.test(label)) {
    intent = 'discovery';
  } else if (SEQUENCE_SECONDARY_LABEL.test(label)) {
    intent = 'support-navigation';
  } else if (isSubmitLikeControl(element)) {
    intent = 'primary-action';
  }

  return {
    element,
    selector,
    selectorCandidates,
    label,
    score: 48,
    rankingBoost: 0,
    confidence: 62,
    intent,
    reasons: ['sequence follow-up anchor (stable DOM)'],
    tokenHits: 1,
    zone,
    semanticScore: 0.12,
    personaScore: 0.08,
    sequenceScore: 0.14,
    selectorStabilityScore: selectorStabilityScore(selector),
    selectorStabilityBonus: Math.max(0, selectorStabilityDelta(selector)),
    selectorFragilityPenalty: Math.min(0, selectorStabilityDelta(selector)),
    actionabilityPenalty: 0,
  };
}

function pickBestSequenceFollowUpFromPools(
  pools: DetectedElement[][],
  options: TourDraftGenerationOptions | undefined,
  primary: DetectedElement | null,
  predicate: (candidate: DetectedElement) => boolean,
): DetectedElement | null {
  const matches: DetectedElement[] = [];

  for (const pool of pools) {
    for (const candidate of pool) {
      if (!isCoreSequenceCandidate(candidate, options)) continue;
      if (excludesPrimaryFromSequence(candidate, primary)) continue;
      if (!predicate(candidate)) continue;
      matches.push(candidate);
    }
  }

  if (matches.length === 0) return null;

  matches.sort(
    (a, b) =>
      b.score + b.selectorStabilityBonus + b.rankingBoost - (a.score + a.selectorStabilityBonus + a.rankingBoost),
  );
  return matches[0];
}

function pickStableActionableFollowUpFromDom(
  candidates: DetectedElement[],
  primary: DetectedElement | null,
  options?: TourDraftGenerationOptions,
): DetectedElement | null {
  if (typeof document === 'undefined') return null;

  const root = resolveAnalysisRoot(options);
  const elements = root.querySelectorAll(
    'button, a[href], [role="button"], input[type="submit"], input[type="button"], [data-tour-id], [data-testid]',
  );

  const ranked: Array<{ element: HTMLElement; selector: string; rank: number }> = [];

  for (const node of elements) {
    if (!(node instanceof HTMLElement)) continue;
    if (!isVisible(node) || !isWithinAnalysisRoot(node, options)) continue;
    if (!isActionableElement(node)) continue;

    const selector = buildUniqueSelector(node);
    if (!selector || !isStableSelectorForPublish(selector)) continue;
    if (primary?.selector && selector === primary.selector) continue;

    const existing = candidates.find((candidate) => candidate.element === node || candidate.selector === selector);
    if (existing && excludesPrimaryFromSequence(existing, primary)) continue;

    const label = normalizeText(getLabel(node)) || selector;
    let rank = selectorStabilityDelta(selector) + (existing?.score || 0) + (existing?.rankingBoost || 0);
    if (isFormControlElement(node) && !isSubmitLikeControl(node)) rank += 28;
    else if (SEQUENCE_UTILITY_LABEL.test(label)) rank += 22;
    else if (SEQUENCE_SECONDARY_LABEL.test(label)) rank += 18;
    else if (existing?.intent === 'support-navigation') rank += 12;
    else if (SEQUENCE_SUBMIT_LABEL.test(label)) rank += 14;

    ranked.push({ element: node, selector, rank });
  }

  ranked.sort((a, b) => b.rank - a.rank);
  const best = ranked[0];
  if (!best) return null;

  const existing = candidates.find(
    (candidate) => candidate.element === best.element || candidate.selector === best.selector,
  );
  if (existing && !excludesPrimaryFromSequence(existing, primary)) return existing;

  return buildSyntheticSequenceCandidate(best.element);
}

function pickBestFormFieldFollowUp(
  pools: DetectedElement[][],
  options: TourDraftGenerationOptions | undefined,
  primary: DetectedElement | null,
): DetectedElement | null {
  const matches: DetectedElement[] = [];

  for (const pool of pools) {
    for (const candidate of pool) {
      if (!isCoreSequenceCandidate(candidate, options)) continue;
      if (excludesPrimaryFromSequence(candidate, primary)) continue;
      if (!isFormControlElement(candidate.element) || isSubmitLikeControl(candidate.element)) continue;
      matches.push(candidate);
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const topDiff = a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top;
    if (Math.abs(topDiff) > 8) return topDiff;
    return b.score + b.selectorStabilityBonus - (a.score + a.selectorStabilityBonus);
  });

  return matches[0];
}

function formatSlotCandidateLabel(candidate: DetectedElement): string {
  const shortId = candidateRankingShortId(candidate);
  const label = normalizeText(candidate.label);
  return label ? `${label} · ${shortId}` : shortId;
}

/**
 * Domain-agnostic singlePageTour chain (7 optional slots, primary mandatory).
 * Blueprints handle vertical-specific flows — this path stays generic.
 */
function buildGenericSinglePageSequenceChain(
  candidates: DetectedElement[],
  primaryHint: DetectedElement | null,
  options?: TourDraftGenerationOptions,
): { chain: DetectedElement[]; decisions: SinglePageSlotDecision[] } {
  const maxSteps = options?.maxSteps ?? 7;
  const chain: DetectedElement[] = [];
  const decisions: SinglePageSlotDecision[] = [];
  const pool = candidates.filter((candidate) => isCoreSequenceCandidate(candidate, options));

  const tryFill = (
    slot: number,
    slotId: GenericSinglePageSlotId,
    candidate: DetectedElement | null | undefined,
    skipLine: string,
  ) => {
    if (!candidate) {
      decisions.push({ slot, slotId, status: 'skipped', line: skipLine });
      return;
    }
    if (!isCoreSequenceCandidate(candidate, options)) {
      decisions.push({ slot, slotId, status: 'skipped', line: `Slot ${slot}: skipped (not a core candidate)` });
      return;
    }
    if (isBlockedByChain(candidate, chain)) {
      decisions.push({
        slot,
        slotId,
        status: 'skipped',
        line: `Slot ${slot}: skipped (duplicate DOM target vs earlier slot)`,
      });
      return;
    }
    if (chain.length >= maxSteps) {
      decisions.push({ slot, slotId, status: 'skipped', line: `Slot ${slot}: skipped (maxSteps ${maxSteps} reached)` });
      return;
    }
    chain.push(candidate);
    decisions.push({
      slot,
      slotId,
      status: 'filled',
      line: `Slot ${slot}: filled (${formatSlotCandidateLabel(candidate)}, score ${Math.round(
        slot === 1 ? genericPrimarySlotRank(candidate) : effectiveRank(candidate),
      )})`,
    });
  };

  const primaryPool = pool.filter(
    (candidate) =>
      candidate.intent === 'primary-action' ||
      (isActionableElement(candidate.element) && candidate.intent !== 'form-flow'),
  );
  const slot1Candidate =
    primaryHint && isCoreSequenceCandidate(primaryHint, options)
      ? primaryHint
      : primaryPool.sort((a, b) => genericPrimarySlotRank(b) - genericPrimarySlotRank(a))[0] || null;

  if (!slot1Candidate) {
    decisions.push({
      slot: 1,
      slotId: 'primary-action',
      status: 'skipped',
      line: 'Slot 1: skipped (no primary-action candidate — chain aborted)',
    });
    lastSinglePageChainSlotDecisions = decisions;
    return { chain: [], decisions };
  }

  tryFill(1, 'primary-action', slot1Candidate, '');
  const primary = slot1Candidate;

  const searchPool = pool
    .filter((candidate) => isStrictSearchSlotCandidate(candidate))
    .sort((a, b) => effectiveRank(b) - effectiveRank(a));
  const searchPick = searchPool[0];
  if (searchPick && candidateConfidenceRatio(searchPick) > 0.5) {
    tryFill(2, 'search', searchPick, '');
  } else {
    tryFill(
      2,
      'search',
      null,
      searchPick
        ? `Slot 2: skipped (${formatSlotCandidateLabel(searchPick)}, confidence ${Math.round(searchPick.confidence)} < 50)`
        : 'Slot 2: skipped (no search input above threshold)',
    );
  }

  const secondPrimaryPick = pool
    .filter(
      (candidate) =>
        candidate.intent === 'primary-action' &&
        isActionableElement(candidate.element) &&
        !isSameDomTarget(candidate, primary) &&
        !isStrictSearchSlotCandidate(candidate) &&
        !isExplicitSettingsOrProfileCandidate(candidate),
    )
    .sort((a, b) => genericPrimarySlotRank(b) - genericPrimarySlotRank(a))[0];
  const secondaryNavPick = pool
    .filter((candidate) => isSecondaryActionSlotCandidate(candidate, primary) && candidate.intent !== 'primary-action')
    .sort((a, b) => effectiveRank(b) - effectiveRank(a))[0];
  const secondaryCandidates = [secondPrimaryPick, secondaryNavPick].filter(Boolean) as DetectedElement[];
  const secondaryPick =
    secondaryCandidates.length > 0
      ? secondaryCandidates.sort((a, b) => genericPrimarySlotRank(b) - genericPrimarySlotRank(a))[0]
      : null;
  if (secondaryPick && candidateConfidenceRatio(secondaryPick) >= 0.45) {
    tryFill(3, 'secondary-action', secondaryPick, '');
  } else {
    tryFill(
      3,
      'secondary-action',
      null,
      secondaryPick
        ? `Slot 3: skipped (${formatSlotCandidateLabel(secondaryPick)}, confidence ${Math.round(secondaryPick.confidence)} < 45)`
        : 'Slot 3: skipped (no secondary action above threshold)',
    );
  }

  const tabNav = pool
    .filter((candidate) => isTabNavigationCandidate(candidate))
    .sort((a, b) => navigationSlotRank(b) - navigationSlotRank(a));
  const sidebarNav = pool
    .filter(
      (candidate) =>
        isSidebarNavigationCandidate(candidate) && !isExplicitSettingsOrProfileCandidate(candidate),
    )
    .sort((a, b) => navigationSlotRank(b) - navigationSlotRank(a));
  const navigationPick = tabNav[0] || sidebarNav[0];
  if (navigationPick) {
    tryFill(4, 'navigation', navigationPick, '');
  } else {
    tryFill(4, 'navigation', null, 'Slot 4: skipped (no navigation/tab candidate)');
  }

  const analyticsPool = pool
    .filter((candidate) => isAnalyticsOrResultSlotCandidate(candidate))
    .sort((a, b) => effectiveRank(b) - effectiveRank(a));
  const analyticsPick = analyticsPool[0];
  if (analyticsPick && candidateConfidenceRatio(analyticsPick) >= 0.45) {
    tryFill(5, 'analytics-or-result', analyticsPick, '');
  } else {
    tryFill(
      5,
      'analytics-or-result',
      null,
      analyticsPick
        ? `Slot 5: skipped (${formatSlotCandidateLabel(analyticsPick)}, confidence ${Math.round(analyticsPick.confidence)} < 45)`
        : 'Slot 5: skipped (no analytics/result candidate)',
    );
  }

  const utilityPool = pool
    .filter((candidate) => isUtilitySlotCandidate(candidate))
    .sort((a, b) => effectiveRank(b) - effectiveRank(a));
  const utilityPick = utilityPool[0];
  if (utilityPick && candidateConfidenceRatio(utilityPick) >= 0.45) {
    tryFill(6, 'utility', utilityPick, '');
  } else {
    tryFill(
      6,
      'utility',
      null,
      utilityPick
        ? `Slot 6: skipped (${formatSlotCandidateLabel(utilityPick)}, confidence ${Math.round(utilityPick.confidence)} < 45)`
        : 'Slot 6: skipped (no utility candidate)',
    );
  }

  const settingsPool = pool
    .filter((candidate) => isExplicitSettingsOrProfileCandidate(candidate))
    .sort((a, b) => effectiveRank(b) - effectiveRank(a));
  const settingsPick = settingsPool[0];
  const nonSettingsStepsBeforeSettings = chain.filter((c) => !isExplicitSettingsOrProfileCandidate(c)).length;
  const settingsAllowed = chain.length >= 3 && nonSettingsStepsBeforeSettings >= 3;

  if (settingsPick && settingsAllowed) {
    tryFill(7, 'settings-or-profile', settingsPick, '');
  } else if (settingsPick && !settingsAllowed) {
    tryFill(
      7,
      'settings-or-profile',
      null,
      `Slot 7: skipped (${formatSlotCandidateLabel(settingsPick)} — requires ≥3 prior non-settings steps)`,
    );
  } else {
    tryFill(7, 'settings-or-profile', null, 'Slot 7: skipped (no explicit settings/profile control)');
  }

  lastSinglePageChainSlotDecisions = decisions;
  return { chain, decisions };
}

function buildSinglePageSequenceChain(
  candidates: DetectedElement[],
  primary: DetectedElement | null,
  options?: TourDraftGenerationOptions,
): DetectedElement[] {
  return buildGenericSinglePageSequenceChain(candidates, primary, options).chain;
}

/** Primary-action is always step 1; other steps keep 7-slot chain order (no re-rank). */
function pinSinglePageTourStepOrder(steps: Step[]): Step[] {
  if (steps.length <= 1) return steps;

  const primaryIndex = steps.findIndex((step) => step.isPrimary);
  const primary =
    primaryIndex >= 0
      ? { ...steps[primaryIndex], isPrimary: true }
      : { ...steps[0], isPrimary: true };
  const primaryIdx = primaryIndex >= 0 ? primaryIndex : 0;
  const rest = steps.filter((_, index) => index !== primaryIdx);

  return recomputeStepOrderIndex([primary, ...rest]);
}

function resolveSequenceFollowUpCandidate(
  orderedCandidates: DetectedElement[],
  allCandidates: DetectedElement[],
  options: TourDraftGenerationOptions | undefined,
  form: DetectedElement | null,
  primary: DetectedElement | null,
): DetectedElement | null {
  const pools = [orderedCandidates, allCandidates];
  const formContext = hasFormContextInCandidates(allCandidates);

  if (form && isCoreSequenceCandidate(form, options) && !excludesPrimaryFromSequence(form, primary)) {
    return form;
  }

  if (formContext) {
    const formField = pickBestFormFieldFollowUp(pools, options, primary);
    if (formField) return formField;

    const submit = pickBestSequenceFollowUpFromPools(
      pools,
      options,
      primary,
      (candidate) =>
        isSubmitLikeControl(candidate.element) && SEQUENCE_SUBMIT_LABEL.test(candidate.label),
    );
    if (submit) return submit;
  }

  const utility = pickBestSequenceFollowUpFromPools(
    pools,
    options,
    primary,
    (candidate) => SEQUENCE_UTILITY_LABEL.test(candidate.label) && !isFormControlElement(candidate.element),
  );
  if (utility) return utility;

  const secondary = pickBestSequenceFollowUpFromPools(
    pools,
    options,
    primary,
    (candidate) =>
      candidate.intent === 'support-navigation' || SEQUENCE_SECONDARY_LABEL.test(candidate.label),
  );
  if (secondary) return secondary;

  if (!formContext) {
    const submit = pickBestSequenceFollowUpFromPools(
      pools,
      options,
      primary,
      (candidate) =>
        isSubmitLikeControl(candidate.element) && SEQUENCE_SUBMIT_LABEL.test(candidate.label),
    );
    if (submit) return submit;
  }

  const actionable = pickBestSequenceFollowUpFromPools(
    pools,
    options,
    primary,
    (candidate) => isActionableElement(candidate.element),
  );
  if (actionable) return actionable;

  return pickStableActionableFollowUpFromDom(allCandidates, primary, options);
}

function buildSequenceDraft(
  candidates: DetectedElement[],
  heading: HTMLElement | null,
  primary: DetectedElement | null,
  support: DetectedElement | null,
  form: DetectedElement | null,
  targetUrl: string,
  options?: TourDraftGenerationOptions,
): SuggestedTourDraft | null {
  const sessionContext = getSessionContext(options);
  const stage = normalizeStage(sessionContext?.currentStage);
  const progress = getProgress(sessionContext);

  const entry =
    heading && isStableSelectorForPublish(buildUniqueSelector(heading))
      ? {
          element: heading,
          selector: buildUniqueSelector(heading),
          selectorCandidates: buildSelectorCandidates(heading),
          label: normalizeText(heading.textContent),
          score: 72,
          rankingBoost: 0,
          confidence: 68,
          intent: 'discovery' as const,
          reasons: ['entry heading'],
          tokenHits: 1,
          zone: 'main' as CandidateZone,
          semanticScore: 0.35,
          personaScore: 0.1,
          sequenceScore: 0.6,
          selectorStabilityScore: selectorStabilityScore(buildUniqueSelector(heading)),
          selectorStabilityBonus: 0,
          selectorFragilityPenalty: 0,
          actionabilityPenalty: 0,
        }
      : null;

  const orderedCandidates = candidates
    .filter(isSequenceCandidate)
    .slice()
    .sort((a, b) => {
      const topDiff = a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top;
      if (Math.abs(topDiff) > 8) return topDiff;
      return b.score - a.score;
    });

  const dedicatedPrimaryDraftExists = Boolean(primary) && !options?.singlePageTour;
  const action = dedicatedPrimaryDraftExists
    ? null
    : primary || orderedCandidates.find((candidate) => candidate.intent === 'primary-action') || orderedCandidates[0] || null;
  const formContext = hasFormContextInCandidates(candidates);
  const navContext = hasNavigationContextInCandidates(candidates);
  const navStep =
    formContext && navContext
      ? pickSequenceNavigationStep([orderedCandidates, candidates], options, primary)
      : null;
  const followUp = resolveSequenceFollowUpCandidate(orderedCandidates, candidates, options, form, primary);
  const result =
    orderedCandidates.find(
      (candidate) => isCoreSequenceCandidate(candidate, options) && SEQUENCE_RESULT_LABEL.test(candidate.label),
    ) || (support && isCoreSequenceCandidate(support, options) ? support : null) || null;

  let chain = [entry, action, navStep, followUp, result].filter(Boolean) as Array<
    DetectedElement | {
      element: HTMLElement;
      selector: string;
      selectorCandidates: string[];
      label: string;
      score: number;
      rankingBoost: number;
      confidence: number;
      intent: TourDraftIntent;
      reasons: string[];
      tokenHits: number;
      zone: CandidateZone;
      semanticScore: number;
      personaScore: number;
      sequenceScore: number;
      selectorStabilityScore: number;
      selectorStabilityBonus: number;
      selectorFragilityPenalty: number;
      actionabilityPenalty: number;
    }
  >;

  if (dedicatedPrimaryDraftExists && primary?.selector) {
    chain = chain.filter((candidate) => candidate.selector !== primary.selector);
  }

  let uniqueChain = chain.filter((candidate, index) => chain.findIndex((item) => item.selector === candidate.selector) === index);

  if (options?.singlePageTour) {
    uniqueChain = buildSinglePageSequenceChain(candidates, null, options);
  }

  const minChainLength = options?.singlePageTour ? 1 : 2;
  if (uniqueChain.length < minChainLength) return null;

  const hasActionableStep = uniqueChain.some((candidate) => isActionableElement(candidate.element));
  if (!hasActionableStep) return null;

  const primarySelector = options?.singlePageTour
    ? uniqueChain[0]?.selector
    : (action || primary)?.selector;
  const useSinglePageStepBuilder = Boolean(options?.singlePageTour);

  const rawSteps: Step[] = uniqueChain.map((candidate, index) => {
    if (useSinglePageStepBuilder) {
      const detected = chainMemberToDetected(candidate as DetectedElement);
      const isPrimaryStep = Boolean(primarySelector && candidate.selector === primarySelector);
      if (isPrimaryStep) {
        const posPrimary =
          isPlaceOrderCtaLabel(candidate.label) || /place-order/i.test(candidate.selector);
        return buildStep(
          posPrimary ? 'Finaliser la commande' : 'Action principale',
          posPrimary
            ? `Validez la commande en cours avec: ${candidate.label}.`
            : `Commencez par l'action clé: ${candidate.label}.`,
          candidate.element,
          'TOP',
          'CLICK',
          { intent: 'primary-action', stepIndex: index, totalSteps: uniqueChain.length },
          {
            isPrimary: true,
            targetSelector: candidate.selector,
            selectorCandidates: candidate.selectorCandidates,
            stabilityScore: candidate.selectorStabilityScore,
          },
        );
      }
      const followUpRole = classifySequenceFollowUpRole(detected);
      const followUpCopy = buildSequenceFollowUpStepCopy(detected, followUpRole);
      return buildStep(
        followUpCopy.title,
        followUpCopy.content,
        candidate.element,
        followUpRole === 'form-field' ? 'RIGHT' : 'BOTTOM',
        followUpCopy.action,
        { intent: detected.intent, stepIndex: index, totalSteps: uniqueChain.length },
        {
          targetSelector: candidate.selector,
          selectorCandidates: candidate.selectorCandidates,
          stabilityScore: candidate.selectorStabilityScore,
        },
      );
    }

    const isEntry = candidate === entry;
    const isActionStep = candidate === action;
    const isNavStep = candidate === navStep;
    const isFollowUp = candidate === followUp;
    const isResult = candidate === result;
    const selector = candidate.selector;

    let title = `Etape ${index + 1}`;
    let content = `Continuer le flux: ${candidate.label}.`;
    let stepAction: Step['action'] = 'NEXT';
    let position: PositionType = 'BOTTOM';
    let followUpRole: SequenceFollowUpRole | null = null;

    if (isEntry) {
      title = 'Point d\'entrée';
      const entryLabel = candidate.label || '';
      const mentionsNavAndForm = /navigation/i.test(entryLabel) && /formulaire|form/i.test(entryLabel);
      content = mentionsNavAndForm
        ? `Ce parcours enchaîne la navigation métier puis le formulaire à partir de: ${entryLabel}.`
        : `Le parcours commence ici avec le contexte visible: ${entryLabel}.`;
    } else if (isActionStep) {
      title = 'Action clé';
      content = `L'IA légère classe cette action comme la plus probable pour lancer le flux: ${candidate.label}.`;
      stepAction = 'CLICK';
    } else if (isNavStep) {
      const chainCandidate = chainMemberToDetected(candidate as DetectedElement);
      const navCopy = buildSequenceFollowUpStepCopy(chainCandidate, 'navigation');
      title = navCopy.title;
      content = navCopy.content;
      stepAction = navCopy.action;
      position = 'RIGHT';
    } else if (isFollowUp) {
      const chainCandidate = chainMemberToDetected(candidate as DetectedElement);
      followUpRole = classifySequenceFollowUpRole(chainCandidate);
      const followUpCopy = buildSequenceFollowUpStepCopy(chainCandidate, followUpRole);
      title = followUpCopy.title;
      content = followUpCopy.content;
      stepAction = followUpCopy.action;
      position = followUpRole === 'form-field' ? 'RIGHT' : 'BOTTOM';
    } else if (isResult) {
      title = 'Résultat';
      content = `Le résultat ou l'état final attendu se trouve ici: ${candidate.label}.`;
      position = 'TOP';
    }

    return buildStep(
      title,
      content,
      candidate.element,
      position,
      stepAction,
      {
        intent: candidate.intent,
        stepIndex: index,
        totalSteps: uniqueChain.length,
      },
      {
        isPrimary:
          isActionStep || (dedicatedPrimaryDraftExists && isFollowUp && followUpRole === 'form-submit' && stepAction === 'CLICK'),
        targetSelector: selector,
        selectorCandidates: candidate.selectorCandidates,
        stabilityScore: candidate.selectorStabilityScore,
      },
    );
  });
  const hasEntryStep = rawSteps.some((step) =>
    /point d['']entr[ée]e/i.test(normalizeText(step.title)),
  );
  if (!rawSteps.some((step) => step.isPrimary) && !hasEntryStep) {
    const firstClick = rawSteps.findIndex((step) => step.action === 'CLICK');
    if (firstClick >= 0) {
      rawSteps[firstClick] = { ...rawSteps[firstClick], isPrimary: true };
    }
  }
  // singlePageTour: keep 7-slot chain order — spatial sort would swap e.g. sidebar Dashboard vs header Import.
  const orderedSteps = options?.singlePageTour
    ? rawSteps
    : normalizeDraftStepOrder(rawSteps, 'discovery');
  let steps = dedupeDraftStepTitles(recomputeStepOrderIndex(orderedSteps));
  if (options?.singlePageTour) {
    steps = pinSinglePageTourStepOrder(steps);
  } else if (entry) {
    steps = pinDiscoveryEntryFirstStepOrder(steps);
  }

  const chainDetected = uniqueChain.map((candidate) => chainMemberToDetected(candidate as DetectedElement));
  const sequenceReasons = [
    'sequence detection enabled',
    ...(options?.singlePageTour
      ? ['generic singlePageTour 7-slot chain', ...lastSinglePageChainSlotDecisions.map((row) => row.line)]
      : [
          ...(entry ? ['entry detected'] : []),
          ...(action ? action.reasons.slice(0, 2) : []),
          ...(navStep ? ['navigation step detected'] : []),
          ...(followUp ? ['follow-up step detected'] : []),
          ...(result ? ['result detected'] : []),
        ]),
  ];
  const metrics = computeHeuristicDraftScores('discovery', steps, chainDetected, sequenceReasons, options);
  const sequenceMinConfidence = resolveSequenceMinConfidence(options);
  if (metrics.confidence < sequenceMinConfidence) return null;

  const previewContext = buildPreviewContextSnapshot(
    uniqueChain.map((candidate) => ({
      element: candidate.element,
      selector: candidate.selector,
      label: candidate.label,
      intent: candidate.intent,
    })),
  );
  const instrumentationSuggestions = buildInstrumentationSuggestions(chainDetected);

  const draftBase: SuggestedTourDraft = {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    intent: 'discovery',
    score: metrics.score,
    confidence: metrics.confidence,
    semanticScore: metrics.semanticScore,
    sequenceScore: metrics.sequenceScore,
    reasons: [...sequenceReasons, ...metrics.adjustments],
    detectedSelectors: uniqueChain.map((candidate) => candidate.selector),
    explainability: explainabilityEnabled(options)
      ? {
          generatedFrom: ['sequence detection enabled', 'ordered candidate chain', 'semantic + sequence scoring'],
          sourceCandidateCount: uniqueChain.length,
          signalScores: {
            semantic: metrics.semanticScore,
            sequence: metrics.sequenceScore,
            confidence: metrics.confidence,
            selectorStabilityBonus: metrics.selectorStabilityBonus,
            selectorFragilityPenalty: metrics.selectorFragilityPenalty,
            actionabilityPenalty: metrics.actionabilityPenalty,
          },
          conflictNotes: [],
        }
      : undefined,
    metadata:
      previewContext || instrumentationSuggestions.length > 0
        ? {
            ...(previewContext ? { previewContext } : {}),
            ...(instrumentationSuggestions.length > 0 ? { instrumentationSuggestions } : {}),
          }
        : undefined,
    name: `Parcours séquentiel - ${document.title || action?.label || 'page courante'}`,
    description: 'Parcours multi-etapes reconstruit à partir du contexte visible, du sens métier et du flux probable.',
    targetUrl,
    isActive: false,
    priority: 0,
    steps,
    sessionContextSnapshot: {
      stage,
      progress,
      isNewUser: sessionContext?.isNewUser !== false,
    },
  };

  const flowVersioning = buildFlowVersioningMetadata(draftBase, options);

  return {
    ...draftBase,
    flowVersioning,
  };
}

function diversifyDrafts(drafts: SuggestedTourDraft[]): SuggestedTourDraft[] {
  const intentCount = new Map<TourDraftIntent, number>();
  const usedSelectors = new Set<string>();
  const output: SuggestedTourDraft[] = [];

  const ranked = [...drafts].sort((a, b) => b.score - a.score);
  for (const draft of ranked) {
    const currentIntentCount = intentCount.get(draft.intent) || 0;
    const overlap = draft.detectedSelectors.filter((selector) => usedSelectors.has(selector)).length;
    const penalty = currentIntentCount * 8 + overlap * 6;
    const effectiveScore = draft.score - penalty;
    if (effectiveScore < 15) continue;

    intentCount.set(draft.intent, currentIntentCount + 1);
    for (const selector of draft.detectedSelectors) usedSelectors.add(selector);
    output.push({ ...draft, score: Math.max(0, effectiveScore) });
  }

  return output;
}

// ============================================================================
// P3 quality filter — rejects trivial heuristic drafts that would harm
// the developer's perception of the SDK (single-step nav, heading-only,
// all-nav). Blueprint drafts bypass this filter.
// ============================================================================

const NAV_INTENT_SET: ReadonlySet<TourDraftIntent> = new Set(['support-navigation']);

function classifyTrivialHeuristicDraft(draft: SuggestedTourDraft): string | null {
  if (!draft.steps || draft.steps.length === 0) return 'no steps';
  if (draft.steps.length === 1) {
    // Single-step drafts are rarely valuable unless they point to a real
    // action (primary-action or form-flow). Single navigation/discovery step
    // = "look at this link" → trivial.
    if (NAV_INTENT_SET.has(draft.intent) || draft.intent === 'discovery') {
      return 'single-step draft with navigation/discovery intent';
    }
  }
  // All-nav: every step targets a navigation/sidebar/header element. Such a
  // draft is just a tour of the menus, which the user doesn't need.
  const allNav = draft.steps.every((step) => {
    const selector = step.targetSelector || '';
    return /header|nav|sidebar|menu/i.test(selector);
  });
  if (allNav && draft.steps.length <= 2) {
    return 'all-navigation draft (header/nav/sidebar only)';
  }
  // Heading-only: a draft that just points to the page H1 with no follow-up
  // actionable step.
  const headingOnly =
    draft.steps.length === 1 &&
    draft.steps[0].action === 'NEXT' &&
    /^h[1-3]/.test(draft.steps[0].targetSelector || '');
  if (headingOnly) return 'heading-only draft';
  return null;
}

function aggregateRejectionReasons(rejections: Array<{ reason: string }>): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const { reason } of rejections) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([reason, count]) => ({ reason, count }));
}

function toBlueprintReportEntry(report: BlueprintResolutionReport) {
  return {
    blueprintId: report.blueprintId,
    vertical: report.vertical,
    declaredSteps: report.declaredSteps,
    resolvedOnCurrentPage: report.resolvedOnCurrentPage,
    resolvedCrossPage: report.resolvedCrossPage,
    resolvedDeduced: report.resolvedDeduced,
    unresolvedSteps: report.unresolvedSteps,
    produced: report.produced,
    rejectionReason: report.rejectionReason,
  };
}

/**
 * Async wrapper around `generateContextualTourDrafts` that optionally
 * fetches backend semantic hints (when `semanticEngineMode` is
 * `'hybrid'` or `'backend'` and `semanticBackendUrl` is configured) and
 * merges them with the local semantic inference. On timeout / error /
 * disabled mode, this falls through to the sync local path without any
 * regression vs. the legacy heuristic behavior.
 */
export async function generateContextualTourDraftsAsync(
  options?: TourDraftGenerationOptions,
): Promise<SuggestedTourDraft[]> {
  if (typeof document === 'undefined') return [];

  let resolvedOptions = options;
  try {
    resolvedOptions = await resolveTourDraftOptionsWithRemoteBlueprints(options);
  } catch {
    resolvedOptions = options;
  }

  if (options?.semanticEnhancementEnabled !== true) {
    return generateContextualTourDrafts(resolvedOptions);
  }
  const mode = resolvedOptions?.semanticEngineMode ?? 'hybrid';
  if (mode === 'local') {
    return generateContextualTourDrafts(resolvedOptions);
  }

  // Honour the DOM-settled gate before doing any work: in async mode we
  // can actively wait for the DOM to quiesce before scanning, which is
  // much friendlier than the sync path's "skip and try later" behavior.
  // If the gate cannot prove stability after the max wait, we fall
  // through to the sync local-only path which will record the bypass
  // reason in the debug report.
  const stability = await waitForDomToSettle(resolvedOptions);
  if (!stability.stable) {
    return generateContextualTourDrafts(resolvedOptions);
  }

  let preCandidates: DetectedElement[] = [];
  try {
    preCandidates = collectCandidates(resolvedOptions);
  } catch {
    return generateContextualTourDrafts(resolvedOptions);
  }
  if (preCandidates.length === 0) {
    return generateContextualTourDrafts(resolvedOptions);
  }

  const inputs = buildSemanticInputs(preCandidates);
  const snapshot = buildSemanticPageSnapshot(inputs, resolvedOptions);
  const request = {
    snapshot,
    candidates: inputs.map((candidate) => ({
      selector: candidate.selector,
      label: candidate.label,
      tag: candidate.element.tagName.toLowerCase(),
      intent: candidate.intent,
      zone: candidate.zone,
    })),
    hints: resolvedOptions?.semanticHints,
    objectives: resolvedOptions?.businessObjectives,
    persona: typeof resolvedOptions?.persona === 'string' ? resolvedOptions?.persona : undefined,
    pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
  };

  let inferenceResult;
  try {
    inferenceResult = await fetchBackendSemanticHints(request, resolvedOptions);
  } catch {
    inferenceResult = {
      status: 'error' as const,
      hints: [],
      preferredOrder: null,
      implementation: {
        kind: 'rule-based-mirror' as const,
        phase: 'phase-1-local' as const,
        fallbackReason: 'sdk_http_error' as const,
        note: 'SDK failed to reach backend semantic-hints.',
      },
    };
  }

  pendingBackendSemanticHints = inferenceResult;
  try {
    return generateContextualTourDrafts(resolvedOptions);
  } finally {
    pendingBackendSemanticHints = null;
  }
}

export function generateContextualTourDrafts(options?: TourDraftGenerationOptions): SuggestedTourDraft[] {
  if (typeof document === 'undefined') return [];

  prepareCandidateScan(options);
  const startedAt = Date.now();
  activeDiagnostics = createDiagnostics();
  lastSinglePageChainSlotDecisions = [];
  // Stability fix B: capture a single feedback snapshot for the whole scan.
  // All `scoreCandidate` invocations below resolve the local feedback store
  // from this constant value, so a tour event mid-scan (e.g. user clicks
  // "Next" while a MutationObserver tick is in flight) cannot make two
  // candidates of the same scan see different feedback states.
  currentFeedbackSnapshot = getFeedbackStore();

  const candidates = collectCandidates(options);
  const generationModePlan = planContextualGenerationMode(options, candidates);
  const resolvedOptions = applySinglePageTourProfile(
    generationModePlan.applySinglePageTourForGeneration
      ? { ...options, singlePageTour: true }
      : options,
  );

  const generationProfile = resolveGenerationProfile(resolvedOptions);
  const maxDrafts = generationProfile.maxDrafts;
  const maxSteps = resolvedOptions?.maxSteps ?? 3;
  const minScore = generationProfile.minScore;
  const minConfidence = generationProfile.minConfidence;
  const sequenceMinConfidence = resolveSequenceMinConfidence(resolvedOptions);
  const targetUrl = resolvedOptions?.targetUrl ?? window.location.pathname;
  if (candidates.length === 0) {
    const emptySemanticShell =
      options?.semanticEnhancementEnabled === true
        ? buildSemanticEnhancementDebugShell(options, null)
        : undefined;
    lastGenerationDebugReport = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      optionsSnapshot: {
        minScore,
        minConfidence,
        mode: options?.mode ?? resolveEffectiveContextualMode(options),
        generationPath: resolveGenerationPathFromPlan(generationModePlan, options),
        conflictResolutionEnabled: options?.conflictResolutionEnabled !== false,
        conflictResolutionStrategy: resolveConflictStrategy(options),
        explainabilityEnabled: explainabilityEnabled(options),
        sessionContextEnabled: Boolean(options?.sessionContext),
        flowVersioningEnabled: options?.flowVersioningEnabled !== false,
        flowVersion: options?.flowVersion || 'v1',
      },
      ...(generationModePlan.autoDecision
        ? { autoDecision: generationModePlan.autoDecision }
        : {}),
      candidateMetrics: activeDiagnostics || createDiagnostics(),
      scoringAdjustments: {
        selectorStabilityBonus: 0,
        selectorFragilityPenalty: 0,
        actionabilityPenalty: 0,
      },
      draftMetrics: {
        beforeConflict: 0,
        afterConflict: 0,
        afterConfidenceFilter: 0,
        afterMaxDrafts: 0,
      },
      conflicts: [],
      stability: {
        viewportWeightMode: 'document-relative',
        feedbackUsed: options?.feedbackEnabled === true,
        remoteFeedbackReady: remoteFeedbackBootstrapped,
        feedbackAppliedTo: 'ranking-only',
      },
      qualityFilter: {
        rejectedAsTrivial: 0,
        rejectedReasons: [],
      },
      ...(emptySemanticShell ? { semanticEnhancement: emptySemanticShell } : {}),
    };
    activeDiagnostics = null;
    currentFeedbackSnapshot = null;
    releaseCandidateMutationObserver();
    return [];
  }

  const heading = getPageHeading(resolvedOptions);
  const headingSelector = heading ? buildUniqueSelector(heading) : '';
  const primaryExcludedSelectors = headingSelector ? [headingSelector] : [];
  const primaryFallbackPool = candidates.filter(
    (candidate) => !isFormControlElement(candidate.element) && !isSearchLikeCandidate(candidate),
  );
  const primary =
    pickBestPrimaryActionCandidate(primaryFallbackPool, primaryExcludedSelectors) ||
    pickBestCandidate(primaryFallbackPool, 'primary-action', primaryExcludedSelectors) ||
    pickBestActionableCandidate(primaryFallbackPool, primaryExcludedSelectors) ||
    pickBestPrimaryActionCandidate(candidates, primaryExcludedSelectors) ||
    pickBestCandidate(candidates, 'primary-action', primaryExcludedSelectors) ||
    pickBestActionableCandidate(candidates, primaryExcludedSelectors) ||
    pickAnyCandidate(candidates, primaryExcludedSelectors);

  // Phase 4: hybrid semantic enhancement layer. The legacy heuristic
  // pipeline above is the source of truth; the semantic layer is opt-in
  // and only nudges the score/copy of generated drafts within bounded
  // margins (see `applySemanticFusionToDraft`).
  const stashedBackendHints = pendingBackendSemanticHints;
  pendingBackendSemanticHints = null;
  const semanticContext: SemanticContext | null = (() => {
    if (options?.semanticEnhancementEnabled !== true) return null;
    try {
      const inputs = buildSemanticInputs(candidates);
      const snapshot = buildSemanticPageSnapshot(inputs, options);
      const mode = (options?.semanticEngineMode ?? 'hybrid') as 'local' | 'hybrid' | 'backend';
      const stability = evaluateDomStability(options);

      // DOM-stability gate. When the DOM is still settling (lazy mount,
      // Suspense, streaming SSR), we keep the legacy heuristic output
      // and skip the semantic enhancement entirely. We still build a
      // "telemetry-only" context so the lab can SEE that semantic was
      // bypassed and why — instead of silently returning to legacy.
      if (!stability.stable) {
        return {
          enabled: false,
          engineMode: mode,
          snapshot,
          rolesBySelector: new Map(),
          backendSelectors: new Set(),
          mergedSelectors: new Set(),
          preferredOrder: null,
          backendStatus: stashedBackendHints?.status ?? (mode === 'local' ? 'disabled' : 'unconfigured'),
          backendImplementation: stashedBackendHints?.implementation ?? null,
          domStability: stability,
          draftReports: [],
        };
      }

      const localRoles = inputs.map((candidate) => classifyCandidate(candidate, snapshot));
      const localBySelector = new Map<string, SemanticCandidateRole>();
      for (const role of localRoles) localBySelector.set(role.selector, role);

      const backendSelectors = new Set<string>();
      const mergedSelectors = new Set<string>();
      let finalRoles: SemanticCandidateRole[] = localRoles;
      if (stashedBackendHints?.hints?.length) {
        finalRoles = mergeBackendHints(localRoles, stashedBackendHints.hints);
        const hintBySelector = new Map(stashedBackendHints.hints.map((hint) => [hint.selector, hint]));
        for (const role of finalRoles) {
          const local = localBySelector.get(role.selector);
          const backend = hintBySelector.get(role.selector);
          if (!backend) continue;
          if (local && role.role === backend.role && role.role !== local.role) {
            backendSelectors.add(role.selector);
          } else if (local) {
            mergedSelectors.add(role.selector);
          }
        }
      }

      const rolesBySelector = new Map<string, SemanticCandidateRole>();
      for (const role of finalRoles) rolesBySelector.set(role.selector, role);
      const backendStatus: BackendSemanticInferenceStatus = stashedBackendHints
        ? stashedBackendHints.status
        : mode === 'local'
          ? 'disabled'
          : 'unconfigured';
      return {
        enabled: true,
        engineMode: mode,
        snapshot,
        rolesBySelector,
        backendSelectors,
        mergedSelectors,
        preferredOrder: stashedBackendHints?.preferredOrder ?? null,
        backendStatus,
        backendImplementation: stashedBackendHints?.implementation ?? null,
        domStability: stability,
        draftReports: [],
      };
    } catch {
      return null;
    }
  })();
  const support = generationProfile.includeSupportDraft ? pickBestCandidate(candidates, 'support-navigation') : null;
  const navigation = generationProfile.includeNavigationDraft ? pickAnyCandidate(candidates, [primary?.selector || ''], ['navigation', 'sidebar', 'main']) : null;
  const form = generationProfile.includeFormDraft ? pickBestCandidate(candidates, 'form-flow') : null;
  const discoveryPick = pickBestCandidate(candidates, 'discovery');
  const candidateRankings = buildCandidateRankingDebug(candidates, {
    'primary-action': primary,
    'support-navigation': support,
    'form-flow': form,
    discovery: discoveryPick,
  });

  const drafts: SuggestedTourDraft[] = [];

  // Analyse limitée à un conteneur : le séquentiel couvre déjà l'entrée — éviter un 3e draft découverte redondant.
  const skipHeadingDiscoveryDraft = hasScopedAnalysis(resolvedOptions);

  if (!resolvedOptions?.singlePageTour && heading && primary && !skipHeadingDiscoveryDraft) {
    const usedSelectors = new Set<string>([primary.selector, ...(headingSelector ? [headingSelector] : [])]);
    const headingSelectorCandidates = heading ? buildSelectorCandidates(heading) : [];
    const steps: Step[] = [
      buildStep(
        'Decouvrir la page',
        `Commencez ici pour comprendre la page ${document.title || 'courante'}.`,
        heading,
        'BOTTOM',
        'NEXT',
        {
          intent: 'discovery',
          stepIndex: 0,
          totalSteps: maxSteps,
        },
        {
          targetSelector: headingSelector || undefined,
          selectorCandidates: headingSelectorCandidates,
          stabilityScore: headingSelector ? selectorStabilityScore(headingSelector) : undefined,
        },
      ),
      buildStep(
        'Action principale',
        `Cette action semble etre la plus importante: ${primary.label}.`,
        primary.element,
        'BOTTOM',
        'CLICK',
        {
          intent: primary.intent,
          stepIndex: 1,
          totalSteps: maxSteps,
        },
        {
          isPrimary: true,
          targetSelector: primary.selector,
          selectorCandidates: primary.selectorCandidates,
          stabilityScore: primary.selectorStabilityScore,
        },
      ),
    ];

    const nextCandidate = pickBestActionableCandidate(candidates, Array.from(usedSelectors)) || pickAnyCandidate(candidates, Array.from(usedSelectors));
    if (nextCandidate && steps.length < maxSteps) {
      usedSelectors.add(nextCandidate.selector);
      const secondaryCopy = buildSecondaryStepCopy(nextCandidate, 'discovery');
      steps.push(
        buildStep(
          secondaryCopy.title,
          secondaryCopy.content,
          nextCandidate.element,
          'BOTTOM',
          'CLICK',
          {
            intent: nextCandidate.intent,
            stepIndex: steps.length,
            totalSteps: maxSteps,
          },
          {
            targetSelector: nextCandidate.selector,
            selectorCandidates: nextCandidate.selectorCandidates,
            stabilityScore: nextCandidate.selectorStabilityScore,
          },
        ),
      );
    }

    const draft = createDraft(
      `Parcours de decouverte - ${document.title || 'page courante'}`,
      'Parcours automatiquement propose a partir du contexte visible de la page.',
      'discovery',
      steps.slice(0, maxSteps),
      [primary, ...(nextCandidate ? [nextCandidate] : [])],
      ['page heading detected', ...primary.reasons],
      targetUrl,
      options,
    );
    applySemanticFusionToDraft(draft, semanticContext, options);

    if (steps.length >= 2 && draft.score >= minScore) drafts.push(draft);
  }

  if (!resolvedOptions?.singlePageTour && primary) {
    const scopedAnalysis = hasScopedAnalysis(resolvedOptions);
    const sequenceCompanionDraft = scopedAnalysis && resolvedOptions?.enableSequenceDetection !== false;
    const excludedAfterPrimary = [primary.selector];
    const secondary = sequenceCompanionDraft
      ? null
      : pickBestActionableCandidate(
          candidates.filter((candidate) => candidate.intent === 'primary-action' || candidate.intent === 'form-flow'),
          excludedAfterPrimary,
        ) ||
        pickBestCandidate(candidates, 'form-flow', excludedAfterPrimary) ||
        pickBestActionableCandidate(candidates, excludedAfterPrimary) ||
        pickAnyCandidate(candidates, excludedAfterPrimary);
    const steps: Step[] = [
      buildStep(
        'Action principale',
        `Le SDK a detecte cette action importante: ${primary.label}.`,
        primary.element,
        'BOTTOM',
        'CLICK',
        {
          intent: primary.intent,
          stepIndex: 0,
          totalSteps: maxSteps,
        },
        {
          isPrimary: true,
          targetSelector: primary.selector,
          selectorCandidates: primary.selectorCandidates,
          stabilityScore: primary.selectorStabilityScore,
        },
      ),
    ];

    if (secondary && steps.length < maxSteps) {
      const secondaryCopy = buildSecondaryStepCopy(secondary, 'primary-action');
      steps.push(
        buildStep(
          secondaryCopy.title,
          secondaryCopy.content,
          secondary.element,
          'BOTTOM',
          'CLICK',
          {
            intent: secondary.intent,
            stepIndex: steps.length,
            totalSteps: maxSteps,
          },
        ),
      );
    }

    if (
      form &&
      !sequenceCompanionDraft &&
      !steps.some((step) => step.targetSelector === form.selector) &&
      steps.length < maxSteps
    ) {
      const formCopy = buildSecondaryStepCopy(form, 'form-flow');
      steps.push(
        buildStep(
          formCopy.title,
          formCopy.content,
          form.element,
          'BOTTOM',
          'CLICK',
          {
            intent: form.intent,
            stepIndex: steps.length,
            totalSteps: maxSteps,
          },
        ),
      );
    }

    const draft = createDraft(
      `Parcours d'action principale - ${primary.label}`,
      "Parcours centre sur la premiere action cle detectee dans l'application cliente.",
      'primary-action',
      steps.slice(0, maxSteps),
      [primary, ...(secondary ? [secondary] : []), ...(form ? [form] : [])],
      [...primary.reasons],
      targetUrl,
      options,
    );
    applySemanticFusionToDraft(draft, semanticContext, options);

    if (draft.score >= minScore) drafts.push(draft);
  }

  if (generationProfile.includeSupportDraft && support) {
    const supportCopy = buildSecondaryStepCopy(support, 'support-navigation');
    const steps: Step[] = [
      buildStep(
        supportCopy.title,
        supportCopy.content,
        support.element,
        'BOTTOM_RIGHT',
        'CLICK',
        {
          intent: support.intent,
          stepIndex: 0,
          totalSteps: maxSteps,
        },
      ),
    ];

    if (navigation && steps.length < maxSteps) {
      const navigationCopy = buildSecondaryStepCopy(navigation, 'support-navigation');
      steps.push(
        buildStep(
          navigationCopy.title,
          navigationCopy.content,
          navigation.element,
          'RIGHT',
          'CLICK',
          {
            intent: navigation.intent,
            stepIndex: steps.length,
            totalSteps: maxSteps,
          },
        ),
      );
    }

    const draft = createDraft(
      `Parcours support et navigation - ${document.title || 'page courante'}`,
      'Parcours automatiquement propose autour des elements de support et de navigation.',
      'support-navigation',
      steps.slice(0, maxSteps),
      [support, ...(navigation ? [navigation] : [])],
      [...support.reasons],
      targetUrl,
      options,
    );
    applySemanticFusionToDraft(draft, semanticContext, options);

    if (draft.score >= minScore) drafts.push(draft);
  }

  if (generationProfile.includeFormDraft && form) {
    const steps: Step[] = [
      buildStep(
        'Zone de saisie',
        `Le SDK a repere une zone de formulaire importante: ${form.label}.`,
        form.element,
        'BOTTOM',
        'CLICK',
        {
          intent: form.intent,
          stepIndex: 0,
          totalSteps: maxSteps,
        },
      ),
    ];

    const draft = createDraft(
      `Parcours formulaire - ${form.label}`,
      'Parcours propose pour guider un flux de saisie ou de validation.',
      'form-flow',
      steps.slice(0, maxSteps),
      [form],
      [...form.reasons],
      targetUrl,
      options,
    );
    applySemanticFusionToDraft(draft, semanticContext, options);

    if (draft.score >= minScore) drafts.push(draft);
  }

  if (resolvedOptions?.enableSequenceDetection !== false) {
    const sequenceDraft = buildSequenceDraft(
      candidates,
      heading,
      primary,
      resolvedOptions?.singlePageTour ? null : support,
      resolvedOptions?.singlePageTour ? null : form,
      targetUrl,
      resolvedOptions,
    );
    if (sequenceDraft) {
      applySemanticFusionToDraft(sequenceDraft, semanticContext, resolvedOptions);
      if (sequenceDraft.score >= minScore && sequenceDraft.confidence >= sequenceMinConfidence) {
        drafts.push(sequenceDraft);
      }
    }
  }

  // ============================================================================
  // Journey blueprints (P1 + P2 + P3): produce business-meaningful, possibly
  // multi-page drafts from declarative templates. Blueprint-based drafts are
  // emitted BEFORE diversify/conflict-resolution so they participate in the
  // same dedupe pipeline as heuristic drafts; they carry `origin.kind =
  // 'blueprint'` so the quality filter and debug panel can distinguish them.
  // ============================================================================
  const activeBlueprints = resolvedOptions?.singlePageTour
    ? []
    : selectActiveBlueprints(resolvedOptions?.journeyVerticals, resolvedOptions?.journeyBlueprints);
  const blueprintOutcome = generationModePlan.prefetchedBlueprintOutcome;
  // Tag heuristic drafts with `origin.kind = 'heuristic'` so downstream
  // filters/UIs can branch on origin reliably.
  for (const draft of drafts) {
    if (!draft.origin) draft.origin = { kind: 'heuristic' };
  }
  // Blueprint drafts are produced by the resolver in `journey-resolver.ts`,
  // which is intentionally decoupled from the flow-versioning subsystem.
  // We hydrate `flowVersioning` here so blueprint drafts share the exact same
  // publish payload contract as heuristic drafts (`toPublishDraft` drops any
  // draft missing `flowVersion`/`flowSignature`). Without this, blueprints
  // would resolve and even appear in the debug panel but silently fail the
  // publish path with "flowVersioning is missing".
  // Phase 4: also apply a feedback-driven score boost per blueprintId so the
  // ranking between competing blueprint drafts reflects historical user
  // performance. Boost is bounded ([-10, +10]) and applied AFTER the
  // deterministic `computeBlueprintScore` so it never demotes a draft below
  // `minScore` (which would re-introduce the stability bug Phase 2 fixed).
  const feedbackForBoost = currentFeedbackSnapshot ?? getFeedbackStore();
  for (const blueprintDraft of blueprintOutcome.drafts) {
    if (!blueprintDraft.flowVersioning) {
      blueprintDraft.flowVersioning = buildFlowVersioningMetadata(blueprintDraft, options);
    }
    applyProjectScopedBlueprintRankingBoost(blueprintDraft, options);
    if (
      options?.feedbackEnabled === true &&
      blueprintDraft.origin?.kind === 'blueprint'
    ) {
      const boost = blueprintFeedbackBoost(blueprintDraft.origin.blueprintId, feedbackForBoost);
      if (boost !== 0) {
        blueprintDraft.score = Math.max(0, Math.min(100, blueprintDraft.score + boost));
      }
    }
  }
  const blueprintDraftsForPipeline = selectBlueprintDraftsForAutoHybrid(
    blueprintOutcome.drafts,
    resolvedOptions,
  );
  // Blueprint drafts are appended last so they don't get pre-empted by
  // legacy `drafts.push` ordering, but they sort to the top later via score.
  drafts.push(...blueprintDraftsForPipeline);

  // `blueprintsExclusive`: when at least one blueprint produced a draft and
  // the host opted in, drop the heuristic drafts entirely.
  let filteredByExclusive = drafts;
  if (options?.blueprintsExclusive === true && blueprintDraftsForPipeline.length > 0) {
    filteredByExclusive = drafts.filter((d) => d.origin?.kind === 'blueprint');
  }

  // P3 quality filter — only applies to heuristic drafts; blueprint drafts
  // are intrinsically business-meaningful so they bypass this filter.
  const qualityRejected: Array<{ reason: string }> = [];
  const qualityFiltered: SuggestedTourDraft[] = [];
  for (const draft of filteredByExclusive) {
    if (draft.origin?.kind === 'blueprint') {
      qualityFiltered.push(draft);
      continue;
    }
    const rejection = classifyTrivialHeuristicDraft(draft);
    if (rejection) {
      qualityRejected.push({ reason: rejection });
      continue;
    }
    qualityFiltered.push(draft);
  }

  const qualityFilterCounts = aggregateRejectionReasons(qualityRejected);

  const draftsBeforeConflict = diversifyDrafts(qualityFiltered);
  const confidenceFiltered = draftsBeforeConflict.filter((draft) => draft.confidence >= minConfidence);
  const coverageFallbackEnabled = (options?.maxDrafts ?? maxDrafts) > 1 && options?.blueprintsExclusive !== true;
  let confidenceReady = confidenceFiltered.slice();
  if (coverageFallbackEnabled && confidenceReady.length < 2 && draftsBeforeConflict.length > confidenceReady.length) {
    const fallbackMinConfidence = Math.max(30, minConfidence - 15);
    const selectedNames = new Set(confidenceReady.map((draft) => draft.name));
    const rescueCandidates = draftsBeforeConflict
      .filter((draft) => !selectedNames.has(draft.name))
      .filter((draft) => draft.confidence >= fallbackMinConfidence)
      .map((draft) => {
        const stableSteps = draft.steps.filter((step) => {
          if (isStableSelectorForPublish(step.targetSelector)) return true;
          if ((step.selectorAlternatives || []).some((selector) => isStableSelectorForPublish(selector))) return true;
          if (typeof step.stabilityScore === 'number' && step.stabilityScore >= 58) return true;
          return Boolean(step.targetFingerprint?.ariaLabel || step.targetFingerprint?.role || step.targetFingerprint?.textSample);
        }).length;
        return { draft, stableSteps };
      })
      .sort((a, b) => {
        if (b.stableSteps !== a.stableSteps) return b.stableSteps - a.stableSteps;
        if (b.draft.confidence !== a.draft.confidence) return b.draft.confidence - a.draft.confidence;
        return b.draft.score - a.draft.score;
      });
    for (const candidate of rescueCandidates) {
      if (confidenceReady.length >= 2) break;
      confidenceReady.push({
        ...candidate.draft,
        reasons: [...candidate.draft.reasons, 'confidence coverage fallback'],
      });
    }
  }
  const resolvedConflicts = resolveDraftConflicts(confidenceReady, options);
  // Blueprint drafts get priority in the final cap.
  const blueprintFirst = [...resolvedConflicts.drafts].sort((a, b) => {
    const aIsBlueprint = a.origin?.kind === 'blueprint' ? 1 : 0;
    const bIsBlueprint = b.origin?.kind === 'blueprint' ? 1 : 0;
    if (aIsBlueprint !== bIsBlueprint) return bIsBlueprint - aIsBlueprint;

    const aProject = isActiveProjectScopedBlueprintDraft(a, options) ? 1 : 0;
    const bProject = isActiveProjectScopedBlueprintDraft(b, options) ? 1 : 0;
    if (bProject !== aProject) return bProject - aProject;

    return b.score - a.score;
  });
  const limited = blueprintFirst.slice(0, maxDrafts);

  // NOTE: 'shown' is intentionally NOT auto-recorded here. Generation != display.
  // Inflating 'shown' on every refresh broke the feedback signal (millions of
  // shown events while clicks remained in single digits, diluting click-rate
  // to ~0 in feedbackWeight()). 'shown' is now recorded by the tour runtime
  // (TourViewer) when a step is actually displayed to the user.

  lastGenerationDebugReport = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    optionsSnapshot: {
      minScore,
      minConfidence,
      mode: options?.mode ?? resolveEffectiveContextualMode(options),
      generationPath: resolveGenerationPathFromPlan(generationModePlan, options),
      conflictResolutionEnabled: options?.conflictResolutionEnabled !== false,
      conflictResolutionStrategy: resolveConflictStrategy(options),
      blueprintStepReservation: shouldReserveBlueprintTargets(confidenceReady, options),
      explainabilityEnabled: explainabilityEnabled(options),
      sessionContextEnabled: Boolean(options?.sessionContext),
      flowVersioningEnabled: options?.flowVersioningEnabled !== false,
      flowVersion: options?.flowVersion || 'v1',
    },
    candidateMetrics: activeDiagnostics || createDiagnostics(),
    scoringAdjustments: {
      selectorStabilityBonus: (activeDiagnostics || createDiagnostics()).selectorStabilityBonus,
      selectorFragilityPenalty: (activeDiagnostics || createDiagnostics()).selectorFragilityPenalty,
      actionabilityPenalty: (activeDiagnostics || createDiagnostics()).actionabilityPenalty,
    },
    draftMetrics: {
      beforeConflict: draftsBeforeConflict.length,
      afterConflict: resolvedConflicts.drafts.length,
      afterConfidenceFilter: confidenceReady.length,
      afterMaxDrafts: limited.length,
    },
    conflicts: resolvedConflicts.conflicts,
    stability: {
      viewportWeightMode: 'document-relative',
      feedbackUsed: options?.feedbackEnabled === true,
      remoteFeedbackReady: remoteFeedbackBootstrapped,
      feedbackAppliedTo: 'ranking-only',
    },
    journeyBlueprints: activeBlueprints.length === 0 ? undefined : {
      activeVerticals: options?.journeyVerticals ?? [],
      totalBlueprintsConsidered: activeBlueprints.length,
      blueprintsProducingDrafts: blueprintOutcome.reports.filter((r) => r.produced).length,
      blueprintResults: blueprintOutcome.reports.map(toBlueprintReportEntry),
    },
    qualityFilter: {
      rejectedAsTrivial: qualityRejected.length,
      rejectedReasons: qualityFilterCounts,
    },
    ...(generationModePlan.autoDecision
      ? { autoDecision: generationModePlan.autoDecision }
      : {}),
    candidateRankings,
    singlePageChainSlots:
      lastSinglePageChainSlotDecisions.length > 0
        ? lastSinglePageChainSlotDecisions.map((row) => ({
            slot: row.slot,
            slotId: row.slotId,
            status: row.status,
            line: row.line,
          }))
        : undefined,
    semanticEnhancement: semanticContext
      ? {
          enabled: semanticContext.enabled,
          engineMode: semanticContext.engineMode,
          backendUsed: semanticContext.backendStatus === 'ok',
          backendStatus: semanticContext.backendStatus,
          minRoleConfidence: MIN_SEMANTIC_ROLE_CONFIDENCE,
          validationPhase: deriveValidationPhase(semanticContext),
          backendImplementation: deriveBackendImplementationReport(semanticContext),
          domStability: {
            stable: semanticContext.domStability.stable,
            domAgeMs:
              semanticContext.domStability.domAgeMs === Number.POSITIVE_INFINITY
                ? -1
                : Math.round(semanticContext.domStability.domAgeMs),
            requiredAgeMs: semanticContext.domStability.requiredAgeMs,
            observerInstalled: semanticContext.domStability.observerInstalled,
            ...(semanticContext.domStability.bypassReason
              ? { bypassReason: semanticContext.domStability.bypassReason }
              : {}),
          },
          calibrationNote: LOCAL_ENGINE_CALIBRATION_NOTE,
          pageSummary: {
            hasForm: semanticContext.snapshot.hasForm,
            hasNavigation: semanticContext.snapshot.hasNavigation,
            formFieldCount: semanticContext.snapshot.formFieldCount,
            navigationLinkCount: semanticContext.snapshot.navigationLinkCount,
            ctaCount: semanticContext.snapshot.ctaCount,
          },
          drafts: semanticContext.draftReports,
        }
      : undefined,
  };

  activeDiagnostics = null;
  currentFeedbackSnapshot = null;
  releaseCandidateMutationObserver();
  if (options?.flowVersioningEnabled !== false) {
    persistFlowVersioningMetadata(limited);
  }
  return limited.map(ensureContextualHighlightOnDraft);
}

/**
 * Test-only helper: applies semantic preferred order then the same
 * post-processing used by runtime (title dedupe + orderIndex sync).
 */
export function __applyPreferredSemanticOrderForTests(
  steps: Step[],
  preferredOrder: string[] | null,
): Step[] {
  const reordered = applyPreferredSemanticOrder(steps, preferredOrder).steps;
  return dedupeDraftStepTitles(recomputeStepOrderIndex(reordered));
}

/** Test-only: exposes draft conflict resolution (blueprint target reservation). */
export function __resolveDraftConflictsForTests(
  drafts: SuggestedTourDraft[],
  options?: TourDraftGenerationOptions,
): { drafts: SuggestedTourDraft[]; conflicts: ConflictEvent[] } {
  return resolveDraftConflicts(drafts, options);
}
