export interface ProgressIndicatorProps {
  currentIndex: number;
  total: number;
  showLabel?: boolean;
}

export function ProgressIndicator({ currentIndex, total, showLabel = true }: ProgressIndicatorProps) {
  if (total <= 0) return null;

  const clamped = Math.max(0, Math.min(currentIndex, total - 1));

  return (
    <div className="td-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={clamped + 1}>
      {showLabel ? <p className="td-progress__label">Etape {clamped + 1} / {total}</p> : null}
      <div className="td-progress__dots">
        {Array.from({ length: total }).map((_, idx) => (
          <span
            key={idx}
            className={`td-progress__dot ${idx === clamped ? 'td-progress__dot--active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}
