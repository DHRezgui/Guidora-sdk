export interface ProgressIndicatorProps {
  currentIndex: number;
  total: number;
  showLabel?: boolean;
}

export function ProgressIndicator({ currentIndex, total, showLabel = true }: ProgressIndicatorProps) {
  if (total <= 0) return null;

  const clamped = Math.max(0, Math.min(currentIndex, total - 1));
  const progress = ((clamped + 1) / total) * 100;

  return (
    <div className="td-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={clamped + 1}>
      {showLabel ? <p className="td-progress__label">Etape {clamped + 1} / {total}</p> : null}
      <div className="td-progress__bar">
        <span className="td-progress__fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
