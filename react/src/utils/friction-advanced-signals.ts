/**
 * Advanced friction signals (industry-aligned):
 * Phase 1 — rage click, error click, form retry
 * Phase 2 — navigation loop, U-turn, slow response
 * Phase 3 — FAQ loops (no result, reopen, fail after help)
 * Phase 4 — combination rules + intent/page thresholds (see friction-combination.ts)
 */

export const RAGE_CLICK_WINDOW_MS = 2_000;
export const RAGE_CLICK_MIN_COUNT = 3;
export const RAGE_CLICK_COOLDOWN_MS = 3_000;

/** Correlate window errors with a recent interactive click. */
export const ERROR_CLICK_WINDOW_MS = 2_500;

/** Second+ invalid submit on the same form counts as a retry. */
export const FORM_RETRY_MIN_FAILED_SUBMITS = 2;

export type RageClickSample = { key: string; at: number };

export function pruneRageClickHistory(
  history: RageClickSample[],
  now: number,
  windowMs: number = RAGE_CLICK_WINDOW_MS,
): RageClickSample[] {
  return history.filter((sample) => now - sample.at <= windowMs);
}

/**
 * Record a click on an interactive target and report whether a rage-click
 * episode should be counted (with cooldown handled by the caller via lastFiredAt).
 */
export function evaluateRageClick(input: {
  history: RageClickSample[];
  key: string;
  now: number;
  lastFiredAt: number;
  windowMs?: number;
  minCount?: number;
  cooldownMs?: number;
}): { history: RageClickSample[]; triggered: boolean; lastFiredAt: number } {
  const windowMs = input.windowMs ?? RAGE_CLICK_WINDOW_MS;
  const minCount = input.minCount ?? RAGE_CLICK_MIN_COUNT;
  const cooldownMs = input.cooldownMs ?? RAGE_CLICK_COOLDOWN_MS;

  let history = pruneRageClickHistory(input.history, input.now, windowMs);
  history = [...history, { key: input.key, at: input.now }];

  const sameTargetCount = history.filter((sample) => sample.key === input.key).length;
  const cooledDown =
    input.lastFiredAt <= 0 || input.now - input.lastFiredAt >= cooldownMs;
  const triggered = sameTargetCount >= minCount && cooledDown;

  if (triggered) {
    // Clear this target's window so the next episode must rebuild.
    history = history.filter((sample) => sample.key !== input.key);
    return { history, triggered: true, lastFiredAt: input.now };
  }

  return { history, triggered: false, lastFiredAt: input.lastFiredAt };
}

export function shouldCountErrorClick(
  lastInteractiveClickAt: number,
  now: number,
  windowMs: number = ERROR_CLICK_WINDOW_MS,
): boolean {
  if (lastInteractiveClickAt <= 0) return false;
  return now - lastInteractiveClickAt <= windowMs;
}

/**
 * Track invalid submits per form. Returns whether this attempt should
 * increment the formRetry counter (from the 2nd failure onward).
 */
export function evaluateFormRetry(input: {
  previousFailedSubmits: number;
  minFailedSubmits?: number;
}): { nextFailedSubmits: number; triggered: boolean } {
  const minFailed = input.minFailedSubmits ?? FORM_RETRY_MIN_FAILED_SUBMITS;
  const nextFailedSubmits = input.previousFailedSubmits + 1;
  return {
    nextFailedSubmits,
    triggered: nextFailedSubmits >= minFailed,
  };
}

/** Leave B and return to the page that led to B within this dwell → U-turn. */
export const U_TURN_MAX_DWELL_MS = 5_000;
/** Ignore sub-frame thrash hops while soft-checks bounce landmarks. */
export const U_TURN_MIN_DWELL_MS = 400;
/** Soft SPA: wait briefly so click→aria-current is observed, then commit. */
export const SOFT_SPA_NAV_SETTLE_MS = 150;
export const U_TURN_COOLDOWN_MS = 3_000;

/** Same undirected A↔B edge repeated within the window → navigation loop. */
export const NAV_LOOP_WINDOW_MS = 60_000;
export const NAV_LOOP_MIN_TRANSITIONS = 3;
export const NAV_LOOP_COOLDOWN_MS = 8_000;

/** Interactive click with no navigation / follow-up click within this delay. */
export const SLOW_RESPONSE_MS = 8_000;
export const SLOW_RESPONSE_COOLDOWN_MS = 10_000;

export type NavTransition = { from: string; to: string; at: number };

export function undirectedNavEdgeKey(from: string, to: string): string {
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

function logicalKeyUrl(key: string): string {
  return (key.split('\u0001')[0] || '').trim();
}

function logicalKeyLandmarks(key: string): { nav: string; heading: string } {
  const parts = key.split('\u0001');
  return {
    nav: (parts[2] || '').trim(),
    heading: (parts[3] || '').trim(),
  };
}

/**
 * True when `nextKey` is a return to `arrivedFromKey` after leaving `previousKey`.
 * Keys may be full logical keys or compact friction identities (`url + nav:/h1:`).
 */
export function isLogicalPageReverseMatch(
  nextKey: string,
  arrivedFromKey: string,
  previousKey: string,
): boolean {
  if (!nextKey || !arrivedFromKey || !previousKey) return false;
  if (nextKey === arrivedFromKey) return true;

  const nextUrl = logicalKeyUrl(nextKey);
  const fromUrl = logicalKeyUrl(arrivedFromKey);
  const prevUrl = logicalKeyUrl(previousKey);

  // Route change: /deals → /contacts → /deals
  if (nextUrl && fromUrl && nextUrl === fromUrl && prevUrl !== nextUrl) {
    return true;
  }

  // Soft SPA / identity keys: compare nav: or h1: suffix on the same URL.
  if (nextUrl === prevUrl && fromUrl === nextUrl) {
    const nextId = nextKey.includes('\u0001') ? nextKey.slice(nextKey.indexOf('\u0001') + 1) : '';
    const fromId = arrivedFromKey.includes('\u0001')
      ? arrivedFromKey.slice(arrivedFromKey.indexOf('\u0001') + 1)
      : '';
    if (nextId && fromId && nextId === fromId) return true;

    const nextLm = logicalKeyLandmarks(nextKey);
    const fromLm = logicalKeyLandmarks(arrivedFromKey);
    if (nextLm.nav && fromLm.nav && nextLm.nav === fromLm.nav) return true;
    if (
      !nextLm.nav &&
      !fromLm.nav &&
      nextLm.heading &&
      fromLm.heading &&
      nextLm.heading === fromLm.heading
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Same-URL update where only one of nav/H1 moved — typical mid-transition paint
 * during soft SPA view swaps, not a deliberate second navigation.
 */
export function isSoftSpaLandmarkPaint(previousKey: string, nextKey: string): boolean {
  if (!previousKey || !nextKey || previousKey === nextKey) return false;
  if (logicalKeyUrl(previousKey) !== logicalKeyUrl(nextKey)) return false;

  const previous = logicalKeyLandmarks(previousKey);
  const next = logicalKeyLandmarks(nextKey);
  const navChanged = previous.nav !== next.nav;
  const headingChanged = previous.heading !== next.heading;
  if (navChanged && headingChanged) return false;
  return navChanged || headingChanged;
}

/**
 * U-turn: arrived A→B, then left B back to A within a short dwell.
 * Short dwell alone while browsing A→B→C is intentional exploration — not a U-turn.
 */
export function evaluateUTurn(input: {
  previousPageKey: string;
  nextPageKey: string;
  /** Page the user came from when they arrived on `previousPageKey`. */
  arrivedFromPageKey: string | null;
  dwellMsOnPrevious: number;
  now: number;
  lastFiredAt: number;
  maxDwellMs?: number;
  minDwellMs?: number;
  cooldownMs?: number;
}): { triggered: boolean; lastFiredAt: number } {
  const maxDwellMs = input.maxDwellMs ?? U_TURN_MAX_DWELL_MS;
  const minDwellMs = input.minDwellMs ?? U_TURN_MIN_DWELL_MS;
  const cooldownMs = input.cooldownMs ?? U_TURN_COOLDOWN_MS;

  if (!input.previousPageKey || !input.nextPageKey || !input.arrivedFromPageKey) {
    return { triggered: false, lastFiredAt: input.lastFiredAt };
  }
  if (input.previousPageKey === input.nextPageKey) {
    return { triggered: false, lastFiredAt: input.lastFiredAt };
  }

  const cooledDown =
    input.lastFiredAt <= 0 || input.now - input.lastFiredAt >= cooldownMs;
  const isReverse = isLogicalPageReverseMatch(
    input.nextPageKey,
    input.arrivedFromPageKey,
    input.previousPageKey,
  );
  const triggered =
    cooledDown &&
    isReverse &&
    input.dwellMsOnPrevious >= minDwellMs &&
    input.dwellMsOnPrevious < maxDwellMs;

  return {
    triggered,
    lastFiredAt: triggered ? input.now : input.lastFiredAt,
  };
}

/**
 * Navigation loop: the undirected edge A↔B appears ≥3 times in the window
 * (e.g. A→B→A→B covers three transitions on the same edge).
 */
export function evaluateNavigationLoop(input: {
  history: NavTransition[];
  from: string;
  to: string;
  now: number;
  lastFiredAt: number;
  windowMs?: number;
  minTransitions?: number;
  cooldownMs?: number;
}): { history: NavTransition[]; triggered: boolean; lastFiredAt: number } {
  const windowMs = input.windowMs ?? NAV_LOOP_WINDOW_MS;
  const minTransitions = input.minTransitions ?? NAV_LOOP_MIN_TRANSITIONS;
  const cooldownMs = input.cooldownMs ?? NAV_LOOP_COOLDOWN_MS;

  if (!input.from || !input.to || input.from === input.to) {
    return {
      history: input.history,
      triggered: false,
      lastFiredAt: input.lastFiredAt,
    };
  }

  let history = input.history.filter((sample) => input.now - sample.at <= windowMs);
  history = [...history, { from: input.from, to: input.to, at: input.now }];

  const edge = undirectedNavEdgeKey(input.from, input.to);
  const edgeCount = history.filter(
    (sample) => undirectedNavEdgeKey(sample.from, sample.to) === edge,
  ).length;
  const cooledDown =
    input.lastFiredAt <= 0 || input.now - input.lastFiredAt >= cooldownMs;
  const triggered = edgeCount >= minTransitions && cooledDown;

  if (triggered) {
    history = history.filter(
      (sample) => undirectedNavEdgeKey(sample.from, sample.to) !== edge,
    );
    return { history, triggered: true, lastFiredAt: input.now };
  }

  return { history, triggered: false, lastFiredAt: input.lastFiredAt };
}

export function shouldCountSlowResponse(input: {
  pageKeyAtClick: string | null;
  currentPageKey: string;
  now: number;
  lastFiredAt: number;
  cooldownMs?: number;
}): boolean {
  if (!input.pageKeyAtClick) return false;
  if (input.pageKeyAtClick !== input.currentPageKey) return false;
  const cooldownMs = input.cooldownMs ?? SLOW_RESPONSE_COOLDOWN_MS;
  if (input.lastFiredAt > 0 && input.now - input.lastFiredAt < cooldownMs) {
    return false;
  }
  return true;
}

/** Phase 3 — FAQ search with no useful match (empty, fallback, or low score). */
export const FAQ_NO_RESULT_COOLDOWN_MS = 4_000;
/** Below this top-hit score (when strategy is missing), treat as weak. */
export const FAQ_WEAK_TOP_SCORE_MAX = 0.6;
/** Phase 3 — FAQ/help opened again after a prior open in the session. */
export const FAQ_REOPEN_MIN_OPENS = 2;
export const FAQ_REOPEN_COOLDOWN_MS = 5_000;
/** Phase 3 — strong friction after help was already offered. */
export const FAIL_AFTER_HELP_COOLDOWN_MS = 6_000;

export const TRUSTDEV_FAQ_FRICTION_EVENT = 'trustdev:faq-friction';

export type FaqFrictionDetail =
  | {
      type: 'noResult';
      query: string;
      resultCount?: number;
      strategyStep?: string | null;
      topScore?: number | null;
    }
  | {
      type: 'search';
      query: string;
      resultCount: number;
      strategyStep?: string | null;
      topScore?: number | null;
    };

export function emitFaqFriction(detail: FaqFrictionDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<FaqFrictionDetail>(TRUSTDEV_FAQ_FRICTION_EVENT, { detail }),
  );
}

/**
 * Empty / low-confidence FAQ hits are weak for friction.
 * After Nest gating, empty results are preferred over a forced wrong top-1.
 */
export function isWeakFaqSearch(input: {
  resultCount: number;
  strategyStep?: string | null;
  topScore?: number | null;
  weakScoreMax?: number;
}): boolean {
  if (input.resultCount <= 0) return true;

  const step = (input.strategyStep || '').trim().toLowerCase();
  if (
    step === 'fallback_top1' ||
    step === 'no_results' ||
    step === 'no_confident_match' ||
    step === 'no_org_corpus'
  ) {
    return true;
  }

  const weakScoreMax = input.weakScoreMax ?? FAQ_WEAK_TOP_SCORE_MAX;
  if (
    typeof input.topScore === 'number' &&
    Number.isFinite(input.topScore) &&
    input.topScore < weakScoreMax
  ) {
    return true;
  }

  return false;
}

export function shouldCountFaqNoResult(input: {
  resultCount: number;
  strategyStep?: string | null;
  topScore?: number | null;
  now: number;
  lastFiredAt: number;
  cooldownMs?: number;
  weakScoreMax?: number;
}): boolean {
  if (
    !isWeakFaqSearch({
      resultCount: input.resultCount,
      strategyStep: input.strategyStep,
      topScore: input.topScore,
      weakScoreMax: input.weakScoreMax,
    })
  ) {
    return false;
  }
  const cooldownMs = input.cooldownMs ?? FAQ_NO_RESULT_COOLDOWN_MS;
  if (input.lastFiredAt > 0 && input.now - input.lastFiredAt < cooldownMs) {
    return false;
  }
  return true;
}

export function shouldCountFaqReopen(input: {
  faqOpenCount: number;
  now: number;
  lastFiredAt: number;
  minOpens?: number;
  cooldownMs?: number;
}): boolean {
  const minOpens = input.minOpens ?? FAQ_REOPEN_MIN_OPENS;
  if (input.faqOpenCount < minOpens) return false;
  const cooldownMs = input.cooldownMs ?? FAQ_REOPEN_COOLDOWN_MS;
  if (input.lastFiredAt > 0 && input.now - input.lastFiredAt < cooldownMs) {
    return false;
  }
  return true;
}

export function shouldCountFailAfterHelp(input: {
  /** Help chrome was opened (sidebar / toast). */
  helpTriggered: boolean;
  /** User actually used help (FAQ search, etc.) — open alone is not enough. */
  helpEngaged: boolean;
  now: number;
  lastFiredAt: number;
  cooldownMs?: number;
}): boolean {
  if (!input.helpTriggered || !input.helpEngaged) return false;
  const cooldownMs = input.cooldownMs ?? FAIL_AFTER_HELP_COOLDOWN_MS;
  if (input.lastFiredAt > 0 && input.now - input.lastFiredAt < cooldownMs) {
    return false;
  }
  return true;
}

/**
 * Surfaces treated as intentional UI controls for friction (click-miss / rage key).
 * Includes native controls + common ARIA widgets (Radix/shadcn Select = combobox/option).
 */
export const FRICTION_INTERACTIVE_CLICK_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="treeitem"]',
  '[contenteditable="true"]',
  '[data-interactive]',
  '[data-trustdev-interactive]',
].join(', ');

/** Stable-ish key for rage-click grouping (id > name > role+text). */
export function resolveInteractiveClickKey(element: Element): string | null {
  const interactive = element.closest(FRICTION_INTERACTIVE_CLICK_SELECTOR);
  if (!(interactive instanceof HTMLElement)) return null;

  if (interactive.id?.trim()) return `id:${interactive.id.trim()}`;

  const name =
    interactive.getAttribute('name') ||
    (interactive instanceof HTMLInputElement ||
    interactive instanceof HTMLButtonElement ||
    interactive instanceof HTMLSelectElement ||
    interactive instanceof HTMLTextAreaElement
      ? interactive.name
      : '');
  if (name?.trim()) {
    return `name:${interactive.tagName.toLowerCase()}:${name.trim()}`;
  }

  const aria = interactive.getAttribute('aria-label')?.trim();
  if (aria) return `aria:${interactive.tagName.toLowerCase()}:${aria.slice(0, 40)}`;

  const text = (interactive.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const type = interactive.getAttribute('type') || '';
  return `el:${interactive.tagName.toLowerCase()}:${type}:${text}`;
}
