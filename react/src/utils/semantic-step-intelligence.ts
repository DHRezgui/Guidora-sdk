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
// Primary-action verbs that signal a top-level CTA distinct from a form
// submit. Tuned for French + English UI copy. Intentionally narrow: we
// only want strong verbs, not generic words like "Voir" or "Ouvrir".
const CTA_PRIMARY_PATTERN =
  /\b(créer|creer|create|démarrer|demarrer|start|lancer|launch|ajouter|add|nouveau|nouvelle|new|get started|try|essayer|commencer|configurer|générer|generer|generate|inviter|invite|importer|import|exporter|export|connecter|connect|reserver|réserver|book|order|commander|acheter|buy|s'?inscrire|signup|sign up|register|déposer|deposer|upload|construire|build|publier un|publish a|relancer|recharger|rafraîchir|rafraichir|actualiser|refresh|reload|retry|réessayer|reessayer)\b/i;

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

  // ----- Primary CTA (creation / activation verbs) -----
  // A primary CTA is an actionable element with a strong action verb that
  // is NOT a submit and NOT a form field. Confidence is intentionally
  // high so the fusion stage can lift this above the suppression floor.
  if (
    candidate.isActionable &&
    !isFormFieldLike(candidate.element) &&
    !isSubmitLike(candidate.element, label) &&
    CTA_PRIMARY_PATTERN.test(label)
  ) {
    const inNav = isInNavigation(candidate.element, candidate.zone);
    const baseWeight = inNav ? 0.6 : 0.75;
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

  return votes;
}

export function classifyCandidate(
  candidate: SemanticCandidateInput,
  snapshot: SemanticPageSnapshot,
): SemanticCandidateRole {
  const votes = voteRoles(candidate, snapshot);

  if (votes.length === 0) {
    return {
      selector: candidate.selector,
      role: 'generic-click',
      confidence: 0.2,
      rationale: ['no semantic signal'],
    };
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
  for (const [role, entry] of aggregated.entries()) {
    if (entry.total > bestEntry.total) {
      bestRole = role;
      bestEntry = entry;
    }
  }

  return {
    selector: candidate.selector,
    role: bestRole,
    confidence: Math.min(1, bestEntry.max),
    rationale: bestEntry.rationales.slice(0, 3),
  };
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
  for (const role of roles) roleBySelector.set(role.selector, role.role);

  const ranked = candidates.slice().sort((a, b) => {
    const roleA = roleBySelector.get(a.selector) || 'generic-click';
    const roleB = roleBySelector.get(b.selector) || 'generic-click';
    const ra = ROLE_ORDER.indexOf(roleA);
    const rb = ROLE_ORDER.indexOf(roleB);
    if (ra !== rb) return ra - rb;
    return (a.documentTop ?? 0) - (b.documentTop ?? 0);
  });

  const proposedOrder = ranked.map((candidate) => candidate.selector);
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
