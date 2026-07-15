import type { AbandonmentIntentPolicy, AbandonmentPredictionClientResult } from '../types/ml';

/** Convert SHAP log-odds baseline to a 0-1 abandonment probability. */
export function abandonmentLogOddsToProbability(logOdds: number): number {
  if (!Number.isFinite(logOdds)) return 0;
  if (logOdds >= 20) return 1;
  if (logOdds <= -20) return 0;
  return 1 / (1 + Math.exp(-logOdds));
}

export function resolveAbandonmentBaseProbability(explanation: {
  baseProbability?: number;
  expectedValue?: number;
}): number | null {
  if (typeof explanation.baseProbability === 'number' && Number.isFinite(explanation.baseProbability)) {
    return Math.max(0, Math.min(1, explanation.baseProbability));
  }
  if (typeof explanation.expectedValue === 'number' && Number.isFinite(explanation.expectedValue)) {
    return abandonmentLogOddsToProbability(explanation.expectedValue);
  }
  return null;
}

/** Confidence as normalized distance from the decision threshold (mirrors `ml/predict.py`). */
export function computeAbandonmentConfidence(
  abandonmentRisk: number,
  threshold: number,
): number {
  const denom = Math.max(threshold, 1 - threshold);
  if (denom <= 0) return 0;
  return Math.abs(abandonmentRisk - threshold) / denom;
}

/** Default proactive toast confidence gate: lower in dev/test, stricter in production. */
export function defaultAbandonmentMinConfidence(): number {
  return process.env.NODE_ENV === 'production' ? 0.4 : 0.3;
}

export const DEFAULT_IDLE_TOAST_MIN_SECONDS = 120;

export type AbandonmentToastVia = 'ml' | 'idle_hybrid';

export interface AbandonmentToastEligibility {
  eligible: boolean;
  reason: string;
  via?: AbandonmentToastVia;
}

export interface AbandonmentIdleToastParams {
  seconds: number;
  localRisk: number;
  signalCount: number;
  enabled?: boolean;
  minSeconds?: number;
  minLocalRisk?: number;
  minSignals?: number;
}

function evaluateMlToastEligibility(params: {
  result: AbandonmentPredictionClientResult | null;
  threshold: number;
  minConfidence: number;
  proactiveHelp: boolean;
  sessionSeconds: number;
  signalCount: number;
  intentPolicy?: AbandonmentIntentPolicy;
}): AbandonmentToastEligibility {
  const { result, threshold, minConfidence, proactiveHelp, sessionSeconds, signalCount, intentPolicy } =
    params;

  if (!proactiveHelp) {
    return { eligible: false, reason: 'aide proactive désactivée' };
  }

  if (intentPolicy) {
    if (sessionSeconds < intentPolicy.minSessionSeconds) {
      return {
        eligible: false,
        reason: `session ${sessionSeconds}s < min ${intentPolicy.minSessionSeconds}s (intent)`,
      };
    }
    if (
      intentPolicy.requireFrictionSignalsForMlToast &&
      signalCount < Math.max(1, intentPolicy.minSignals)
    ) {
      return {
        eligible: false,
        reason: `ML — signaux ${signalCount} < min ${intentPolicy.minSignals} (friction requise)`,
      };
    }
  }

  if (!result) {
    return { eligible: false, reason: 'aucune prédiction' };
  }
  if (result.source !== 'ml') {
    return { eligible: false, reason: `source ${result.source} (ML requis pour voie ML)` };
  }
  if (result.status !== 'ok') {
    return { eligible: false, reason: `statut ${result.status}` };
  }
  if (!result.prediction) {
    return { eligible: false, reason: 'prédiction vide' };
  }

  const { abandonmentRisk, confidence, willAbandon } = result.prediction;

  if (!willAbandon || abandonmentRisk < threshold) {
    return {
      eligible: false,
      reason: `risque ML ${Math.round(abandonmentRisk * 100)}% < seuil ${Math.round(threshold * 100)}%`,
    };
  }
  if (confidence < minConfidence) {
    return {
      eligible: false,
      reason: `confiance ${Math.round(confidence * 100)}% < min ${Math.round(minConfidence * 100)}%`,
    };
  }

  return { eligible: true, reason: 'voie ML — toutes les conditions remplies', via: 'ml' };
}

function evaluateIdleHybridToastEligibility(params: {
  proactiveHelp: boolean;
  threshold: number;
  idle: AbandonmentIdleToastParams;
  sessionSeconds: number;
  intentPolicy?: AbandonmentIntentPolicy;
}): AbandonmentToastEligibility {
  const { proactiveHelp, threshold, idle, sessionSeconds, intentPolicy } = params;

  if (!proactiveHelp || idle.enabled === false) {
    return { eligible: false, reason: 'voie idle désactivée' };
  }

  if (intentPolicy && sessionSeconds < intentPolicy.minSessionSeconds) {
    return {
      eligible: false,
      reason: `idle — session ${sessionSeconds}s < min ${intentPolicy.minSessionSeconds}s`,
    };
  }

  const minSeconds = idle.minSeconds ?? intentPolicy?.proactiveIdleMinSeconds ?? DEFAULT_IDLE_TOAST_MIN_SECONDS;
  const minLocalRisk = idle.minLocalRisk ?? intentPolicy?.proactiveIdleMinLocalRisk ?? threshold;
  const minSignals = Math.max(
    1,
    idle.minSignals ?? intentPolicy?.proactiveIdleMinSignals ?? 2,
  );

  if (idle.signalCount < minSignals) {
    return {
      eligible: false,
      reason: `idle — signaux ${idle.signalCount} < min ${minSignals}`,
    };
  }
  if (idle.localRisk < minLocalRisk) {
    return {
      eligible: false,
      reason: `idle — score local ${Math.round(idle.localRisk * 100)}% < min ${Math.round(minLocalRisk * 100)}%`,
    };
  }
  if (idle.seconds < minSeconds) {
    return {
      eligible: false,
      reason: `idle — inactivité ${idle.seconds}s < min ${minSeconds}s`,
    };
  }

  return {
    eligible: true,
    reason: `voie idle — inactivité ${idle.seconds}s, score local ${Math.round(idle.localRisk * 100)}%`,
    via: 'idle_hybrid',
  };
}

export function evaluateAbandonmentToastEligibility(params: {
  result: AbandonmentPredictionClientResult | null;
  threshold: number;
  minConfidence: number;
  proactiveHelp: boolean;
  sessionSeconds: number;
  signalCount: number;
  intentPolicy?: AbandonmentIntentPolicy;
  idle?: AbandonmentIdleToastParams;
}): AbandonmentToastEligibility {
  const effectiveThreshold = params.intentPolicy?.threshold ?? params.threshold;
  const effectiveMinConfidence = params.intentPolicy?.minConfidence ?? params.minConfidence;

  const mlVerdict = evaluateMlToastEligibility({
    result: params.result,
    threshold: effectiveThreshold,
    minConfidence: effectiveMinConfidence,
    proactiveHelp: params.proactiveHelp,
    sessionSeconds: params.sessionSeconds,
    signalCount: params.signalCount,
    intentPolicy: params.intentPolicy,
  });
  if (mlVerdict.eligible) {
    return mlVerdict;
  }

  if (params.idle) {
    const idleVerdict = evaluateIdleHybridToastEligibility({
      proactiveHelp: params.proactiveHelp,
      threshold: effectiveThreshold,
      idle: params.idle,
      sessionSeconds: params.sessionSeconds,
      intentPolicy: params.intentPolicy,
    });
    if (idleVerdict.eligible) {
      return idleVerdict;
    }

    return {
      eligible: false,
      reason: `${mlVerdict.reason} ; ${idleVerdict.reason}`,
    };
  }

  return mlVerdict;
}
