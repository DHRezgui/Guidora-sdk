/// <reference types="jest" />

import {
  MAX_HELP_TAB_SCROLLBAR_INSET_PX,
  measureHelpTabEdgeInset,
} from '../src/utils/help-tab-edge-inset';

function installScrollableDocument(options: {
  scrollHeight: number;
  clientHeight: number;
  innerWidth: number;
  clientWidth: number;
  direction?: 'ltr' | 'rtl';
  bodyChildren?: HTMLElement[];
}): Document {
  const html = {
    scrollHeight: options.scrollHeight,
    clientHeight: options.clientHeight,
    clientWidth: options.clientWidth,
  };

  const bodyChildren = options.bodyChildren ?? [];
  const body = {
    querySelectorAll: (selector: string) => {
      if (selector !== '*') return [] as unknown as NodeListOf<Element>;
      return bodyChildren as unknown as NodeListOf<Element>;
    },
  };

  const doc = {
    documentElement: html,
    body,
  } as unknown as Document;

  globalThis.window = {
    innerWidth: options.innerWidth,
    getComputedStyle: (el: Element) => {
      if (el === html || el === (html as unknown as Element)) {
        return {
          direction: options.direction ?? 'ltr',
        } as CSSStyleDeclaration;
      }
      const styled = el as HTMLElement & {
        __testOverflowY?: string;
        __testBorderX?: number;
      };
      return {
        direction: options.direction ?? 'ltr',
        overflowY: styled.__testOverflowY ?? 'visible',
        borderLeftWidth: '0px',
        borderRightWidth: `${styled.__testBorderX ?? 0}px`,
      } as CSSStyleDeclaration;
    },
  } as Window & typeof globalThis;

  return doc;
}

function makeOverflowScroller(options: {
  scrollHeight: number;
  clientHeight: number;
  offsetWidth: number;
  clientWidth: number;
  rectRight: number;
  rectLeft?: number;
  overflowY?: string;
}): HTMLElement {
  const el = {
    scrollHeight: options.scrollHeight,
    clientHeight: options.clientHeight,
    offsetWidth: options.offsetWidth,
    clientWidth: options.clientWidth,
    __testOverflowY: options.overflowY ?? 'auto',
    __testBorderX: 0,
    closest: () => null,
    getBoundingClientRect: () => ({
      left: options.rectLeft ?? 0,
      right: options.rectRight,
      top: 0,
      bottom: options.clientHeight,
      width: options.offsetWidth,
      height: options.clientHeight,
      x: options.rectLeft ?? 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;

  return el;
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

  it('offsets the right tab when a classic document scrollbar is visible', () => {
    const doc = installScrollableDocument({
      scrollHeight: 2000,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1263,
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(MAX_HELP_TAB_SCROLLBAR_INSET_PX);
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

  it('detects a classic scrollbar on a near-edge overflow container', () => {
    const scroller = makeOverflowScroller({
      scrollHeight: 2000,
      clientHeight: 900,
      offsetWidth: 804,
      clientWidth: 800,
      rectRight: 1280,
    });

    const doc = installScrollableDocument({
      scrollHeight: 900,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1280,
      bodyChildren: [scroller],
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(MAX_HELP_TAB_SCROLLBAR_INSET_PX);
  });

  it('ignores overflow scrollers that are not near the dock edge', () => {
    const scroller = makeOverflowScroller({
      scrollHeight: 2000,
      clientHeight: 900,
      offsetWidth: 804,
      clientWidth: 800,
      rectRight: 900,
    });

    const doc = installScrollableDocument({
      scrollHeight: 900,
      clientHeight: 900,
      innerWidth: 1280,
      clientWidth: 1280,
      bodyChildren: [scroller],
    });

    expect(measureHelpTabEdgeInset('right', doc)).toBe(0);
  });
});
