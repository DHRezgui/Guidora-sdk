import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';
import type { ResolveOptions } from '../hooks/useTourTargetResolver';
import type { UseTourResult } from '../hooks/useTour';
import { useSdkDockLayout } from '../hooks/useSdkDockLayout';
import { resolveSDKConfig } from '../core/sdk-state';
import { PositionType, SDKConfig, Step, TourDraftIntent } from '../types';
import { UseContextualTourSuggestionsOptions } from '../hooks/useContextualTourSuggestions';
import { ContextualSuggestionsPublisher, ContextualSuggestionsUIMode } from './ContextualSuggestionsPublisher';
import { FaqSearchWidget } from './FaqSearchWidget';
import { HelpSidebar } from './HelpSidebar';
import type { FaqWidgetOptions } from '../types/faq';
import { OnboardingTheme } from './theme';
import { TourRenderer } from './TourRenderer';
import { recordTourSuggestionFeedback } from '../utils/tour-suggestion-generator';
import { enqueueContextualFeedback } from '../utils/contextual-feedback-flusher';
import { findElement } from '../utils/dom-utils';
import {
  mergeTourViewerFaqOptions,
  normalizeSdkDockLayoutConfig,
  normalizeSdkFaqDefaults,
  resolveInitHostAvoidSelectors,
} from '../utils/sdk-ui-defaults';
import { resolveContextualTourViewerOptions } from '../utils/sdk-auto-defaults';
import { resolveSdkProjectKey } from '../utils/sdk-project-key';

const VALID_INTENTS: TourDraftIntent[] = ['discovery', 'primary-action', 'support-navigation', 'form-flow'];
const NAVIGATION_CLICK_RESUME_DELAY_MS = 5000;
const NAVIGATION_CLICK_RESUME_KEY = '__trustdev_navigation_click_resume_at_v1';
const SELECTOR_HEAL_STORAGE_KEY = '__trustdev_selector_heals_v1';
const SELECTOR_HEAL_TTL_MS = 30 * 60 * 1000;
const RUNTIME_FALLBACK_SELECTORS = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  'input[type="submit"]',
  '[aria-label]',
].join(', ');
const MIN_RUNTIME_FALLBACK_MATCH_SCORE = 28;
const LOW_CONFIDENCE_RUNTIME_MATCH_SCORE = 50;
const TARGET_RECT_MIN_INTERVAL_MS = 120;
const TARGET_RECT_HIDDEN_INTERVAL_MS = 500;
const SELECTOR_HEAL_PERSIST_DEBOUNCE_MS = 400;
const RUNTIME_RESOLUTION_CACHE_MAX = 64;
type TargetRect = { top: number; left: number; width: number; height: number };
type RuntimeResolvePath = 'primary' | 'alternative' | 'fingerprint' | 'semantic-fallback' | 'not-found';
type PersistedSelectorHeal = {
  selector: string;
  expiresAt: number;
  pageHash: string;
};

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

function getPageUrlHash(): string {
  if (typeof window === 'undefined') return 'unknown';
  const base = `${window.location.origin}${window.location.pathname}`;
  return hashString(base);
}

function areRectsClose(a: TargetRect | null, b: TargetRect, tolerance = 0.5): boolean {
  if (!a) return false;
  return (
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function toTourDraftIntent(raw: unknown): TourDraftIntent | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase() as TourDraftIntent;
  return VALID_INTENTS.includes(normalized) ? normalized : null;
}

function readNavigationClickResumeAt(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.sessionStorage.getItem(NAVIGATION_CLICK_RESUME_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeNavigationClickResumeAt(resumeAt: number): void {
  if (typeof window === 'undefined') return;
  if (resumeAt > Date.now()) {
    window.sessionStorage.setItem(NAVIGATION_CLICK_RESUME_KEY, String(resumeAt));
  } else {
    window.sessionStorage.removeItem(NAVIGATION_CLICK_RESUME_KEY);
  }
}

let selectorHealsMemory: Record<string, PersistedSelectorHeal> | null = null;
let selectorHealPersistTimer: ReturnType<typeof setTimeout> | null = null;

function parseSelectorHealsFromStorage(): Record<string, PersistedSelectorHeal> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SELECTOR_HEAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PersistedSelectorHeal | string>;
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const pageHash = getPageUrlHash();
    const next: Record<string, PersistedSelectorHeal> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value) continue;
      if (typeof value === 'string') {
        next[key] = {
          selector: value,
          expiresAt: now + SELECTOR_HEAL_TTL_MS,
          pageHash,
        };
        continue;
      }
      if (typeof value.selector !== 'string' || !value.selector.trim()) continue;
      if (typeof value.expiresAt !== 'number' || value.expiresAt <= now) continue;
      if (typeof value.pageHash !== 'string' || value.pageHash !== pageHash) continue;
      next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function loadSelectorHealsMemory(): Record<string, PersistedSelectorHeal> {
  if (!selectorHealsMemory) {
    selectorHealsMemory = parseSelectorHealsFromStorage();
  }
  return selectorHealsMemory;
}

function persistSelectorHealsToStorage(): void {
  if (typeof window === 'undefined' || !selectorHealsMemory) return;
  try {
    window.sessionStorage.setItem(SELECTOR_HEAL_STORAGE_KEY, JSON.stringify(selectorHealsMemory));
  } catch {
    // ignore storage write failures
  }
}

function schedulePersistSelectorHeals(): void {
  if (selectorHealPersistTimer) clearTimeout(selectorHealPersistTimer);
  selectorHealPersistTimer = setTimeout(() => {
    selectorHealPersistTimer = null;
    persistSelectorHealsToStorage();
  }, SELECTOR_HEAL_PERSIST_DEBOUNCE_MS);
}

function writeSelectorHeal(stepKey: string, selector: string, pageHash: string): void {
  if (typeof window === 'undefined' || !stepKey || !selector) return;
  const current = loadSelectorHealsMemory();
  current[stepKey] = {
    selector,
    expiresAt: Date.now() + SELECTOR_HEAL_TTL_MS,
    pageHash,
  };
  schedulePersistSelectorHeals();
}

function removeSelectorHeal(stepKey: string): void {
  if (typeof window === 'undefined' || !stepKey) return;
  const current = loadSelectorHealsMemory();
  if (!current[stepKey]) return;
  delete current[stepKey];
  schedulePersistSelectorHeals();
}

type RuntimeResolutionCacheEntry = {
  domSignature: string;
  resolvedSelector: string;
  resolvedPath: RuntimeResolvePath;
  matchScore: number | null;
};

const runtimeResolutionCache = new Map<string, RuntimeResolutionCacheEntry>();
const runtimeSemanticMatchCache = new WeakMap<HTMLElement, Map<string, { accepted: boolean; score: number }>>();

function getLightDomSignature(): string {
  if (typeof document === 'undefined') return 'ssr';
  const root = document.querySelector('main') ?? document.body;
  const childCount = root?.childElementCount ?? 0;
  return `${getPageUrlHash()}:${childCount}`;
}

function rememberRuntimeResolution(
  stepKey: string,
  entry: RuntimeResolutionCacheEntry,
): void {
  if (runtimeResolutionCache.size >= RUNTIME_RESOLUTION_CACHE_MAX) {
    const oldest = runtimeResolutionCache.keys().next().value;
    if (oldest) runtimeResolutionCache.delete(oldest);
  }
  runtimeResolutionCache.set(stepKey, entry);
}

function resolveRuntimeFallbackScopeRoot(): ParentNode {
  if (typeof document === 'undefined') return document;
  const main = document.querySelector('main');
  if (main instanceof HTMLElement && main.isConnected) return main;
  return document.body ?? document;
}

export interface TourViewerProps {
  config?: Partial<SDKConfig>;
  autoStart?: boolean;
  debug?: boolean;
  theme?: OnboardingTheme;
  showHighlight?: boolean;
  showBeacon?: boolean;
  showTooltip?: boolean;
  tooltipPosition?: PositionType;
  onTourComplete?: (tourId?: string) => void;
  onTourSkipped?: (tourId?: string) => void;
  runtimeBehavior?: {
    /**
     * Enables preview auto-detection in iframe runtime.
     */
    detectPreviewIframe?: boolean;
    /**
     * Host suffixes considered as preview hosts when embedded in iframe.
     * Example: ['tunnelmole.net'].
     */
    previewHostSuffixes?: string[];
    /**
     * Whether tour UI should be hidden in preview iframe.
     */
    hideTourUiInPreview?: boolean;
    /**
     * Whether auto-start should be disabled in preview iframe.
     */
    disableAutoStartInPreview?: boolean;
    /**
     * Clears local progress/session storage on mount.
     * - never: no reset
     * - always: always reset
     * - non-preview: reset only outside preview iframe
     */
    resetProgressOnMount?: 'never' | 'always' | 'non-preview';
  };
  contextualSuggestions?: (UseContextualTourSuggestionsOptions & {
    /**
     * Defaults to 'auto':
     * - hidden when developerMode=false (production-safe)
     * - hidden when autoPublish=true
     * - minimal manual panel when developerMode=true and autoPublish=false
     */
    uiMode?: ContextualSuggestionsUIMode;
    title?: string;
    stableOnly?: boolean;
    /**
     * Selects a built-in preset combining sensible defaults + the relevant
     * `journeyVerticals`. Pick the one that matches your host app:
     * - `ecommerce-default`: e-commerce funnel (browse / cart / checkout)
     * - `saas-default`: SaaS onboarding + feature discovery + account settings
     * - `marketing-default`: lead generation (CTA / contact form / demo)
     * - `dashboard-default`: analytics / data exploration (filters, charts,
     *   date pickers, exports)
     * - `support-default`: in-app help surfaces (FAQ, docs, ticket creation,
     *   live chat)
     * - `multi-vertical-default`: activates ALL verticals — useful when the
     *   app spans several contexts (e.g. an e-commerce site with a marketing
     *   landing page and an analytics admin dashboard)
     */
    preset?:
      | 'ecommerce-default'
      | 'saas-default'
      | 'marketing-default'
      | 'dashboard-default'
      | 'support-default'
      | 'multi-vertical-default';
    /**
     * Enables the publishing panel UI. End-users consuming activated tours
     * must never see this panel, so it is hidden by default. When omitted,
     * TourViewer's `debug` prop is used as the implicit value, so the panel
     * appears automatically only in development.
     */
    developerMode?: boolean;
    /** Host DOM zones all SDK floating chrome should avoid (FAQ + contextual). */
    avoidSelectors?: string[];
    /** Minimum horizontal clearance (px) before flipping dock side (default `420`). */
    minDockClearancePx?: number;
    /** Preferred dock for the contextual panel when space allows (default `right`). */
    dockSide?: 'left' | 'right';
  }) | null;
  /**
   * Host DOM zones all SDK floating chrome should avoid (merged with FAQ/contextual selectors).
   * Use for persistent host UI such as nav sidebars, carts, or order summaries.
   */
  hostAvoidSelectors?: string[];
  /** In-app FAQ semantic search (RAG). Requires SDK token scope `faq:search`. */
  faq?: (FaqWidgetOptions & { config?: Partial<SDKConfig> }) | null;
}

const SHARED_CONTEXTUAL_DEFAULTS: Partial<UseContextualTourSuggestionsOptions> = {
  enabled: true,
  autoGenerate: true,
  autoPublish: false,
  autoActivatePublishedDrafts: false,
  maxAutoPublishedTours: 3,
  publishScenario: 'simple',
  maxDrafts: 4,
  maxCandidates: 250,
  ignoreTransientUi: true,
  includeSupportDraft: true,
  includeNavigationDraft: true,
  includeFormDraft: true,
  useSemanticRanking: true,
  enableSequenceDetection: true,
  noiseFilteringEnabled: true,
  conflictResolutionEnabled: true,
  conflictResolutionStrategy: 'hybrid',
  explainabilityEnabled: true,
  minConfidence: 45,
  persona: 'admin',
  flowVersioningEnabled: true,
  flowCompatibilityMode: 'lenient',
  feedbackEnabled: true,
  // When at least one blueprint produces a draft, suppress the heuristic
  // drafts. Blueprint drafts are business-meaningful by construction; the
  // heuristic ones tend to be "tour of the navigation menu" / "look at the
  // page H1" which add noise. Hosts that want to keep the heuristics on top
  // can override this with `blueprintsExclusive: false`.
  blueprintsExclusive: true,
};

const CONTEXTUAL_SUGGESTIONS_PRESETS: Record<string, Partial<UseContextualTourSuggestionsOptions>> = {
  'ecommerce-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'e-commerce onboarding',
    businessObjectives: ['discover products', 'add to cart', 'reach checkout'],
    semanticHints: ['shop', 'cart', 'checkout', 'contact'],
    flowVersion: 'ecommerce-v1',
    baselineFlowVersion: 'ecommerce-v0',
    journeyVerticals: ['ecommerce'],
  },
  'saas-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'saas onboarding',
    businessObjectives: [
      'discover dashboard',
      'create first resource',
      'invite team',
      'complete profile',
      'discover new features',
      'manage account settings',
    ],
    semanticHints: [
      'dashboard',
      'create',
      'new',
      'settings',
      'team',
      'invite',
      'profile',
      'billing',
      'security',
      'upgrade',
      'whats new',
    ],
    flowVersion: 'saas-v1',
    baselineFlowVersion: 'saas-v0',
    journeyVerticals: ['saas'],
  },
  'marketing-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'marketing lead capture',
    businessObjectives: ['capture leads', 'book demo', 'newsletter signup'],
    semanticHints: ['contact', 'demo', 'newsletter', 'get started', 'pricing'],
    flowVersion: 'marketing-v1',
    baselineFlowVersion: 'marketing-v0',
    journeyVerticals: ['marketing'],
  },
  'dashboard-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'analytics dashboard',
    businessObjectives: ['explore data', 'apply filters', 'export reports', 'compare periods'],
    semanticHints: [
      'kpi',
      'metric',
      'filter',
      'chart',
      'date',
      'period',
      'export',
      'download',
      'csv',
    ],
    flowVersion: 'dashboard-v1',
    baselineFlowVersion: 'dashboard-v0',
    journeyVerticals: ['dashboard'],
  },
  'support-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'in-app help center',
    businessObjectives: ['find answer in FAQ', 'browse documentation', 'open support ticket'],
    semanticHints: [
      'faq',
      'help',
      'support',
      'documentation',
      'docs',
      'ticket',
      'contact',
      'chat',
    ],
    flowVersion: 'support-v1',
    baselineFlowVersion: 'support-v0',
    journeyVerticals: ['support'],
  },
  'multi-vertical-default': {
    ...SHARED_CONTEXTUAL_DEFAULTS,
    projectDomain: 'multi-vertical onboarding',
    businessObjectives: [
      'discover products',
      'add to cart',
      'capture leads',
      'create first resource',
      'explore analytics',
      'manage account',
      'find help',
    ],
    semanticHints: [
      'shop',
      'cart',
      'checkout',
      'contact',
      'demo',
      'dashboard',
      'create',
      'kpi',
      'filter',
      'chart',
      'export',
      'settings',
      'billing',
      'help',
      'faq',
      'docs',
    ],
    flowVersion: 'multi-v1',
    baselineFlowVersion: 'multi-v0',
    journeyVerticals: ['ecommerce', 'saas', 'marketing', 'dashboard', 'support'],
  },
};

function normalizeRoutePath(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return parsed.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  }
}

function getStepSearchText(step?: Step | null): string {
  if (!step) return '';
  const fingerprint = step.targetFingerprint;
  return [
    fingerprint?.textSample,
    fingerprint?.ariaLabel,
    fingerprint?.placeholder,
    fingerprint?.name,
    step.title,
    step.content,
    step.targetSelector,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Match score for stable selectors: compare DOM to fingerprint, not French editorial copy. */
function getStepRuntimeMatchText(step?: Step | null, selector?: string): string {
  if (!step) return '';
  const fingerprint = step.targetFingerprint;
  if (fingerprint && selectorRuntimeQualityScore(selector) >= 60) {
    return [fingerprint.textSample, fingerprint.ariaLabel, fingerprint.placeholder, fingerprint.name]
      .filter(Boolean)
      .join(' ');
  }
  return getStepSearchText(step);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getElementRuntimeSearchText(element: HTMLElement): string {
  return normalizeSearchText(
    [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('value'),
      element.getAttribute('id'),
      element.getAttribute('aria-controls'),
      element.textContent,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function selectorRuntimeQualityScore(selector?: string): number {
  if (!selector) return 0;
  if (selector.includes('[data-tour-id=')) return 96;
  if (selector.includes('[data-testid=')) return 90;
  if (selector.includes('[data-cy=') || selector.includes('[data-qa=')) return 86;
  if (selector.startsWith('#')) return 78;
  if (selector.includes('[aria-label=')) return 68;
  if (selector.includes('[role=')) return 62;
  if (selector.includes(':nth-of-type(') || selector.includes(':nth-child(')) return 22;
  return 45;
}

function isRecoverSelectorTrusted(selector?: string): boolean {
  if (!selector) return false;
  return selectorRuntimeQualityScore(selector) >= 60;
}

function scoreElementForRuntimeFallback(
  element: HTMLElement,
  step: Step | null | undefined,
  preferredText: string,
): number {
  const elementText = getElementRuntimeSearchText(element);
  if (!elementText) return 0;
  const preferred = normalizeSearchText(preferredText);
  const fp = step?.targetFingerprint;
  let score = 0;

  if (preferred) {
    const tokens = preferred.split(' ').filter((token) => token.length >= 3);
    for (const token of tokens) {
      if (elementText.includes(token)) score += token.length >= 6 ? 8 : 4;
    }
  }

  if (fp) {
    if (fp.tagName && element.tagName.toLowerCase() === fp.tagName.toLowerCase()) score += 16;
    const role = (element.getAttribute('role') || '').toLowerCase();
    if (fp.role && role === fp.role.toLowerCase()) score += 14;
    const aria = normalizeSearchText(element.getAttribute('aria-label') || '');
    if (fp.ariaLabel && aria && aria.includes(normalizeSearchText(fp.ariaLabel))) score += 14;
    const sample = normalizeSearchText(fp.textSample || '');
    if (sample) {
      if (elementText.includes(sample)) score += 42;
      else if (elementText.includes(sample.slice(0, Math.min(sample.length, 24)))) score += 28;
    }
    const placeholder = normalizeSearchText(fp.placeholder || '');
    if (placeholder && elementText.includes(placeholder)) score += 32;
    const name = normalizeSearchText(fp.name || '');
    if (name && elementText.includes(name)) score += 24;
  }

  if (element.getAttribute('aria-selected') === 'true') score += 8;
  if (element.getAttribute('data-state') === 'active') score += 8;
  return score;
}

function evaluateRuntimeSemanticMatch(
  element: HTMLElement,
  step: Step | null | undefined,
  preferredText: string,
): { accepted: boolean; score: number } {
  const cacheKey = [
    preferredText,
    step?.targetFingerprint?.tagName ?? '',
    step?.targetFingerprint?.role ?? '',
    step?.targetFingerprint?.ariaLabel ?? '',
    step?.targetFingerprint?.textSample ?? '',
  ].join('|');
  const perElement = runtimeSemanticMatchCache.get(element);
  if (perElement?.has(cacheKey)) {
    return perElement.get(cacheKey)!;
  }

  const hasFingerprintSignals = Boolean(
    step?.targetFingerprint?.tagName ||
      step?.targetFingerprint?.role ||
      step?.targetFingerprint?.ariaLabel ||
      step?.targetFingerprint?.textSample,
  );
  const result = !hasFingerprintSignals
    ? { accepted: true, score: scoreElementForRuntimeFallback(element, step, preferredText) }
    : (() => {
        const score = scoreElementForRuntimeFallback(element, step, preferredText);
        return { accepted: score >= MIN_RUNTIME_FALLBACK_MATCH_SCORE, score };
      })();

  const bucket = perElement ?? new Map<string, { accepted: boolean; score: number }>();
  bucket.set(cacheKey, result);
  runtimeSemanticMatchCache.set(element, bucket);
  return result;
}

function getRuntimeSelectorCandidates(step: Step | null | undefined, healedSelector?: string): string[] {
  const selectors = [healedSelector, step?.targetSelector, ...(step?.selectorAlternatives ?? [])]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
  return Array.from(new Set(selectors));
}

function buildRecoverSelector(element: HTMLElement): string | null {
  const tag = element.tagName.toLowerCase();
  const stableAttrs = ['data-tour-id', 'data-testid', 'data-cy', 'data-qa', 'aria-label', 'name'] as const;
  for (const attr of stableAttrs) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    return `${tag}[${attr}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  }
  if (element.id && typeof CSS !== 'undefined' && CSS.escape) {
    return `#${CSS.escape(element.id)}`;
  }
  const role = element.getAttribute('role');
  if (role) return `${tag}[role="${role.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  return tag;
}

function findElementByStepFingerprint(step: Step | null | undefined, preferredText: string): HTMLElement | null {
  if (!step?.targetFingerprint) return null;
  const fp = step.targetFingerprint;
  const selectors: string[] = [];
  if (fp.tagName && fp.ariaLabel) selectors.push(`${fp.tagName}[aria-label="${fp.ariaLabel.replace(/"/g, '\\"')}"]`);
  if (fp.tagName && fp.role) selectors.push(`${fp.tagName}[role="${fp.role.replace(/"/g, '\\"')}"]`);
  if (fp.tagName) selectors.push(fp.tagName);

  const expectedText = normalizeSearchText(fp.textSample || preferredText || '');
  for (const selector of selectors) {
    const element = findElement(selector, {
      preferredText: expectedText,
      preferActive: true,
      requirePreferredMatch: Boolean(expectedText),
    });
    if (element) return element;
  }
  return null;
}

function findBestRuntimeFallbackElement(
  step: Step | null | undefined,
  preferredText: string,
  scopeRoot?: ParentNode,
): { element: HTMLElement; score: number } | null {
  if (typeof document === 'undefined') return null;
  const root = scopeRoot ?? resolveRuntimeFallbackScopeRoot();
  const candidates = Array.from(root.querySelectorAll(RUNTIME_FALLBACK_SELECTORS)) as HTMLElement[];
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const element of candidates) {
    if (!element.isConnected) continue;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    const score = scoreElementForRuntimeFallback(element, step, preferredText);
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  }
  if (!best || bestScore < MIN_RUNTIME_FALLBACK_MATCH_SCORE) return null;
  return { element: best, score: bestScore };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isActiveInPageNavigationTarget(element: HTMLElement): boolean {
  return (
    element.getAttribute('aria-selected') === 'true' ||
    element.getAttribute('data-state') === 'active' ||
    element.getAttribute('aria-current') === 'page'
  );
}

function isOverlayChromeControl(element: HTMLElement): boolean {
  if (element.closest('[data-trustdev-help-sidebar], [data-trustdev-faq-panel], [data-trustdev-contextual-panel]')) {
    return true;
  }
  if (element.closest('[data-slot="sheet-trigger"], [data-slot="dialog-trigger"], [data-slot="drawer-trigger"]')) {
    return true;
  }
  if (element.getAttribute('aria-haspopup') === 'dialog') {
    return true;
  }
  const label = normalizeSearchText(
    [element.getAttribute('aria-label'), element.textContent].filter(Boolean).join(' '),
  );
  return label.includes('open menu') || label.includes('ouvrir le menu') || label.includes('toggle menu');
}

function activateInPageNavigationForStep(step?: Step | null): boolean {
  if (typeof window === 'undefined' || !step) return false;

  const preferredText = getStepSearchText(step);
  if (!preferredText) return false;

  const target = findElement('[role="tab"], button[aria-controls], a[role="tab"]', {
    preferredText,
    requirePreferredMatch: true,
  });

  if (!target || isOverlayChromeControl(target) || isActiveInPageNavigationTarget(target)) return false;
  if (target.getAttribute('aria-disabled') === 'true' || target.hasAttribute('disabled')) return false;

  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  target.click();
  return true;
}

function isNavigationActivationTarget(element: HTMLElement): boolean {
  const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
  if (anchor) {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return false;
    if (
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      return false;
    }

    try {
      const targetUrl = new URL(href, window.location.href);
      const currentUrl = new URL(window.location.href);
      return (
        targetUrl.href !== currentUrl.href &&
        (targetUrl.pathname !== currentUrl.pathname ||
          targetUrl.search !== currentUrl.search ||
          targetUrl.hash !== currentUrl.hash)
      );
    } catch {
      return true;
    }
  }

  return element.getAttribute('role') === 'link' || element.dataset.trustdevNavigates === 'true';
}

/**
 * Composant haut-niveau qui orchestre tout automatiquement:
 * - Initialise useOnboarding hook
 * - Résout les sélecteurs DOM
 * - Affiche TourRenderer avec tous les composants UI
 * - Gère la navigation tour complète
 * 
 * Usage optimal:
 * ```tsx
 * <TourViewer config={sdkConfig} autoStart={true} />
 * ```
 */
export function TourViewer({
  config,
  autoStart = true,
  debug = false,
  theme,
  showHighlight = true,
  showBeacon = false,
  showTooltip = true,
  tooltipPosition = 'BOTTOM',
  onTourComplete,
  onTourSkipped,
  runtimeBehavior,
  contextualSuggestions = null,
  faq = null,
  hostAvoidSelectors,
}: TourViewerProps) {
  const sdkUiConfig = useMemo(() => {
    try {
      return resolveSDKConfig(config);
    } catch {
      return {
        dockLayout: normalizeSdkDockLayoutConfig(),
        faqDefaults: normalizeSdkFaqDefaults(),
      };
    }
  }, [config]);

  const resolvedFaq = useMemo(() => {
    const merged = mergeTourViewerFaqOptions(sdkUiConfig.faqDefaults, faq);
    if (!merged) return merged;
    return {
      ...merged,
      projectKey: resolveSdkProjectKey({
        projectKey: merged.projectKey,
        flowVersion: contextualSuggestions?.flowVersion,
      }),
    };
  }, [sdkUiConfig.faqDefaults, faq, contextualSuggestions?.flowVersion]);

  const mergedHostAvoidSelectors = useMemo(
    () => resolveInitHostAvoidSelectors(sdkUiConfig.dockLayout, hostAvoidSelectors),
    [sdkUiConfig.dockLayout, hostAvoidSelectors],
  );

  const activeTargetRef = useRef<HTMLElement | null>(null);
  const previewBridgeRef = useRef<{
    selector: string;
    source: Window | null;
    origin: string;
  } | null>(null);

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [resolvePath, setResolvePath] = useState<RuntimeResolvePath | null>(null);
  const [resolveMatchScore, setResolveMatchScore] = useState<number | null>(null);
  const [resolvedSelector, setResolvedSelector] = useState<string | null>(null);
  const activeSelectorForSyncRef = useRef<string>('');
  const attachedStepRuntimeKeyRef = useRef<string | null>(null);
  const softReResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTargetResolutionRef = useRef<(() => void) | null>(null);
  const [currentPathname, setCurrentPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '',
  );
  const [autoNavigatingToRoute, setAutoNavigatingToRoute] = useState<string | null>(null);
  const [navigationClickResumeAt, setNavigationClickResumeAt] = useState(readNavigationClickResumeAt);
  const [helpSidebarOpen, setHelpSidebarOpen] = useState(
    () => resolvedFaq?.presentation === 'sidebar' && resolvedFaq?.startCollapsed === false,
  );
  const lastRouteAutoNavigateKeyRef = useRef<string | null>(null);
  const suppressRouteAutoNavigateUntilRef = useRef(0);
  const targetClickAdvanceInFlightRef = useRef(false);
  const lastTargetAutoScrollKeyRef = useRef<string | null>(null);
  const lastUserScrollIntentAtRef = useRef(0);
  const healedSelectorByStepRef = useRef<Map<string, string>>(new Map());
  const selectorHealsBootstrappedRef = useRef(false);
  const runtimeFeedbackRecorderRef = useRef<
    (event: 'shown' | 'clicked' | 'completed' | 'skipped', selectorOverride?: string) => void
  >(() => undefined);
  const resolveTargetRef = useRef<
    (selector?: string, options?: ResolveOptions) => Promise<HTMLElement | null>
  >(async () => null);
  const debugRef = useRef<{
    info: (message: string, payload?: unknown) => void;
    warn: (message: string, payload?: unknown) => void;
    error: (message: string, payload?: unknown) => void;
  } | null>(null);
  const lastResolutionLogKeyRef = useRef<string | null>(null);
  const tourRef = useRef<UseTourResult | null>(null);
  const isEmbeddedSimulatorPreview =
    typeof window !== 'undefined' &&
    window.self !== window.top &&
    new URLSearchParams(window.location.search).get('__trustdev_simulator_preview') === '1';
  const previewHostSuffixes = runtimeBehavior?.previewHostSuffixes ?? ['tunnelmole.net'];
  const detectPreviewIframe = runtimeBehavior?.detectPreviewIframe ?? true;
  const isRuntimePreviewIframe =
    typeof window !== 'undefined' &&
    detectPreviewIframe &&
    window.self !== window.top &&
    previewHostSuffixes.some((suffix) => window.location.hostname.endsWith(suffix));
  const isPreviewRuntime = isEmbeddedSimulatorPreview || isRuntimePreviewIframe;
  const shouldHideTourUiInPreview = runtimeBehavior?.hideTourUiInPreview ?? true;
  const shouldDisableAutoStartInPreview = runtimeBehavior?.disableAutoStartInPreview ?? true;
  const effectiveAutoStart = isPreviewRuntime && shouldDisableAutoStartInPreview ? false : autoStart;
  const isNavigationClickSuspended =
    typeof window !== 'undefined' && navigationClickResumeAt > Date.now();
  const shouldTemporarilyHideTourUi = isNavigationClickSuspended;
  const effectiveShowHighlight =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showHighlight;
  const effectiveShowBeacon =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showBeacon;
  const effectiveShowTooltip =
    shouldTemporarilyHideTourUi || (isPreviewRuntime && shouldHideTourUiInPreview) ? false : showTooltip;

  const onboarding = useOnboarding({
    config,
    autoStart: effectiveAutoStart,
    debug,
    activeFlowVersion: contextualSuggestions?.flowVersion,
  });

  resolveTargetRef.current = onboarding.resolver.resolveTarget;
  debugRef.current = onboarding.debug;
  tourRef.current = onboarding.tour;

  useEffect(() => {
    if (selectorHealsBootstrappedRef.current) return;
    selectorHealsBootstrappedRef.current = true;
    const heals = loadSelectorHealsMemory();
    for (const [key, value] of Object.entries(heals)) {
      if (value?.selector) healedSelectorByStepRef.current.set(key, value.selector);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const resumeAt = readNavigationClickResumeAt();
    if (resumeAt <= Date.now()) {
      writeNavigationClickResumeAt(0);
      setNavigationClickResumeAt(0);
      return;
    }

    setNavigationClickResumeAt(resumeAt);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (navigationClickResumeAt <= Date.now()) return;

    const timer = window.setTimeout(() => {
      writeNavigationClickResumeAt(0);
      setNavigationClickResumeAt(0);
    }, navigationClickResumeAt - Date.now());

    return () => window.clearTimeout(timer);
  }, [navigationClickResumeAt]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const markUserScrollIntent = () => {
      lastUserScrollIntentAtRef.current = Date.now();
    };
    const markKeyboardScrollIntent = (event: KeyboardEvent) => {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'PageDown' ||
        event.key === 'PageUp' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' '
      ) {
        markUserScrollIntent();
      }
    };

    window.addEventListener('wheel', markUserScrollIntent, { passive: true, capture: true });
    window.addEventListener('touchmove', markUserScrollIntent, { passive: true, capture: true });
    window.addEventListener('keydown', markKeyboardScrollIntent, { capture: true });
    return () => {
      window.removeEventListener('wheel', markUserScrollIntent, true);
      window.removeEventListener('touchmove', markUserScrollIntent, true);
      window.removeEventListener('keydown', markKeyboardScrollIntent, true);
    };
  }, []);

  const navigateToStepRoute = useCallback((rawRoute?: string): boolean => {
    if (typeof window === 'undefined') return false;
    const normalizedTargetRoute = normalizeRoutePath(rawRoute);
    if (!normalizedTargetRoute) return false;

    const normalizedCurrentRoute = normalizeRoutePath(window.location.pathname);
    if (normalizedTargetRoute === normalizedCurrentRoute) return false;

    setAutoNavigatingToRoute(normalizedTargetRoute);
    const targetUrl = `${window.location.origin}${normalizedTargetRoute}`;
    window.location.assign(targetUrl);
    return true;
  }, []);

  const syncTargetRect = useCallback(() => {
    const el = activeTargetRef.current;
    if (!el) return;
    const domRect = el.getBoundingClientRect();
    const nextRect: TargetRect = {
      // Tooltip/overlay are fixed-position layers, so keep viewport coordinates.
      top: domRect.top,
      left: domRect.left,
      width: domRect.width,
      height: domRect.height,
    };
    setTargetRect((prev) => (areRectsClose(prev, nextRect) ? prev : nextRect));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updatePath = () => {
      setCurrentPathname(window.location.pathname);
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      updatePath();
    };
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      updatePath();
    };

    window.addEventListener('popstate', updatePath);
    window.addEventListener('hashchange', updatePath);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', updatePath);
      window.removeEventListener('hashchange', updatePath);
    };
  }, []);

  useEffect(() => {
    const resetMode = runtimeBehavior?.resetProgressOnMount ?? 'never';
    if (resetMode === 'never') return;
    if (resetMode === 'non-preview' && isPreviewRuntime) return;

    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('trustdev_sdk_progress:')) {
          window.localStorage.removeItem(key);
        }
      }
      window.sessionStorage.removeItem('__trustdev_active_tour_session_v1');
    } catch {
      // Ignore storage access errors.
    }
  }, [runtimeBehavior?.resetProgressOnMount, isPreviewRuntime]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sendTargetRect = () => {
      const bridge = previewBridgeRef.current;
      if (!bridge?.source || !bridge.selector) return;

      const target = document.querySelector(bridge.selector) as HTMLElement | null;
      const rect = target?.getBoundingClientRect();
      bridge.source.postMessage(
        {
          type: 'TRUSTDEV_PREVIEW_TARGET_RECT',
          selector: bridge.selector,
          href: window.location.href,
          rect: rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null,
        },
        bridge.origin,
      );
    };

    let rafId: number | null = null;
    const scheduleSend = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        sendTargetRect();
      });
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; selector?: string } | null;
      if (!data || data.type !== 'TRUSTDEV_PREVIEW_REQUEST_TARGET' || !data.selector) {
        return;
      }

      previewBridgeRef.current = {
        selector: data.selector,
        source: event.source as Window | null,
        origin: event.origin || '*',
      };
      scheduleSend();
    };

    const onViewportChange = () => {
      if (!previewBridgeRef.current) return;
      scheduleSend();
    };

    const observer = new MutationObserver(onViewportChange);
    if (document.body) {
      observer.observe(document.body, { subtree: true, childList: true });
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };
  }, [isPreviewRuntime]);

  const expectedStepRoute = normalizeRoutePath(onboarding.tour.currentStep?.stepTargetUrl);
  const normalizedCurrentRoute = normalizeRoutePath(currentPathname);
  const routeMismatch = Boolean(expectedStepRoute) && expectedStepRoute !== normalizedCurrentRoute;
  const stepResolutionKey = useMemo(() => {
    const step = onboarding.tour.currentStep;
    return [
      onboarding.tour.isOpen ? 'open' : 'closed',
      onboarding.activeTour?.id ?? 'unknown',
      onboarding.tour.currentStepIndex,
      step?.targetSelector ?? '',
      step?.selectorAlternatives?.join('|') ?? '',
      step?.targetFingerprint?.textSample ?? '',
      step?.targetFingerprint?.tagName ?? '',
      step?.targetFingerprint?.role ?? '',
      step?.targetFingerprint?.ariaLabel ?? '',
      step?.action ?? '',
      step?.title ?? '',
      step?.content ?? '',
      routeMismatch ? 'route-mismatch' : 'route-ok',
    ].join('|');
  }, [
    onboarding.activeTour?.id,
    onboarding.tour.currentStep?.action,
    onboarding.tour.currentStep?.content,
    onboarding.tour.currentStep?.selectorAlternatives?.join('|'),
    onboarding.tour.currentStep?.targetFingerprint?.ariaLabel,
    onboarding.tour.currentStep?.targetFingerprint?.role,
    onboarding.tour.currentStep?.targetFingerprint?.tagName,
    onboarding.tour.currentStep?.targetFingerprint?.textSample,
    onboarding.tour.currentStep?.targetSelector,
    onboarding.tour.currentStep?.title,
    onboarding.tour.currentStepIndex,
    onboarding.tour.isOpen,
    routeMismatch,
  ]);
  const isAutoNavigating = Boolean(autoNavigatingToRoute) && routeMismatch;

  useEffect(() => {
    if (!autoNavigatingToRoute) return;
    if (normalizedCurrentRoute === autoNavigatingToRoute) {
      setAutoNavigatingToRoute(null);
    }
  }, [autoNavigatingToRoute, normalizedCurrentRoute]);

  useEffect(() => {
    if (!autoNavigatingToRoute) return;
    const timer = window.setTimeout(() => {
      setAutoNavigatingToRoute(null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoNavigatingToRoute]);

  useEffect(() => {
    if (!onboarding.tour.isOpen || !routeMismatch || !expectedStepRoute) return;
    if (autoNavigatingToRoute === expectedStepRoute) return;
    if (shouldTemporarilyHideTourUi) return;
    if (Date.now() < suppressRouteAutoNavigateUntilRef.current) return;

    const stepKey = [
      onboarding.activeTour?.id ?? 'unknown',
      onboarding.tour.currentStepIndex,
      normalizedCurrentRoute,
      expectedStepRoute,
    ].join('|');
    if (lastRouteAutoNavigateKeyRef.current === stepKey) return;

    lastRouteAutoNavigateKeyRef.current = stepKey;
    navigateToStepRoute(expectedStepRoute);
  }, [
    autoNavigatingToRoute,
    expectedStepRoute,
    navigateToStepRoute,
    normalizedCurrentRoute,
    onboarding.activeTour?.id,
    onboarding.tour.currentStepIndex,
    onboarding.tour.isOpen,
    routeMismatch,
    shouldTemporarilyHideTourUi,
  ]);

  useEffect(() => {
    if (!onboarding.tour.isOpen) {
      lastRouteAutoNavigateKeyRef.current = null;
      lastResolutionLogKeyRef.current = null;
      attachedStepRuntimeKeyRef.current = null;
      activeSelectorForSyncRef.current = '';
    }
  }, [onboarding.tour.isOpen]);

  const advanceAfterTargetActivation = useCallback((targetEl?: HTMLElement | null) => {
    if (targetClickAdvanceInFlightRef.current) return;
    targetClickAdvanceInFlightRef.current = true;
    runtimeFeedbackRecorderRef.current('clicked');

    const tourState = tourRef.current;
    if (!tourState) return;
    const isLast = tourState.currentStepIndex >= tourState.steps.length - 1;
    const isNavigationTarget = targetEl ? isNavigationActivationTarget(targetEl) : false;

    if (isNavigationTarget) {
      const resumeAt = Date.now() + NAVIGATION_CLICK_RESUME_DELAY_MS;
      writeNavigationClickResumeAt(resumeAt);
      setNavigationClickResumeAt(resumeAt);
      suppressRouteAutoNavigateUntilRef.current = resumeAt + 500;

      if (isLast) {
        runtimeFeedbackRecorderRef.current('completed');
        tourState.completeTour();
        onTourComplete?.(onboarding.activeTour?.id);
      } else {
        tourState.nextStep();
      }

      window.setTimeout(() => {
        targetClickAdvanceInFlightRef.current = false;
      }, 900);
      return;
    }

    suppressRouteAutoNavigateUntilRef.current = Date.now() + 2500;
    if (isLast) {
      runtimeFeedbackRecorderRef.current('completed');
      tourState.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      const nextStep = tourState.steps[tourState.currentStepIndex + 1];
      tourState.nextStep();

      window.setTimeout(() => {
        navigateToStepRoute(nextStep?.stepTargetUrl);
      }, 250);
    }

    window.setTimeout(() => {
      targetClickAdvanceInFlightRef.current = false;
    }, 900);
  }, [navigateToStepRoute, onTourComplete, onboarding.activeTour?.id]);

  // Résoudre le sélecteur de la step courante
  useEffect(() => {
    const currentStep = onboarding.tour.currentStep;
    const currentSelector = currentStep?.targetSelector;
    const currentStepSearchText = getStepSearchText(currentStep);
    const pageHash = getPageUrlHash();
    const stepRuntimeKey = [
      onboarding.activeTour?.id ?? 'unknown',
      onboarding.tour.currentStepIndex,
      currentSelector ?? '',
      pageHash,
    ].join('|');
    const persistedHeals = loadSelectorHealsMemory();
    const healedSelector =
      healedSelectorByStepRef.current.get(stepRuntimeKey) || persistedHeals[stepRuntimeKey]?.selector || undefined;
    const selectorCandidates = getRuntimeSelectorCandidates(currentStep, healedSelector);
    if (!onboarding.tour.isOpen || routeMismatch || selectorCandidates.length === 0) {
      activeTargetRef.current = null;
      attachedStepRuntimeKeyRef.current = null;
      activeSelectorForSyncRef.current = '';
      setTargetRect(null);
      setTargetNotFound(false);
      setResolvePath(null);
      setResolveMatchScore(null);
      setResolvedSelector(null);
      return;
    }

    let cancelled = false;
    let raf1: number | null = null;
    let raf2: number | null = null;
    let syncRaf: number | null = null;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTargetRectSyncAt = 0;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let targetClickCleanup: (() => void) | null = null;
    let activeSelectorForSync = selectorCandidates[0];
    const domSignature = getLightDomSignature();

    const scheduleTargetRectSync = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (syncRaf !== null || syncTimer !== null) return;

      const minInterval =
        typeof document !== 'undefined' && document.hidden
          ? TARGET_RECT_HIDDEN_INTERVAL_MS
          : TARGET_RECT_MIN_INTERVAL_MS;
      const elapsed = Date.now() - lastTargetRectSyncAt;
      const delay = Math.max(0, minInterval - elapsed);

      const runSync = () => {
        syncRaf = window.requestAnimationFrame(() => {
          syncRaf = null;
          if (cancelled) return;
          lastTargetRectSyncAt = Date.now();

          const currentTarget = activeTargetRef.current;
          if (!currentTarget?.isConnected) {
            const selector = activeSelectorForSyncRef.current;
            if (selector) {
              const replacement = findElement(selector, {
                preferredText: currentStepSearchText,
                preferActive: true,
              });
              if (replacement?.isConnected) {
                activeTargetRef.current = replacement;
                syncTargetRect();
                return;
              }
            }

            if (softReResolveTimerRef.current !== null) return;
            softReResolveTimerRef.current = setTimeout(() => {
              softReResolveTimerRef.current = null;
              if (cancelled) return;
              runTargetResolutionRef.current?.();
            }, 280);
            return;
          }

          // Keep tracking the attached node while it stays connected. Ambiguous
          // selectors (e.g. `main h1`) can make findElement return a different
          // sibling on each query — that must not trigger a full re-resolution loop.
          syncTargetRect();
        });
      };

      if (delay > 0) {
        syncTimer = setTimeout(() => {
          syncTimer = null;
          runSync();
        }, delay);
      } else {
        runSync();
      }
    };

    const attachResolvedTarget = (
      targetEl: HTMLElement,
      resolvedSelector: string,
      resolvedPath: RuntimeResolvePath,
      resolvedMatchScore: number | null,
    ) => {
      activeSelectorForSync = resolvedSelector || activeSelectorForSync;
      activeSelectorForSyncRef.current = activeSelectorForSync;
      attachedStepRuntimeKeyRef.current = stepRuntimeKey;
      if (
        resolvedSelector &&
        resolvedSelector !== currentSelector &&
        isRecoverSelectorTrusted(resolvedSelector)
      ) {
        healedSelectorByStepRef.current.set(stepRuntimeKey, resolvedSelector);
        writeSelectorHeal(stepRuntimeKey, resolvedSelector, pageHash);
      }
      activeTargetRef.current = targetEl;
      const domRect = targetEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const isOutOfViewport =
        domRect.bottom < 0 ||
        domRect.top > viewportHeight ||
        domRect.right < 0 ||
        domRect.left > viewportWidth;
      const stepAutoScrollKey = [
        onboarding.activeTour?.id ?? 'unknown',
        onboarding.tour.currentStepIndex,
        resolvedSelector,
      ].join('|');
      const userScrolledRecently = Date.now() - lastUserScrollIntentAtRef.current < 1500;
      const canAutoScrollTarget =
        isOutOfViewport &&
        !userScrolledRecently &&
        lastTargetAutoScrollKeyRef.current !== stepAutoScrollKey;

      if (canAutoScrollTarget) {
        lastTargetAutoScrollKeyRef.current = stepAutoScrollKey;
        targetEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
        raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            if (!cancelled) syncTargetRect();
          });
        });
      } else {
        const nextRect: TargetRect = {
          top: domRect.top,
          left: domRect.left,
          width: domRect.width,
          height: domRect.height,
        };
        setTargetRect((prev) => (areRectsClose(prev, nextRect) ? prev : nextRect));
      }

      window.addEventListener('scroll', scheduleTargetRectSync, { capture: true, passive: true });
      document.addEventListener('scroll', scheduleTargetRectSync, { capture: true, passive: true });
      window.addEventListener('resize', scheduleTargetRectSync);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(scheduleTargetRectSync);
        resizeObserver.observe(targetEl);
      }
      observer = new MutationObserver(() => {
        scheduleTargetRectSync();
      });
      observer.observe(targetEl, {
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
      });
      let layoutParent = targetEl.parentElement;
      let layoutDepth = 0;
      while (layoutParent && layoutDepth < 3) {
        observer.observe(layoutParent, {
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
        layoutParent = layoutParent.parentElement;
        layoutDepth += 1;
      }

      if (currentStep?.action === 'CLICK') {
        const handleTargetClick = () => {
          advanceAfterTargetActivation(targetEl);
        };
        targetEl.addEventListener('click', handleTargetClick);
        targetClickCleanup = () => {
          targetEl.removeEventListener('click', handleTargetClick);
        };
      }

      rememberRuntimeResolution(stepRuntimeKey, {
        domSignature,
        resolvedSelector: resolvedSelector || selectorCandidates[0],
        resolvedPath,
        matchScore: resolvedMatchScore,
      });

      setTargetNotFound(false);
      setResolvePath((previous) => (previous === resolvedPath ? previous : resolvedPath));
      setResolveMatchScore((previous) => (previous === resolvedMatchScore ? previous : resolvedMatchScore));
      setResolvedSelector((previous) => (previous === resolvedSelector ? previous : resolvedSelector));
      if (lastResolutionLogKeyRef.current !== stepRuntimeKey) {
        lastResolutionLogKeyRef.current = stepRuntimeKey;
        debugRef.current?.info('Runtime fallback resolution', {
          resolvePath: resolvedPath,
          matchScore: resolvedMatchScore,
          lowConfidenceMatch:
            typeof resolvedMatchScore === 'number' && resolvedMatchScore < LOW_CONFIDENCE_RUNTIME_MATCH_SCORE,
          selector: resolvedSelector,
          stepRuntimeKey,
          cacheHit: false,
        });
      }
    };

    const resolveSelector = async () => {
      try {
        let targetEl: HTMLElement | null = null;
        let resolvedSelector = selectorCandidates[0];
        let resolvedPath: RuntimeResolvePath = 'not-found';
        let resolvedMatchScore: number | null = null;

        const cachedResolution = runtimeResolutionCache.get(stepRuntimeKey);
        if (
          cachedResolution &&
          cachedResolution.domSignature === domSignature &&
          cachedResolution.resolvedPath !== 'not-found'
        ) {
          const cachedTarget = findElement(cachedResolution.resolvedSelector, {
            preferredText: currentStepSearchText,
            preferActive: true,
          });
          if (cachedTarget) {
            const semanticMatch = evaluateRuntimeSemanticMatch(
              cachedTarget,
              currentStep,
              getStepRuntimeMatchText(currentStep, cachedResolution.resolvedSelector),
            );
            if (semanticMatch.accepted) {
              targetEl = cachedTarget;
              resolvedSelector = cachedResolution.resolvedSelector;
              resolvedPath = cachedResolution.resolvedPath;
              resolvedMatchScore = cachedResolution.matchScore;
            }
          }
        }

        if (!targetEl) {
          const activatedInPageNavigation = activateInPageNavigationForStep(currentStep);
          if (activatedInPageNavigation) {
            await wait(180);
            if (cancelled) return;
          }

          const tryResolveSelector = async (
          selector: string,
          retries: number,
          intervalMs: number,
          ): Promise<HTMLElement | null> => {
            return resolveTargetRef.current(selector, {
              retries,
              intervalMs,
              preferredText: currentStepSearchText,
              preferActive: true,
            });
          };

          for (let i = 0; i < selectorCandidates.length; i += 1) {
            const selector = selectorCandidates[i];
            const resolved = await tryResolveSelector(selector, i === 0 ? 8 : 3, i === 0 ? 250 : 180);
            if (!resolved) continue;
            const semanticMatch = evaluateRuntimeSemanticMatch(
              resolved,
              currentStep,
              getStepRuntimeMatchText(currentStep, selector),
            );
            if (!semanticMatch.accepted) {
              if (selector === healedSelector) {
                healedSelectorByStepRef.current.delete(stepRuntimeKey);
                removeSelectorHeal(stepRuntimeKey);
              }
              continue;
            }
            targetEl = resolved;
            resolvedSelector = selector;
            resolvedPath = i === 0 ? 'primary' : 'alternative';
            resolvedMatchScore = semanticMatch.score;
            break;
          }

          if (!targetEl) {
            const fingerprintTarget = findElementByStepFingerprint(currentStep, currentStepSearchText);
            if (fingerprintTarget) {
              const semanticMatch = evaluateRuntimeSemanticMatch(
                fingerprintTarget,
                currentStep,
                getStepRuntimeMatchText(currentStep, buildRecoverSelector(fingerprintTarget) ?? undefined),
              );
              if (semanticMatch.accepted) {
                targetEl = fingerprintTarget;
                resolvedSelector = buildRecoverSelector(fingerprintTarget) ?? selectorCandidates[0];
                resolvedPath = 'fingerprint';
                resolvedMatchScore = semanticMatch.score;
              }
            }
          }

          if (!targetEl && currentStepSearchText) {
            const semanticFallback = findBestRuntimeFallbackElement(
              currentStep,
              currentStepSearchText,
              resolveRuntimeFallbackScopeRoot(),
            );
            if (semanticFallback) {
              targetEl = semanticFallback.element;
              resolvedSelector = buildRecoverSelector(semanticFallback.element) ?? selectorCandidates[0];
              resolvedPath = 'semantic-fallback';
              resolvedMatchScore = semanticFallback.score;
            }
          }
        }

        if (cancelled) return;

        if (targetEl) {
          attachResolvedTarget(targetEl, resolvedSelector, resolvedPath, resolvedMatchScore);
        } else {
          activeTargetRef.current = null;
          setTargetRect(null);
          setTargetNotFound(true);
          setResolvePath('not-found');
          setResolveMatchScore(null);
          setResolvedSelector(null);
          debugRef.current?.warn('Runtime fallback failed to resolve target', {
            stepRuntimeKey,
            selectorCandidates,
          });
        }
      } catch (error) {
        debugRef.current?.error('Failed to resolve target', { error });
        activeTargetRef.current = null;
        setTargetRect(null);
        setTargetNotFound(true);
        setResolvePath('not-found');
        setResolveMatchScore(null);
        setResolvedSelector(null);
      }
    };

    runTargetResolutionRef.current = () => {
      if (cancelled) return;
      void resolveSelector();
    };

    void resolveSelector();

    return () => {
      runTargetResolutionRef.current = null;
      cancelled = true;
      activeTargetRef.current = null;
      attachedStepRuntimeKeyRef.current = null;
      if (softReResolveTimerRef.current !== null) {
        clearTimeout(softReResolveTimerRef.current);
        softReResolveTimerRef.current = null;
      }
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      if (syncRaf !== null) window.cancelAnimationFrame(syncRaf);
      if (syncTimer !== null) clearTimeout(syncTimer);
      if (observer) observer.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      if (targetClickCleanup) targetClickCleanup();
      window.removeEventListener('scroll', scheduleTargetRectSync, true);
      document.removeEventListener('scroll', scheduleTargetRectSync, true);
      window.removeEventListener('resize', scheduleTargetRectSync);
    };
  }, [stepResolutionKey, syncTargetRect, advanceAfterTargetActivation]);

  const resolvedContextualSuggestions = useMemo(() => {
    if (!contextualSuggestions) return null;
    const presetName = contextualSuggestions.preset;
    const preset = presetName ? CONTEXTUAL_SUGGESTIONS_PRESETS[presetName] ?? {} : {};
    const withPreset = {
      ...preset,
      ...contextualSuggestions,
      noiseSelectors: contextualSuggestions.noiseSelectors ?? preset.noiseSelectors,
      businessObjectives: contextualSuggestions.businessObjectives ?? preset.businessObjectives,
      semanticHints: contextualSuggestions.semanticHints ?? preset.semanticHints,
    };
    return resolveContextualTourViewerOptions(config, withPreset, { debug });
  }, [config, contextualSuggestions, debug]);

  const activeTourIntent = (() => {
    const meta = onboarding.activeTour?.triggerConditions as
      | { contextualEngine?: { intent?: string } }
      | undefined;
    return toTourDraftIntent(meta?.contextualEngine?.intent);
  })();
  // Blueprint origin marker propagated through `triggerConditions.contextualEngine.blueprintId`.
  // When present, runtime feedback events are also aggregated per blueprintId
  // via `blueprintFeedbackBoost`, so the resolver can de-prioritize blueprints
  // that historically underperform on end users.
  const activeTourBlueprintId = (() => {
    const meta = onboarding.activeTour?.triggerConditions as
      | { contextualEngine?: { blueprintId?: string } }
      | undefined;
    return meta?.contextualEngine?.blueprintId;
  })();
  const isContextualTour = activeTourIntent !== null;
  // Strict opt-in: runtime feedback recording is OFF by default. The host app
  // must explicitly set `contextualSuggestions.feedbackEnabled: true` (or use a
  // preset that does, e.g. 'ecommerce-default'). End-users in production who
  // do not configure contextualSuggestions never trigger any local storage
  // writes, preventing silent pollution of feedback counters.
  const runtimeFeedbackEnabled =
    isContextualTour &&
    isPreviewRuntime === false &&
    resolvedContextualSuggestions?.feedbackEnabled === true;

  const isTourActive = onboarding.tour.isOpen;
  const isSdkChromeSuspendedDuringTour = isTourActive;

  useEffect(() => {
    if (isSdkChromeSuspendedDuringTour) {
      setHelpSidebarOpen((open) => (open ? false : open));
    }
  }, [isSdkChromeSuspendedDuringTour]);

  const dockLayout = useSdkDockLayout({
    dockLayoutEnabled: sdkUiConfig.dockLayout.enabled,
    hostAvoidSelectors: mergedHostAvoidSelectors,
    helpAvoidSelectors: resolvedFaq?.avoidSelectors,
    contextualAvoidSelectors: resolvedContextualSuggestions?.avoidSelectors,
    helpPreferredSide: resolvedFaq?.side ?? 'right',
    contextualPreferredSide: resolvedContextualSuggestions?.dockSide ?? 'right',
    minClearancePx:
      resolvedFaq?.minDockClearancePx ??
      resolvedContextualSuggestions?.minDockClearancePx ??
      sdkUiConfig.dockLayout.minClearancePx,
    helpEnabled: Boolean(
      resolvedFaq && resolvedFaq.enabled !== false && !isSdkChromeSuspendedDuringTour,
    ),
    contextualEnabled: Boolean(
      resolvedContextualSuggestions && !isSdkChromeSuspendedDuringTour,
    ),
    helpSidebarOpen: Boolean(
      resolvedFaq &&
        resolvedFaq.enabled !== false &&
        resolvedFaq.presentation === 'sidebar' &&
        helpSidebarOpen &&
        !isSdkChromeSuspendedDuringTour,
    ),
  });

  const recordRuntimeFeedback = useCallback(
    (event: 'shown' | 'clicked' | 'completed' | 'skipped', selectorOverride?: string) => {
      if (!runtimeFeedbackEnabled || !activeTourIntent) return;
      const selector =
        selectorOverride ?? onboarding.tour.currentStep?.targetSelector ?? undefined;
      recordTourSuggestionFeedback({
        selector,
        intent: activeTourIntent,
        event,
        blueprintId: activeTourBlueprintId,
      });
      enqueueContextualFeedback({
        selector,
        intent: activeTourIntent,
        event,
        targetUrl: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
    },
    [
      runtimeFeedbackEnabled,
      activeTourIntent,
      activeTourBlueprintId,
      onboarding.tour.currentStep?.targetSelector,
    ],
  );

  useEffect(() => {
    runtimeFeedbackRecorderRef.current = recordRuntimeFeedback;
  }, [recordRuntimeFeedback]);

  const lastShownKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runtimeFeedbackEnabled) return;
    if (!onboarding.tour.isOpen || !onboarding.tour.currentStep) return;
    if (shouldTemporarilyHideTourUi) return;
    if (routeMismatch || targetNotFound || !targetRect) return;

    const tourId = onboarding.activeTour?.id ?? 'unknown';
    const stepKey = `${tourId}|${onboarding.tour.currentStepIndex}|${onboarding.tour.currentStep.targetSelector ?? ''}`;
    if (lastShownKeyRef.current === stepKey) return;
    lastShownKeyRef.current = stepKey;
    recordRuntimeFeedback('shown');
  }, [
    runtimeFeedbackEnabled,
    onboarding.tour.isOpen,
    onboarding.tour.currentStepIndex,
    onboarding.tour.currentStep?.targetSelector,
    onboarding.activeTour?.id,
    routeMismatch,
    shouldTemporarilyHideTourUi,
    targetNotFound,
    targetRect,
    recordRuntimeFeedback,
  ]);

  useEffect(() => {
    if (!onboarding.tour.isOpen) {
      lastShownKeyRef.current = null;
    }
  }, [onboarding.tour.isOpen]);

  const handleNext = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (isLast) {
      recordRuntimeFeedback('clicked');
      recordRuntimeFeedback('completed');
      onboarding.tour.completeTour();
      onTourComplete?.(onboarding.activeTour?.id);
    } else {
      recordRuntimeFeedback('clicked');
      const nextStep = onboarding.tour.steps[onboarding.tour.currentStepIndex + 1];
      onboarding.tour.nextStep();
      navigateToStepRoute(nextStep?.stepTargetUrl);
    }
  }, [onboarding.tour, onboarding.activeTour?.id, onTourComplete, navigateToStepRoute, recordRuntimeFeedback]);

  const handlePrev = useCallback(() => {
    const prevStep = onboarding.tour.steps[onboarding.tour.currentStepIndex - 1];
    onboarding.tour.prevStep();
    navigateToStepRoute(prevStep?.stepTargetUrl);
  }, [onboarding.tour, navigateToStepRoute]);

  const handleSkip = useCallback(() => {
    recordRuntimeFeedback('skipped');
    onboarding.tour.skipTour();
    onTourSkipped?.(onboarding.activeTour?.id);
  }, [onboarding.tour, onboarding.activeTour?.id, onTourSkipped, recordRuntimeFeedback]);

  const handleClose = useCallback(() => {
    const isLast = onboarding.tour.currentStepIndex >= onboarding.tour.steps.length - 1;
    if (!isLast) {
      recordRuntimeFeedback('skipped');
    }
    onboarding.stop();
  }, [onboarding, recordRuntimeFeedback]);

  return (
    <>
      <TourRenderer
        isOpen={onboarding.tour.isOpen && !shouldTemporarilyHideTourUi}
        currentStep={onboarding.tour.currentStep}
        currentIndex={onboarding.tour.currentStepIndex}
        totalSteps={onboarding.tour.steps.length}
        theme={theme}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onClose={handleClose}
        targetRect={targetRect}
        showHighlight={effectiveShowHighlight}
        showBeacon={effectiveShowBeacon}
        showTooltip={effectiveShowTooltip}
        tooltipPosition={tooltipPosition}
        targetNotFound={!routeMismatch && targetNotFound}
        retryingSelector={onboarding.resolver.isResolving}
        routeMismatch={routeMismatch}
        expectedRoute={expectedStepRoute}
        currentRoute={normalizedCurrentRoute}
        autoNavigating={isAutoNavigating}
        resolvePath={debug ? resolvePath : null}
        resolveMatchScore={debug ? resolveMatchScore : null}
        resolvedSelector={debug ? resolvedSelector : null}
      />
      {resolvedContextualSuggestions && !isSdkChromeSuspendedDuringTour ? (
        <ContextualSuggestionsPublisher
          {...resolvedContextualSuggestions}
          uiMode={resolvedContextualSuggestions.uiMode ?? 'auto'}
          title={resolvedContextualSuggestions.title}
          stableOnly={resolvedContextualSuggestions.stableOnly}
          developerMode={resolvedContextualSuggestions.developerMode ?? debug}
          dockSide={resolvedContextualSuggestions.dockSide ?? 'right'}
          avoidSelectors={dockLayout.avoidSelectors}
          minDockClearancePx={
            resolvedFaq?.minDockClearancePx ??
            resolvedContextualSuggestions.minDockClearancePx ??
            sdkUiConfig.dockLayout.minClearancePx
          }
          resolvedDockSide={dockLayout.contextualSide}
          publishConfig={{
            ...(config ?? {}),
            ...(resolvedContextualSuggestions.publishConfig ?? {}),
          }}
        />
      ) : null}
      {resolvedFaq &&
      resolvedFaq.enabled !== false &&
      !isSdkChromeSuspendedDuringTour ? (
        resolvedFaq.presentation === 'sidebar' ? (
          <HelpSidebar
            {...resolvedFaq}
            enabled
            side={resolvedFaq.side ?? 'right'}
            avoidSelectors={dockLayout.avoidSelectors}
            resolvedDockSide={dockLayout.helpSide}
            contextualSuggestionsEnabled={resolvedFaq.contextualSuggestionsEnabled ?? true}
            pageContext={resolvedFaq.pageContext}
            runtimePageContext={{
              tourId: onboarding.activeTour?.id,
              tourName: onboarding.activeTour?.name,
              tourStepTitle: onboarding.tour.currentStep?.title,
              projectDomain: resolvedContextualSuggestions?.projectDomain,
              flowVersion: resolvedFaq.projectKey,
            }}
            config={{
              ...(config ?? {}),
              ...(resolvedFaq.config ?? {}),
            }}
            onOpenChange={setHelpSidebarOpen}
          />
        ) : (
          <FaqSearchWidget
            {...resolvedFaq}
            enabled
            avoidSelectors={dockLayout.avoidSelectors}
            resolvedDockSide={dockLayout.helpSide}
            config={{
              ...(config ?? {}),
              ...(resolvedFaq.config ?? {}),
            }}
          />
        )
      ) : null}
    </>
  );
}
