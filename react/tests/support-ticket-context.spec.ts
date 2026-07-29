/// <reference types="jest" />

import {
  buildSupportTicketSessionContext,
  resolveSupportPresentation,
} from '../src/utils/support-ticket-context';
import {
  __resetSupportTicketRuntimeSignalsForTests,
  captureSupportHelpEpisode,
  parseBrowserLabel,
  recordSupportCompletedTour,
  recordSupportFaqSearch,
  sanitizeNavigationUrl,
  getSupportTicketRuntimeSignals,
} from '../src/utils/support-ticket-runtime-signals';

describe('support-ticket-context', () => {
  it('prefers inline form when enabled or url missing', () => {
    expect(resolveSupportPresentation({ supportInlineForm: true, supportContactUrl: 'mailto:a@b.c' })).toBe('form');
    expect(resolveSupportPresentation({ supportContactUrl: null })).toBe('form');
    expect(resolveSupportPresentation({ supportContactUrl: 'https://support.example.com' })).toBe('link');
  });

  it('normalizes numeric context fields', () => {
    const context = buildSupportTicketSessionContext({
      pageUrl: 'https://app.test/page',
      sessionId: 'sess-1',
      projectKey: 'test-13-v1',
      assistanceState: 'faq',
      abandonmentRisk: 1.5,
      frictionScore: -0.2,
      timeOnPage: 42.8,
      pageTime: 12.1,
      contactEmail: ' user@test.com ',
      browser: 'Chrome/120 · Windows',
      faqSearchCount: 2.7,
      faqLastQuery: '  comment facturer  ',
      activeTourId: 'tour-1',
      activeTourStep: 1.9,
      navigationHistory: [
        'https://app.test/a?token=secret',
        'https://app.test/b#hash',
        'https://app.test/b#hash',
        'https://app.test/?view=analytics',
      ],
    });

    expect(context).toEqual({
      pageUrl: 'https://app.test/page',
      sessionId: 'sess-1',
      projectKey: 'test-13-v1',
      assistanceState: 'faq',
      abandonmentRisk: 1,
      frictionScore: 0,
      timeOnPage: 42,
      pageTime: 12,
      contactEmail: 'user@test.com',
      browser: 'Chrome/120 · Windows',
      faqSearchCount: 2,
      faqLastQuery: 'comment facturer',
      activeTourId: 'tour-1',
      activeTourStep: 1,
      navigationHistory: [
        'https://app.test/a',
        'https://app.test/b#hash',
        'https://app.test/?view=analytics',
      ],
    });
  });

  it('keeps a sanitized help episode + last completed tour', () => {
    const context = buildSupportTicketSessionContext({
      episode: {
        trigger: 'proactiveToast',
        frictionAtTrigger: 0.65,
        riskAtTrigger: 1.2,
        timeOnPageAtTrigger: 127.8,
        pageTimeAtTrigger: 120.2,
        idleSecondsAtTrigger: 89.4,
        capturedAt: '2026-07-10T14:32:00.000Z',
      },
      lastCompletedTourId: ' tour-abc ',
      lastCompletedTourName: ' Onboarding facturation ',
    });

    expect(context.episode).toEqual({
      trigger: 'proactiveToast',
      frictionAtTrigger: 0.65,
      riskAtTrigger: 1,
      timeOnPageAtTrigger: 127,
      pageTimeAtTrigger: 120,
      idleSecondsAtTrigger: 89,
      capturedAt: '2026-07-10T14:32:00.000Z',
    });
    expect(context.lastCompletedTourId).toBe('tour-abc');
    expect(context.lastCompletedTourName).toBe('Onboarding facturation');
  });

  it('drops invalid episode triggers', () => {
    const context = buildSupportTicketSessionContext({
      episode: {
        trigger: 'unknown' as 'manualFaq',
        capturedAt: '2026-07-10T14:32:00.000Z',
      },
    });
    expect(context.episode).toBeUndefined();
  });
});

describe('support-ticket-runtime-signals', () => {
  beforeEach(() => {
    __resetSupportTicketRuntimeSignalsForTests();
  });

  it('parses a compact browser label', () => {
    expect(
      parseBrowserLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome/120 · Windows');
  });

  it('keeps safe query/hash while stripping secrets', () => {
    expect(sanitizeNavigationUrl('https://app.test/path?token=abc&view=invoices#section')).toBe(
      'https://app.test/path?view=invoices#section',
    );
  });

  it('records faq searches for ticket context', () => {
    recordSupportFaqSearch('facture');
    recordSupportFaqSearch('paiement échoué');
    const signals = getSupportTicketRuntimeSignals();
    expect(signals.faqSearchCount).toBe(2);
    expect(signals.faqLastQuery).toBe('paiement échoué');
  });

  it('overwrites help episode on each capture', () => {
    captureSupportHelpEpisode({
      trigger: 'proactiveToast',
      frictionAtTrigger: 0.8,
      riskAtTrigger: 0.9,
      timeOnPageAtTrigger: 120,
    });
    captureSupportHelpEpisode({
      trigger: 'manualFaq',
      frictionAtTrigger: 0.1,
      riskAtTrigger: 0.2,
      timeOnPageAtTrigger: 10,
    });
    const signals = getSupportTicketRuntimeSignals();
    expect(signals.episode?.trigger).toBe('manualFaq');
    expect(signals.episode?.frictionAtTrigger).toBe(0.1);
    expect(signals.episode?.timeOnPageAtTrigger).toBe(10);
  });

  it('records last completed tour', () => {
    recordSupportCompletedTour('tour-1', 'Facturation');
    const signals = getSupportTicketRuntimeSignals();
    expect(signals.lastCompletedTourId).toBe('tour-1');
    expect(signals.lastCompletedTourName).toBe('Facturation');
  });
});
