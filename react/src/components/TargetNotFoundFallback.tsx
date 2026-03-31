export interface TargetNotFoundFallbackProps {
  open: boolean;
  selector?: string;
  title?: string;
  description?: string;
  retryLabel?: string;
  skipLabel?: string;
  onRetry?: () => void;
  onSkip?: () => void;
}

export function TargetNotFoundFallback({
  open,
  selector,
  title = 'Element not found',
  description = 'The target element is not available yet on this page.',
  retryLabel = 'Retry',
  skipLabel = 'Skip step',
  onRetry,
  onSkip,
}: TargetNotFoundFallbackProps) {
  if (!open) return null;

  return (
    <section className="td-target-fallback" role="status" aria-live="polite">
      <h4 className="td-tooltip__title">{title}</h4>
      <p className="td-tooltip__content">{description}</p>
      {selector ? <p className="td-tooltip__meta">Selector: {selector}</p> : null}

      <div className="td-tooltip__actions">
        <button type="button" className="td-btn td-btn--ghost" onClick={onRetry}>
          {retryLabel}
        </button>
        <button type="button" className="td-btn td-btn--text" onClick={onSkip}>
          {skipLabel}
        </button>
      </div>
    </section>
  );
}
