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

interface DetectedElement {
  element: HTMLElement;
  selector: string;
  label: string;
  score: number;
  confidence: number;
  intent: TourDraftIntent;
  reasons: string[];
  tokenHits: number;
  zone: CandidateZone;
  semanticScore: number;
  personaScore: number;
  sequenceScore: number;
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
const FLOW_VERSION_REGISTRY_STORAGE_KEY = '__trustdev_contextual_flow_registry_v1';
const MAX_TRACKED_ELEMENTS = 1200;
const DEFAULT_MUTATION_BATCH_WINDOW_MS = 120;
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
];
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
};

let activeDiagnostics: GenerationDiagnostics | null = null;
let lastGenerationDebugReport: ContextualGenerationDebugReport | null = null;

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
  const next = [...entries];

  for (const draft of drafts) {
    if (!draft.flowVersioning) continue;
    next.push({
      version: draft.flowVersioning.flowVersion,
      signature: draft.flowVersioning.flowSignature,
      generatedAt: draft.generatedAt,
      targetUrl: draft.targetUrl,
    });
  }

  saveFlowRegistry(next);
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

function resolveDraftConflicts(
  drafts: SuggestedTourDraft[],
  options?: TourDraftGenerationOptions,
): { drafts: SuggestedTourDraft[]; conflicts: ConflictEvent[] } {
  if (options?.conflictResolutionEnabled === false) {
    return { drafts, conflicts: [] };
  }

  const strategy = resolveConflictStrategy(options);
  const conflicts: ConflictEvent[] = [];
  const ownership = new Map<string, { draftName: string; priority: number }>();

  const ranked = drafts
    .map((draft, index) => ({ draft, index, priority: draftPriorityScore(draft, strategy) }))
    .sort((a, b) => b.priority - a.priority);

  const processed = ranked.map((entry) => {
    const filteredSteps: Step[] = [];
    const localSeen = new Set<string>();
    const dedupedSteps = dedupeStepsBySelector(entry.draft.steps);
    for (const [stepIndex, step] of dedupedSteps.entries()) {
      const selector = step.targetSelector || '';
      if (!selector || localSeen.has(selector)) continue;

      localSeen.add(selector);
      const existingOwner = ownership.get(selector);
      const protectPrimaryAnchor = entry.draft.intent === 'primary-action' && stepIndex === 0;

      if (protectPrimaryAnchor) {
        // Keep the first step of a primary-action draft as an anchor even if another draft references the same selector.
        ownership.set(selector, { draftName: entry.draft.name, priority: entry.priority });
        filteredSteps.push(step);
        continue;
      }

      if (!existingOwner) {
        ownership.set(selector, { draftName: entry.draft.name, priority: entry.priority });
        filteredSteps.push(step);
        continue;
      }

      conflicts.push({
        selector,
        winnerDraft: existingOwner.draftName,
        loserDraft: entry.draft.name,
        reason: `selector conflict resolved by ${strategy}`,
      });
    }

    const draftExplainability = entry.draft.explainability
      ? {
          ...entry.draft.explainability,
          conflictNotes: [
            ...entry.draft.explainability.conflictNotes,
            ...conflicts
              .filter((conflict) => conflict.loserDraft === entry.draft.name || conflict.winnerDraft === entry.draft.name)
              .map((conflict) => `${conflict.selector}: ${conflict.reason}`),
          ],
        }
      : undefined;

    return {
      ...entry,
      draft: {
        ...entry.draft,
        steps: filteredSteps,
        detectedSelectors: filteredSteps.map((step) => step.targetSelector).filter(Boolean) as string[],
        explainability: draftExplainability,
      },
    };
  });

  const filtered = processed
    .filter((entry) => entry.draft.steps.length > 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.draft);

  return { drafts: filtered, conflicts };
}

export function getLastContextualGenerationDebugReport(): ContextualGenerationDebugReport | null {
  return lastGenerationDebugReport;
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
  stats[event] = (stats[event] || 0) + 1;
}

export function recordTourSuggestionFeedback(input: {
  selector?: string;
  intent: TourDraftIntent;
  event: 'shown' | 'clicked' | 'completed' | 'skipped';
}): void {
  const store = getFeedbackStore();

  incrementFeedbackStats(store.intents[input.intent], input.event);

  if (input.selector) {
    const existing = store.selectors[input.selector] || getDefaultFeedbackStats();
    incrementFeedbackStats(existing, input.event);
    store.selectors[input.selector] = existing;
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

function feedbackWeight(stats?: FeedbackStats): number {
  if (!stats) return 0;
  const shown = Math.max(1, stats.shown);
  const clickRate = stats.clicked / shown;
  const completionRate = stats.completed / shown;
  const skipRate = stats.skipped / shown;
  return completionRate * 24 + clickRate * 10 - skipRate * 18;
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
  const selectors = getNoiseSelectors(options);
  const noiseMatch = selectors.some((selector) => {
    try {
      return element.matches(selector) || Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });

  if (noiseMatch) return true;

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
  const candidates = [
    element.getAttribute('data-tour-label'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
    element.textContent,
    element.getAttribute('data-testid'),
    element.getAttribute('name'),
  ];

  return normalizeText(candidates.find((value) => normalizeText(value).length > 0) || '');
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
  const viewportHeight = Math.max(1, window.innerHeight || 1);
  const centerY = rect.top + rect.height / 2;
  const viewportWeight = Math.max(0, 12 - Math.abs(centerY - viewportHeight / 2) / (viewportHeight / 2) * 8);
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

function buildUniqueSelector(element: HTMLElement): string {
  const cached = runtime.selectorCache.get(element);
  if (cached && tryUniqueSelector(cached)) return cached;

  const tagName = element.tagName.toLowerCase();

  for (const attributeName of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(attributeName);
    if (!value) continue;

    const selector = buildStableAttributeSelector(tagName, attributeName, value);
    if (tryUniqueSelector(selector)) {
      runtime.selectorCache.set(element, selector);
      return selector;
    }
  }

  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (tryUniqueSelector(selector)) {
      runtime.selectorCache.set(element, selector);
      return selector;
    }
  }

  const path: string[] = [];
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && current !== document.body && depth < 7) {
    path.unshift(buildSelectorPart(current));
    const selector = path.join(' > ');
    if (tryUniqueSelector(selector)) {
      runtime.selectorCache.set(element, selector);
      return selector;
    }

    if (STABLE_ATTRIBUTES.some((attributeName) => current?.hasAttribute(attributeName))) {
      break;
    }

    current = current.parentElement;
    depth += 1;
  }

  const fallback = path.join(' > ') || tagName;
  runtime.selectorCache.set(element, fallback);
  return fallback;
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

      if (tokenSet.has(normalizedTerm) || Array.from(tokenSet).some((token) => token.includes(normalizedTerm))) {
        tokenHits[intent] += 1;
      }
    }
  }

  const totalHits = tokenHits.discovery + tokenHits['primary-action'] + tokenHits['support-navigation'] + tokenHits['form-flow'];
  return { tokenHits, totalHits };
}

function getIntentFromSemanticHits(result: SemanticMatchResult, zone: CandidateZone): TourDraftIntent {
  let bestIntent: TourDraftIntent = 'discovery';
  let bestScore = result.tokenHits.discovery;

  for (const intent of ['primary-action', 'support-navigation', 'form-flow'] as TourDraftIntent[]) {
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

  const label = getLabel(element);
  if (!label) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoLabel += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const lexicon = getLexicon(options);
  const semantic = computeSemanticMatches(label, lexicon);
  const semanticScore = buildSemanticAffinity(label, options);

  const selector = buildUniqueSelector(element);
  if (!selector) {
    if (activeDiagnostics) activeDiagnostics.rejectedNoSelector += 1;
    runtime.scoreCache.set(element, { domVersion: runtime.domVersion, detected: null });
    return null;
  }

  const zone = detectZone(element);
  const features = getScoreFeatures(element);
  const tagName = element.tagName.toLowerCase();
  let intent = getIntentFromSemanticHits(semantic, zone);
  const sessionContext = getSessionContext(options);
  const isActionable = isActionableElement(element);
  const isFormControl = isFormControlElement(element);

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
  const feedbackStore = getFeedbackStore();
  const selectorFeedback = feedbackStore.selectors[selector];
  const intentFeedback = feedbackStore.intents[intent];
  const feedbackBonus = feedbackWeight(selectorFeedback) + feedbackWeight(intentFeedback) * 0.6;

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
    const normalizedLabel = normalizeText(label);
    if (zone === 'form' || zone === 'main') {
      score += 14;
      reasons.push('primary-action boost: form/main zone');
    }

    const inputType = (element.getAttribute('type') || '').toLowerCase();
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

  score += feedbackBonus;

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
  const confidence = confidenceFromSignals(normalizedScore, semanticScore, personaScore, sequenceScore, feedbackBonus);
  const detected: DetectedElement = {
    element,
    selector,
    label,
    score: normalizedScore,
    confidence,
    intent,
    reasons,
    tokenHits: semantic.totalHits,
    zone,
    semanticScore,
    personaScore,
    sequenceScore,
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

  runtime.mutationBatchWindowMs = Math.max(20, Math.min(1500, requestedWindow));
  runtime.maxDirtyNodesPerBatch = Math.max(50, Math.min(5000, requestedLimit));
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

function ensureMutationObserver(options?: TourDraftGenerationOptions): void {
  if (typeof document === 'undefined') return;
  configureBatching(options);
  if (runtime.observer) return;

  runtime.observer = new MutationObserver((mutations) => {
    if (mutations.length > runtime.maxDirtyNodesPerBatch * 2) {
      flushBatchedMutations(true);
      return;
    }

    for (const mutation of mutations) {
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

    scheduleMutationFlush();
  });

  runtime.observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-label', 'title', 'placeholder', 'disabled', 'aria-disabled'],
  });
}

function harvestInteractiveNodesFromRoot(root: ParentNode): HTMLElement[] {
  if (!(root instanceof Element) && !(root instanceof Document)) return [];
  return Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR)) as HTMLElement[];
}

function collectCandidates(options?: TourDraftGenerationOptions): DetectedElement[] {
  ensureMutationObserver(options);
  flushBatchedMutations();

  const maxCandidates = options?.maxCandidates ?? 300;
  const useIncremental = options?.enableIncremental !== false;
  const nodesToEvaluate: Set<HTMLElement> = new Set<HTMLElement>();

  if (!useIncremental || runtime.fullRescanNeeded || runtime.trackedElements.size === 0) {
    runtime.fullRescanNeeded = false;
    runtime.batchedDirtyNodes.clear();
    runtime.dirtyNodes.clear();
    runtime.domVersion += 1;

    const all = harvestInteractiveNodesFromRoot(document).slice(0, MAX_TRACKED_ELEMENTS);
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
  return deduped
    .sort((a, b) => b.score - a.score)
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
      : (candidate.zone === 'navigation' || candidate.zone === 'sidebar' || candidate.zone === 'header')
        ? 0
        : 1;

  return controlRank * 10 + zoneRank;
}

function pickBestCandidate(candidates: DetectedElement[], intent: TourDraftIntent, excludedSelectors: string[] = []): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  return (
    candidates
      .filter((candidate) => candidate.intent === intent && !blocked.has(candidate.selector))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
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
        if (b.score !== a.score) return b.score - a.score;
        const tie = primaryActionTieBreakerRank(b) - primaryActionTieBreakerRank(a);
        if (tie !== 0) return tie;
        return b.confidence - a.confidence;
      })[0] || null
  );
}

function pickBestPrimaryActionCandidate(candidates: DetectedElement[], excludedSelectors: string[] = []): DetectedElement | null {
  const blocked = new Set(excludedSelectors);
  const actionable = candidates.filter((candidate) => candidate.intent === 'primary-action' && !blocked.has(candidate.selector));
  const controls = actionable.filter((candidate) => {
    const tag = candidate.element.tagName.toLowerCase();
    const inputType = (candidate.element.getAttribute('type') || '').toLowerCase();
    return tag === 'button' || (tag === 'input' && (inputType === 'submit' || inputType === 'button'));
  });

  const pool = controls.length > 0 ? controls : actionable;
  return (
    pool
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
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
        return b.score - a.score;
      })[0] || null
  );
}

function buildSecondaryStepCopy(candidate: DetectedElement, draftIntent: TourDraftIntent): { title: string; content: string } {
  const label = candidate.label || 'element courant';
  const normalizedLabel = normalizeText(label);

  if (candidate.intent === 'form-flow' || /form|champ|saisie|validation|email|company|organisation|organisation|notes/i.test(normalizedLabel)) {
    return {
      title: 'Acceder au formulaire',
      content: `Poursuivez vers la zone de configuration pour renseigner ou verifier les informations metier: ${label}.`,
    };
  }

  if (candidate.intent === 'support-navigation' || candidate.zone === 'navigation' || candidate.zone === 'sidebar') {
    return {
      title: 'Consulter la navigation metier',
      content: `Utilisez cette zone pour rejoindre les sections utiles du parcours: ${label}.`,
    };
  }

  if (draftIntent === 'primary-action') {
    return {
      title: 'Poursuivre le flux metier',
      content: `Cet element complete le parcours principal et permet de continuer le flux: ${label}.`,
    };
  }

  return {
    title: 'Etape suivante',
    content: `Poursuivez avec cet element du contexte: ${label}.`,
  };
}

function getPageHeading(): HTMLElement | null {
  const headingSelectors = ['main h1', 'h1', 'main h2', 'h2', '[role="heading"]'];
  for (const selector of headingSelectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element && isVisible(element)) return element;
  }
  return null;
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

function shouldHighlightElement(stepType: StepType): boolean {
  return stepType === 'highlight' || stepType === 'form';
}

function buildStep(
  title: string,
  content: string,
  element: HTMLElement,
  position?: PositionType,
  action: Step['action'] = 'NEXT',
  context?: StepBuildContext,
): Step {
  const inferredPosition = inferStepPosition(element);
  const resolvedPosition = !position || position === 'BOTTOM' ? inferredPosition : position;
  const stepType = inferStepType(title, content, element, action, context);

  stepCounter += 1;
  return {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${stepCounter}`,
    title,
    content,
    stepType,
    targetSelector: buildUniqueSelector(element),
    position: resolvedPosition,
    action,
    skipAllowed: true,
    highlightElement: shouldHighlightElement(stepType),
  };
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
  let confidence = confidenceFromSignals(score, averageSemanticScore, averagePersonaScore, averageSequenceScore, 0);

  const dynamicContext = options?.noiseFilteringEnabled !== false && options?.ignoreTransientUi !== false;
  const hasStableActionControl = sourceCandidates.some((candidate) => {
    const tagName = candidate.element.tagName.toLowerCase();
    const inputType = (candidate.element.getAttribute('type') || '').toLowerCase();
    const isActionControl = tagName === 'button' || (tagName === 'input' && (inputType === 'submit' || inputType === 'button'));
    const isStableSelector =
      candidate.selector.includes('[data-tour-id=') ||
      candidate.selector.includes('[data-testid=') ||
      candidate.selector.startsWith('#');
    // Dynamic layouts often report zones as 'other'; keep strict actionable/stable checks but relax zone guard.
    return isActionControl && isStableSelector;
  });

  const hasDynamicActionMarker = sourceCandidates.some((candidate) => candidate.selector.includes('tour-dynamic-action-'));

  if (intent === 'primary-action' && dynamicContext && hasStableActionControl) {
    confidence = Math.min(100, confidence + 12);
    reasonsWithAdjustments.push('dynamic-context confidence boost: stable action control');
  }

  if (intent === 'primary-action' && dynamicContext && hasDynamicActionMarker) {
    confidence = Math.min(100, confidence + 6);
    reasonsWithAdjustments.push('dynamic-context confidence boost: explicit dynamic action marker');
  }

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

  const draftBase: SuggestedTourDraft = {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    intent,
    score,
    confidence,
    semanticScore: Math.round(averageSemanticScore * 100),
    sequenceScore: Math.round(averageSequenceScore * 100),
    reasons: reasonsWithAdjustments,
    detectedSelectors: sourceCandidates.map((candidate) => candidate.selector),
    explainability: explainabilityEnabled(options)
      ? {
          generatedFrom: reasonsWithAdjustments.slice(0, 8),
          sourceCandidateCount: sourceCandidates.length,
          signalScores: {
            semantic: Math.round(averageSemanticScore * 100),
            sequence: Math.round(averageSequenceScore * 100),
            confidence,
            selectorStabilityBonus: Math.round(averageSelectorStabilityBonus),
            selectorFragilityPenalty: Math.round(averageSelectorFragilityPenalty),
            actionabilityPenalty: Math.round(averageActionabilityPenalty),
          },
          conflictNotes: [],
        }
      : undefined,
    metadata: previewContext
      ? {
          previewContext,
        }
      : undefined,
    name,
    description,
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

function isSequenceCandidate(candidate: DetectedElement): boolean {
  return candidate.semanticScore > 0.08 || candidate.sequenceScore > 0.08 || candidate.tokenHits > 0;
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

  const entry = heading
    ? { element: heading, selector: buildUniqueSelector(heading), label: normalizeText(heading.textContent), score: 72, confidence: 68, intent: 'discovery' as const, reasons: ['entry heading'], tokenHits: 1, zone: 'main' as CandidateZone, semanticScore: 0.35, personaScore: 0.1, sequenceScore: 0.6, selectorStabilityBonus: 0, selectorFragilityPenalty: 0, actionabilityPenalty: 0 }
    : null;

  const orderedCandidates = candidates
    .filter(isSequenceCandidate)
    .slice()
    .sort((a, b) => {
      const topDiff = a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top;
      if (Math.abs(topDiff) > 8) return topDiff;
      return b.score - a.score;
    });

  const action = primary || orderedCandidates.find((candidate) => candidate.intent === 'primary-action') || orderedCandidates[0] || null;
  const validation = form || orderedCandidates.find((candidate) => candidate.intent === 'form-flow' || /confirm|validate|submit|save|valider|confirmer|soumettre/i.test(candidate.label)) || null;
  const result =
    orderedCandidates.find((candidate) => /result|status|done|complete|success|résultat|terminé/i.test(candidate.label)) ||
    support ||
    orderedCandidates[1] ||
    null;

  const chain = [entry, action, validation, result].filter(Boolean) as Array<DetectedElement | { element: HTMLElement; selector: string; label: string; score: number; confidence: number; intent: TourDraftIntent; reasons: string[]; tokenHits: number; zone: CandidateZone; semanticScore: number; personaScore: number; sequenceScore: number; selectorStabilityBonus: number; selectorFragilityPenalty: number; actionabilityPenalty: number }>;
  const uniqueChain = chain.filter((candidate, index) => chain.findIndex((item) => item.selector === candidate.selector) === index);

  if (uniqueChain.length < 3) return null;

  const hasActionableStep = uniqueChain.some((candidate) => isActionableElement(candidate.element));
  if (!hasActionableStep) return null;

  const steps: Step[] = uniqueChain.slice(0, 4).map((candidate, index) => {
    const titles = ['Point d\'entrée', 'Action clé', 'Validation', 'Résultat'];
    const actions: Step['action'][] = ['NEXT', 'CLICK', 'CLICK', 'NEXT'];
    const positions: PositionType[] = ['BOTTOM', 'BOTTOM', 'RIGHT', 'TOP'];
    return buildStep(
      titles[index] || `Etape ${index + 1}`,
      index === 0
        ? `Le parcours commence ici avec le contexte visible: ${candidate.label}.`
        : index === 1
          ? `L'IA légère classe cette action comme la plus probable pour lancer le flux: ${candidate.label}.`
          : index === 2
            ? `Cette étape correspond à la validation ou à l'envoi du flux: ${candidate.label}.`
            : `Le résultat ou l'état final attendu se trouve ici: ${candidate.label}.`,
      candidate.element,
      positions[index] || 'BOTTOM',
      actions[index] || 'NEXT',
      {
        intent: candidate.intent,
        stepIndex: index,
        totalSteps: Math.min(4, uniqueChain.length),
      },
    );
  });

  const sequenceScore = uniqueChain.reduce((total, candidate) => total + candidate.sequenceScore + candidate.semanticScore, 0) / uniqueChain.length;
  const sequenceSelectorStabilityBonus = uniqueChain.reduce((total, candidate) => total + candidate.selectorStabilityBonus, 0) / uniqueChain.length;
  const sequenceSelectorFragilityPenalty = uniqueChain.reduce((total, candidate) => total + candidate.selectorFragilityPenalty, 0) / uniqueChain.length;
  const sequenceActionabilityPenalty = uniqueChain.reduce((total, candidate) => total + candidate.actionabilityPenalty, 0) / uniqueChain.length;
  const confidence = Math.min(100, Math.round(58 + sequenceScore * 30 + uniqueChain.length * 4));
  if (confidence < 45) return null;
  const previewContext = buildPreviewContextSnapshot(
    uniqueChain.map((candidate) => ({
      element: candidate.element,
      selector: candidate.selector,
      label: candidate.label,
      intent: candidate.intent,
    })),
  );

  const draftBase: SuggestedTourDraft = {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    intent: 'discovery',
    score: Math.min(100, Math.round(sequenceScore * 100)),
    confidence,
    semanticScore: Math.round(sequenceScore * 100),
    sequenceScore: Math.round(sequenceScore * 100),
    reasons: [
      'sequence detection enabled',
      ...(entry ? ['entry detected'] : []),
      ...(action ? action.reasons.slice(0, 2) : []),
      ...(validation ? ['validation detected'] : []),
      ...(result ? ['result detected'] : []),
    ],
    detectedSelectors: uniqueChain.map((candidate) => candidate.selector),
    explainability: explainabilityEnabled(options)
      ? {
          generatedFrom: ['sequence detection enabled', 'ordered candidate chain', 'semantic + sequence scoring'],
          sourceCandidateCount: uniqueChain.length,
          signalScores: {
            semantic: Math.round(sequenceScore * 100),
            sequence: Math.round(sequenceScore * 100),
            confidence,
            selectorStabilityBonus: Math.round(sequenceSelectorStabilityBonus),
            selectorFragilityPenalty: Math.round(sequenceSelectorFragilityPenalty),
            actionabilityPenalty: Math.round(sequenceActionabilityPenalty),
          },
          conflictNotes: [],
        }
      : undefined,
    metadata: previewContext
      ? {
          previewContext,
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

export function generateContextualTourDrafts(options?: TourDraftGenerationOptions): SuggestedTourDraft[] {
  if (typeof document === 'undefined') return [];

  const startedAt = Date.now();
  activeDiagnostics = createDiagnostics();

  const generationProfile = resolveGenerationProfile(options);
  const maxDrafts = generationProfile.maxDrafts;
  const maxSteps = options?.maxSteps ?? 3;
  const minScore = generationProfile.minScore;
  const minConfidence = generationProfile.minConfidence;
  const targetUrl = options?.targetUrl ?? window.location.pathname;

  const candidates = collectCandidates(options);
  if (candidates.length === 0) {
    lastGenerationDebugReport = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      optionsSnapshot: {
        minScore,
        minConfidence,
        conflictResolutionEnabled: options?.conflictResolutionEnabled !== false,
        conflictResolutionStrategy: resolveConflictStrategy(options),
        explainabilityEnabled: explainabilityEnabled(options),
        sessionContextEnabled: Boolean(options?.sessionContext),
        flowVersioningEnabled: options?.flowVersioningEnabled !== false,
        flowVersion: options?.flowVersion || 'v1',
      },
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
    };
    activeDiagnostics = null;
    return [];
  }

  const heading = getPageHeading();
  const headingSelector = heading ? buildUniqueSelector(heading) : '';
  const primary =
    pickBestPrimaryActionCandidate(candidates, headingSelector ? [headingSelector] : []) ||
    pickBestCandidate(candidates, 'primary-action') ||
    pickBestActionableCandidate(candidates, headingSelector ? [headingSelector] : []) ||
    pickAnyCandidate(candidates, headingSelector ? [headingSelector] : []);
  const support = generationProfile.includeSupportDraft ? pickBestCandidate(candidates, 'support-navigation') : null;
  const navigation = generationProfile.includeNavigationDraft ? pickAnyCandidate(candidates, [primary?.selector || ''], ['navigation', 'sidebar', 'main']) : null;
  const form = generationProfile.includeFormDraft ? pickBestCandidate(candidates, 'form-flow') : null;

  const drafts: SuggestedTourDraft[] = [];

  if (heading && primary) {
    const usedSelectors = new Set<string>([primary.selector, ...(headingSelector ? [headingSelector] : [])]);
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

    if (steps.length >= 2 && draft.score >= minScore) drafts.push(draft);
  }

  if (primary) {
    const secondary = pickBestActionableCandidate(candidates, [primary.selector]) || pickAnyCandidate(candidates, [primary.selector]);
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

    if (form && !steps.some((step) => step.targetSelector === form.selector) && steps.length < maxSteps) {
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

    if (draft.score >= minScore) drafts.push(draft);
  }

  if (generationProfile.includeSupportDraft && support) {
    const steps: Step[] = [
      buildStep(
        "Acceder a l'aide",
        `Le SDK a identifie un element d'assistance: ${support.label}.`,
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

    if (draft.score >= minScore) drafts.push(draft);
  }

  if (options?.enableSequenceDetection !== false) {
    const sequenceDraft = buildSequenceDraft(candidates, heading, primary, support, form, targetUrl, options);
    if (sequenceDraft && sequenceDraft.score >= minScore && sequenceDraft.confidence >= minConfidence) {
      drafts.push(sequenceDraft);
    }
  }

  const draftsBeforeConflict = diversifyDrafts(drafts);
  const confidenceFiltered = draftsBeforeConflict.filter((draft) => draft.confidence >= minConfidence);
  const resolvedConflicts = resolveDraftConflicts(confidenceFiltered, options);
  const limited = resolvedConflicts.drafts.slice(0, maxDrafts);

  if (options?.feedbackEnabled !== false) {
    for (const draft of limited) {
      for (const selector of draft.detectedSelectors) {
        recordTourSuggestionFeedback({ selector, intent: draft.intent, event: 'shown' });
      }
    }
  }

  lastGenerationDebugReport = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    optionsSnapshot: {
      minScore,
      minConfidence,
      conflictResolutionEnabled: options?.conflictResolutionEnabled !== false,
      conflictResolutionStrategy: resolveConflictStrategy(options),
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
      afterConfidenceFilter: confidenceFiltered.length,
      afterMaxDrafts: limited.length,
    },
    conflicts: resolvedConflicts.conflicts,
  };

  activeDiagnostics = null;
  if (options?.flowVersioningEnabled !== false) {
    persistFlowVersioningMetadata(limited);
  }
  return limited;
}
