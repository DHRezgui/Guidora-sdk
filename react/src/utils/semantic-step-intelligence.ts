/**
 * Hybrid semantic enhancement layer (local engine).
 *
 * This module sits on top of the heuristic tour-suggestion generator. It
 * inspects the DOM candidates already detected by the heuristic stage and
 * produces three artefacts that are then fused with the heuristic output:
 *
 *  1. A page-level semantic snapshot (`SemanticPageSnapshot`) describing
 *     the overall structure of the analysed surface (presence of a form,
 *     a navigation menu, CTA count, etc.).
 *  2. A per-candidate role classification (`SemanticCandidateRole`)
 *     with a confidence score and rationale tags.
 *  3. An ordering proposal (`semantic-step-order`) for the sequential
 *     parcours when the candidates contain both navigation and a form.
 *
 * The engine is deterministic and side-effect free so the rest of the
 * generator can stay stable across sessions:
 *  - It MUST NOT mutate the DOM.
 *  - It MUST NOT call out to the network. Network-backed enrichment is
 *    handled by a separate module (`semantic-backend-client.ts`).
 *  - Its decisions are intentionally bounded so they can only re-rank or
 *    re-classify within safe margins. The publish quality filters in the
 *    backend remain authoritative.
 */

import type {
  TourDraftGenerationOptions,
  TourDraftIntent,
} from '../types';

export type SemanticRole =
  | 'entry'
  | 'navigation'
  | 'cta-primary'
  | 'form-field'
  | 'form-submit'
  | 'utility'
  | 'secondary'
  | 'result'
  | 'generic-click';

export interface SemanticCandidateInput {
  element: HTMLElement;
  selector: string;
  label: string;
  intent: TourDraftIntent;
  /** Zone reported by the heuristic stage (`header`, `navigation`, etc.). */
  zone: string;
  /** Heuristic actionability flag (button/link/contenteditable/...). */
  isActionable: boolean;
  /** Heuristic form-control flag (input/select/textarea). */
  isFormControl: boolean;
  /** Pre-computed bounding box top (used for ordering). */
  documentTop?: number;
}

export interface SemanticCandidateRole {
  selector: string;
  role: SemanticRole;
  /** 0..1 confidence in the inferred role. */
  confidence: number;
  /** Short human-readable rationale tags (debug only). */
  rationale: string[];
}

export interface SemanticPageSnapshot {
  hasForm: boolean;
  hasNavigation: boolean;
  formFieldCount: number;
  navigationLinkCount: number;
  ctaCount: number;
  pageTitle: string;
  pageHeading: string;
  /** Tokens extracted from titles / headings, useful to compare with labels. */
  contextTokens: string[];
}

export interface SemanticInferenceResult {
  snapshot: SemanticPageSnapshot;
  roles: SemanticCandidateRole[];
  /**
   * Optional preferred ordering for the sequential draft chain. Each entry
   * is the selector of a candidate. When `null`, the heuristic ordering is
   * preserved as-is.
   */
  preferredOrder: string[] | null;
}

// ---------------------------------------------------------------------------
// Lexical signals — kept generic on purpose (works on any product page).
// ---------------------------------------------------------------------------

const UTILITY_PATTERN =
  /réglages|settings|reglages|preferences|préférences|options|configuration|configurer|paramètres|parametres/i;
const SECONDARY_PATTERN =
  /guide|learn|découvrir|decouvrir|discover|aide|help|documentation|doc\b|en savoir|tutoriel|tutorial/i;
const SUBMIT_PATTERN =
  /confirm|validate|submit|valider|confirmer|soumettre|enregistrer|publier|sauvegarder|save|prévisualiser|preview|appliquer|apply/i;
const RESULT_PATTERN = /result|status|done|complete|success|résultat|terminé|termine|fini/i;
const ENTRY_PATTERN = /bienvenue|welcome|aperçu|apercu|overview|introduction|commencez|get started|prise en main/i;
const PLACE_ORDER_CTA_PATTERN = /place\s*order|confirm\s*order|commander/i;
const PAYMENT_METHOD_PATTERN =
  /\b(cash|credit\s*\/?\s*debit|debit\s*card|credit\s*card|qr\s*code|carte|encaisser|encaissement|checkout|paiement|payment)\b/i;
const SEARCH_PATTERN = /recherche|search|filtre|filter|sort|trier|chercher/i;
const ORDER_SUMMARY_PATTERN = /panier|cart|ticket|subtotal|total|commande|table \d+/i;

type SparseEmbedding = Map<string, number>;

const ROLE_EMBEDDING_PROTOTYPES: Record<Exclude<SemanticRole, 'generic-click'>, string[]> = {
  entry: [
    'bienvenue introduction overview start here',
    'point entree commencer prise en main',
    'home dashboard main context',
  ],
  navigation: [
    'menu navigation section side link',
    'aller vers section parcourir categories',
    'sidebar nav linker page',
  ],
  'cta-primary': [
    'action principale lancer demarrer creer',
    'start create generate activate primary call to action',
    'nouveau ajouter commander reserver',
  ],
  'form-field': [
    'champ formulaire saisie input recherche filtre',
    'form field typing entry edit information',
    'search query find filter input',
  ],
  'form-submit': [
    'valider enregistrer confirmer publier appliquer',
    'submit save confirm continue checkout',
    'terminer finaliser envoyer',
  ],
  utility: [
    'reglages options preferences configuration',
    'settings options preference controls',
    'paiement encaissement payment cash credit debit',
  ],
  secondary: [
    'aide guide tutoriel documentation learn help',
    'support onboarding assistance',
    'decouverte conseils infos',
  ],
  result: [
    'resultat statut termine succes complete',
    'summary recap state done',
    'total amount order status',
  ],
};
// Primary-action verbs that signal a top-level CTA distinct from a form
// submit. Tuned for French + English UI copy. Intentionally narrow: we
// only want strong verbs, not generic words like "Voir" or "Ouvrir".
const CTA_PRIMARY_PATTERN =
  /\b(créer|creer|create|démarrer|demarrer|start|lancer|launch|ajouter|add|nouveau|nouvelle|new|get started|try|essayer|commencer|configurer|générer|generer|generate|inviter|invite|importer|import|exporter|export|connecter|connect|reserver|réserver|book|acheter|buy|s'?inscrire|signup|sign up|register|déposer|deposer|upload|construire|build|publier un|publish a|relancer|recharger|rafraîchir|rafraichir|actualiser|refresh|reload|retry|réessayer|reessayer)\b/i;

function normalize(value: string | null | undefined): string {
  return (value || '').toString().trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function buildCharTrigrams(value: string): string[] {
  const compact = normalize(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length < 3) return compact ? [compact] : [];
  const out: string[] = [];
  for (let i = 0; i <= compact.length - 3; i += 1) {
    out.push(compact.slice(i, i + 3));
  }
  return out;
}

function buildEmbedding(text: string): SparseEmbedding {
  const vector: SparseEmbedding = new Map();
  for (const token of tokenize(text)) {
    vector.set(`tok:${token}`, (vector.get(`tok:${token}`) || 0) + 1.2);
  }
  for (const trigram of buildCharTrigrams(text)) {
    vector.set(`tri:${trigram}`, (vector.get(`tri:${trigram}`) || 0) + 0.35);
  }
  return vector;
}

function cosineSimilarity(a: SparseEmbedding, b: SparseEmbedding): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [key, value] of small.entries()) {
    const other = large.get(key);
    if (typeof other === 'number') dot += value * other;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

let rolePrototypeVectorsCache: Map<Exclude<SemanticRole, 'generic-click'>, SparseEmbedding[]> | null = null;

function getRolePrototypeVectors(): Map<Exclude<SemanticRole, 'generic-click'>, SparseEmbedding[]> {
  if (rolePrototypeVectorsCache) return rolePrototypeVectorsCache;
  const cache = new Map<Exclude<SemanticRole, 'generic-click'>, SparseEmbedding[]>();
  for (const [role, phrases] of Object.entries(ROLE_EMBEDDING_PROTOTYPES) as Array<
    [Exclude<SemanticRole, 'generic-click'>, string[]]
  >) {
    cache.set(role, phrases.map((phrase) => buildEmbedding(phrase)));
  }
  rolePrototypeVectorsCache = cache;
  return cache;
}

const SEMANTIC_ROLE_CACHE_MAX = 512;
const semanticRoleCache = new Map<string, SemanticCandidateRole>();
const semanticEmbeddingSignalCache = new Map<
  string,
  { role: SemanticRole; score: number; margin: number }
>();

function buildCandidateFingerprintKey(candidate: SemanticCandidateInput): string {
  const el = candidate.element;
  const tag = el.tagName.toLowerCase();
  const role = normalize(el.getAttribute('role')).toLowerCase();
  const aria = normalize(el.getAttribute('aria-label')).slice(0, 48);
  const placeholder = normalize(el.getAttribute('placeholder')).slice(0, 48);
  const name = normalize(el.getAttribute('name')).slice(0, 32);
  const typeAttr = normalize(el.getAttribute('type')).toLowerCase();
  const label = normalize(candidate.label).slice(0, 64);
  const zone = normalize(candidate.zone);
  return `${tag}|${role}|${aria}|${placeholder}|${name}|${typeAttr}|${label}|${zone}|${candidate.intent}`;
}

function rememberSemanticRoleCache(key: string, value: SemanticCandidateRole): SemanticCandidateRole {
  if (semanticRoleCache.size >= SEMANTIC_ROLE_CACHE_MAX) {
    const oldest = semanticRoleCache.keys().next().value;
    if (oldest) semanticRoleCache.delete(oldest);
  }
  semanticRoleCache.set(key, value);
  return value;
}

/** Test helper: clears in-memory semantic caches between runs. */
export function __resetSemanticRoleCachesForTests(): void {
  semanticRoleCache.clear();
  semanticEmbeddingSignalCache.clear();
}

function computeEmbeddingRoleSignal(
  candidate: SemanticCandidateInput,
  snapshot: SemanticPageSnapshot,
): { role: SemanticRole; score: number; margin: number } {
  const fingerprintKey = buildCandidateFingerprintKey(candidate);
  const cachedSignal = semanticEmbeddingSignalCache.get(fingerprintKey);
  if (cachedSignal) return cachedSignal;

  const aria = normalize(candidate.element.getAttribute('aria-label'));
  const placeholder = normalize(candidate.element.getAttribute('placeholder'));
  const name = normalize(candidate.element.getAttribute('name'));
  const value = normalize(candidate.element.getAttribute('value'));
  const roleAttr = normalize(candidate.element.getAttribute('role'));
  const typeAttr = normalize(candidate.element.getAttribute('type'));
  const titleAttr = normalize(candidate.element.getAttribute('title'));
  const classAttr = normalize(candidate.element.className || '');
  const zone = normalize(candidate.zone);
  const text = [
    candidate.label,
    aria,
    placeholder,
    name,
    value,
    titleAttr,
    classAttr,
    roleAttr,
    typeAttr,
    zone,
    snapshot.pageTitle,
    snapshot.pageHeading,
    snapshot.contextTokens.slice(0, 12).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  const candidateVector = buildEmbedding(text);
  const prototypes = getRolePrototypeVectors();
  const scored: Array<{ role: Exclude<SemanticRole, 'generic-click'>; score: number }> = [];
  for (const [role, vectors] of prototypes.entries()) {
    const maxScore = vectors.reduce((best, vector) => Math.max(best, cosineSimilarity(candidateVector, vector)), 0);
    scored.push({ role, score: Number(maxScore.toFixed(4)) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  if (!top) {
    const empty = { role: 'generic-click' as const, score: 0, margin: 0 };
    semanticEmbeddingSignalCache.set(fingerprintKey, empty);
    return empty;
  }
  const result = {
    role: top.role,
    score: top.score,
    margin: Math.max(0, top.score - (second?.score || 0)),
  };
  if (semanticEmbeddingSignalCache.size >= SEMANTIC_ROLE_CACHE_MAX) {
    const oldest = semanticEmbeddingSignalCache.keys().next().value;
    if (oldest) semanticEmbeddingSignalCache.delete(oldest);
  }
  semanticEmbeddingSignalCache.set(fingerprintKey, result);
  return result;
}

function isSubmitLike(element: HTMLElement, label: string): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'button') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'submit' || type === '' || type === 'button') {
      return SUBMIT_PATTERN.test(label);
    }
  }
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return type === 'submit' || type === 'button';
  }
  if (tag === 'a' && SUBMIT_PATTERN.test(label)) return true;
  return false;
}

function isFormFieldLike(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    return type !== 'submit' && type !== 'button' && type !== 'hidden';
  }
  return tag === 'textarea' || tag === 'select' || element.getAttribute('contenteditable') === 'true';
}

function isInNavigation(element: HTMLElement, zone: string): boolean {
  if (zone === 'navigation' || zone === 'sidebar') return true;
  return Boolean(element.closest('nav, aside, [role="navigation"]'));
}

function isHeadingLike(element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') return true;
  const role = (element.getAttribute('role') || '').toLowerCase();
  return role === 'heading';
}

// ---------------------------------------------------------------------------
// Page-level snapshot
// ---------------------------------------------------------------------------

export function buildSemanticPageSnapshot(
  candidates: SemanticCandidateInput[],
  options?: TourDraftGenerationOptions,
): SemanticPageSnapshot {
  let formFieldCount = 0;
  let navigationLinkCount = 0;
  let ctaCount = 0;

  for (const candidate of candidates) {
    if (candidate.isFormControl && !isSubmitLike(candidate.element, candidate.label)) {
      formFieldCount += 1;
    }
    if (isInNavigation(candidate.element, candidate.zone) && candidate.element.tagName.toLowerCase() === 'a') {
      navigationLinkCount += 1;
    }
    if (
      candidate.isActionable &&
      (candidate.intent === 'primary-action' || isSubmitLike(candidate.element, candidate.label))
    ) {
      ctaCount += 1;
    }
  }

  const pageTitle = typeof document !== 'undefined' ? normalize(document.title) : '';
  let pageHeading = '';
  if (typeof document !== 'undefined') {
    const headingEl = document.querySelector('main h1, h1, main h2, h2, [role="heading"]');
    if (headingEl) pageHeading = normalize(headingEl.textContent);
  }

  const tokens = [
    ...tokenize(pageTitle),
    ...tokenize(pageHeading),
    ...(options?.semanticHints || []).flatMap((hint) => tokenize(hint)),
    ...(options?.businessObjectives || []).flatMap((objective) => tokenize(objective)),
  ];

  return {
    hasForm: formFieldCount > 0,
    hasNavigation: navigationLinkCount > 0,
    formFieldCount,
    navigationLinkCount,
    ctaCount,
    pageTitle,
    pageHeading,
    contextTokens: Array.from(new Set(tokens)),
  };
}

// ---------------------------------------------------------------------------
// Role inference
// ---------------------------------------------------------------------------

interface RoleVote {
  role: SemanticRole;
  weight: number;
  rationale: string;
}

function voteRoles(candidate: SemanticCandidateInput, snapshot: SemanticPageSnapshot): RoleVote[] {
  const label = normalize(candidate.label);
  const tag = candidate.element.tagName.toLowerCase();
  const votes: RoleVote[] = [];

  // ----- Entry -----
  if (isHeadingLike(candidate.element)) {
    votes.push({ role: 'entry', weight: 0.85, rationale: 'heading element detected' });
  } else if (ENTRY_PATTERN.test(label)) {
    votes.push({ role: 'entry', weight: 0.55, rationale: `entry vocabulary "${label}"` });
  }

  // ----- Form field (input/textarea/select) -----
  if (isFormFieldLike(candidate.element)) {
    votes.push({ role: 'form-field', weight: 0.95, rationale: `form control <${tag}>` });
  } else if (candidate.intent === 'form-flow' && !isSubmitLike(candidate.element, label)) {
    votes.push({ role: 'form-field', weight: 0.5, rationale: 'intent=form-flow without submit signal' });
  }

  // ----- Submit / CTA validation -----
  if (isSubmitLike(candidate.element, label)) {
    votes.push({ role: 'form-submit', weight: 0.9, rationale: `submit signal "${label}"` });
  } else if (SUBMIT_PATTERN.test(label) && candidate.isActionable) {
    votes.push({ role: 'form-submit', weight: 0.55, rationale: `submit vocabulary "${label}"` });
  }

  // ----- Place order / checkout CTA -----
  if (
    candidate.isActionable &&
    tag === 'button' &&
    PLACE_ORDER_CTA_PATTERN.test(label) &&
    !isFormFieldLike(candidate.element)
  ) {
    votes.push({
      role: 'cta-primary',
      weight: 0.94,
      rationale: `place order CTA "${label}"`,
    });
  }

  // ----- Payment method tiles (utility, not primary CTA) -----
  if (PAYMENT_METHOD_PATTERN.test(label) && !PLACE_ORDER_CTA_PATTERN.test(label)) {
    votes.push({
      role: 'utility',
      weight: 0.88,
      rationale: `payment method "${label}"`,
    });
  }

  // ----- Primary CTA (creation / activation verbs) -----
  // A primary CTA is an actionable element with a strong action verb that
  // is NOT a submit and NOT a form field. Confidence is intentionally
  // high so the fusion stage can lift this above the suppression floor.
  if (
    candidate.isActionable &&
    !isFormFieldLike(candidate.element) &&
    !isSubmitLike(candidate.element, label) &&
    !PAYMENT_METHOD_PATTERN.test(label) &&
    CTA_PRIMARY_PATTERN.test(label)
  ) {
    const inNav = isInNavigation(candidate.element, candidate.zone);
    const baseWeight = inNav ? 0.68 : 0.82;
    votes.push({
      role: 'cta-primary',
      weight: baseWeight,
      rationale: `primary CTA verb "${label}"`,
    });
  }

  // ----- Utility (settings/options) -----
  if (UTILITY_PATTERN.test(label)) {
    votes.push({ role: 'utility', weight: 0.7, rationale: `utility vocabulary "${label}"` });
  }

  // ----- Navigation (in-app links) -----
  if (isInNavigation(candidate.element, candidate.zone) && tag === 'a') {
    votes.push({ role: 'navigation', weight: 0.75, rationale: 'link inside nav/aside' });
  }

  // ----- Secondary (help/guide) -----
  if (SECONDARY_PATTERN.test(label)) {
    votes.push({ role: 'secondary', weight: 0.6, rationale: `secondary vocabulary "${label}"` });
  } else if (candidate.intent === 'support-navigation') {
    votes.push({ role: 'secondary', weight: 0.45, rationale: 'intent=support-navigation' });
  }

  // ----- Result / status -----
  if (RESULT_PATTERN.test(label)) {
    votes.push({ role: 'result', weight: 0.55, rationale: `result vocabulary "${label}"` });
  }

  // ----- Generic actionable fallback -----
  if (candidate.isActionable && votes.length === 0) {
    votes.push({ role: 'generic-click', weight: 0.3, rationale: 'actionable element, no specific signal' });
  }

  // Small contextual boost: a form-field candidate becomes more likely when
  // the page snapshot already confirms a form is present.
  if (snapshot.hasForm) {
    for (const vote of votes) {
      if (vote.role === 'form-field') vote.weight = Math.min(1, vote.weight + 0.05);
      if (vote.role === 'form-submit') vote.weight = Math.min(1, vote.weight + 0.05);
    }
  }
  if (snapshot.hasNavigation) {
    for (const vote of votes) {
      if (vote.role === 'navigation') vote.weight = Math.min(1, vote.weight + 0.05);
    }
  }

  const embedding = computeEmbeddingRoleSignal(candidate, snapshot);
  if (embedding.role !== 'generic-click' && embedding.score >= 0.16) {
    const embeddingWeight = Math.max(
      0.32,
      Math.min(0.9, embedding.score * 1.25 + Math.min(0.2, embedding.margin * 0.8)),
    );
    votes.push({
      role: embedding.role,
      weight: Number(embeddingWeight.toFixed(3)),
      rationale: `semantic embedding role=${embedding.role} sim=${embedding.score.toFixed(2)} margin=${embedding.margin.toFixed(2)}`,
    });
  }

  return votes;
}

export function classifyCandidate(
  candidate: SemanticCandidateInput,
  snapshot: SemanticPageSnapshot,
): SemanticCandidateRole {
  const cacheKey = `${buildCandidateFingerprintKey(candidate)}|f:${snapshot.hasForm ? 1 : 0}|n:${snapshot.hasNavigation ? 1 : 0}`;
  const cachedRole = semanticRoleCache.get(cacheKey);
  if (cachedRole) return cachedRole;

  const votes = voteRoles(candidate, snapshot);

  if (votes.length === 0) {
    return rememberSemanticRoleCache(cacheKey, {
      selector: candidate.selector,
      role: 'generic-click',
      confidence: 0.2,
      rationale: ['no semantic signal'],
    });
  }

  // Aggregate votes per role and pick the strongest.
  const aggregated = new Map<SemanticRole, { total: number; rationales: string[]; max: number }>();
  for (const vote of votes) {
    const entry = aggregated.get(vote.role) || { total: 0, rationales: [], max: 0 };
    entry.total += vote.weight;
    entry.max = Math.max(entry.max, vote.weight);
    entry.rationales.push(vote.rationale);
    aggregated.set(vote.role, entry);
  }

  let bestRole: SemanticRole = 'generic-click';
  let bestEntry = { total: -Infinity, rationales: [] as string[], max: 0 };
  let secondTotal = -Infinity;
  for (const [role, entry] of aggregated.entries()) {
    if (entry.total > bestEntry.total) {
      secondTotal = bestEntry.total;
      bestRole = role;
      bestEntry = entry;
    } else if (entry.total > secondTotal) {
      secondTotal = entry.total;
    }
  }
  const margin = Math.max(0, bestEntry.total - Math.max(0, secondTotal));
  const normalizedMargin = bestEntry.total > 0 ? Math.min(1, margin / bestEntry.total) : 0;
  const confidence = Math.max(0.2, Math.min(1, bestEntry.max * 0.65 + normalizedMargin * 0.35));

  return rememberSemanticRoleCache(cacheKey, {
    selector: candidate.selector,
    role: bestRole,
    confidence,
    rationale: bestEntry.rationales.slice(0, 3),
  });
}

// ---------------------------------------------------------------------------
// Sequence ordering
// ---------------------------------------------------------------------------

const ROLE_ORDER: SemanticRole[] = [
  'entry',
  'navigation',
  'cta-primary',
  'form-field',
  'form-submit',
  'utility',
  'secondary',
  'generic-click',
  'result',
];

export function proposeSequenceOrder(
  candidates: SemanticCandidateInput[],
  roles: SemanticCandidateRole[],
): string[] | null {
  if (candidates.length <= 1) return null;

  const roleBySelector = new Map<string, SemanticRole>();
  const confidenceBySelector = new Map<string, number>();
  for (const role of roles) {
    roleBySelector.set(role.selector, role.role);
    confidenceBySelector.set(role.selector, role.confidence);
  }

  const roleIndex = new Map<SemanticRole, number>();
  ROLE_ORDER.forEach((role, index) => roleIndex.set(role, index));

  const roleTransitionPreference = (fromRole: SemanticRole, toRole: SemanticRole): number => {
    const direct: Record<string, number> = {
      'entry->navigation': 0.98,
      'entry->cta-primary': 0.92,
      'navigation->cta-primary': 0.95,
      'cta-primary->form-field': 0.97,
      'form-field->form-field': 0.9,
      'form-field->form-submit': 0.99,
      'form-submit->utility': 0.86,
      'form-submit->result': 0.98,
      'utility->result': 0.9,
      'secondary->result': 0.8,
      'generic-click->result': 0.72,
    };
    const key = `${fromRole}->${toRole}`;
    if (typeof direct[key] === 'number') return direct[key];
    const from = roleIndex.get(fromRole) ?? ROLE_ORDER.length;
    const to = roleIndex.get(toRole) ?? ROLE_ORDER.length;
    const diff = to - from;
    if (diff === 0) return 0.68;
    if (diff > 0) return Math.max(0.25, 0.72 - diff * 0.09);
    return Math.max(0.05, 0.22 - Math.abs(diff) * 0.05);
  };

  const topOf = (candidate: SemanticCandidateInput): number => candidate.documentTop ?? Number.POSITIVE_INFINITY;
  const leftOf = (candidate: SemanticCandidateInput): number => {
    try {
      return candidate.element.getBoundingClientRect().left;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const spatialContinuity = (from: SemanticCandidateInput, to: SemanticCandidateInput): number => {
    const vertical = topOf(to) - topOf(from);
    const leftDiff = Math.abs(leftOf(to) - leftOf(from));
    const verticalScore = vertical >= -24 ? 1 / (1 + Math.abs(vertical) / 520) : 0.15;
    const lateralScore = 1 / (1 + leftDiff / 700);
    return verticalScore * 0.7 + lateralScore * 0.3;
  };
  const startPriority = (candidate: SemanticCandidateInput): number => {
    const role = roleBySelector.get(candidate.selector) || 'generic-click';
    const confidence = confidenceBySelector.get(candidate.selector) || 0;
    const roleBias: Record<SemanticRole, number> = {
      entry: 1,
      navigation: 0.92,
      'cta-primary': 0.84,
      'form-field': 0.7,
      'form-submit': 0.62,
      utility: 0.58,
      secondary: 0.52,
      'generic-click': 0.42,
      result: 0.38,
    };
    const top = topOf(candidate);
    const topBias = Number.isFinite(top) ? Math.max(0, 1 - Math.min(1, top / 1800)) : 0;
    return roleBias[role] * 0.65 + confidence * 0.25 + topBias * 0.1;
  };

  const remaining = candidates.slice();
  let first: SemanticCandidateInput | undefined;
  const entryCandidates = remaining
    .filter((candidate) => (roleBySelector.get(candidate.selector) || 'generic-click') === 'entry')
    .sort((a, b) => (confidenceBySelector.get(b.selector) || 0) - (confidenceBySelector.get(a.selector) || 0));
  if (entryCandidates.length > 0) {
    first = entryCandidates[0];
    const idx = remaining.findIndex((candidate) => candidate.selector === first?.selector);
    if (idx >= 0) remaining.splice(idx, 1);
  } else {
    remaining.sort((a, b) => startPriority(b) - startPriority(a));
    first = remaining.shift();
  }
  if (!first) return null;

  const ordered: SemanticCandidateInput[] = [first];
  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    const prevRole = roleBySelector.get(previous.selector) || 'generic-click';
    if (prevRole === 'entry') {
      const navigationIndex = remaining.findIndex(
        (candidate) => (roleBySelector.get(candidate.selector) || 'generic-click') === 'navigation',
      );
      if (navigationIndex >= 0) {
        ordered.push(remaining.splice(navigationIndex, 1)[0]);
        continue;
      }
    }
    const hasFormField = remaining.some(
      (candidate) => (roleBySelector.get(candidate.selector) || 'generic-click') === 'form-field',
    );
    const hasFormSubmit = remaining.some(
      (candidate) => (roleBySelector.get(candidate.selector) || 'generic-click') === 'form-submit',
    );
    if (hasFormField && hasFormSubmit && prevRole !== 'form-field') {
      const formFieldIndex = remaining.findIndex(
        (candidate) => (roleBySelector.get(candidate.selector) || 'generic-click') === 'form-field',
      );
      if (formFieldIndex >= 0) {
        ordered.push(remaining.splice(formFieldIndex, 1)[0]);
        continue;
      }
    }
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const role = roleBySelector.get(candidate.selector) || 'generic-click';
      const confidence = confidenceBySelector.get(candidate.selector) || 0;
      const transition = roleTransitionPreference(prevRole, role);
      const continuity = spatialContinuity(previous, candidate);
      const score = transition * 0.7 + continuity * 0.2 + confidence * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  const proposedOrder = ordered.map((candidate) => candidate.selector);
  const heuristicOrder = candidates.map((candidate) => candidate.selector);

  // Only emit a preferred order when it actually differs from the heuristic
  // ordering. This keeps the debug report meaningful and avoids no-op
  // mutations downstream.
  const sameOrder = proposedOrder.every((selector, index) => selector === heuristicOrder[index]);
  return sameOrder ? null : proposedOrder;
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

export interface LocalSemanticInferenceInput {
  candidates: SemanticCandidateInput[];
  options?: TourDraftGenerationOptions;
}

export function runLocalSemanticInference(
  input: LocalSemanticInferenceInput,
): SemanticInferenceResult {
  const snapshot = buildSemanticPageSnapshot(input.candidates, input.options);
  const roles = input.candidates.map((candidate) => classifyCandidate(candidate, snapshot));
  const preferredOrder = proposeSequenceOrder(input.candidates, roles);

  return { snapshot, roles, preferredOrder };
}

// ---------------------------------------------------------------------------
// Step copy aligned with semantic role
// ---------------------------------------------------------------------------

export interface SemanticStepCopy {
  title: string;
  content: string;
}

export function buildSemanticStepCopy(role: SemanticRole, label: string): SemanticStepCopy {
  const safeLabel = label || 'cet élément';
  const normalizedLabel = normalize(label).toLowerCase();
  switch (role) {
    case 'entry':
      return {
        title: "Point d'entrée",
        content: `Le parcours démarre ici, avec le contexte visible: ${safeLabel}.`,
      };
    case 'navigation':
      return {
        title: 'Navigation métier',
        content: `Ce lien de navigation mène à la section utile du parcours: ${safeLabel}.`,
      };
    case 'cta-primary':
      return {
        title: 'Action principale',
        content: `Lancez l'action clé du parcours en activant: ${safeLabel}.`,
      };
    case 'form-field':
      if (SEARCH_PATTERN.test(normalizedLabel)) {
        return {
          title: 'Recherche et filtrage',
          content: `Utilisez ce champ pour rechercher ou filtrer rapidement: ${safeLabel}.`,
        };
      }
      return {
        title: 'Renseigner le formulaire',
        content: `Saisissez ou vérifiez les informations attendues dans ce champ: ${safeLabel}.`,
      };
    case 'form-submit':
      return {
        title: 'Valider et enregistrer',
        content: `Une fois les champs complétés, confirmez l'étape avec: ${safeLabel}.`,
      };
    case 'utility':
      if (PAYMENT_METHOD_PATTERN.test(normalizedLabel)) {
        return {
          title: 'Paiement et encaissement',
          content: `Ce contrôle concerne la finalisation de commande ou le moyen de paiement: ${safeLabel}.`,
        };
      }
      if (SEARCH_PATTERN.test(normalizedLabel)) {
        return {
          title: 'Recherche et filtrage',
          content: `Utilisez ce contrôle pour retrouver rapidement les éléments pertinents: ${safeLabel}.`,
        };
      }
      if (ORDER_SUMMARY_PATTERN.test(normalizedLabel)) {
        return {
          title: 'Suivi de la commande',
          content: `Cette zone synthétise l'état de la commande en cours: ${safeLabel}.`,
        };
      }
      return {
        title: 'Réglages et options',
        content: `Ce contrôle ouvre les préférences ou réglages associés au parcours: ${safeLabel}.`,
      };
    case 'secondary':
      return {
        title: 'Découverte et aide',
        content: `Consultez les ressources d'aide ou de découverte liées à: ${safeLabel}.`,
      };
    case 'result':
      return {
        title: 'Résultat',
        content: `Le résultat ou l'état final attendu se trouve ici: ${safeLabel}.`,
      };
    default:
      return {
        title: 'Étape suivante',
        content: `Poursuivez le parcours avec: ${safeLabel}.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Fusion helpers — bounded score deltas used by the heuristic generator.
// ---------------------------------------------------------------------------

export interface SemanticFusionWeights {
  role: number;
  order: number;
  copy: number;
}

const DEFAULT_FUSION_WEIGHTS: SemanticFusionWeights = {
  role: 0.6,
  order: 0.4,
  copy: 0.4,
};

const MAX_SEMANTIC_DELTA = 8;

export function resolveSemanticWeights(
  options?: TourDraftGenerationOptions,
): SemanticFusionWeights {
  const raw = options?.semanticRoleWeights;
  if (!raw) return DEFAULT_FUSION_WEIGHTS;
  const clamp = (value: number | undefined, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  return {
    role: clamp(raw.role, DEFAULT_FUSION_WEIGHTS.role),
    order: clamp(raw.order, DEFAULT_FUSION_WEIGHTS.order),
    copy: clamp(raw.copy, DEFAULT_FUSION_WEIGHTS.copy),
  };
}

/**
 * Compute a bounded score delta for a single candidate given the
 * heuristic intent and the semantic role/confidence.
 *
 * The delta is intentionally capped at +/- `MAX_SEMANTIC_DELTA` so the
 * semantic stage cannot, on its own, push a draft past the publish
 * thresholds. It only nudges the relative ranking.
 */
export function computeSemanticScoreDelta(params: {
  heuristicIntent: TourDraftIntent;
  semanticRole: SemanticRole;
  confidence: number;
  weights?: SemanticFusionWeights;
}): { delta: number; agreement: 'agree' | 'neutral' | 'conflict' } {
  const { heuristicIntent, semanticRole, confidence } = params;
  const weights = params.weights || DEFAULT_FUSION_WEIGHTS;

  const agreementMap: Record<TourDraftIntent, SemanticRole[]> = {
    'primary-action': ['cta-primary', 'form-submit', 'generic-click'],
    'form-flow': ['form-field', 'form-submit'],
    'support-navigation': ['secondary', 'navigation', 'utility'],
    'discovery': ['entry', 'navigation', 'result', 'secondary'],
  };

  const conflictMap: Record<TourDraftIntent, SemanticRole[]> = {
    'primary-action': ['form-field', 'entry', 'secondary', 'utility'],
    'form-flow': ['navigation', 'utility', 'secondary'],
    'support-navigation': ['form-field', 'form-submit'],
    'discovery': ['form-submit', 'form-field', 'utility'],
  };

  const agree = agreementMap[heuristicIntent]?.includes(semanticRole);
  const conflict = conflictMap[heuristicIntent]?.includes(semanticRole);

  if (agree) {
    const delta = Math.min(MAX_SEMANTIC_DELTA, MAX_SEMANTIC_DELTA * weights.role * confidence);
    return { delta, agreement: 'agree' };
  }
  if (conflict) {
    const delta = -Math.min(MAX_SEMANTIC_DELTA, MAX_SEMANTIC_DELTA * weights.role * confidence * 0.5);
    return { delta, agreement: 'conflict' };
  }
  return { delta: 0, agreement: 'neutral' };
}
