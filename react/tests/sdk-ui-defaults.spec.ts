/// <reference types="jest" />

import {
  DEFAULT_HOST_HEURISTIC_AVOID_SELECTORS,
  DEFAULT_SDK_FAQ_DEFAULTS,
  mergeTourViewerFaqOptions,
  normalizeSdkDockLayoutConfig,
  normalizeSdkFaqDefaults,
  resolveInitHostAvoidSelectors,
} from '../src/utils/sdk-ui-defaults';

describe('sdk-ui-defaults', () => {
  it('enables dock layout and host heuristics by default', () => {
    expect(normalizeSdkDockLayoutConfig()).toEqual({
      enabled: true,
      useHostHeuristics: true,
      hostAvoidSelectors: [],
      minClearancePx: 420,
    });
  });

  it('opts out of dock layout when init passes false', () => {
    expect(normalizeSdkDockLayoutConfig(false).enabled).toBe(false);
  });

  it('merges heuristic and explicit host avoid selectors', () => {
    const selectors = resolveInitHostAvoidSelectors(normalizeSdkDockLayoutConfig(), [
      '[data-cart]',
    ]);

    expect(selectors).toEqual(expect.arrayContaining(['[data-cart]']));
    expect(selectors).toEqual(
      expect.arrayContaining([DEFAULT_HOST_HEURISTIC_AVOID_SELECTORS[0]]),
    );
  });

  it('applies sidebar FAQ defaults when TourViewer passes a partial faq prop', () => {
    const merged = mergeTourViewerFaqOptions(DEFAULT_SDK_FAQ_DEFAULTS, { enabled: true });

    expect(merged).toMatchObject({
      enabled: true,
      presentation: 'sidebar',
      startCollapsed: true,
      themeMode: 'host',
      modal: false,
      sidebarLayout: 'push',
      audience: 'end-user',
      frequentQuestionsMode: 'auto',
    });
  });

  it('opts out of FAQ defaults when init passes faqDefaults false', () => {
    expect(normalizeSdkFaqDefaults(false)).toBeNull();
    expect(mergeTourViewerFaqOptions(null, { enabled: true })).toEqual({ enabled: true });
  });
});
