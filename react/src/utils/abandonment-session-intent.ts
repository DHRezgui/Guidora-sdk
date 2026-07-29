import type {
  AbandonmentIntentPolicy,
  AbandonmentPagePolicy,
  AbandonmentSessionIntent,
  SdkAbandonmentPredictionConfig,
} from '../types/ml';
import { defaultAbandonmentMinConfidence } from './abandonment-confidence';
import { DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES } from './friction-combination';

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
    minDistinctFamilies: DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES,
    allowStrongSingleFamily: true,
    requireMultiFamilyForToast: true,
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
    minDistinctFamilies: DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES,
    allowStrongSingleFamily: true,
    requireMultiFamilyForToast: true,
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
    minDistinctFamilies: DEFAULT_MIN_DISTINCT_FRICTION_FAMILIES,
    allowStrongSingleFamily: true,
    requireMultiFamilyForToast: true,
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

  return mergeIntentPolicyPartial(defaults, {
    threshold: override?.threshold ?? config?.threshold,
    minConfidence: override?.minConfidence ?? config?.minConfidence,
    minSessionSeconds:
      override?.minSessionSeconds ?? config?.proactiveMinSessionSeconds,
    minSignals: override?.minSignals ?? config?.minSignals,
    requireFrictionSignalsForMlToast:
      override?.requireFrictionSignalsForMlToast ??
      config?.proactiveRequireFrictionSignals,
    allowTemporalMlGate: override?.allowTemporalMlGate,
    proactiveIdleMinSeconds:
      override?.proactiveIdleMinSeconds ?? config?.proactiveIdleMinSeconds,
    proactiveIdleMinLocalRisk:
      override?.proactiveIdleMinLocalRisk ?? config?.proactiveIdleMinLocalRisk,
    proactiveIdleMinSignals:
      override?.proactiveIdleMinSignals ?? config?.proactiveIdleMinSignals,
    minDistinctFamilies: override?.minDistinctFamilies,
    allowStrongSingleFamily: override?.allowStrongSingleFamily,
    requireMultiFamilyForToast:
      override?.requireMultiFamilyForToast ?? config?.proactiveRequireMultiFamily,
  });
}

export interface AbandonmentPageContext {
  /** Pathname or full page URL (logical page URL segment). */
  url: string;
  /** Full logical page key (URL + title + nav + H1). */
  logicalKey?: string;
  /** Soft-SPA identity (`url + nav:` / `h1:`). */
  identity?: string;
}

export interface ResolvedAbandonmentPolicy {
  policy: AbandonmentIntentPolicy;
  /** Matched page policy label, if any. */
  pagePolicyLabel: string | null;
  pagePolicyMatch: string | null;
}

/**
 * Intent policy + first matching page override (Phase 4).
 */
export function resolveEffectiveAbandonmentPolicy(
  config: SdkAbandonmentPredictionConfig | null | undefined,
  intent: AbandonmentSessionIntent,
  page?: AbandonmentPageContext | null,
): ResolvedAbandonmentPolicy {
  const base = resolveAbandonmentIntentPolicy(config, intent);
  const matched = matchAbandonmentPagePolicy(config?.pagePolicies, page);
  if (!matched) {
    return { policy: base, pagePolicyLabel: null, pagePolicyMatch: null };
  }
  return {
    policy: mergeIntentPolicyPartial(base, matched.policy),
    pagePolicyLabel: matched.label ?? matched.match,
    pagePolicyMatch: matched.match,
  };
}

export function matchAbandonmentPagePolicy(
  policies: AbandonmentPagePolicy[] | undefined,
  page?: AbandonmentPageContext | null,
): AbandonmentPagePolicy | null {
  if (!policies?.length || !page) return null;
  const haystacks = [
    page.url,
    page.logicalKey,
    page.identity,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase());

  if (haystacks.length === 0) return null;

  for (const policy of policies) {
    const pattern = (policy.match || '').trim();
    if (!pattern) continue;
    if (haystacks.some((haystack) => matchesPagePattern(haystack, pattern.toLowerCase()))) {
      return policy;
    }
  }
  return null;
}

/**
 * Simple matcher: substring, or `*` wildcards (`settings*` → prefix/suffix/contains).
 */
export function matchesPagePattern(haystack: string, pattern: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes('*')) {
    return haystack.includes(pattern);
  }
  const parts = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`^${parts.join('.*')}$`, 'i');
  if (regex.test(haystack)) return true;
  // Also allow wildcard patterns to match as substring when not anchored by design.
  const containsRegex = new RegExp(parts.filter(Boolean).join('.*'), 'i');
  return containsRegex.test(haystack);
}

function mergeIntentPolicyPartial(
  base: AbandonmentIntentPolicy,
  partial: Partial<AbandonmentIntentPolicy> | undefined,
): AbandonmentIntentPolicy {
  if (!partial) return { ...base };
  return {
    threshold: partial.threshold ?? base.threshold,
    minConfidence: partial.minConfidence ?? base.minConfidence,
    minSessionSeconds: partial.minSessionSeconds ?? base.minSessionSeconds,
    minSignals: partial.minSignals ?? base.minSignals,
    requireFrictionSignalsForMlToast:
      partial.requireFrictionSignalsForMlToast ?? base.requireFrictionSignalsForMlToast,
    allowTemporalMlGate: partial.allowTemporalMlGate ?? base.allowTemporalMlGate,
    proactiveIdleMinSeconds:
      partial.proactiveIdleMinSeconds ?? base.proactiveIdleMinSeconds,
    proactiveIdleMinLocalRisk:
      partial.proactiveIdleMinLocalRisk ?? base.proactiveIdleMinLocalRisk,
    proactiveIdleMinSignals:
      partial.proactiveIdleMinSignals ?? base.proactiveIdleMinSignals,
    minDistinctFamilies: partial.minDistinctFamilies ?? base.minDistinctFamilies,
    allowStrongSingleFamily:
      partial.allowStrongSingleFamily ?? base.allowStrongSingleFamily,
    requireMultiFamilyForToast:
      partial.requireMultiFamilyForToast ?? base.requireMultiFamilyForToast,
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
