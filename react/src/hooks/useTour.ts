import { useCallback, useMemo, useRef, useState } from 'react';
import { GuidedTour, Step } from '../types';

export interface UseTourOptions {
  initialStepIndex?: number;
  autoOpen?: boolean;
  onComplete?: (tour: GuidedTour) => void;
  onSkip?: (tour: GuidedTour) => void;
}

export interface UseTourResult {
  activeTour: GuidedTour | null;
  steps: Step[];
  currentStepIndex: number;
  currentStep: Step | null;
  isOpen: boolean;
  isCompleted: boolean;
  startTour: (tour: GuidedTour, startIndex?: number) => void;
  closeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  jumpToStep: (index: number) => void;
  skipTour: () => void;
  completeTour: () => void;
}

function sortStepsByOrderIndex(steps: Step[]): Step[] {
  return [...steps]
    .map((step, idx) => ({ step, idx }))
    .sort((a, b) => {
      const ao = typeof a.step.orderIndex === 'number' ? a.step.orderIndex : Number.MAX_SAFE_INTEGER;
      const bo = typeof b.step.orderIndex === 'number' ? b.step.orderIndex : Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.idx - b.idx;
    })
    .map((entry) => entry.step);
}

const EMPTY_TOUR_STEPS: Step[] = [];

export function useTour(options?: UseTourOptions): UseTourResult {
  const initialStepIndex = options?.initialStepIndex ?? 0;
  const autoOpen = options?.autoOpen ?? false;
  const onCompleteRef = useRef(options?.onComplete);
  const onSkipRef = useRef(options?.onSkip);
  onCompleteRef.current = options?.onComplete;
  onSkipRef.current = options?.onSkip;

  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex);
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [isCompleted, setIsCompleted] = useState(false);

  const steps = activeTour?.steps ?? EMPTY_TOUR_STEPS;
  const currentStep = steps[currentStepIndex] || null;

  const startTour = useCallback(
    (tour: GuidedTour, startIndex = initialStepIndex) => {
      const normalizedTour: GuidedTour = {
        ...tour,
        steps: sortStepsByOrderIndex(tour.steps || []),
      };
      setActiveTour(normalizedTour);
      setCurrentStepIndex(startIndex);
      setIsOpen(true);
      setIsCompleted(false);
    },
    [initialStepIndex],
  );

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    setIsOpen(false);
    setIsCompleted(true);
    const finishedTour = activeTour;
    if (finishedTour) {
      onCompleteRef.current?.(finishedTour);
    }
  }, [activeTour]);

  const nextStep = useCallback(() => {
    if (!steps.length) return;
    setCurrentStepIndex((prev) => {
      const next = prev + 1;
      if (next >= steps.length) {
        completeTour();
        return prev;
      }
      return next;
    });
  }, [completeTour, steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const jumpToStep = useCallback(
    (index: number) => {
      if (!steps.length) return;
      const clamped = Math.max(0, Math.min(index, steps.length - 1));
      setCurrentStepIndex(clamped);
    },
    [steps.length],
  );

  const skipTour = useCallback(() => {
    setIsOpen(false);
    const skippedTour = activeTour;
    if (skippedTour) {
      onSkipRef.current?.(skippedTour);
    }
  }, [activeTour]);

  return useMemo(
    () => ({
      activeTour,
      steps,
      currentStepIndex,
      currentStep,
      isOpen,
      isCompleted,
      startTour,
      closeTour,
      nextStep,
      prevStep,
      jumpToStep,
      skipTour,
      completeTour,
    }),
    [
      activeTour,
      closeTour,
      completeTour,
      currentStep,
      currentStepIndex,
      isCompleted,
      isOpen,
      jumpToStep,
      nextStep,
      prevStep,
      skipTour,
      startTour,
      steps,
    ],
  );
}
