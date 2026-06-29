import type {
  FaqAudienceMode,
  FaqContextDisplay,
  FaqContentOptions,
  FaqFrequentQuestionsMode,
  FaqPageContext,
} from '../types/faq';

export interface ResolvedFaqContentOptions {
  subtitle: string;
  showResultScore: boolean;
  showStrategyFootnote: boolean;
  contextDisplay: FaqContextDisplay;
  showDetailedLoadingHint: boolean;
  contextSectionLabel: string;
  frequentQuestionsMode: FaqFrequentQuestionsMode;
  frequentQuestionsLimit: number;
  starterQuestions: string[];
}

export const DEFAULT_END_USER_FAQ_SUBTITLE =
  'Posez votre question — nous trouvons la réponse dans la documentation.';

export const DEFAULT_DEVELOPER_FAQ_SUBTITLE =
  'Recherche sémantique sur la base d’aide de votre organisation';

const GENERIC_PAGE_TITLES = /^v0 app$|^next\.js|^localhost|^untitled/i;

function isMeaningfulPathname(pathname?: string): boolean {
  if (!pathname?.trim()) return false;
  return pathname !== '/';
}

/** Human-readable page label for end-user context strip. */
export function formatFaqContextLabel(
  context: FaqPageContext,
  display: FaqContextDisplay = 'page-title',
): string | null {
  if (display === 'hidden') return null;

  if (display === 'summary') {
    const parts: string[] = [];
    if (isMeaningfulPathname(context.pathname)) parts.push(context.pathname!);
    if (context.tourName) parts.push(`Tour : ${context.tourName}`);
    if (context.tourStepTitle) parts.push(`Étape : ${context.tourStepTitle}`);
    return parts.join(' · ') || null;
  }

  const pageTitle = context.pageTitle?.trim();
  if (pageTitle && !GENERIC_PAGE_TITLES.test(pageTitle)) {
    return pageTitle;
  }

  if (context.tourStepTitle?.trim()) {
    return context.tourStepTitle.trim();
  }

  if (isMeaningfulPathname(context.pathname)) {
    return context.pathname!.replace(/^\//, '').replace(/-/g, ' ') || 'Page courante';
  }

  return 'Page courante';
}

export function resolveContextualSuggestionsEnabled(
  options: {
    audience?: FaqAudienceMode;
    frequentQuestionsMode?: FaqFrequentQuestionsMode;
    contextualSuggestionsEnabled?: boolean;
  } = {},
): boolean {
  const audience = options.audience ?? 'end-user';
  const frequentQuestionsMode = options.frequentQuestionsMode ?? (audience === 'end-user' ? 'auto' : 'off');
  const enabled = options.contextualSuggestionsEnabled ?? false;

  if (!enabled) return false;
  if (audience === 'end-user' && frequentQuestionsMode === 'auto') return false;
  return true;
}

export function formatFaqCategoryLabel(category: string, audience: FaqAudienceMode): string {
  const trimmed = category.trim();
  if (!trimmed) return '';
  if (audience === 'developer') return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function resolveFaqContentOptions(
  options: FaqContentOptions = {},
): ResolvedFaqContentOptions {
  const audience = options.audience ?? 'end-user';
  const isEndUser = audience === 'end-user';

  return {
    subtitle:
      options.subtitle ??
      (isEndUser ? DEFAULT_END_USER_FAQ_SUBTITLE : DEFAULT_DEVELOPER_FAQ_SUBTITLE),
    showResultScore: options.showResultScore ?? !isEndUser,
    showStrategyFootnote: options.showStrategyFootnote ?? !isEndUser,
    contextDisplay: options.contextDisplay ?? (isEndUser ? 'hidden' : 'summary'),
    showDetailedLoadingHint: options.showDetailedLoadingHint ?? !isEndUser,
    contextSectionLabel: isEndUser ? 'Vous êtes sur' : 'Contexte',
    frequentQuestionsMode: options.frequentQuestionsMode ?? (isEndUser ? 'auto' : 'off'),
    frequentQuestionsLimit: options.frequentQuestionsLimit ?? 4,
    starterQuestions: options.starterQuestions ?? [],
  };
}
