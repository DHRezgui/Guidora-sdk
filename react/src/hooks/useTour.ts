import { useCallback, useMemo, useState } from 'react';
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

export function useTour(options?: UseTourOptions): UseTourResult {
  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(options?.initialStepIndex ?? 0);
  const [isOpen, setIsOpen] = useState(options?.autoOpen ?? false);
  const [isCompleted, setIsCompleted] = useState(false);

  const steps = activeTour?.steps || [];
  const currentStep = steps[currentStepIndex] || null;

  const startTour = useCallback(
    (tour: GuidedTour, startIndex = options?.initialStepIndex ?? 0) => {
      setActiveTour(tour);
      setCurrentStepIndex(startIndex);
      setIsOpen(true);
      setIsCompleted(false);
    },
    [options?.initialStepIndex],
  );

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    if (activeTour) {
      options?.onComplete?.(activeTour);
    }
    setIsCompleted(true);
    setIsOpen(false);
  }, [activeTour, options]);

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
    if (activeTour) {
      options?.onSkip?.(activeTour);
    }
    setIsOpen(false);
  }, [activeTour, options]);

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
