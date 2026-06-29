import { describe, expect, it } from '@jest/globals';
import {
  formatFaqCategoryLabel,
  formatFaqContextLabel,
  resolveContextualSuggestionsEnabled,
  resolveFaqContentOptions,
} from '../src/utils/faq-content';

describe('formatFaqContextLabel', () => {
  it('prefers human page title over pathname', () => {
    expect(
      formatFaqContextLabel(
        { pageTitle: 'Portfolio Overview', pathname: '/' },
        'page-title',
      ),
    ).toBe('Portfolio Overview');
  });

  it('hides pathname-only context in page-title mode', () => {
    expect(formatFaqContextLabel({ pathname: '/' }, 'page-title')).toBe('Page courante');
  });

  it('keeps technical summary in developer mode', () => {
    expect(
      formatFaqContextLabel(
        { pathname: '/accounts', tourName: 'Onboarding ORBIT' },
        'summary',
      ),
    ).toBe('/accounts · Tour : Onboarding ORBIT');
  });
});

describe('resolveFaqContentOptions', () => {
  it('defaults to end-user friendly content', () => {
    const options = resolveFaqContentOptions({});
    expect(options.showResultScore).toBe(false);
    expect(options.showStrategyFootnote).toBe(false);
    expect(options.contextDisplay).toBe('hidden');
    expect(options.frequentQuestionsMode).toBe('auto');
    expect(options.contextSectionLabel).toBe('Vous êtes sur');
  });

  it('enables diagnostics for developer audience', () => {
    const options = resolveFaqContentOptions({ audience: 'developer' });
    expect(options.showResultScore).toBe(true);
    expect(options.showStrategyFootnote).toBe(true);
    expect(options.contextDisplay).toBe('summary');
  });

  it('hides contextual suggestions for end-user auto frequent questions', () => {
    expect(
      resolveContextualSuggestionsEnabled({
        audience: 'end-user',
        frequentQuestionsMode: 'auto',
        contextualSuggestionsEnabled: true,
      }),
    ).toBe(false);
  });
});

describe('formatFaqCategoryLabel', () => {
  it('title-cases categories for end users', () => {
    expect(formatFaqCategoryLabel('SUPPORT', 'end-user')).toBe('Support');
  });
});
