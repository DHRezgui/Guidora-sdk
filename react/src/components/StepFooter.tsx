import { ProgressIndicator } from './ProgressIndicator';

export interface StepFooterProps {
  currentIndex?: number;
  totalSteps?: number;
  showProgress?: boolean;
  showSkip?: boolean;
  disablePrev?: boolean;
  disableNext?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  skipLabel?: string;
  onNext?: () => void;
  onPrev?: () => void;
  onSkip?: () => void;
}

export function StepFooter({
  currentIndex = 0,
  totalSteps = 0,
  showProgress = true,
  showSkip = true,
  disablePrev,
  disableNext,
  nextLabel = 'Next',
  prevLabel = 'Previous',
  skipLabel = 'Skip',
  onNext,
  onPrev,
  onSkip,
}: StepFooterProps) {
  return (
    <footer className="td-step-footer">
      {showProgress ? <ProgressIndicator currentIndex={currentIndex} total={totalSteps} /> : null}

      <div className="td-tooltip__actions">
        <button type="button" className="td-btn td-btn--ghost" onClick={onPrev} disabled={disablePrev || !onPrev}>
          {prevLabel}
        </button>

        <button type="button" className="td-btn td-btn--primary" onClick={onNext} disabled={disableNext || !onNext}>
          {nextLabel}
        </button>

        {showSkip ? (
          <button type="button" className="td-btn td-btn--text" onClick={onSkip}>
            {skipLabel}
          </button>
        ) : null}
      </div>
    </footer>
  );
}
