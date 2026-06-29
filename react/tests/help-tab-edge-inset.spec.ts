/// <reference types="jest" />

import { measureHelpTabEdgeInset } from '../src/utils/help-tab-edge-inset';

function installScrollableDocument(options: {
  scrollHeight: number;
  clientHeight: number;
  innerWidth: number;
  clientWidth: number;
  direction?: 'ltr' | 'rtl';
}): Document {
  const html = {
    scrollHeight: options.scrollHeight,
    clientHeight: options.clientHeight,
    clientWidth: options.clientWidth,
  };

  const doc = {
    documentElement: html,
    body: {},
  } as unknown as Document;

  globalThis.window = {
    innerWidth: options.innerWidth,
    getComputedStyle: () =>
      ({
        direction: options.direction ?? 'ltr',
      }) as CSSStyleDeclaration,
  } as Window & typeof globalThis;

  return doc;
}

describe('measureHelpTabEdgeInset', () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  it('returns 0 when the page does not scroll vertically', () => {
    const doc = installScrollableDocument({
      scrollHeight: 800,
      clientHeight: 800,
      innerWidth: 1280,
      clientWidth: 1263,
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(0);
  });

  it('offsets the right tab when a classic scrollbar is visible', () => {
    const doc = installScrollableDocument({
      scrollHeight: 2000,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1263,
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(4);
  });

  it('does not offset the left tab when the scrollbar is on the right', () => {
    const doc = installScrollableDocument({
      scrollHeight: 2000,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1263,
    });

    expect(measureHelpTabEdgeInset('left', doc)).toBe(0);
  });

  it('returns 0 for overlay scrollbars without gutter width', () => {
    const doc = installScrollableDocument({
      scrollHeight: 2000,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1280,
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(0);
  });
});
