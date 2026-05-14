import { sdkApiClient } from '../core/api-client';
import {
  ContextualFeedbackEventInput,
  ContextualFeedbackEventType,
  NormalizedSDKConfig,
  TourDraftIntent,
} from '../types';

type QueuedEvent = ContextualFeedbackEventInput;

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_MAX_BATCH = 100;
const MAX_QUEUE_SIZE = 500;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentConfig: NormalizedSDKConfig | null = null;
let pageHideHookInstalled = false;

function ensurePageHideHook(): void {
  if (pageHideHookInstalled || typeof window === 'undefined') return;
  pageHideHookInstalled = true;

  const onLeave = () => {
    if (queue.length === 0 || !currentConfig) return;
    const batch = queue.splice(0, FLUSH_MAX_BATCH);
    try {
      sdkApiClient.submitContextualFeedbackKeepalive(currentConfig, { events: batch });
    } catch {
      // Best-effort on unload; failures are ignored.
    }
  };

  window.addEventListener('pagehide', onLeave);
  window.addEventListener('beforeunload', onLeave);
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushFeedbackQueue();
  }, FLUSH_INTERVAL_MS);
}

export function setContextualFeedbackConfig(config: NormalizedSDKConfig | null): void {
  currentConfig = config;
  if (config) ensurePageHideHook();
}

export function enqueueContextualFeedback(input: {
  targetUrl?: string;
  selector?: string;
  intent: TourDraftIntent;
  event: ContextualFeedbackEventType;
}): void {
  if (!currentConfig) return;
  const targetUrl =
    input.targetUrl ?? (typeof window !== 'undefined' ? window.location.pathname : '/');

  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.splice(0, Math.ceil(MAX_QUEUE_SIZE / 4));
  }

  queue.push({
    targetUrl,
    selector: input.selector,
    intent: input.intent,
    event: input.event,
    count: 1,
  });

  scheduleFlush();
}

export async function flushFeedbackQueue(): Promise<void> {
  if (!currentConfig || queue.length === 0) return;
  const batch = queue.splice(0, FLUSH_MAX_BATCH);
  try {
    await sdkApiClient.submitContextualFeedback(currentConfig, { events: batch });
  } catch (error) {
    // Re-queue on failure (bounded), but only for transient cases.
    if (queue.length + batch.length <= MAX_QUEUE_SIZE) {
      queue.unshift(...batch);
    }
    if (typeof console !== 'undefined') {
      console.warn('[TrustDev SDK] Failed to flush contextual feedback batch', error);
    }
  }

  if (queue.length > 0) scheduleFlush();
}

export function resetContextualFeedbackQueueForTesting(): void {
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
