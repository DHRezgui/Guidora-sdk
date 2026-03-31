import { TourProgress } from '../types';

const SESSION_KEY = 'trustdev_sdk_session_id';
const VISITS_KEY_PREFIX = 'trustdev_sdk_visits:';
const PROGRESS_KEY_PREFIX = 'trustdev_sdk_progress:';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  const storage = safeStorage();
  if (!storage) return generateSessionId();

  const existing = storage.getItem(SESSION_KEY);
  if (existing) return existing;

  const next = generateSessionId();
  storage.setItem(SESSION_KEY, next);
  return next;
}

export function resetSessionId(): string {
  const storage = safeStorage();
  const next = generateSessionId();
  if (storage) {
    storage.setItem(SESSION_KEY, next);
  }
  return next;
}

export function increaseVisitCount(pageUrl: string): number {
  const storage = safeStorage();
  if (!storage) return 1;

  const key = `${VISITS_KEY_PREFIX}${pageUrl}`;
  const current = Number(storage.getItem(key) || 0);
  const next = current + 1;
  storage.setItem(key, String(next));
  return next;
}

export function getVisitCount(pageUrl: string): number {
  const storage = safeStorage();
  if (!storage) return 0;
  return Number(storage.getItem(`${VISITS_KEY_PREFIX}${pageUrl}`) || 0);
}

export function saveTourProgress(progress: TourProgress): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(`${PROGRESS_KEY_PREFIX}${progress.tourId}`, JSON.stringify(progress));
}

export function loadTourProgress(tourId: string): TourProgress | null {
  const storage = safeStorage();
  if (!storage) return null;

  const raw = storage.getItem(`${PROGRESS_KEY_PREFIX}${tourId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TourProgress;
  } catch {
    return null;
  }
}

export function clearTourProgress(tourId: string): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(`${PROGRESS_KEY_PREFIX}${tourId}`);
}
