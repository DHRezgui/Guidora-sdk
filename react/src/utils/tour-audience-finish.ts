export type TourFinishAudience = 'sandbox' | 'production';

const STORAGE_PREFIX = 'trustdev_tour_finished';

function storageKey(tourId: string, audience: TourFinishAudience): string {
  return `${STORAGE_PREFIX}:${tourId}:${audience}`;
}

export function markTourFinishedForAudience(tourId: string, audience: TourFinishAudience): void {
  if (typeof window === 'undefined' || !tourId) return;
  try {
    window.localStorage.setItem(storageKey(tourId, audience), String(Date.now()));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function isTourFinishedForAudience(tourId: string, audience: TourFinishAudience): boolean {
  if (typeof window === 'undefined' || !tourId) return false;
  try {
    return Boolean(window.localStorage.getItem(storageKey(tourId, audience)));
  } catch {
    return false;
  }
}

export function clearTourFinishedForAudience(tourId: string, audience: TourFinishAudience): void {
  if (typeof window === 'undefined' || !tourId) return;
  try {
    window.localStorage.removeItem(storageKey(tourId, audience));
  } catch {
    // Ignore.
  }
}

export function isTourFinishedLocally(tour: {
  id?: string;
  isActive?: boolean;
  isSandboxTestActive?: boolean;
  environment?: string;
}): boolean {
  if (!tour.id) return false;

  if (tour.environment?.toLowerCase() === 'sandbox' || tour.isSandboxTestActive) {
    if (isTourFinishedForAudience(tour.id, 'sandbox')) {
      return true;
    }
  }

  if (tour.isActive || tour.environment?.toLowerCase() === 'production') {
    if (isTourFinishedForAudience(tour.id, 'production')) {
      return true;
    }
  }

  return false;
}
