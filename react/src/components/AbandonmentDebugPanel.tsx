import { CSSProperties, useEffect, useMemo, useState } from 'react';
import type { UseAbandonmentPredictionResult } from '../hooks/useAbandonmentPrediction';
import type { FrictionScoreResult } from '../hooks/useFrictionScore';
import type { FrictionCounters } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';
import { countAbandonmentSignals } from '../utils/abandonment-features';
import {
  defaultAbandonmentMinConfidence,
  evaluateAbandonmentToastEligibility,
  resolveAbandonmentBaseProbability,
  type AbandonmentToastEligibility,
} from '../utils/abandonment-confidence';
import { formatAbandonmentSessionIntent } from '../utils/abandonment-session-intent';
import { formatAssistanceState } from '../utils/assistance-orchestrator';
import { normalizeFrictionScore } from '../utils/friction-scoring';
import { AbandonmentRiskBadge } from './AbandonmentRiskBadge';

export interface AbandonmentDebugPanelProps {
  /**
   * When false (default), the panel is hidden — same contract as
   * `ContextualSuggestionsPublisher.developerMode`.
   */
  developerMode?: boolean;
  title?: string;
  dockSide?: 'left' | 'right';
  /**
   * Horizontal inset from the dock edge when placed beside the contextual panel.
   * Prefer measuring the live contextual width rather than a fixed constant.
   */
  dockOffsetPx?: number;
  /**
   * Extra bottom inset when panels stack vertically on narrow viewports
   * (abandonment sits above the contextual panel).
   */
  dockBottomOffsetPx?: number;
  className?: string;
  style?: CSSProperties;
  threshold?: number;
  minConfidence?: number;
  proactiveHelp?: boolean;
  proactiveIdleToast?: boolean;
  proactiveIdleMinSeconds?: number;
  sessionIntent?: import('../types/ml').AbandonmentSessionIntent;
  intentPolicy?: import('../types/ml').AbandonmentIntentPolicy;
  assistanceState?: import('../types/ml').AssistanceState;
  assistanceMlPaused?: boolean;
  abandonment: UseAbandonmentPredictionResult;
  friction: {
    counters: FrictionCounters;
    getSignals: () => FrictionBehaviorSignals;
  };
  frictionScore: FrictionScoreResult;
}

const PHOENIX_GLASS_BG =
  'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(187,0,140,0.12) 35%, rgba(12,18,30,0.9) 100%)';
const PHOENIX_SURFACE_BG = 'rgba(15,23,42,0.5)';
const PHOENIX_SURFACE_BORDER = '1px solid rgba(255,255,255,0.2)';

const FEATURE_LABELS: Record<string, string> = {
  timeOnPage: 'Temps session',
  pageTime: 'Temps page',
  scrollDepth: 'Scroll',
  clickMisses: 'Click-miss',
  hesitations: 'Hésitations',
  helpTriggered: 'Aide déclenchée',
  hasError: 'Erreur',
  multiplePages: 'Multi-pages',
  idleSeconds: 'Inactivité',
  timePerPage: 'Temps / page (dérivé)',
  clickMissRate: 'Taux click-miss',
  hesitationRate: 'Taux hésitation',
  frictionScore: 'Score friction',
  highFriction: 'Forte friction',
  multipleIssues: 'Problèmes multiples',
  abandonmentRisk: 'Risque initial',
};

function formatFeatureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

function formatContribution(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

export function AbandonmentDebugPanel({
  developerMode = false,
  title = 'Abandon — debug',
  dockSide = 'left',
  dockOffsetPx = 0,
  dockBottomOffsetPx = 0,
  className,
  style,
  threshold = 0.35,
  minConfidence = defaultAbandonmentMinConfidence(),
  proactiveHelp = true,
  proactiveIdleToast = true,
  proactiveIdleMinSeconds,
  sessionIntent,
  intentPolicy,
  assistanceState,
  assistanceMlPaused = false,
  abandonment,
  friction,
  frictionScore,
}: AbandonmentDebugPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  // The friction hook updates `elapsedSeconds` based on time, but the debug panel only re-renders
  // when other state changes happen (prediction refresh / friction counters tier).
  // We force a 1s tick so the "Temps (s)" display increments smoothly while expanded.
  const [, setTick] = useState(0);

  const signals = friction.getSignals();
  const signalCount = countAbandonmentSignals(friction.counters);
  const effectiveThreshold = intentPolicy?.threshold ?? threshold;
  const effectiveMinConfidence = intentPolicy?.minConfidence ?? minConfidence;
  const localRisk = useMemo(
    () => normalizeFrictionScore(frictionScore.score),
    [frictionScore.score],
  );
  const toastEligibility = useMemo(
    () =>
      evaluateAbandonmentToastEligibility({
        result: abandonment.result,
        threshold: effectiveThreshold,
        minConfidence: effectiveMinConfidence,
        proactiveHelp,
        sessionSeconds: signals.elapsedSeconds,
        signalCount,
        intentPolicy,
        idle: {
          seconds: signals.idleSeconds,
          localRisk,
          signalCount,
          enabled: proactiveIdleToast,
          minSeconds: intentPolicy?.proactiveIdleMinSeconds ?? proactiveIdleMinSeconds,
          minLocalRisk: intentPolicy?.proactiveIdleMinLocalRisk ?? threshold,
          minSignals: intentPolicy?.proactiveIdleMinSignals ?? 2,
        },
      }),
    [
      abandonment.result,
      effectiveThreshold,
      effectiveMinConfidence,
      threshold,
      proactiveHelp,
      proactiveIdleToast,
      proactiveIdleMinSeconds,
      intentPolicy,
      signals.elapsedSeconds,
      signals.pageSeconds,
      signals.idleSeconds,
      localRisk,
      signalCount,
    ],
  );
  const explanation = abandonment.result?.prediction?.explanation;
  const baseProbability = explanation ? resolveAbandonmentBaseProbability(explanation) : null;

  useEffect(() => {
    if (!developerMode) return;
    if (collapsed) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [developerMode, collapsed]);

  if (!developerMode) {
    return null;
  }

  const panelClassName = [
    'trustdev-abandonment-debug-panel',
    dockSide === 'left'
      ? 'trustdev-abandonment-debug-panel--dock-left'
      : 'trustdev-abandonment-debug-panel--dock-right',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={panelClassName}
      data-trustdev-abandonment-panel="true"
      role="region"
      aria-label="Trustdev abandonment debug panel"
      style={{
        position: 'fixed',
        zIndex: 'calc(var(--td-z-index) + 9)',
        maxHeight: collapsed ? 'auto' : '72vh',
        overflow: 'auto',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.22)',
        background: PHOENIX_GLASS_BG,
        color: '#ffffff',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.12), 0 14px 36px rgba(2,6,23,0.5)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        pointerEvents: 'auto',
        ['--td-abandonment-dock-offset-x' as string]: `${Math.max(0, dockOffsetPx)}px`,
        ['--td-abandonment-dock-offset-y' as string]: `${Math.max(0, dockBottomOffsetPx)}px`,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 6px' }}>
        <strong style={{ fontSize: 14, fontWeight: 800, flex: 1, color: '#ffffff' }}>{title}</strong>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={{
            minWidth: 36,
            height: 32,
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            background: 'linear-gradient(180deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.95) 100%)',
            color: '#ffffff',
            padding: '0 10px',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(2,6,23,0.35)',
            cursor: 'pointer',
          }}
          aria-label={collapsed ? 'Expand abandonment panel' : 'Collapse abandonment panel'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed ? (
        <div style={{ padding: '0 10px 10px', display: 'grid', gap: 8 }}>
          <AbandonmentRiskBadge
            result={abandonment.result}
            isLoading={abandonment.isLoading}
            localRisk={localRisk}
            className="trustdev-abandon-badge--embedded"
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              fontSize: 12,
              color: '#f8fafc',
            }}
          >
            {/* Contexte → Temps → Friction → Décision */}
            {assistanceState ? (
              <Stat label="Assistance" value={formatAssistanceState(assistanceState)} />
            ) : null}
            <Stat label="ML" value={assistanceMlPaused ? 'En pause' : 'Actif'} />
            {sessionIntent ? (
              <Stat label="Intent" value={formatAbandonmentSessionIntent(sessionIntent)} />
            ) : null}
            {intentPolicy ? (
              <Stat label="Min session" value={`${intentPolicy.minSessionSeconds}s`} />
            ) : null}
            <Stat label="Temps session (s)" value={Math.floor(signals.elapsedSeconds)} />
            <Stat label="Temps page (s)" value={Math.floor(signals.pageSeconds)} />
            <Stat label="Inactivité (s)" value={Math.floor(signals.idleSeconds)} />
            <Stat label="Palier temps" value={friction.counters.timeOnPageExcessive} />
            <Stat label="Click-miss" value={friction.counters.clickMiss} />
            <Stat label="Scroll hésit." value={friction.counters.scrollHesitation} />
            <Stat label="Signaux" value={signalCount} />
            <Stat label="Scroll max" value={`${Math.round(signals.maxScrollDepth)}%`} />
            <Stat label="Score local" value={`${Math.round(localRisk * 100)}%`} />
            <Stat label="Seuil toast" value={`${Math.round(effectiveThreshold * 100)}%`} />
            <Stat label="Min confiance" value={`${Math.round(effectiveMinConfidence * 100)}%`} />
          </div>

          <ToastEligibilityCard eligibility={toastEligibility} />

          <div
            style={{
              borderRadius: 8,
              border: PHOENIX_SURFACE_BORDER,
              background: PHOENIX_SURFACE_BG,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Explication ML</div>
            <div style={{ opacity: 0.75, fontSize: 11, marginBottom: 6 }}>
              Top features SHAP — impacts en log-odds (+ = vers abandon)
            </div>
            {explanation?.topFeatures?.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {baseProbability != null ? (
                  <div style={{ opacity: 0.85, fontSize: 11 }}>
                    Probabilité de base (avant features) : {Math.round(baseProbability * 100)}%
                  </div>
                ) : null}
                {explanation.topFeatures.map((row) => (
                  <div
                    key={row.feature}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{formatFeatureLabel(row.feature)}</div>
                      <div style={{ opacity: 0.75, fontSize: 11 }}>valeur {row.value}</div>
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: row.contribution >= 0 ? '#fca5a5' : '#86efac',
                        fontSize: 11,
                      }}
                      title="Contribution SHAP (log-odds)"
                    >
                      {formatContribution(row.contribution)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ opacity: 0.8 }}>
                {abandonment.result?.source === 'ml'
                  ? 'SHAP indisponible — rafraîchir en mode debug.'
                  : 'Disponible uniquement avec une prédiction ML en mode debug.'}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void abandonment.refresh({ force: true })}
            disabled={abandonment.isLoading}
            style={{
              border: '1px solid rgba(255,255,255,0.22)',
              borderRadius: 8,
              background: abandonment.isLoading
                ? 'rgba(51,65,85,0.7)'
                : 'rgba(15,23,42,0.56)',
              color: '#ffffff',
              padding: '7px 10px',
              fontSize: 12,
              cursor: abandonment.isLoading ? 'wait' : 'pointer',
              opacity: abandonment.isLoading ? 0.75 : 1,
            }}
          >
            {abandonment.isLoading ? 'Actualisation…' : 'Rafraîchir la prédiction'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: PHOENIX_SURFACE_BORDER,
        background: PHOENIX_SURFACE_BG,
        padding: '6px 8px',
      }}
    >
      <div style={{ opacity: 0.8, marginBottom: 2, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{value}</div>
    </div>
  );
}

function splitToastReasons(reason: string): string[] {
  return reason
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatToastReasonLine(line: string): { label: string; detail: string } {
  if (line.startsWith('idle —') || line.startsWith('idle -')) {
    return { label: 'Idle', detail: line.replace(/^idle\s*[—-]\s*/i, '') };
  }
  if (line.startsWith('voie idle')) {
    return { label: 'Idle', detail: line.replace(/^voie idle\s*[—-]?\s*/i, '') };
  }
  if (line.startsWith('voie ML') || line.startsWith('ML —') || line.startsWith('ML -')) {
    return { label: 'ML', detail: line.replace(/^(voie ML|ML)\s*[—-]?\s*/i, '') };
  }
  if (/^session\s+\d/i.test(line)) {
    return { label: 'Session', detail: line };
  }
  return { label: 'Gate', detail: line };
}

function ToastEligibilityCard({ eligibility }: { eligibility: AbandonmentToastEligibility }) {
  const reasons = splitToastReasons(eligibility.reason).map(formatToastReasonLine);
  const statusColor = eligibility.eligible ? '#86efac' : '#fda4af';
  const statusBg = eligibility.eligible ? 'rgba(34,197,94,0.18)' : 'rgba(244,63,94,0.16)';
  const statusBorder = eligibility.eligible
    ? '1px solid rgba(134,239,172,0.35)'
    : '1px solid rgba(253,164,175,0.35)';
  const viaLabel =
    eligibility.via === 'ml' ? 'ML' : eligibility.via === 'idle_hybrid' ? 'Idle' : null;

  return (
    <div
      style={{
        borderRadius: 8,
        border: PHOENIX_SURFACE_BORDER,
        background: PHOENIX_SURFACE_BG,
        padding: '8px 10px',
        display: 'grid',
        gap: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: '0.04em' }}>
          TOAST PROACTIF
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {viaLabel ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                padding: '3px 7px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(15,23,42,0.55)',
                color: '#e2e8f0',
              }}
            >
              via {viaLabel}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              padding: '3px 8px',
              borderRadius: 999,
              border: statusBorder,
              background: statusBg,
              color: statusColor,
            }}
          >
            {eligibility.eligible ? 'OUI' : 'NON'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {reasons.map((row) => (
          <div
            key={`${row.label}-${row.detail}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr',
              gap: 8,
              alignItems: 'start',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'rgba(248,250,252,0.72)',
                paddingTop: 1,
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                color: '#f8fafc',
                wordBreak: 'break-word',
              }}
            >
              {row.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
