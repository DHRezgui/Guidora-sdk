import { describe, expect, it } from 'vitest';
import {
  buildContextualFaqSuggestions,
  collectFaqPageContext,
  formatFaqContextSummary,
} from '../src/utils/faq-context';

describe('faq-context', () => {
  it('collectFaqPageContext merges partial overrides', () => {
    const context = collectFaqPageContext({
      pathname: '/settings/profile',
      tourName: 'Welcome tour',
      tourStepTitle: 'Update profile',
    });
    expect(context.pathname).toBe('/settings/profile');
    expect(context.tourName).toBe('Welcome tour');
    expect(context.tourStepTitle).toBe('Update profile');
  });

  it('collectFaqPageContext keeps suggestionKeywords for FAQ ranking', () => {
    const context = collectFaqPageContext({
      suggestionKeywords: ['health score', 'portfolio'],
    });
    expect(context.suggestionKeywords).toEqual(['health score', 'portfolio']);
  });

  it('formatFaqContextSummary includes tour metadata', () => {
    const summary = formatFaqContextSummary({
      pathname: '/checkout',
      tourName: 'POS onboarding',
      tourStepTitle: 'Add item',
    });
    expect(summary).toContain('/checkout');
    expect(summary).toContain('POS onboarding');
    expect(summary).toContain('Add item');
  });

  it('buildContextualFaqSuggestions uses pathname topics', () => {
    const suggestions = buildContextualFaqSuggestions({
      pathname: '/settings/account',
      pageTitle: 'Account settings',
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((item) => /profil|compte|mot de passe/i.test(item.query))).toBe(true);
  });

  it('buildContextualFaqSuggestions prioritizes active tour step', () => {
    const suggestions = buildContextualFaqSuggestions({
      pathname: '/',
      tourStepTitle: 'Scan barcode',
    });
    expect(suggestions[0]?.label).toContain('Scan barcode');
  });

  it('buildContextualFaqSuggestions hides generic domain probe for end users', () => {
    const suggestions = buildContextualFaqSuggestions(
      {
        pathname: '/',
        projectDomain: 'test-13 web application',
      },
      { endUser: true },
    );
    expect(suggestions.some((item) => item.label === 'Aide métier')).toBe(false);
  });
});
