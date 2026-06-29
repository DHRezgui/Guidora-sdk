/// <reference types="jest" />

import {
  appearanceFromRgb,
  detectHostAppTheme,
  detectHostDocumentTheme,
  parseCssColorToRgb,
  resolveAutoFaqThemeAppearance,
  resolveFaqThemeAppearance,
  resolveFaqThemeAppearanceInitial,
} from '../src/utils/faq-theme';

let originalGetComputedStyle: typeof getComputedStyle;

function installComputedStyleMock(partial: {
  html?: Partial<{ token: string | null; className: string }>;
  body?: Partial<{ token: string | null; className: string; background?: string }>;
  cssVariables?: Record<string, string>;
  colorScheme?: string;
  metaColorScheme?: string;
}): Document {
  const html = {
    getAttribute: (name: string) =>
      name === 'data-theme' || name === 'data-color-scheme' ? partial.html?.token ?? null : null,
    classList: {
      contains: (name: string) => partial.html?.className?.split(/\s+/).includes(name) ?? false,
    },
  };

  const body = {
    getAttribute: (name: string) =>
      name === 'data-theme' || name === 'data-color-scheme' ? partial.body?.token ?? null : null,
    classList: {
      contains: (name: string) => partial.body?.className?.split(/\s+/).includes(name) ?? false,
    },
    parentElement: html,
  };

  const doc = {
    documentElement: html,
    body,
    querySelector: (selector: string) =>
      selector === 'meta[name="color-scheme"]' && partial.metaColorScheme
        ? { getAttribute: () => partial.metaColorScheme ?? null }
        : null,
  } as unknown as Document;

  globalThis.getComputedStyle = ((element: Element) => {
    const cssVariables = partial.cssVariables ?? {};
    const isHtml = element === html;
    const isBody = element === body;

    return {
      colorScheme: isHtml ? partial.colorScheme ?? '' : '',
      backgroundColor: isBody ? partial.body?.background ?? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0)',
      getPropertyValue: (name: string) => (isHtml ? cssVariables[name] ?? '' : ''),
    } as CSSStyleDeclaration;
  }) as typeof getComputedStyle;

  return doc;
}

describe('faq-theme', () => {
  beforeEach(() => {
    originalGetComputedStyle = globalThis.getComputedStyle;
  });

  afterEach(() => {
    globalThis.getComputedStyle = originalGetComputedStyle;
  });

  it('keeps dark as the default legacy palette', () => {
    expect(resolveFaqThemeAppearance()).toBe('dark');
    expect(resolveFaqThemeAppearance(undefined)).toBe('dark');
    expect(resolveFaqThemeAppearance('dark')).toBe('dark');
  });

  it('forces light when themeMode is light', () => {
    expect(resolveFaqThemeAppearance('light')).toBe('light');
  });

  it('reads data-theme from the host document', () => {
    const doc = installComputedStyleMock({ html: { token: 'light' } });
    expect(detectHostDocumentTheme(doc)).toBe('light');
    expect(detectHostAppTheme(doc)).toEqual({ appearance: 'light', source: 'token' });
  });

  it('detects light from host CSS background variables before system preference', () => {
    const doc = installComputedStyleMock({
      cssVariables: {
        '--background': '#FAFBFC',
      },
    });

    expect(resolveAutoFaqThemeAppearance(doc)).toEqual({
      appearance: 'light',
      source: 'css-variable',
    });
  });

  it('detects theme from rendered body background when tokens are absent', () => {
    const doc = installComputedStyleMock({
      body: {
        background: 'rgb(250, 251, 252)',
      },
    });

    expect(resolveAutoFaqThemeAppearance(doc)).toEqual({
      appearance: 'light',
      source: 'computed-background',
    });
  });

  it('falls back to system theme only when host has no signal', () => {
    const doc = installComputedStyleMock({});
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    expect(detectHostAppTheme(doc)).toBeNull();
    expect(resolveAutoFaqThemeAppearance(doc)).toEqual({
      appearance: 'light',
      source: 'system',
    });
  });

  it('uses a stable SSR default for auto mode', () => {
    expect(resolveFaqThemeAppearanceInitial('auto')).toBe('dark');
    expect(resolveFaqThemeAppearance('auto')).toBe('dark');
  });

  it('uses light as the SSR default for host mode', () => {
    expect(resolveFaqThemeAppearanceInitial('host')).toBe('light');
  });

  it('parses common CSS colors for luminance checks', () => {
    expect(parseCssColorToRgb('#FAFBFC')).toEqual([250, 251, 252]);
    expect(parseCssColorToRgb('rgb(2, 2, 2)')).toEqual([2, 2, 2]);
    expect(appearanceFromRgb([250, 251, 252])).toBe('light');
    expect(appearanceFromRgb([2, 2, 2])).toBe('dark');
  });
});
