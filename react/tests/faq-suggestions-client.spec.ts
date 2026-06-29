import { describe, expect, it } from '@jest/globals';
import { buildFaqSuggestionContext } from '../src/utils/faq-suggestions-client';

describe('buildFaqSuggestionContext', () => {
  it('merges page and custom keywords for FAQ ranking', () => {
    expect(
      buildFaqSuggestionContext({
        pageTitle: 'Portfolio Overview',
        suggestionKeywords: ['health score', 'accounts at risk'],
      }),
    ).toBe('Portfolio Overview health score accounts at risk');
  });
});
