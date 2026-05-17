/**
 * Cross-app structural guards for contextual tour steps.
 * Domain-specific rules (POS, e-commerce, …) belong in config overlays;
 * these checks apply to any host UI.
 */

import type { SemanticRole } from './semantic-step-intelligence';
import { buildSemanticStepCopy } from './semantic-step-intelligence';
import type { Step, SuggestedTourDraft, TourDraftIntent } from '../types';
import { findElement } from './dom-utils';

export const MAX_STEP_CONTENT_LENGTH = 200;
export const MAX_STEP_TITLE_LENGTH = 120;
export const MAX_TARGET_LABEL_LENGTH = 120;
/** Max whitespace-separated tokens in label/copy before treating as DOM dump. */
export const MAX_COPY_TOKEN_COUNT = 18;
/** Max interactive descendants (excluding the target itself). */
export const MAX_INTERACTIVE_DESCENDANTS = 8;

const INTERACTIVE_DESCENDANT_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[data-tour-id]',
].join(', ');

function normalizeText(value: string | null | undefined): string {
  return (value || '').toString().replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-zàâçéèêëîïôûùüÿñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

export function isBloatedCopyText(text: string | null | undefined): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (normalized.length > MAX_STEP_CONTENT_LENGTH) return true;
  const tokens = tokenize(normalized);
  if (tokens.length > MAX_COPY_TOKEN_COUNT) return true;
  // Dense concatenation typical of parent.innerText scrapes (prices, SKUs, nav labels).
  const compact = normalized.replace(/\s+/g, '').toLowerCase();
  if (compact.length > 140 && tokens.length >= 12) return true;
  if (/\$\d/.test(normalized) && tokens.length >= 10) return true;
  return false;
}

export function getShortElementLabel(element: HTMLElement): string {
  const attrCandidates = [
    element.getAttribute('data-tour-label'),
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
    element.getAttribute('name'),
    element.getAttribute('data-testid'),
  ];

  for (const raw of attrCandidates) {
    const value = normalizeText(raw);
    if (value.length >= 2 && value.length <= MAX_TARGET_LABEL_LENGTH) return value;
    if (value.length > MAX_TARGET_LABEL_LENGTH) return value.slice(0, MAX_TARGET_LABEL_LENGTH);
  }

  const directText = normalizeText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' '),
  );
  if (directText.length >= 2) {
    return directText.slice(0, MAX_TARGET_LABEL_LENGTH);
  }

  return normalizeText(element.textContent || '').slice(0, MAX_TARGET_LABEL_LENGTH);
}

export function countInteractiveDescendants(element: HTMLElement): number {
  try {
    const matches = element.querySelectorAll(INTERACTIVE_DESCENDANT_SELECTOR);
    let count = 0;
    for (const match of matches) {
      if (match === element) continue;
      count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

export function isOversizedStepTarget(element: HTMLElement): boolean {
  if (countInteractiveDescendants(element) > MAX_INTERACTIVE_DESCENDANTS) return true;
  const label = getShortElementLabel(element);
  if (label.length > MAX_TARGET_LABEL_LENGTH) return true;
  if (tokenize(label).length > MAX_COPY_TOKEN_COUNT) return true;
  return false;
}

export function inferSemanticRoleFromDraftIntent(intent: TourDraftIntent): SemanticRole {
  switch (intent) {
    case 'primary-action':
      return 'cta-primary';
    case 'form-flow':
      return 'form-field';
    case 'support-navigation':
      return 'navigation';
    case 'discovery':
    default:
      return 'entry';
  }
}

export function enforceSemanticStepCopy(
  title: string,
  content: string,
  options?: {
    element?: HTMLElement | null;
    semanticRole?: SemanticRole;
    fallbackLabel?: string;
    draftIntent?: TourDraftIntent;
  },
): { title: string; content: string; rewritten: boolean } {
  const needsFix = isBloatedCopyText(content) || isBloatedCopyText(title);
  if (!needsFix) {
    return {
      title: normalizeText(title).slice(0, MAX_STEP_TITLE_LENGTH) || 'Étape',
      content: normalizeText(content).slice(0, MAX_STEP_CONTENT_LENGTH),
      rewritten: false,
    };
  }

  const role =
    options?.semanticRole ??
    (options?.draftIntent ? inferSemanticRoleFromDraftIntent(options.draftIntent) : 'generic-click');

  let label = normalizeText(options?.fallbackLabel || '');
  if (isBloatedCopyText(label) || label.length < 2) {
    label = options?.element ? getShortElementLabel(options.element) : 'cet élément';
  }
  if (isBloatedCopyText(label) || label.length < 2) {
    label = 'cet élément';
  }
  label = label.slice(0, MAX_TARGET_LABEL_LENGTH);

  const copy = buildSemanticStepCopy(role, label);
  return {
    title: copy.title.slice(0, MAX_STEP_TITLE_LENGTH),
    content: copy.content.slice(0, MAX_STEP_CONTENT_LENGTH),
    rewritten: true,
  };
}

export function sanitizeStepCopy(
  step: Step,
  options?: { element?: HTMLElement | null; draftIntent?: TourDraftIntent; semanticRole?: SemanticRole },
): Step {
  const element =
    options?.element ??
    (typeof document !== 'undefined' && step.targetSelector
      ? findElement(step.targetSelector, { preferActive: true })
      : null);

  const fallbackLabel = normalizeText(
    step.targetFingerprint?.ariaLabel ||
      step.targetFingerprint?.textSample ||
      (element ? getShortElementLabel(element) : ''),
  );

  const enforced = enforceSemanticStepCopy(step.title, step.content, {
    element,
    fallbackLabel,
    draftIntent: options?.draftIntent,
    semanticRole: options?.semanticRole,
  });

  if (!enforced.rewritten && enforced.title === step.title && enforced.content === step.content) {
    return step;
  }

  return {
    ...step,
    title: enforced.title,
    content: enforced.content,
  };
}

export function getCanonicalElementTargetKey(element: HTMLElement): string {
  const tourId = element.getAttribute('data-tour-id');
  if (tourId) return `tour:${tourId}`;

  const id = element.id;
  if (id) return `id:${id}`;

  const sample = [
    element.tagName.toLowerCase(),
    normalizeText(element.getAttribute('role')),
    normalizeText(element.getAttribute('aria-label')).slice(0, 48),
    getShortElementLabel(element).slice(0, 48),
  ].join('|');
  return `fp:${hashString(sample)}`;
}

export function getCanonicalTargetKeyForStep(step: Step): string {
  if (typeof document !== 'undefined' && step.targetSelector) {
    try {
      const element = findElement(step.targetSelector, { preferActive: true });
      if (element) return getCanonicalElementTargetKey(element);
    } catch {
      /* fall through */
    }
  }
  return `sel:${normalizeText(step.targetSelector).toLowerCase()}`;
}

export function draftTargetSpecificityScore(draft: SuggestedTourDraft, step: Step): number {
  let score = 0;
  const selector = step.targetSelector || '';
  if (selector.includes('[data-tour-id=')) score += 48;
  if (selector.includes('[data-testid=')) score += 28;
  if (selector.includes('#') && !selector.includes('nth-child')) score += 18;
  if (!/:nth-child|nth-of-type/.test(selector)) score += 12;
  if (typeof step.stabilityScore === 'number') score += Math.min(20, step.stabilityScore / 5);
  if (typeof step.semanticRoleConfidence === 'number') score += step.semanticRoleConfidence * 12;

  switch (draft.intent) {
    case 'primary-action':
      score += step.isPrimary ? 24 : 8;
      break;
    case 'form-flow':
      score += 10;
      break;
    case 'support-navigation':
      score += 6;
      break;
    default:
      score += 4;
  }

  return score;
}
