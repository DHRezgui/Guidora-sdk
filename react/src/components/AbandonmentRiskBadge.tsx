import type { AbandonmentPredictionClientResult } from '../types/ml';

export interface AbandonmentRiskBadgeProps {
  result: AbandonmentPredictionClientResult | null;
  isLoading?: boolean;
  className?: string;
  /** Optional local heuristic (0–1) for lab transparency when ML diverges. */
  localRisk?: number | null;
}

function resolveLabel(result: AbandonmentPredictionClientResult | null): {
  tier: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  text: string;
} {
  if (!result?.prediction) {
    return { tier: 'NONE', text: 'Risque —' };
  }

  const risk = result.prediction.abandonmentRisk;
  const source = result.source === 'ml' ? 'ML' : 'local';

  if (risk >= 0.55) {
    return { tier: 'HIGH', text: `Risque élevé (${source})` };
  }
  if (risk >= 0.35) {
    return { tier: 'MEDIUM', text: `Risque modéré (${source})` };
  }
  if (risk >= 0.15) {
    return { tier: 'LOW', text: `Risque faible (${source})` };
  }
  return { tier: 'NONE', text: `Risque minimal (${source})` };
}

export function AbandonmentRiskBadge({
  result,
  isLoading = false,
  className,
  localRisk = null,
}: AbandonmentRiskBadgeProps) {
  const { tier, text } = resolveLabel(result);
  const riskPct =
    result?.prediction != null
      ? `${Math.round(result.prediction.abandonmentRisk * 100)}%`
      : '—';
  const localRiskPct =
    localRisk != null && Number.isFinite(localRisk)
      ? `${Math.round(localRisk * 100)}%`
      : null;
  const showLocalRef =
    localRiskPct != null &&
    result?.prediction != null &&
    Math.round((localRisk ?? 0) * 100) !== Math.round(result.prediction.abandonmentRisk * 100);

  const tierBorder =
    tier === 'HIGH'
      ? 'trustdev-abandon-badge--high'
      : tier === 'MEDIUM'
        ? 'trustdev-abandon-badge--medium'
        : tier === 'LOW'
          ? 'trustdev-abandon-badge--low'
          : 'trustdev-abandon-badge--none';

  return (
    <div
      className={`trustdev-abandon-badge ${tierBorder} ${className ?? ''}`.trim()}
      aria-live="polite"
    >
      <div className="trustdev-abandon-badge__row">
        <div>
          <p className="trustdev-abandon-badge__eyebrow">Abandon LightGBM</p>
          <p className="trustdev-abandon-badge__title">{text}</p>
        </div>
        <div className="trustdev-abandon-badge__value-block">
          <p className="trustdev-abandon-badge__value">{riskPct}</p>
          <p className="trustdev-abandon-badge__label">{isLoading ? 'Analyse…' : 'Probabilité'}</p>
        </div>
      </div>
      {result?.prediction ? (
        <p className="trustdev-abandon-badge__meta">
          Seuil {Math.round(result.prediction.threshold * 100)}% · confiance{' '}
          {Math.round(result.prediction.confidence * 100)}% · source {result.source}
          {result.status === 'fallback' ? ' (fallback local)' : ''}
          {showLocalRef ? ` · réf. locale ${localRiskPct}` : ''}
        </p>
      ) : null}
    </div>
  );
}
