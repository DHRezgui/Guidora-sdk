import type { FrictionCounters } from '../types';
import type { AbandonmentIntentPolicy, AbandonmentPredictionClientResult } from '../types/ml';
import {
  DEFAULT_IDLE_TOAST_MIN_SECONDS,
  type AbandonmentIdleToastParams,
} from './abandonment-confidence';
import {
  evaluateFrictionCombination,
  resolveActiveFrictionFamilies,
  type FrictionSignalFamily,
} from './friction-combination';
import {
  hasMediumOrStrongHelpSignal,
  hasStrongHelpSignal,
  listActiveFrictionSignals,
} from './friction-signal-catalog';
import { buildFrictionExplanation, type FrictionExplanation } from './friction-explanation';
import {
  DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS,
  filterCountersByFreshness,
  type FrictionSignalTimestamps,
} from './friction-signal-freshness';

export type HelpDecisionVia = 'friction_ml' | 'friction_idle' | 'friction_only' | null;

export interface HelpDecisionResult {
  eligible: boolean;
  via: HelpDecisionVia;
  reasons: string[];
  /** Human-readable single-line summary for debug / logs. */
  reason: string;
  friction: FrictionExplanation;
  concreteFriction: boolean;
  /** Counters after freshness filter (what the Decision Engine actually used). */
  decisionCounters: FrictionCounters;
  mlAdvisory: {
    risk: number | null;
    aboveThreshold: boolean;
    source: string | null;
  };
}

export interface EvaluateHelpDecisionInput {
  counters: FrictionCounters;
  /** Last-fire timestamps per signal; enables freshness window for live help. */
  signalTimestamps?: FrictionSignalTimestamps | null;
  freshnessWindowMs?: number;
  now?: number;
  result: AbandonmentPredictionClientResult | null;
  threshold: number;
  minConfidence: number;
  proactiveHelp: boolean;
  sessionSeconds: number;
  signalCount: number;
  intentPolicy?: AbandonmentIntentPolicy;
  idle?: AbandonmentIdleToastParams;
  /** When false, skip assistance-state checks (caller already gated). Default true unused — pass blocked. */
  assistanceBlocked?: boolean;
  cooldownActive?: boolean;
}

/**
 * Concrete friction for help: strong alone, OR multi-family with ≥1 medium/strong.
 * Weak-only evidence (e.g. click-miss + scroll) never unlocks help.
 * Callers should pass freshness-filtered counters when available.
 */
export function hasConcreteFrictionEvidence(
  counters: FrictionCounters,
  intentPolicy?: AbandonmentIntentPolicy,
): { ok: boolean; reason: string; families: FrictionSignalFamily[] } {
  const families = resolveActiveFrictionFamilies(counters);

  if (hasStrongHelpSignal(counters)) {
    const strong = listActiveFrictionSignals(counters)
      .filter((s) => s.entry.strength === 'strong')
      .map((s) => s.entry.label)
      .join(', ');
    return {
      ok: true,
      reason: `friction concrète — signal fort (${strong || 'strong'})`,
      families,
    };
  }

  const allowStrong = intentPolicy?.allowStrongSingleFamily !== false;
  const requireMulti = intentPolicy?.requireMultiFamilyForToast !== false;
  const minFamilies = intentPolicy?.minDistinctFamilies ?? 2;

  if (!requireMulti) {
    if (hasMediumOrStrongHelpSignal(counters) || families.length > 0) {
      return { ok: true, reason: 'friction concrète — multi-family gate off', families };
    }
    return { ok: false, reason: 'friction concrète — aucun signal utile', families };
  }

  const combination = evaluateFrictionCombination({
    counters,
    minDistinctFamilies: minFamilies,
    // Strong path already handled above via catalog; keep combination for multi-family only.
    allowStrongSingleFamily: allowStrong,
  });

  if (!combination.eligible) {
    return { ok: false, reason: combination.reason, families: combination.families };
  }

  // Multi-family of weak-only must not unlock help.
  if (!hasMediumOrStrongHelpSignal(counters) && !combination.viaStrongSingle) {
    return {
      ok: false,
      reason: `friction concrète — familles weak only (${combination.families.join(', ') || 'aucune'})`,
      families: combination.families,
    };
  }

  return {
    ok: true,
    reason: combination.viaStrongSingle
      ? combination.reason
      : `friction concrète — ${combination.reason}`,
    families: combination.families,
  };
}

/**
 * Friction-first Decision Engine: ML / idle are advisory paths that still require concrete friction.
 * Strong fresh friction can unlock help via `friction_only` without ML.
 */
export function evaluateHelpDecision(input: EvaluateHelpDecisionInput): HelpDecisionResult {
  const freshness = filterCountersByFreshness(input.counters, input.signalTimestamps, {
    windowMs: input.freshnessWindowMs ?? DEFAULT_FRICTION_SIGNAL_FRESHNESS_MS,
    now: input.now,
  });
  const decisionCounters = freshness.counters;
  const friction = buildFrictionExplanation(decisionCounters);
  const reasons: string[] = [];
  if (freshness.droppedKeys.length > 0) {
    reasons.push(
      `fraîcheur — ignoré (>${Math.round(freshness.windowMs / 1000)}s): ${freshness.droppedKeys.join(', ')}`,
    );
  }

  const mlRisk = input.result?.prediction?.abandonmentRisk ?? null;
  const mlSource = input.result?.source ?? null;
  const effectiveThreshold = input.intentPolicy?.threshold ?? input.threshold;
  const effectiveMinConfidence = input.intentPolicy?.minConfidence ?? input.minConfidence;
  const mlAdvisory = {
    risk: mlRisk,
    aboveThreshold: mlRisk != null && mlRisk >= effectiveThreshold,
    source: mlSource,
  };

  const deny = (reason: string, concreteFriction = false): HelpDecisionResult => ({
    eligible: false,
    via: null,
    reasons: [...reasons, reason],
    reason,
    friction,
    concreteFriction,
    decisionCounters,
    mlAdvisory,
  });

  if (!input.proactiveHelp) {
    return deny('aide proactive désactivée');
  }
  if (input.assistanceBlocked) {
    return deny('assistance déjà active ou ML en pause');
  }
  if (input.cooldownActive) {
    return deny('cooldown toast actif');
  }

  const concrete = hasConcreteFrictionEvidence(decisionCounters, input.intentPolicy);
  if (!concrete.ok) {
    return deny(concrete.reason, false);
  }
  reasons.push(concrete.reason);

  if (input.intentPolicy && input.sessionSeconds < input.intentPolicy.minSessionSeconds) {
    const reason = `session ${input.sessionSeconds}s < min ${input.intentPolicy.minSessionSeconds}s (intent)`;
    reasons.push(reason);
    return deny(reason, true);
  }

  // --- ML advisory path (requires concrete friction already) ---
  const mlGate = evaluateMlAdvisoryPath({
    result: input.result,
    threshold: effectiveThreshold,
    minConfidence: effectiveMinConfidence,
    signalCount: input.signalCount,
    intentPolicy: input.intentPolicy,
  });
  if (mlGate.ok) {
    const reason = `voie friction+ML — ${mlGate.detail}`;
    reasons.push(reason);
    return {
      eligible: true,
      via: 'friction_ml',
      reasons,
      reason,
      friction,
      concreteFriction: true,
      decisionCounters,
      mlAdvisory,
    };
  }
  reasons.push(mlGate.detail);

  // --- Strong friction alone: ML must not deny a concrete blockage ---
  if (hasStrongHelpSignal(decisionCounters)) {
    const strong = listActiveFrictionSignals(decisionCounters)
      .filter((s) => s.entry.strength === 'strong' && s.entry.canTriggerAlone)
      .map((s) => s.entry.label)
      .join(', ');
    const reason = `voie friction seule — signal fort (${strong || 'strong'})`;
    reasons.push(reason);
    return {
      eligible: true,
      via: 'friction_only',
      reasons,
      reason,
      friction,
      concreteFriction: true,
      decisionCounters,
      mlAdvisory,
    };
  }

  // --- Idle hybrid (still requires concrete friction; typically medium+combo) ---
  if (input.idle) {
    const idleGate = evaluateIdleAdvisoryPath({
      idle: input.idle,
      threshold: effectiveThreshold,
      intentPolicy: input.intentPolicy,
    });
    if (idleGate.ok) {
      const reason = `voie friction+idle — ${idleGate.detail}`;
      reasons.push(reason);
      return {
        eligible: true,
        via: 'friction_idle',
        reasons,
        reason,
        friction,
        concreteFriction: true,
        decisionCounters,
        mlAdvisory,
      };
    }
    reasons.push(idleGate.detail);
    return deny(`${mlGate.detail} ; ${idleGate.detail}`, true);
  }

  return deny(mlGate.detail, true);
}

function evaluateMlAdvisoryPath(input: {
  result: AbandonmentPredictionClientResult | null;
  threshold: number;
  minConfidence: number;
  signalCount: number;
  intentPolicy?: AbandonmentIntentPolicy;
}): { ok: boolean; detail: string } {
  if (
    input.intentPolicy?.requireFrictionSignalsForMlToast &&
    input.signalCount < Math.max(1, input.intentPolicy.minSignals)
  ) {
    return {
      ok: false,
      detail: `ML — signaux ${input.signalCount} < min ${input.intentPolicy.minSignals}`,
    };
  }

  const result = input.result;
  if (!result) return { ok: false, detail: 'ML — aucune prédiction' };
  if (result.source !== 'ml') {
    return { ok: false, detail: `ML — source ${result.source} (ML requis)` };
  }
  if (result.status !== 'ok' || !result.prediction) {
    return { ok: false, detail: `ML — statut ${result.status}` };
  }

  const { abandonmentRisk, confidence, willAbandon } = result.prediction;
  if (!willAbandon || abandonmentRisk < input.threshold) {
    return {
      ok: false,
      detail: `ML — risque ${Math.round(abandonmentRisk * 100)}% < seuil ${Math.round(input.threshold * 100)}%`,
    };
  }
  if (confidence < input.minConfidence) {
    return {
      ok: false,
      detail: `ML — confiance ${Math.round(confidence * 100)}% < min ${Math.round(input.minConfidence * 100)}%`,
    };
  }
  return { ok: true, detail: 'risque et confiance OK' };
}

function evaluateIdleAdvisoryPath(input: {
  idle: AbandonmentIdleToastParams;
  threshold: number;
  intentPolicy?: AbandonmentIntentPolicy;
}): { ok: boolean; detail: string } {
  const { idle, threshold, intentPolicy } = input;
  if (idle.enabled === false) {
    return { ok: false, detail: 'idle — voie désactivée' };
  }

  const minSeconds = idle.minSeconds ?? intentPolicy?.proactiveIdleMinSeconds ?? DEFAULT_IDLE_TOAST_MIN_SECONDS;
  const minLocalRisk = idle.minLocalRisk ?? intentPolicy?.proactiveIdleMinLocalRisk ?? threshold;
  const minSignals = Math.max(1, idle.minSignals ?? intentPolicy?.proactiveIdleMinSignals ?? 2);

  if (idle.signalCount < minSignals) {
    return { ok: false, detail: `idle — signaux ${idle.signalCount} < min ${minSignals}` };
  }
  if (idle.localRisk < minLocalRisk) {
    return {
      ok: false,
      detail: `idle — score local ${Math.round(idle.localRisk * 100)}% < min ${Math.round(minLocalRisk * 100)}%`,
    };
  }
  if (idle.seconds < minSeconds) {
    return { ok: false, detail: `idle — inactivité ${idle.seconds}s < min ${minSeconds}s` };
  }
  return {
    ok: true,
    detail: `inactivité ${idle.seconds}s, score local ${Math.round(idle.localRisk * 100)}%`,
  };
}
