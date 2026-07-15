import type {
  AbandonmentIntentPolicy,
  AbandonmentSessionIntent,
  SdkAbandonmentPredictionConfig,
} from '../types/ml';
import { defaultAbandonmentMinConfidence } from './abandonment-confidence';

export const ABANDONMENT_SESSION_INTENTS = ['onboarding', 'exploration', 'returning'] as const;

export const DEFAULT_ABANDONMENT_INTENT_POLICIES: Record<
  AbandonmentSessionIntent,
  AbandonmentIntentPolicy
> = {
  onboarding: {
    threshold: 0.55,
    minConfidence: 0.35,
    minSessionSeconds: 120,
    minSignals: 2,
    requireFrictionSignalsForMlToast: true,
    allowTemporalMlGate: false,
    proactiveIdleMinSeconds: 150,
    proactiveIdleMinLocalRisk: 0.5,
    proactiveIdleMinSignals: 2,
  },
  exploration: {
    threshold: 0.5,
    minConfidence: 0.32,
    minSessionSeconds: 90,
    minSignals: 2,
    requireFrictionSignalsForMlToast: true,
    allowTemporalMlGate: false,
    proactiveIdleMinSeconds: 120,
    proactiveIdleMinLocalRisk: 0.45,
    proactiveIdleMinSignals: 2,
  },
  returning: {
    threshold: 0.45,
    minConfidence: defaultAbandonmentMinConfidence(),
    minSessionSeconds: 60,
    minSignals: 2,
    requireFrictionSignalsForMlToast: true,
    allowTemporalMlGate: true,
    proactiveIdleMinSeconds: 120,
    proactiveIdleMinLocalRisk: 0.45,
    proactiveIdleMinSignals: 2,
  },
};

export interface ResolveAbandonmentSessionIntentParams {
  explicitIntent?: AbandonmentSessionIntent;
  isTourActive: boolean;
  organizationVisitCount: number;
  pageVisitCount: number;
}

/**
 * Infer session intent for abandonment gates and thresholds.
 * Explicit config wins; otherwise tour + visit history drive the policy.
 */
export function resolveAbandonmentSessionIntent(
  params: ResolveAbandonmentSessionIntentParams,
): AbandonmentSessionIntent {
  if (params.explicitIntent) {
    return params.explicitIntent;
  }
  if (params.isTourActive) {
    return 'onboarding';
  }
  if (params.organizationVisitCount <= 1) {
    return 'onboarding';
  }
  if (params.organizationVisitCount >= 3 || params.pageVisitCount > 1) {
    return 'returning';
  }
  return 'exploration';
}

export function resolveAbandonmentIntentPolicy(
  config: SdkAbandonmentPredictionConfig | null | undefined,
  intent: AbandonmentSessionIntent,
): AbandonmentIntentPolicy {
  const defaults = DEFAULT_ABANDONMENT_INTENT_POLICIES[intent];
  const override = config?.intentPolicies?.[intent];

  return {
    threshold: override?.threshold ?? config?.threshold ?? defaults.threshold,
    minConfidence: override?.minConfidence ?? config?.minConfidence ?? defaults.minConfidence,
    minSessionSeconds:
      override?.minSessionSeconds ??
      config?.proactiveMinSessionSeconds ??
      defaults.minSessionSeconds,
    minSignals: override?.minSignals ?? config?.minSignals ?? defaults.minSignals,
    requireFrictionSignalsForMlToast:
      override?.requireFrictionSignalsForMlToast ??
      config?.proactiveRequireFrictionSignals ??
      defaults.requireFrictionSignalsForMlToast,
    allowTemporalMlGate:
      override?.allowTemporalMlGate ?? defaults.allowTemporalMlGate,
    proactiveIdleMinSeconds:
      override?.proactiveIdleMinSeconds ??
      config?.proactiveIdleMinSeconds ??
      defaults.proactiveIdleMinSeconds,
    proactiveIdleMinLocalRisk:
      override?.proactiveIdleMinLocalRisk ??
      config?.proactiveIdleMinLocalRisk ??
      defaults.proactiveIdleMinLocalRisk,
    proactiveIdleMinSignals:
      override?.proactiveIdleMinSignals ??
      config?.proactiveIdleMinSignals ??
      defaults.proactiveIdleMinSignals,
  };
}

export function formatAbandonmentSessionIntent(intent: AbandonmentSessionIntent): string {
  switch (intent) {
    case 'onboarding':
      return 'première utilisation / tour';
    case 'exploration':
      return 'exploration libre';
    case 'returning':
      return 'usage récurrent';
    default:
      return intent;
  }
}
