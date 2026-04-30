import { useCallback, useEffect, useState } from 'react';
import { TourProgress } from '../types';
import { clearTourProgress, loadTourProgress, saveTourProgress } from '../utils/storage';

export interface UseTourProgressResult {
  progress: TourProgress | null;
  setStepIndex: (stepIndex: number) => void;
  clear: () => void;
}

export function useTourProgress(tourId?: string): UseTourProgressResult {
  const [progress, setProgress] = useState<TourProgress | null>(() => {
    if (!tourId) return null;
    return loadTourProgress(tourId);
  });

  useEffect(() => {
    if (!tourId) {
      setProgress(null);
      return;
    }
    setProgress(loadTourProgress(tourId));
  }, [tourId]);

  const setStepIndex = useCallback(
    (stepIndex: number) => {
      if (!tourId) return;
      setProgress((prev) => {
        if (prev?.tourId === tourId && prev.stepIndex === stepIndex) {
          return prev;
        }

        const next: TourProgress = {
          tourId,
          stepIndex,
          updatedAt: Date.now(),
        };
        saveTourProgress(next);
        return next;
      });
    },
    [tourId],
  );

  const clear = useCallback(() => {
    if (!tourId) return;
    clearTourProgress(tourId);
    setProgress(null);
  }, [tourId]);

  return {
    progress,
    setStepIndex,
    clear,
  };
}
