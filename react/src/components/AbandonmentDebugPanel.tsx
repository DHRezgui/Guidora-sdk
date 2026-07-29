import { CSSProperties, useEffect, useMemo, useState } from 'react';
import type { UseAbandonmentPredictionResult } from '../hooks/useAbandonmentPrediction';
import type { FrictionScoreResult } from '../hooks/useFrictionScore';
import type { FrictionCounters } from '../types';
import type { FrictionBehaviorSignals } from '../types/ml';
import { countAbandonmentSignals } from '../utils/abandonment-features';
import {
  defaultAbandonmentMinConfidence,
  resolveAbandonmentBaseProbability,
} from '../utils/abandonment-confidence';
import { formatAbandonmentSessionIntent } from '../utils/abandonment-session-intent';
import { formatAssistanceState } from '../utils/assistance-orchestrator';
import {
  evaluateFrictionCombination,
  FRICTION_SIGNAL_FAMILY_LABELS,
} from '../utils/friction-combination';
import {
  evaluateHelpDecision,
  type HelpDecisionResult,
} from '../utils/friction-decision-engine';
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
  /** Phase 4 — matched page policy label (if any). */
  pagePolicyLabel?: string | null;
  assistanceState?: import('../types/ml').AssistanceState;
  assistanceMlPaused?: boolean;
  abandonment: UseAbandonmentPredictionResult;
  friction: {
    counters: FrictionCounters;
    signalTimestamps?: import('../utils/friction-signal-freshness').FrictionSignalTimestamps;
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
  pagePolicyLabel,
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
  const [tick, setTick] = useState(0);

  const signals = friction.getSignals();
  const signalCount = countAbandonmentSignals(friction.counters);
  const combination = useMemo(
    () =>
      evaluateFrictionCombination({
        counters: friction.counters,
        minDistinctFamilies: intentPolicy?.minDistinctFamilies,
        allowStrongSingleFamily: intentPolicy?.allowStrongSingleFamily,
      }),
    [friction.counters, intentPolicy?.minDistinctFamilies, intentPolicy?.allowStrongSingleFamily],
  );
  const effectiveThreshold = intentPolicy?.threshold ?? threshold;
  const effectiveMinConfidence = intentPolicy?.minConfidence ?? minConfidence;
  const localRisk = useMemo(
    () => normalizeFrictionScore(frictionScore.score),
    [frictionScore.score],
  );
  const helpDecision = useMemo(
    () =>
      evaluateHelpDecision({
        counters: friction.counters,
        signalTimestamps: friction.signalTimestamps,
        now: Date.now(),
        result: abandonment.result,
        threshold: effectiveThreshold,
        minConfidence: effectiveMinConfidence,
        proactiveHelp,
        sessionSeconds: signals.elapsedSeconds,
        signalCount,
        intentPolicy,
        assistanceBlocked: assistanceMlPaused || assistanceState === 'tour' || assistanceState === 'faq',
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
      friction.counters,
      friction.signalTimestamps,
      signals.elapsedSeconds,
      signals.pageSeconds,
      signals.idleSeconds,
      localRisk,
      signalCount,
      assistanceMlPaused,
      assistanceState,
      tick,
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
            <Stat label="Rage click" value={friction.counters.rageClick ?? 0} />
            <Stat label="Error click" value={friction.counters.errorClick ?? 0} />
            <Stat label="Form retry" value={friction.counters.formRetry ?? 0} />
            <Stat label="Nav loop" value={friction.counters.navigationLoop ?? 0} />
            <Stat label="U-turn" value={friction.counters.uTurn ?? 0} />
            <Stat label="Slow resp." value={friction.counters.slowResponse ?? 0} />
            <Stat label="FAQ faible" value={friction.counters.faqNoResult ?? 0} />
            <Stat label="FAQ reopen" value={friction.counters.faqReopen ?? 0} />
            <Stat label="Fail after help" value={friction.counters.failAfterHelp ?? 0} />
            <Stat label="Scroll hésit." value={friction.counters.scrollHesitation} />
            <Stat label="Scroll max" value={`${Math.round(signals.maxScrollDepth)}%`} />
            <Stat
              label="Familles"
              value={
                combination.familyCount > 0
                  ? `${combination.familyCount}: ${combination.families
                      .map((family) => FRICTION_SIGNAL_FAMILY_LABELS[family])
                      .join(', ')}`
                  : '0'
              }
            />
            <Stat
              label="Combinaison"
              value={combination.eligible ? (combination.viaStrongSingle ? 'OK (fort)' : 'OK') : 'bloquée'}
            />
            {pagePolicyLabel ? <Stat label="Page policy" value={pagePolicyLabel} /> : null}
            <Stat label="Signaux" value={signalCount} />
            <Stat label="Score local" value={`${Math.round(localRisk * 100)}%`} />
            <Stat label="Friction" value={helpDecision.friction.levelLabel} />
            <Stat
              label="Raisons friction"
              value={
                helpDecision.friction.reasons.length > 0
                  ? helpDecision.friction.reasons.slice(0, 3).join(' · ')
                  : '—'
              }
            />
            <Stat label="Seuil toast" value={`${Math.round(effectiveThreshold * 100)}%`} />
            <Stat label="Min confiance" value={`${Math.round(effectiveMinConfidence * 100)}%`} />
          </div>

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
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Risque ML (expérimental)</div>
            <div style={{ opacity: 0.85, fontSize: 11 }}>
              {abandonment.result?.prediction
                ? `${Math.round(abandonment.result.prediction.abandonmentRisk * 100)}% · source ${
                    abandonment.result.source
                  } — n’ouvre pas l’aide seul`
                : 'aucune prédiction'}
            </div>
          </div>

          <HelpDecisionCard decision={helpDecision} />

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

function formatToastReasonLine(line: string): { label: string; detail: string } {
  if (line.startsWith('idle —') || line.startsWith('idle -') || line.includes('friction+idle')) {
    return { label: 'Idle', detail: line.replace(/^(voie friction\+idle|idle)\s*[—-]?\s*/i, '') };
  }
  if (line.startsWith('voie friction seule') || line.startsWith('friction seule')) {
    return {
      label: 'Friction',
      detail: line.replace(/^(voie friction seule|friction seule)\s*[—-]?\s*/i, ''),
    };
  }
  if (line.startsWith('fraîcheur')) {
    return { label: 'Fraîcheur', detail: line.replace(/^fraîcheur\s*[—-]?\s*/i, '') };
  }
  if (
    line.startsWith('voie friction+ML') ||
    line.startsWith('voie ML') ||
    line.startsWith('ML —') ||
    line.startsWith('ML -')
  ) {
    return {
      label: 'ML',
      detail: line.replace(/^(voie friction\+ML|voie ML|ML)\s*[—-]?\s*/i, ''),
    };
  }
  if (line.startsWith('friction concrète') || line.startsWith('combinaison')) {
    return { label: 'Friction', detail: line };
  }
  if (/^session\s+\d/i.test(line)) {
    return { label: 'Session', detail: line };
  }
  return { label: 'Gate', detail: line };
}

function HelpDecisionCard({ decision }: { decision: HelpDecisionResult }) {
  const reasons = (decision.reasons.length > 0 ? decision.reasons : [decision.reason]).map(
    formatToastReasonLine,
  );
  const statusColor = decision.eligible ? '#86efac' : '#fda4af';
  const statusBg = decision.eligible ? 'rgba(34,197,94,0.18)' : 'rgba(244,63,94,0.16)';
  const statusBorder = decision.eligible
    ? '1px solid rgba(134,239,172,0.35)'
    : '1px solid rgba(253,164,175,0.35)';
  const viaLabel =
    decision.via === 'friction_ml'
      ? 'Friction+ML'
      : decision.via === 'friction_idle'
        ? 'Friction+Idle'
        : decision.via === 'friction_only'
          ? 'Friction seule'
          : null;

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
          DÉCISION AIDE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {viaLabel ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                opacity: 0.85,
              }}
            >
              VIA {viaLabel}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: statusColor,
              background: statusBg,
              border: statusBorder,
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {decision.eligible ? 'OUI' : 'NON'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        Friction concrète : {decision.concreteFriction ? 'oui' : 'non'} · niveau{' '}
        {decision.friction.levelLabel}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {reasons.map((row, index) => (
          <div key={`${row.label}-${index}`} style={{ fontSize: 11, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700, opacity: 0.85 }}>{row.label}:</span>{' '}
            <span style={{ opacity: 0.9 }}>{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
