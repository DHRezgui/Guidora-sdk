/**
 * Journey blueprint resolver — maps a `JourneyBlueprint` (declarative
 * description of a business funnel) onto the host application's real DOM.
 *
 * Resolution strategy, in order of priority for each blueprint step:
 *  1. Match against candidates already detected on the current page via
 *     direct selector hints, semantic tokens or action verbs.
 *  2. If the step declares `routePatterns`, look for an internal `<a href>`
 *     whose pathname matches → emit a step with `stepTargetUrl` so the
 *     `TourViewer` runtime will navigate the user to that route during the
 *     tour (true multi-page draft).
 *  3. Otherwise: mark the step unresolved. Required steps trigger rejection
 *     of the whole blueprint; optional steps are silently skipped.
 *
 * Required steps also emit `skipAllowed: false` on the produced tour step so
 * the runtime UI hides the "Passer" action for mandatory funnel steps.
 *
 * Drafts produced here carry `origin = { kind: 'blueprint', ... }` so the
 * debug panel and the publisher can distinguish them from legacy heuristic
 * drafts.
 */

import {
  ActionType,
  JourneyBlueprint,
  JourneyStepBlueprint,
  JourneyVertical,
  PositionType,
  Step,
  SuggestedTourDraft,
  TourDraftGenerationOptions,
  TriggerConditions,
} from '../types';
import { DetectedElement } from './tour-suggestion-generator';

export interface BlueprintResolutionReport {
  blueprintId: string;
  vertical: JourneyVertical;
  declaredSteps: number;
  resolvedOnCurrentPage: number;
  resolvedCrossPage: number;
  /**
   * Steps resolved via deductive inference (no direct match, but a
   * predecessor declared in `inferAfter` was resolved). Surfaced in the
   * debug panel so developers can distinguish deduced steps from real
   * cross-page resolution.
   */
  resolvedDeduced: number;
  unresolvedSteps: number;
  produced: boolean;
  rejectionReason?: string;
}

export interface BlueprintResolutionOutcome {
  drafts: SuggestedTourDraft[];
  reports: BlueprintResolutionReport[];
}

interface ResolvedStepRecord {
  step: JourneyStepBlueprint;
  // 'deduced' = the step couldn't be matched on the current page nor via a
  // direct internal link, but its `inferAfter` predecessor was resolved, so
  // we infer the route. The selector is a best-guess from `selectorHints[0]`
  // and will be resolved dynamically at runtime when the user lands on the
  // inferred route.
  origin: 'current-page' | 'cross-page' | 'deduced' | 'unresolved';
  selector?: string;
  stepTargetUrl?: string;
  resolvedLabel?: string;
  matchReason: string;
}

interface InternalLink {
  href: string;
  pathname: string;
  selector: string;
  label: string;
  element: HTMLAnchorElement;
}

const DEFAULT_MIN_RESOLVED_STEPS = 2;

/** Mandatory blueprint steps must not expose the runtime "Skip" action. */
export function blueprintStepSkipAllowed(step: Pick<JourneyStepBlueprint, 'required'>): boolean {
  return step.required !== true;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolves the given blueprints against the current page DOM + the candidate
 * set already computed by the heuristic generator. Returns produced drafts
 * plus a per-blueprint diagnostic report.
 */
export function resolveBlueprintsToDrafts(
  blueprints: JourneyBlueprint[],
  candidates: DetectedElement[],
  options: TourDraftGenerationOptions | undefined,
): BlueprintResolutionOutcome {
  if (typeof document === 'undefined' || blueprints.length === 0) {
    return { drafts: [], reports: [] };
  }

  const targetUrl = options?.targetUrl ?? window.location.pathname;
  const internalLinks = collectInternalLinks();
  const drafts: SuggestedTourDraft[] = [];
  const reports: BlueprintResolutionReport[] = [];

  for (const blueprint of blueprints) {
    const { draft, report } = resolveBlueprint(blueprint, candidates, internalLinks, targetUrl);
    reports.push(report);
    if (draft) drafts.push(draft);
  }

  return { drafts, reports };
}

// ============================================================================
// Per-blueprint resolution
// ============================================================================

function resolveBlueprint(
  blueprint: JourneyBlueprint,
  candidates: DetectedElement[],
  internalLinks: InternalLink[],
  currentTargetUrl: string,
): { draft: SuggestedTourDraft | null; report: BlueprintResolutionReport } {
  const minResolved = Math.max(2, blueprint.minResolvedSteps ?? DEFAULT_MIN_RESOLVED_STEPS);
  const usedSelectors = new Set<string>();
  const resolved: ResolvedStepRecord[] = [];

  let resolvedOnCurrent = 0;
  let resolvedCrossPage = 0;
  let unresolvedCount = 0;
  let missingRequired = false;

  let resolvedDeduced = 0;

  for (const stepBlueprint of blueprint.steps) {
    const onPage = resolveStepOnCurrentPage(stepBlueprint, candidates, usedSelectors);
    if (onPage) {
      resolved.push(onPage);
      usedSelectors.add(onPage.selector!);
      resolvedOnCurrent += 1;
      continue;
    }

    const crossPage = resolveStepCrossPage(stepBlueprint, internalLinks);
    if (crossPage) {
      resolved.push(crossPage);
      if (crossPage.selector) usedSelectors.add(crossPage.selector);
      resolvedCrossPage += 1;
      continue;
    }

    // Deductive resolution: when `inferAfter` is declared and at least one
    // predecessor has been resolved (in this blueprint, on the current page
    // OR cross-page), we infer the step's route from the actual matching
    // internal link and emit a "deduced" record. The runtime will navigate
    // the user to that route at the relevant tour step and the actual target
    // element will be located dynamically using `selectorHints[0]` once the
    // new DOM is loaded.
    //
    // SAFETY: we now require at least one internal link to match one of the
    // step's route patterns before publishing a deduced record. Without this
    // guard the resolver was fabricating "phantom" steps pointing at routes
    // the host app has never implemented (e.g. emitting a `/profile` step
    // on a marketing landing page that has no profile route → 404 on Next).
    const deduced = resolveStepDeductive(stepBlueprint, resolved, internalLinks);
    if (deduced) {
      resolved.push(deduced);
      if (deduced.selector) usedSelectors.add(deduced.selector);
      resolvedDeduced += 1;
      continue;
    }

    resolved.push({
      step: stepBlueprint,
      origin: 'unresolved',
      matchReason: 'no candidate matched, no internal link, and no predecessor allowed deduction',
    });
    unresolvedCount += 1;
    if (stepBlueprint.required) missingRequired = true;
  }

  const report: BlueprintResolutionReport = {
    blueprintId: blueprint.id,
    vertical: blueprint.vertical,
    declaredSteps: blueprint.steps.length,
    resolvedOnCurrentPage: resolvedOnCurrent,
    resolvedCrossPage: resolvedCrossPage,
    resolvedDeduced: resolvedDeduced,
    unresolvedSteps: unresolvedCount,
    produced: false,
  };

  if (missingRequired) {
    report.rejectionReason = 'at least one required step could not be resolved';
    return { draft: null, report };
  }

  const totalResolved = resolvedOnCurrent + resolvedCrossPage + resolvedDeduced;
  if (totalResolved < minResolved) {
    report.rejectionReason = `resolved ${totalResolved} step(s), below the blueprint minimum of ${minResolved}`;
    return { draft: null, report };
  }

  // Keep only resolved steps in the final draft, preserve the blueprint order.
  const resolvedOnly = resolved.filter((r) => r.origin !== 'unresolved');
  const draft = assembleBlueprintDraft(blueprint, resolvedOnly, currentTargetUrl);
  report.produced = true;
  return { draft, report };
}

// ============================================================================
// Step resolution — current page
// ============================================================================

function resolveStepOnCurrentPage(
  step: JourneyStepBlueprint,
  candidates: DetectedElement[],
  usedSelectors: Set<string>,
): ResolvedStepRecord | null {
  const directSelectorMatch = tryDirectSelector(step, candidates, usedSelectors);
  if (directSelectorMatch) return directSelectorMatch;

  const semanticMatch = trySemanticMatch(step, candidates, usedSelectors);
  if (semanticMatch) return semanticMatch;

  return null;
}

function tryDirectSelector(
  step: JourneyStepBlueprint,
  candidates: DetectedElement[],
  usedSelectors: Set<string>,
): ResolvedStepRecord | null {
  const hints = step.targetHints.selectorHints;
  if (!hints || hints.length === 0) return null;

  for (const hint of hints) {
    // Prefer a candidate whose stored selector matches one of the hints (so
    // we benefit from `score`/`confidence` already computed by the heuristic
    // pipeline) — fall back to a raw `querySelector` otherwise.
    const candidateMatch = candidates.find(
      (c) => !usedSelectors.has(c.selector) && (c.selector === hint || c.selector.includes(hint)),
    );
    if (candidateMatch) {
      return {
        step,
        origin: 'current-page',
        selector: candidateMatch.selector,
        resolvedLabel: candidateMatch.label,
        matchReason: `selector hint matched candidate: ${hint}`,
      };
    }

    try {
      const matches = Array.from(document.querySelectorAll(hint)) as HTMLElement[];
      const el = chooseBestDirectSelectorMatch(step, matches.filter(isUsableElement));
      if (el) {
        // Refine the selector by prefixing the actual tagName when the hint
        // started with a generic attribute selector (e.g. `[data-tour-id*="shop"]`).
        // If the hint is broad and matches several elements (e.g.
        // `button[role="tab"]`), build a more specific selector for the
        // label-matched element so runtime navigation cannot reattach the step
        // to the first duplicate after a page/tab transition.
        const refined = buildRuntimeSelectorForDirectMatch(hint, el);
        if (usedSelectors.has(refined)) continue;
        return {
          step,
          origin: 'current-page',
          selector: refined,
          resolvedLabel: extractElementLabel(el),
          matchReason: `selector hint resolved via DOM query: ${hint}`,
        };
      }
    } catch {
      // Bad selector — silently skip; blueprint authors should fix their hints.
    }
  }

  return null;
}

/**
 * Adds the element's tagName as a selector prefix when the hint starts with a
 * generic attribute selector. Returns the original hint otherwise (e.g. when
 * the hint already mentions a tag like `a[href*="/cart"]`, or when it's a
 * compound selector that doesn't begin with `[`).
 *
 * Examples:
 *  - `[data-tour-id="x"]`  +  <a>     →  `a[data-tour-id="x"]`
 *  - `[data-tour-id*="shop"]`  +  <button>  →  `button[data-tour-id*="shop"]`
 *  - `a[href*="/cart"]`  +  <a>       →  `a[href*="/cart"]`  (unchanged)
 *  - `article[data-product]`  +  <article>  →  `article[data-product]`  (unchanged)
 */
function refineSelectorWithTag(hint: string, el: HTMLElement): string {
  if (!hint.startsWith('[')) return hint;
  const tag = el.tagName.toLowerCase();
  if (!tag) return hint;
  // Defensive: never produce something like `[data-tour-id="x"]\` — only
  // allowed tags we accept for tour targets.
  const allowedTags = new Set(['a', 'button', 'input', 'form', 'select', 'textarea', 'article', 'section']);
  if (!allowedTags.has(tag)) return hint;
  return `${tag}${hint}`;
}

function chooseBestDirectSelectorMatch(
  step: JourneyStepBlueprint,
  elements: HTMLElement[],
): HTMLElement | null {
  if (elements.length === 0) return null;
  if (elements.length === 1) return elements[0];

  const tokens = [
    ...(step.targetHints.actionVerbs ?? []),
    ...(step.targetHints.semanticTokens ?? []),
  ].map(normalize);

  let best: HTMLElement | null = null;
  let bestScore = 0;

  for (const element of elements) {
    const label = normalize(extractElementLabel(element));
    if (!label) continue;

    let score = 0;
    for (const token of tokens) {
      if (!token) continue;
      if (matchesWholeWord(label, token)) {
        score += token.includes(' ') ? 18 : 10;
      }
    }

    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }

  // A broad selector with several matches is unsafe unless the element label
  // confirms this specific step. Let semantic matching try next instead.
  return bestScore > 0 ? best : null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getUniqueSelector(selector: string): string | null {
  try {
    return document.querySelectorAll(selector).length === 1 ? selector : null;
  } catch {
    return null;
  }
}

function getElementIndexSelector(element: HTMLElement, baseSelector: string): string | null {
  const parent = element.parentElement;
  if (!parent) return null;
  const sameTagSiblings = Array.from(parent.children).filter(
    (child) => child.tagName === element.tagName,
  );
  const index = sameTagSiblings.indexOf(element) + 1;
  if (index <= 0) return null;
  return getUniqueSelector(`${baseSelector}:nth-of-type(${index})`);
}

function buildRuntimeSelectorForDirectMatch(hint: string, element: HTMLElement): string {
  const refined = refineSelectorWithTag(hint, element);
  const uniqueRefined = getUniqueSelector(refined);
  if (uniqueRefined) return uniqueRefined;

  const tag = element.tagName.toLowerCase();
  const stableAttributes = ['data-tour-id', 'data-testid', 'data-cy', 'data-qa', 'name', 'aria-label'] as const;
  for (const attribute of stableAttributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const selector = getUniqueSelector(`${tag}[${attribute}="${escapeAttributeValue(value)}"]`);
    if (selector) return selector;
  }

  const role = element.getAttribute('role');
  const labelSlug = normalize(extractElementLabel(element)).replace(/\s+/g, '-');
  if (role && labelSlug) {
    const controlsSelector = getUniqueSelector(
      `${tag}[role="${escapeAttributeValue(role)}"][aria-controls*="${escapeAttributeValue(labelSlug)}"]`,
    );
    if (controlsSelector) return controlsSelector;

    const idContainsSelector = getUniqueSelector(
      `${tag}[role="${escapeAttributeValue(role)}"][id*="${escapeAttributeValue(labelSlug)}"]`,
    );
    if (idContainsSelector) return idContainsSelector;
  }

  if (element.id && typeof CSS !== 'undefined' && CSS.escape) {
    const selector = getUniqueSelector(`#${CSS.escape(element.id)}`);
    if (selector) return selector;
  }

  if (role) {
    const roleBase = `${tag}[role="${escapeAttributeValue(role)}"]`;
    const indexedRole = getElementIndexSelector(element, roleBase);
    if (indexedRole) return indexedRole;
  }

  const indexedTag = getElementIndexSelector(element, tag);
  return indexedTag ?? refined;
}

/**
 * Collects a normalized "search surface" for a DOM element by concatenating:
 *  - its label (text / aria-label / title — already captured in `candidate.label`)
 *  - its own className(s)
 *  - its data-* attribute values
 *  - up to `maxAncestors` ancestor className strings (BEM convention, Tailwind
 *    component classes, etc.)
 *
 * This lets the semantic matcher recognize elements whose visible text contains
 * no business token but whose surrounding markup does — e.g. a product card
 * with class `ProductCard` whose label is just the product name.
 */
function collectSemanticSearchSurface(el: HTMLElement, maxAncestors = 3): string {
  const parts: string[] = [];

  const ownClass = (el.className || '').toString();
  if (ownClass) parts.push(ownClass);

  // data-* attributes often carry semantic intent ("data-product-card", etc.)
  for (let i = 0; i < el.attributes.length; i += 1) {
    const attr = el.attributes[i];
    if (attr.name.startsWith('data-') && attr.value) {
      parts.push(`${attr.name} ${attr.value}`);
    }
  }

  let current: HTMLElement | null = el.parentElement;
  let depth = 0;
  while (current && depth < maxAncestors) {
    const cls = (current.className || '').toString();
    if (cls) parts.push(cls);
    current = current.parentElement;
    depth += 1;
  }

  return normalize(parts.join(' '));
}

/**
 * Whole-word matching for token search in user-visible labels.
 *
 * Using `String.prototype.includes` is too permissive across languages:
 * the Portuguese token `conta` ("account") would falsely match the English
 * label `Contact`, the Italian `accedi` would match `accede` / `accedeo`,
 * etc. Word boundaries (`\b`) tie the match to actual word starts/ends so
 * cross-language false positives cannot leak into the semantic matcher.
 *
 * Multi-word tokens (e.g. `mon compte`, `add to cart`) are still supported:
 * `\b` only delimits the start/end of the entire token, the inner space stays
 * exact.
 */
function matchesWholeWord(text: string, token: string): boolean {
  if (!text || !token) return false;
  // Escape regex metacharacters in the token before composing the pattern.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  return re.test(text);
}

/**
 * Segment-aware route pattern matching.
 *
 * A pattern (e.g. `/conta`) is considered to match a pathname (e.g.
 * `/minha-conta`) only when the pattern ends on a path-segment boundary:
 *  - end of string                  → `/conta` in `/conta`               ✓
 *  - segment separator `/`          → `/profile` in `/profile/edit`       ✓
 *  - query-string `?`               → `/profile` in `/profile?ref=hp`     ✓
 *  - hash `#`                       → `/profile` in `/profile#section-1`  ✓
 *
 * Substring leakage like `/conta` ⊂ `/contact` is rejected because the
 * char following the pattern (`c`) is none of the above.
 *
 * The pattern's leading `/` already protects against in-word matches at the
 * START of the pattern (e.g. `/account` cannot match `myaccount` because the
 * `/` is not in `myaccount`).
 */
function matchesRoutePattern(pathname: string, pattern: string): boolean {
  if (!pathname || !pattern) return false;
  let idx = pathname.indexOf(pattern);
  while (idx !== -1) {
    const after = pathname.charAt(idx + pattern.length);
    if (after === '' || after === '/' || after === '?' || after === '#') {
      return true;
    }
    idx = pathname.indexOf(pattern, idx + 1);
  }
  return false;
}

function trySemanticMatch(
  step: JourneyStepBlueprint,
  candidates: DetectedElement[],
  usedSelectors: Set<string>,
): ResolvedStepRecord | null {
  const tokens = (step.targetHints.semanticTokens ?? []).map(normalize);
  const verbs = (step.targetHints.actionVerbs ?? []).map(normalize);
  const tagFilter = new Set((step.targetHints.elementTags ?? []).map((t) => t.toLowerCase()));

  if (tokens.length === 0 && verbs.length === 0) return null;

  let bestCandidate: DetectedElement | null = null;
  let bestScore = -Infinity;
  let bestReason = '';

  for (const candidate of candidates) {
    if (usedSelectors.has(candidate.selector)) continue;
    if (tagFilter.size > 0) {
      const tag = candidate.element.tagName.toLowerCase();
      if (!tagFilter.has(tag)) continue;
    }

    const label = normalize(candidate.label);
    // Phase 3: secondary search surface — class names + data-* attrs + a few
    // ancestor class strings. Matches here are weighted lower than visible
    // label matches but lower-weight matches still let us recognize semantic
    // intent encoded in CSS conventions (BEM, Tailwind component classes,
    // Material UI / Chakra component naming).
    const classSurface = collectSemanticSearchSurface(candidate.element);

    if (!label && !classSurface) continue;

    let matchScore = 0;
    const matchedTokens: string[] = [];

    for (const verb of verbs) {
      // Visible label match — the strongest signal for an actionable element.
      // Use WORD-BOUNDARY matching so cross-language token substrings don't
      // produce false positives (e.g. PT "conta" matching EN "Contact").
      if (label && matchesWholeWord(label, verb)) {
        matchScore += 30;
        matchedTokens.push(`label:${verb}`);
      } else if (classSurface && matchesWholeWord(classSurface, verb.replace(/\s+/g, '-'))) {
        // BEM / Tailwind / camelCase classes are inherently delimited (dash,
        // underscore, case change). `matchesWholeWord` honors those boundaries
        // because `\b` triggers on the `\w`/`\W` transition, so it correctly
        // matches `btn-add-to-cart` against the token `add-to-cart` but does
        // NOT match `header-nav-contact` against `conta` (cross-language
        // collision prevention).
        matchScore += 8;
        matchedTokens.push(`class:${verb}`);
      }
    }
    for (const token of tokens) {
      if (label && matchesWholeWord(label, token)) {
        matchScore += 10;
        matchedTokens.push(`label:${token}`);
      } else if (classSurface && matchesWholeWord(classSurface, token)) {
        // Token in class / data-* / ancestor class, matched on word
        // boundaries so e.g. PT `conta` cannot match EN `contact`.
        matchScore += 4;
        matchedTokens.push(`class:${token}`);
      }
    }

    if (matchScore <= 0) continue;

    // Tie-break with the candidate's heuristic score so we promote already
    // strongly-detected candidates over weaker ones with the same token hits.
    const combined = matchScore + Math.min(20, candidate.score / 5);

    if (combined > bestScore) {
      bestScore = combined;
      bestCandidate = candidate;
      bestReason = `semantic match on [${matchedTokens.slice(0, 3).join(', ')}]`;
    }
  }

  if (!bestCandidate) return null;

  return {
    step,
    origin: 'current-page',
    selector: bestCandidate.selector,
    resolvedLabel: bestCandidate.label,
    matchReason: bestReason,
  };
}

// ============================================================================
// Step resolution — deductive (predecessor-based inference)
// ============================================================================

/**
 * Deductive resolution: when a step couldn't be matched on the current page
 * nor cross-page via direct anchor detection, but its `inferAfter`
 * predecessor was successfully resolved (any mode), we infer the step from
 * an internal link that matches one of the step's route patterns. The
 * runtime will navigate the user to that route and resolve the actual
 * target on the new page using the first selector hint as best-effort
 * fallback.
 *
 * Returns `null` when:
 *  - the step doesn't declare `inferAfter`
 *  - none of the declared predecessors have been resolved
 *  - the step doesn't declare any `routePatterns` (no route to navigate to)
 *  - NO internal link in the current DOM matches any of the route patterns
 *    (= the host app does not expose this route → publishing a deduced step
 *    pointing at it would land the user on a 404. Phantom-step prevention.)
 */
function resolveStepDeductive(
  step: JourneyStepBlueprint,
  alreadyResolved: ResolvedStepRecord[],
  internalLinks: InternalLink[],
): ResolvedStepRecord | null {
  const inferAfter = step.inferAfter;
  if (!inferAfter || inferAfter.length === 0) return null;

  // A predecessor only counts as "resolved" when it produced an actionable
  // record (not `unresolved`); otherwise the deduction would chain on a
  // non-existent step and produce a phantom journey.
  const predecessor = alreadyResolved.find(
    (r) => r.origin !== 'unresolved' && inferAfter.includes(r.step.semanticRole),
  );
  if (!predecessor) return null;

  const routePatterns = step.targetHints.routePatterns;
  if (!routePatterns || routePatterns.length === 0) return null;

  // PHANTOM-STEP GUARD: we used to pick `routePatterns[0]` blindly as the
  // inferred route. That produced steps pointing at routes the host app
  // had never implemented (observed on test_4 / SecureBank: a SaaS
  // onboarding blueprint deduced `/profile`, an app with no profile page,
  // landing the user on a 404 when "Suivant" was clicked).
  //
  // We now require evidence that the inferred route is reachable from the
  // current page: at least one internal `<a href>` must match one of the
  // route patterns. We then use that link's pathname as the `stepTargetUrl`
  // so the deduced step lands on a route the host app actually serves.
  const normalizedPatterns = routePatterns.map((p) => p.toLowerCase());
  const matchingLink = internalLinks.find((link) => {
    const pathname = link.pathname.toLowerCase();
    return normalizedPatterns.some((pattern) => matchesRoutePattern(pathname, pattern));
  });
  if (!matchingLink) return null;

  const inferredRoute = matchingLink.pathname;
  // `selectorHints[0]` is a best-effort placeholder: when the user reaches
  // the inferred route, the tour runtime will try this selector first, then
  // fall back to the runtime target-not-found component if the element isn't
  // present. We deliberately don't iterate all hints here to keep the draft
  // payload small — the runtime is responsible for late binding.
  const selectorGuess = step.targetHints.selectorHints?.[0];

  return {
    step,
    origin: 'deduced',
    selector: selectorGuess,
    stepTargetUrl: inferredRoute,
    resolvedLabel: step.title,
    matchReason: `deduced from predecessor "${predecessor.step.semanticRole}" via internal link "${inferredRoute}"`,
  };
}

// ============================================================================
// Step resolution — cross-page via internal anchor detection
// ============================================================================

function resolveStepCrossPage(
  step: JourneyStepBlueprint,
  internalLinks: InternalLink[],
): ResolvedStepRecord | null {
  const patterns = step.targetHints.routePatterns;
  if (!patterns || patterns.length === 0) return null;
  if (internalLinks.length === 0) return null;

  const normalizedPatterns = patterns.map((p) => p.toLowerCase());

  for (const link of internalLinks) {
    const pathname = link.pathname.toLowerCase();
    // SEGMENT-AWARE match: a substring `includes` was producing nasty
    // cross-language false positives (e.g. the PT pattern `/conta` matched
    // `/contact`, sending the `auth.view-profile` step to the Contact page).
    // `matchesRoutePattern` requires the pattern to *end* a path segment
    // (next char is `/`, `?`, `#` or end of string) — same `\b`-style
    // discipline we already enforce on semantic tokens.
    const matched = normalizedPatterns.find((pattern) => matchesRoutePattern(pathname, pattern));
    if (!matched) continue;

    // The step is going to live on the OTHER route. We emit a step whose
    // `stepTargetUrl` is that route. The `targetSelector` is best-effort:
    // we point to the link element itself on the current page so the first
    // visit highlights the link the user is supposed to click to navigate.
    // TourViewer then handles the actual navigation when the user clicks
    // "Next" because it sees a `stepTargetUrl` different from the current
    // location.
    return {
      step,
      origin: 'cross-page',
      selector: link.selector,
      stepTargetUrl: link.pathname,
      resolvedLabel: link.label || step.title,
      matchReason: `internal link "${link.pathname}" matched route pattern "${matched}"`,
    };
  }

  return null;
}

// ============================================================================
// Draft assembly
// ============================================================================

function assembleBlueprintDraft(
  blueprint: JourneyBlueprint,
  resolvedSteps: ResolvedStepRecord[],
  currentTargetUrl: string,
): SuggestedTourDraft {
  const steps: Step[] = resolvedSteps.map((record, index) => {
    const isLast = index === resolvedSteps.length - 1;
    const action: ActionType = record.step.action ?? (isLast ? 'NEXT' : 'CLICK');
    const position: PositionType = record.step.position ?? 'BOTTOM';
    // Cohérence cross-page: when this step was resolved via an internal link
    // (the user will click the link to navigate to another route), enrich the
    // user-facing copy with the actual link label so the instruction stays
    // accurate on the current page. The blueprint's generic title (e.g.
    // "Découvrez notre catalogue") is preserved as a fallback when the link
    // has no meaningful label.
    const { title, content } = enrichCopyForRecord(record);
    return {
      title,
      content,
      targetSelector: record.selector,
      stepTargetUrl: record.stepTargetUrl,
      position,
      action,
      stepType: 'tooltip',
      highlightElement: true,
      skipAllowed: blueprintStepSkipAllowed(record.step),
      orderIndex: index,
    };
  });

  const score = computeBlueprintScore(blueprint, resolvedSteps);
  const confidence = computeBlueprintConfidence(blueprint, resolvedSteps);

  const detectedSelectors = resolvedSteps
    .map((r) => r.selector)
    .filter((selector): selector is string => Boolean(selector));

  const reasons = [
    `journey blueprint: ${blueprint.id}`,
    `vertical: ${blueprint.vertical}`,
    `resolved ${resolvedSteps.length}/${blueprint.steps.length} steps`,
    ...resolvedSteps.slice(0, 4).map((r) => `${r.step.semanticRole} <- ${r.matchReason}`),
  ];

  return {
    generatedBy: 'contextual-tour-generator',
    generatedAt: new Date().toISOString(),
    name: blueprint.name,
    description: blueprint.description,
    targetUrl: currentTargetUrl,
    isActive: false,
    priority: blueprint.priority,
    steps,
    intent: blueprint.intent,
    score,
    confidence,
    reasons,
    detectedSelectors,
    origin: {
      kind: 'blueprint',
      blueprintId: blueprint.id,
      vertical: blueprint.vertical,
      resolvedSteps: resolvedSteps.length,
      declaredSteps: blueprint.steps.length,
      catalogSource: blueprint.catalogSource,
      projectKey: blueprint.projectKey,
    },
    triggerConditions: {
      contextualEngine: {
        intent: blueprint.intent,
        blueprintId: blueprint.id,
      },
    } as unknown as TriggerConditions,
  };
}

/**
 * Adapts the step's user-facing copy when the record was resolved via an
 * internal link (cross-page) so the tooltip mentions the actual link the
 * user is supposed to click. Keeps the blueprint's generic copy as fallback.
 */
function enrichCopyForRecord(record: ResolvedStepRecord): { title: string; content: string } {
  const baseTitle = record.step.title;
  const baseContent = record.step.description;
  if (record.origin !== 'cross-page') return { title: baseTitle, content: baseContent };

  const label = (record.resolvedLabel || '').trim();
  const route = record.stepTargetUrl ? ` (${record.stepTargetUrl})` : '';

  // When we have a usable label, weave it into the description so the user
  // knows exactly which element to click on the current page.
  if (label && label.length > 0 && label.length < 60) {
    return {
      title: baseTitle,
      content: `${baseContent} Cliquez sur "${label}"${route} pour continuer.`.trim(),
    };
  }

  // No label (e.g. icon-only link): fall back to the route hint only.
  if (route) {
    return {
      title: baseTitle,
      content: `${baseContent} Cette etape se trouve sur ${record.stepTargetUrl}.`.trim(),
    };
  }

  return { title: baseTitle, content: baseContent };
}

function computeBlueprintScore(blueprint: JourneyBlueprint, resolved: ResolvedStepRecord[]): number {
  const completion = resolved.length / Math.max(1, blueprint.steps.length);
  const crossPageBonus = resolved.some((r) => r.origin === 'cross-page') ? 8 : 0;
  const priorityBonus = Math.min(10, (blueprint.priority ?? 0));
  const base = 60 + completion * 30;
  return Math.max(0, Math.min(100, Math.round(base + crossPageBonus + priorityBonus)));
}

function computeBlueprintConfidence(blueprint: JourneyBlueprint, resolved: ResolvedStepRecord[]): number {
  // Blueprints are intrinsically more reliable than heuristics because they
  // encode known business funnels. We start from a higher floor (70) and
  // adjust by how complete the resolution is.
  const completion = resolved.length / Math.max(1, blueprint.steps.length);
  const requiredCoverage = blueprint.steps.every((s) => {
    if (!s.required) return true;
    return resolved.some((r) => r.step === s && r.origin !== 'unresolved');
  })
    ? 10
    : 0;
  return Math.max(0, Math.min(100, Math.round(70 + completion * 20 + requiredCoverage)));
}

// ============================================================================
// DOM helpers
// ============================================================================

function collectInternalLinks(): InternalLink[] {
  const seen = new Set<string>();
  const result: InternalLink[] = [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const currentPath = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';

  const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

  for (const a of anchors) {
    const rawHref = a.getAttribute('href');
    if (!rawHref) continue;

    // External links / mail / tel / fragments are ignored.
    if (
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref.startsWith('javascript:')
    ) {
      continue;
    }

    let pathname: string;
    try {
      const url = new URL(rawHref, origin || 'http://placeholder.local');
      // Cross-origin links are not "internal" in the SPA sense.
      if (origin && url.origin !== origin) continue;
      pathname = url.pathname || '/';
    } catch {
      // Treat as relative path.
      pathname = rawHref.startsWith('/') ? rawHref.split('?')[0].split('#')[0] : `/${rawHref}`;
    }

    if (!pathname || pathname === '#') continue;
    // Skip the link that points to the current page — it wouldn't navigate.
    if (pathname.toLowerCase() === currentPath) continue;
    if (seen.has(pathname)) continue;
    seen.add(pathname);

    // NOTE: we deliberately do NOT filter anchors by visibility here. Many
    // real-world apps put auth/account links (login/register/profile) inside
    // a closed user dropdown, and cart/checkout links inside a closed mini-
    // cart drawer — all `display:none` or `visibility:hidden` by default.
    // For cross-page resolution we only need the `href` to know the route is
    // reachable; whether the anchor is currently visible is irrelevant. The
    // tour engine will navigate to the route at runtime, regardless of the
    // anchor's initial visibility.
    if (!a.isConnected) continue;

    const selector = buildAnchorSelector(a);
    const label = extractElementLabel(a);
    result.push({ href: rawHref, pathname, selector, label, element: a });
  }

  return result;
}

function buildAnchorSelector(a: HTMLAnchorElement): string {
  // Always include the `a` tag in the selector so the backend
  // `isActionableSelector` policy (regex requires `a[...]` for anchors)
  // recognizes the step as actionable. Without the tag, primary-action
  // drafts are rejected with `primary_intent_not_actionable`.
  const tourId = a.getAttribute('data-tour-id');
  if (tourId) return `a[data-tour-id="${tourId}"]`;

  const testId = a.getAttribute('data-testid');
  if (testId) return `a[data-testid="${testId}"]`;

  const href = a.getAttribute('href');
  if (href) return `a[href="${href.replace(/"/g, '\\"')}"]`;

  return 'a';
}

function isUsableElement(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  // Anchors that are visually hidden (e.g. screen-reader skip links) are
  // still acceptable for navigation purposes if they have a real href.
  if (rect.width === 0 && rect.height === 0 && el.tagName.toLowerCase() !== 'a') return false;
  return true;
}

function extractElementLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const title = el.getAttribute('title');
  if (title) return title.trim();
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  return text;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @internal test-only — assembles a draft from pre-resolved step records. */
export function __assembleBlueprintDraftForTests(
  blueprint: JourneyBlueprint,
  resolvedSteps: ResolvedStepRecord[],
  currentTargetUrl: string,
): SuggestedTourDraft {
  return assembleBlueprintDraft(blueprint, resolvedSteps, currentTargetUrl);
}
