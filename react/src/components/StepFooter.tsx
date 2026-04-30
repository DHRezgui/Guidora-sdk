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
  nextLabel = 'Suivant',
  prevLabel = 'Precedent',
  skipLabel = 'Passer',
  onNext,
  onPrev,
  onSkip,
}: StepFooterProps) {
  return (
    <footer className="td-step-footer">
      <div className="td-step-footer__row">
        {showProgress ? <ProgressIndicator currentIndex={currentIndex} total={totalSteps} showLabel={false} /> : null}

        <div className="td-tooltip__actions">
          {showSkip ? (
            <button type="button" className="td-btn td-btn--text" onClick={onSkip}>
              {skipLabel}
            </button>
          ) : null}

          {!disablePrev && onPrev ? (
            <button type="button" className="td-btn td-btn--icon" onClick={onPrev} aria-label={prevLabel}>
              &lt;
            </button>
          ) : null}

          <button type="button" className="td-btn td-btn--primary" onClick={onNext} disabled={disableNext || !onNext}>
            {nextLabel}
          </button>
        </div>
      </div>
    </footer>
  );
}
