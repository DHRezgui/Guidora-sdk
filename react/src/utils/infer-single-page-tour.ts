import type { TourDraftGenerationOptions } from '../types';
import type { DetectedElement } from './tour-suggestion-generator';

/**
 * Detects tabbed / shallow single-view apps (CRM dashboard, POS, task boards)
 * where the 7-slot singlePageTour chain works better than multi-draft heuristic.
 */
export function inferSinglePageTourFromPage(
  candidates: DetectedElement[],
  _options?: TourDraftGenerationOptions,
): boolean {
  if (typeof document === 'undefined') return false;

  let tabCount = 0;
  try {
    tabCount = document.querySelectorAll('[role="tab"]').length;
  } catch {
    tabCount = 0;
  }

  const tabLikeNav = candidates.filter((candidate) => {
    const label = (candidate.label || '').toLowerCase();
    const selector = (candidate.selector || '').toLowerCase();
    return (
      selector.includes('[role="tab"]') ||
      selector.includes('role="tab"') ||
      /\btab\b/.test(label)
    );
  }).length;

  const effectiveTabs = Math.max(tabCount, tabLikeNav);
  if (effectiveTabs < 2 || effectiveTabs > 14) {
    return false;
  }

  const navLinks = candidates.filter(
    (candidate) =>
      candidate.intent === 'support-navigation' ||
      /nav|menu|sidebar/i.test(candidate.selector) ||
      /^a\[href/.test(candidate.selector),
  );

  const routeHints = new Set<string>();
  for (const link of navLinks) {
    const match = link.selector.match(/href[*^$]*=["']([^"']+)["']/i);
    if (match?.[1]) {
      const path = match[1].split('?')[0].split('#')[0];
      if (path && path !== '#' && path !== '/') {
        routeHints.add(path);
      }
    }
  }

  const shallowApp = routeHints.size <= 4;
  const hasPrimaryAction = candidates.some((candidate) => candidate.intent === 'primary-action');

  return shallowApp && hasPrimaryAction;
}

export function shouldAutoApplySinglePageTour(
  options: TourDraftGenerationOptions | undefined,
  candidates: DetectedElement[],
): boolean {
  if (options?.singlePageTour === true) return false;
  if (options?.autoDetectSinglePageTour === false) return false;
  return inferSinglePageTourFromPage(candidates, options);
}
