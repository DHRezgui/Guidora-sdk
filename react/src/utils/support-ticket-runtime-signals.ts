import type { SupportHelpEpisode, SupportHelpEpisodeTrigger } from '../types/support';

const NAV_HISTORY_MAX = 5;
const FAQ_QUERY_MAX = 200;
const TOUR_ID_MAX = 120;
const TOUR_NAME_MAX = 160;

const SENSITIVE_QUERY_KEY =
  /^(token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth|authorization|api[_-]?key|session|sid|jwt|password|secret|code|sig|signature|state)$/i;

type SupportTicketRuntimeSignals = {
  browser?: string;
  faqSearchCount: number;
  faqLastQuery?: string;
  navigationHistory: string[];
  episode?: SupportHelpEpisode;
  lastCompletedTourId?: string;
  lastCompletedTourName?: string;
};

const state: SupportTicketRuntimeSignals = {
  faqSearchCount: 0,
  navigationHistory: [],
};

const EPISODE_TRIGGERS: ReadonlySet<SupportHelpEpisodeTrigger> = new Set([
  'proactiveToast',
  'manualFaq',
  'tour',
]);

export function mapAssistanceStateToEpisodeTrigger(
  next: string,
): SupportHelpEpisodeTrigger | null {
  if (next === 'proactiveToast') return 'proactiveToast';
  if (next === 'faq') return 'manualFaq';
  if (next === 'tour') return 'tour';
  return null;
}

let navTrackingStarted = false;

/**
 * Keep pathname + safe query/hash routes.
 * Strip secrets (token, jwt, …) but preserve SPA navigations that only change search/hash.
 */
export function sanitizeNavigationUrl(href: string): string | null {
  const raw = href?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : undefined);

    const kept = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (SENSITIVE_QUERY_KEY.test(key)) return;
      if (!value || value.length > 80) return;
      kept.set(key, value);
    });
    const search = kept.toString();

    let hash = '';
    if (url.hash && url.hash.length > 1 && url.hash.length <= 120) {
      const body = url.hash.slice(1);
      if (body.startsWith('/')) {
        // Hash router: keep path only (#/invoices?x=1 → #/invoices)
        hash = `#${body.split('?')[0]}`;
      } else if (!body.includes('=') && !SENSITIVE_QUERY_KEY.test(body)) {
        hash = url.hash;
      }
    }

    return `${url.origin}${url.pathname}${search ? `?${search}` : ''}${hash}`;
  } catch {
    const cleaned = raw.split(/[?#]/)[0]?.trim();
    return cleaned || null;
  }
}

/** Compact UA summary — never send the raw user-agent string. */
export function parseBrowserLabel(userAgent?: string): string | undefined {
  const ua = (userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')).trim();
  if (!ua) return undefined;

  let os = 'Unknown OS';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  let version = '';
  const edge = ua.match(/Edg\/([\d.]+)/i);
  const chrome = ua.match(/Chrome\/([\d.]+)/i);
  const firefox = ua.match(/Firefox\/([\d.]+)/i);
  const safari = ua.match(/Version\/([\d.]+).*Safari/i);

  if (edge) {
    browser = 'Edge';
    version = edge[1].split('.')[0] ?? '';
  } else if (chrome && !/Chromium/i.test(ua)) {
    browser = 'Chrome';
    version = chrome[1].split('.')[0] ?? '';
  } else if (firefox) {
    browser = 'Firefox';
    version = firefox[1].split('.')[0] ?? '';
  } else if (safari) {
    browser = 'Safari';
    version = safari[1].split('.')[0] ?? '';
  }

  return version ? `${browser}/${version} · ${os}` : `${browser} · ${os}`;
}

export function recordSupportNavigation(href?: string | null): void {
  if (typeof window === 'undefined' && !href) return;
  const cleaned = sanitizeNavigationUrl(href ?? window.location.href);
  if (!cleaned) return;
  const last = state.navigationHistory[state.navigationHistory.length - 1];
  if (last === cleaned) return;
  state.navigationHistory = [...state.navigationHistory, cleaned].slice(-NAV_HISTORY_MAX);
}

export function recordSupportFaqSearch(query: string | null | undefined): void {
  const trimmed = (query ?? '').trim().slice(0, FAQ_QUERY_MAX);
  if (!trimmed) return;
  state.faqSearchCount += 1;
  state.faqLastQuery = trimmed;
}

/**
 * Freeze (overwrite) the latest help-episode snapshot when assistance leaves `none`.
 */
export function captureSupportHelpEpisode(input: {
  trigger: SupportHelpEpisodeTrigger;
  frictionAtTrigger?: number;
  riskAtTrigger?: number;
  timeOnPageAtTrigger?: number;
  pageTimeAtTrigger?: number;
  idleSecondsAtTrigger?: number;
  capturedAt?: string;
}): void {
  if (!EPISODE_TRIGGERS.has(input.trigger)) return;
  const clamp01 = (n: number | undefined): number | undefined => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.max(0, Math.min(1, n));
  };
  const clampSec = (n: number | undefined): number | undefined => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    return Math.max(0, Math.floor(n));
  };
  const episode: SupportHelpEpisode = {
    trigger: input.trigger,
    capturedAt: input.capturedAt?.trim() || new Date().toISOString(),
  };
  const friction = clamp01(input.frictionAtTrigger);
  const risk = clamp01(input.riskAtTrigger);
  const timeOnPage = clampSec(input.timeOnPageAtTrigger);
  const pageTime = clampSec(input.pageTimeAtTrigger);
  const idle = clampSec(input.idleSecondsAtTrigger);
  if (friction != null) episode.frictionAtTrigger = friction;
  if (risk != null) episode.riskAtTrigger = risk;
  if (timeOnPage != null) episode.timeOnPageAtTrigger = timeOnPage;
  if (pageTime != null) episode.pageTimeAtTrigger = pageTime;
  if (idle != null) episode.idleSecondsAtTrigger = idle;
  state.episode = episode;
}

export function recordSupportCompletedTour(
  tourId: string | null | undefined,
  tourName?: string | null,
): void {
  const id = (tourId ?? '').trim().slice(0, TOUR_ID_MAX);
  if (!id) return;
  state.lastCompletedTourId = id;
  const name = (tourName ?? '').trim().slice(0, TOUR_NAME_MAX);
  if (name) state.lastCompletedTourName = name;
  else delete state.lastCompletedTourName;
}

/**
 * Lightweight listeners only — do not re-patch history.pushState
 * (TourViewer already patches it; we hook via recordSupportNavigation there).
 */
export function ensureSupportTicketNavTracking(): void {
  if (typeof window === 'undefined' || navTrackingStarted) return;
  navTrackingStarted = true;

  recordSupportNavigation(window.location.href);

  const onNavigate = () => recordSupportNavigation(window.location.href);
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('hashchange', onNavigate);
}

export function getSupportTicketRuntimeSignals(): SupportTicketRuntimeSignals {
  if (typeof window !== 'undefined') {
    ensureSupportTicketNavTracking();
    recordSupportNavigation(window.location.href);
  }
  return {
    browser: parseBrowserLabel(),
    faqSearchCount: state.faqSearchCount,
    faqLastQuery: state.faqLastQuery,
    navigationHistory: [...state.navigationHistory],
    episode: state.episode ? { ...state.episode } : undefined,
    lastCompletedTourId: state.lastCompletedTourId,
    lastCompletedTourName: state.lastCompletedTourName,
  };
}

/** Test helper — resets in-memory counters. */
export function __resetSupportTicketRuntimeSignalsForTests(): void {
  state.faqSearchCount = 0;
  state.faqLastQuery = undefined;
  state.navigationHistory = [];
  state.episode = undefined;
  state.lastCompletedTourId = undefined;
  state.lastCompletedTourName = undefined;
  navTrackingStarted = false;
}
