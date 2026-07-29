import type {
  SupportHelpEpisode,
  SupportHelpEpisodeTrigger,
  SupportTicketSessionContext,
} from '../types/support';
import { sanitizeNavigationUrl } from './support-ticket-runtime-signals';

export type SupportPresentation = 'form' | 'link' | 'none';

const NAV_HISTORY_MAX = 5;
const FAQ_QUERY_MAX = 200;
const BROWSER_LABEL_MAX = 80;
const TOUR_ID_MAX = 120;
const TOUR_NAME_MAX = 160;

const EPISODE_TRIGGERS: ReadonlySet<SupportHelpEpisodeTrigger> = new Set([
  'proactiveToast',
  'manualFaq',
  'tour',
]);

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampSec(n: number): number {
  return Math.max(0, Math.floor(n));
}

function normalizeHelpEpisode(raw: unknown): SupportHelpEpisode | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const input = raw as Partial<SupportHelpEpisode>;
  if (!input.trigger || !EPISODE_TRIGGERS.has(input.trigger)) return undefined;
  const episode: SupportHelpEpisode = {
    trigger: input.trigger,
    capturedAt:
      typeof input.capturedAt === 'string' && input.capturedAt.trim()
        ? input.capturedAt.trim().slice(0, 40)
        : new Date().toISOString(),
  };
  if (typeof input.frictionAtTrigger === 'number' && Number.isFinite(input.frictionAtTrigger)) {
    episode.frictionAtTrigger = clamp01(input.frictionAtTrigger);
  }
  if (typeof input.riskAtTrigger === 'number' && Number.isFinite(input.riskAtTrigger)) {
    episode.riskAtTrigger = clamp01(input.riskAtTrigger);
  }
  if (typeof input.timeOnPageAtTrigger === 'number' && Number.isFinite(input.timeOnPageAtTrigger)) {
    episode.timeOnPageAtTrigger = clampSec(input.timeOnPageAtTrigger);
  }
  if (typeof input.pageTimeAtTrigger === 'number' && Number.isFinite(input.pageTimeAtTrigger)) {
    episode.pageTimeAtTrigger = clampSec(input.pageTimeAtTrigger);
  }
  if (typeof input.idleSecondsAtTrigger === 'number' && Number.isFinite(input.idleSecondsAtTrigger)) {
    episode.idleSecondsAtTrigger = clampSec(input.idleSecondsAtTrigger);
  }
  return episode;
}

export function resolveSupportPresentation(options: {
  supportInlineForm?: boolean;
  supportContactUrl?: string | null;
}): SupportPresentation {
  const hasUrl = Boolean(options.supportContactUrl);
  if (options.supportInlineForm === true || !hasUrl) {
    return 'form';
  }
  return 'link';
}

function normalizeNavigationHistory(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const url = sanitizeNavigationUrl(entry);
    if (!url) continue;
    if (cleaned[cleaned.length - 1] === url) continue;
    cleaned.push(url);
  }
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(-NAV_HISTORY_MAX);
}

export function buildSupportTicketSessionContext(
  input: Partial<SupportTicketSessionContext> = {},
): SupportTicketSessionContext {
  const context: SupportTicketSessionContext = {};

  if (input.pageUrl?.trim()) context.pageUrl = input.pageUrl.trim();
  if (input.sessionId?.trim()) context.sessionId = input.sessionId.trim();
  if (input.projectKey?.trim()) context.projectKey = input.projectKey.trim();
  if (input.assistanceState) context.assistanceState = input.assistanceState;
  if (typeof input.abandonmentRisk === 'number' && Number.isFinite(input.abandonmentRisk)) {
    context.abandonmentRisk = Math.max(0, Math.min(1, input.abandonmentRisk));
  }
  if (typeof input.frictionScore === 'number' && Number.isFinite(input.frictionScore)) {
    context.frictionScore = Math.max(0, Math.min(1, input.frictionScore));
  }
  if (typeof input.timeOnPage === 'number' && Number.isFinite(input.timeOnPage)) {
    context.timeOnPage = Math.max(0, Math.floor(input.timeOnPage));
  }
  if (typeof input.pageTime === 'number' && Number.isFinite(input.pageTime)) {
    context.pageTime = Math.max(0, Math.floor(input.pageTime));
  }
  if (input.contactEmail?.trim()) context.contactEmail = input.contactEmail.trim();
  if (input.supportBrand && typeof input.supportBrand === 'object') {
    const brand: NonNullable<SupportTicketSessionContext['supportBrand']> = {};
    const raw = input.supportBrand;
    if (raw.productName?.trim()) brand.productName = raw.productName.trim();
    if (raw.supportLabel?.trim()) brand.supportLabel = raw.supportLabel.trim();
    if (raw.fromDisplayName?.trim()) brand.fromDisplayName = raw.fromDisplayName.trim();
    if (raw.accentColor?.trim()) brand.accentColor = raw.accentColor.trim();
    if (raw.accentColorTo?.trim()) brand.accentColorTo = raw.accentColorTo.trim();
    if (raw.logoUrl?.trim()) brand.logoUrl = raw.logoUrl.trim();
    if (raw.monogram?.trim()) brand.monogram = raw.monogram.trim();
    if (Object.keys(brand).length) context.supportBrand = brand;
  }

  if (input.browser?.trim()) {
    context.browser = input.browser.trim().slice(0, BROWSER_LABEL_MAX);
  }
  if (typeof input.faqSearchCount === 'number' && Number.isFinite(input.faqSearchCount)) {
    context.faqSearchCount = Math.max(0, Math.floor(input.faqSearchCount));
  }
  if (input.faqLastQuery?.trim()) {
    context.faqLastQuery = input.faqLastQuery.trim().slice(0, FAQ_QUERY_MAX);
  }
  if (input.activeTourId === null) {
    context.activeTourId = null;
  } else if (typeof input.activeTourId === 'string' && input.activeTourId.trim()) {
    context.activeTourId = input.activeTourId.trim();
  }
  if (input.activeTourStep === null) {
    context.activeTourStep = null;
  } else if (typeof input.activeTourStep === 'number' && Number.isFinite(input.activeTourStep)) {
    context.activeTourStep = Math.max(0, Math.floor(input.activeTourStep));
  }
  const navigationHistory = normalizeNavigationHistory(input.navigationHistory);
  if (navigationHistory) context.navigationHistory = navigationHistory;

  if (input.lastCompletedTourId?.trim()) {
    context.lastCompletedTourId = input.lastCompletedTourId.trim().slice(0, TOUR_ID_MAX);
  }
  if (input.lastCompletedTourName?.trim()) {
    context.lastCompletedTourName = input.lastCompletedTourName.trim().slice(0, TOUR_NAME_MAX);
  }

  const episode = normalizeHelpEpisode(input.episode);
  if (episode) context.episode = episode;

  return context;
}
