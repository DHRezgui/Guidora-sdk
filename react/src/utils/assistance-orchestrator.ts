import type { AssistanceState } from '../types/ml';

/** Delay before ML polling resumes after a guided tour ends. */
export const ASSISTANCE_ML_RESUME_DELAY_MS = 5_000;

export const ASSISTANCE_STATE_LABELS: Record<AssistanceState, string> = {
  none: 'Aucune',
  tour: 'Parcours',
  faq: 'Aide / FAQ',
  proactiveToast: 'Toast proactif',
};

/**
 * Allowed assistance transitions. Tour always wins (any → tour).
 * Single source of truth for the orchestrator in `useOnboarding`.
 */
export function canTransitionAssistance(
  from: AssistanceState,
  to: AssistanceState,
): boolean {
  if (from === to) return true;
  if (to === 'tour') return true;
  if (from === 'none' && (to === 'faq' || to === 'proactiveToast')) return true;
  if (from === 'proactiveToast' && (to === 'faq' || to === 'none')) return true;
  if (from === 'faq' && to === 'none') return true;
  if (from === 'tour' && to === 'none') return true;
  return false;
}

export function formatAssistanceState(state: AssistanceState): string {
  return ASSISTANCE_STATE_LABELS[state] ?? state;
}
