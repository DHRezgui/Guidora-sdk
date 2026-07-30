/// <reference types="jest" />

import { resolveHostFaqTheme } from '../src/utils/host-faq-theme';

function installHostThemeMock(cssVariables: Record<string, string>): Document {
  const html = {
    getAttribute: () => null,
    classList: { contains: () => false },
  };
  const body = {
    getAttribute: () => null,
    classList: { contains: () => false },
    parentElement: html,
  };

  const doc = {
    documentElement: html,
    body,
    querySelector: () => null,
  } as unknown as Document;

  const getComputedStyleMock = ((element: Element) => {
    const isHtml = element === html;
    const isBody = element === body;
    return {
      colorScheme: '',
      backgroundColor: isBody ? 'rgb(250, 251, 252)' : 'rgba(0, 0, 0, 0)',
      color: isBody ? 'rgb(15, 23, 42)' : '',
      borderColor: 'rgba(0, 0, 0, 0)',
      fontFamily: isBody ? '"Geist", system-ui, sans-serif' : '',
      getPropertyValue: (name: string) => (isHtml ? cssVariables[name] ?? '' : ''),
    } as CSSStyleDeclaration;
  }) as typeof getComputedStyle;

  globalThis.getComputedStyle = getComputedStyleMock;
  (globalThis as { window: typeof globalThis }).window = Object.assign(globalThis, {
    getComputedStyle: getComputedStyleMock,
  }) as typeof globalThis & Window;
  (globalThis as { document: Document }).document = doc;

  return doc;
}

describe('host-faq-theme', () => {
  let originalGetComputedStyle: typeof getComputedStyle;
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    originalGetComputedStyle = globalThis.getComputedStyle;
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    globalThis.getComputedStyle = originalGetComputedStyle;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
      Reflect.deleteProperty(globalThis, 'document');
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('maps shadcn host tokens onto FAQ CSS variables', () => {
    const doc = installHostThemeMock({
      '--background': '#FAFBFC',
      '--foreground': '#0F172A',
      '--primary': '#0066FF',
      '--primary-foreground': '#FFFFFF',
      '--border': 'rgba(15, 23, 42, 0.06)',
      '--radius': '6',
      '--card': '#FFFFFF',
      '--muted-foreground': '#64748B',
    });

    const snapshot = resolveHostFaqTheme({ root: doc });

    expect(snapshot.appearance).toBe('light');
    expect(snapshot.cssVars['--td-faq-surface-sidebar']).toBe('#FFFFFF');
    expect(snapshot.cssVars['--td-faq-accent']).toBe('#0066FF');
    expect(snapshot.cssVars['--td-faq-title']).toBe('#0F172A');
    expect(snapshot.cssVars['--td-faq-radius']).toBe('6px');
    expect(snapshot.mappedTokenCount).toBeGreaterThan(5);
  });

  it('normalizes shadcn hsl token components into valid FAQ surface colors', () => {
    const doc = installHostThemeMock({
      '--background': '0 0% 100%',
      '--foreground': '222.2 84% 4.9%',
      '--primary': '221.2 83.2% 53.3%',
      '--primary-foreground': '210 40% 98%',
      '--border': '214.3 31.8% 91.4%',
      '--radius': '0.75',
      '--card': '0 0% 100%',
      '--muted-foreground': '215.4 16.3% 46.9%',
      '--accent': '210 40% 96%',
    });

    const snapshot = resolveHostFaqTheme({ root: doc });

    expect(snapshot.cssVars['--td-faq-surface-sidebar']).toBe('hsl(0 0% 100%)');
    expect(snapshot.cssVars['--td-faq-accent']).toBe('hsl(221.2 83.2% 53.3%)');
    expect(snapshot.cssVars['--td-faq-title']).toBe('hsl(222.2 84% 4.9%)');
  });

  it('forces high-contrast accent text when host foreground clashes with primary', () => {
    const doc = installHostThemeMock({
      '--background': '#FAFBFC',
      '--foreground': '#0F172A',
      '--primary': '#0066FF',
      // Same as primary — unusable on accent fills (Rechercher / "?").
      '--primary-foreground': '#0066FF',
      '--card': '#FFFFFF',
      '--accent': '#EFF6FF',
    });

    const snapshot = resolveHostFaqTheme({ root: doc });

    expect(snapshot.cssVars['--td-faq-accent']).toBe('#0066FF');
    expect(snapshot.cssVars['--td-faq-accent-text']).toBe('#ffffff');
    expect(snapshot.cssVars['--td-faq-chip-text']).toBe('#0066FF');
  });

  it('derives readable chip text when accent and chip background are similar', () => {
    const doc = installHostThemeMock({
      '--background': '#0a1f0a',
      '--foreground': '#ecfdf5',
      '--primary': '#166534',
      '--primary-foreground': '#166534',
      '--accent': '#166534',
      '--secondary': '#14532d',
      '--border': 'rgba(236, 253, 245, 0.2)',
      '--card': '#0f2f1a',
      '--muted-foreground': '#86efac',
    });

    const snapshot = resolveHostFaqTheme({ root: doc });

    expect(snapshot.cssVars['--td-faq-chip-bg']).toBe('#166534');
    expect(snapshot.cssVars['--td-faq-accent-text']).toBe('#ffffff');
    expect(snapshot.cssVars['--td-faq-chip-text']).not.toBe(snapshot.cssVars['--td-faq-chip-bg']);
  });
});
