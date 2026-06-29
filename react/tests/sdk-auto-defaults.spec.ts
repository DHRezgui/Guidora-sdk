/// <reference types="jest" />

import {
  detectHostThemeReference,
  detectPushTargetSelector,
  resolveContextualTourViewerOptions,
  resolveFaqAutoOptions,
  resolveSemanticBackendUrl,
} from '../src/utils/sdk-auto-defaults';

describe('sdk-auto-defaults', () => {
  it('resolves semantic backend url from apiUrl when not in local mode', () => {
    expect(resolveSemanticBackendUrl('http://localhost:3020/api/v1', 'hybrid')).toBe(
      'http://localhost:3020/api/v1/tours/contextual/semantic-hints',
    );
    expect(resolveSemanticBackendUrl('http://localhost:3020/api/v1', 'local')).toBeUndefined();
  });

  it('applies end-user FAQ auto wiring defaults', () => {
    const resolved = resolveFaqAutoOptions({
      enabled: true,
      sidebarLayout: 'push',
      themeMode: 'host',
    });

    expect(resolved).toMatchObject({
      enabled: true,
      sidebarLayout: 'push',
      themeMode: 'host',
      topK: 5,
      timeoutMs: 120_000,
      frequentQuestionsMode: 'auto',
      frequentQuestionsLimit: 4,
    });
  });

  it('respects explicit FAQ overrides over auto wiring', () => {
    const resolved = resolveFaqAutoOptions({
      enabled: true,
      sidebarLayout: 'overlay',
      themeMode: 'dark',
      pushTargetSelector: '#app-root',
      hostThemeReference: '[data-tour-id="billing-panel"]',
      frequentQuestionsLimit: 6,
    });

    expect(resolved).toMatchObject({
      sidebarLayout: 'overlay',
      themeMode: 'dark',
      pushTargetSelector: '#app-root',
      hostThemeReference: '[data-tour-id="billing-panel"]',
      frequentQuestionsLimit: 6,
    });
  });

  it('wires contextual auto mode from sdk config', () => {
    const resolved = resolveContextualTourViewerOptions(
      {
        apiKey: 'key',
        apiUrl: 'http://localhost:3020/api/v1',
        sdkToken: 'td_sdk_test',
      },
      {
        mode: 'auto',
        projectDomain: 'Acme billing portal',
      },
      { debug: true },
    );

    expect(resolved?.semanticBackendUrl).toBe(
      'http://localhost:3020/api/v1/tours/contextual/semantic-hints',
    );
    expect(resolved?.publishConfig?.apiKey).toBe('key');
    expect(resolved?.journeyBlueprintsRemoteEnabled).toBe(true);
    expect(resolved?.developerMode).toBe(true);
    expect(resolved?.persona).toBe('admin');
    expect(resolved?.businessObjectives?.length).toBeGreaterThan(0);
    expect(resolved?.semanticHints?.length).toBeGreaterThan(0);
  });

  it('allows contextual persona override in auto mode', () => {
    const resolved = resolveContextualTourViewerOptions(
      { apiUrl: 'http://localhost:3020/api/v1' },
      {
        mode: 'auto',
        persona: 'end-user',
      },
    );

    expect(resolved?.persona).toBe('end-user');
  });

  it('detects Tailwind full-screen push targets when present', () => {
    document.body.innerHTML = `
      <div class="h-screen w-screen" data-tour-id="account-list"></div>
      <div data-trustdev-help-sidebar="true"></div>
    `;

    expect(detectPushTargetSelector()).toBe('.h-screen.w-screen');
    expect(detectHostThemeReference()).toBe('[data-tour-id="account-list"]');
  });

  it('falls back to first body child for push targets on non-Tailwind layouts', () => {
    document.body.innerHTML = `
      <div id="app-root">
        <main data-tour-id="checkout-panel">Checkout</main>
      </div>
    `;

    expect(detectPushTargetSelector()).toBe('body > div:first-of-type');
    expect(detectHostThemeReference()).toBe('[data-tour-id="checkout-panel"]');
  });

  it('skips TrustDev chrome when detecting host theme reference', () => {
    document.body.innerHTML = `
      <section data-tour-id="trustdev-help-sidebar"></section>
      <article data-tour-id="product-catalog">Catalog</article>
    `;

    expect(detectHostThemeReference()).toBe('[data-tour-id="product-catalog"]');
  });
});
