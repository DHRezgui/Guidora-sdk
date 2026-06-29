/// <reference types="jest" />

import {
  measureSideClearance,
  resolveHelpDockSide,
  resolveSdkDockLayout,
} from '../src/utils/help-dock-side';

function rect(left: number, width: number, height = 600): DOMRect {
  return {
    left,
    right: left + width,
    top: 0,
    bottom: height,
    width,
    height,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('help-dock-side', () => {
  it('keeps preferred side when no avoid selectors are provided', () => {
    expect(resolveHelpDockSide({ preferredSide: 'right' })).toBe('right');
    expect(resolveHelpDockSide({ preferredSide: 'left' })).toBe('left');
  });

  it('flips to left when a right-side panel blocks clearance', () => {
    const viewportWidth = 1280;
    const cart = rect(viewportWidth - 380, 380);

    expect(measureSideClearance('right', viewportWidth, [cart], 24)).toBeLessThan(420);
    expect(
      resolveHelpDockSide({
        preferredSide: 'right',
        avoidSelectors: ['[data-cart]'],
        viewportWidth,
        occupiedRects: [cart],
      }),
    ).toBe('left');
  });

  it('keeps right side when enough clearance remains', () => {
    const viewportWidth = 1600;
    const cart = rect(viewportWidth - 500, 500);

    expect(measureSideClearance('right', viewportWidth, [cart], 24)).toBeGreaterThanOrEqual(420);
    expect(
      resolveHelpDockSide({
        preferredSide: 'right',
        avoidSelectors: ['[data-cart]'],
        viewportWidth,
        occupiedRects: [cart],
      }),
    ).toBe('right');
  });

  it('flips to right when left navigation blocks clearance', () => {
    const viewportWidth = 1280;
    const nav = rect(0, 280);

    expect(measureSideClearance('left', viewportWidth, [nav], 24)).toBeLessThan(420);
    expect(
      resolveHelpDockSide({
        preferredSide: 'left',
        avoidSelectors: ['nav'],
        viewportWidth,
        occupiedRects: [nav],
      }),
    ).toBe('right');
  });

  it('picks the side with the most clearance when both edges are tight', () => {
    const viewportWidth = 1280;
    const nav = rect(0, 280);
    const cart = rect(viewportWidth - 380, 380);

    expect(
      resolveHelpDockSide({
        preferredSide: 'right',
        avoidSelectors: ['nav', 'cart'],
        viewportWidth,
        occupiedRects: [nav, cart],
      }),
    ).toBe('right');
  });

  it('respects blocked sides when choosing fallback placement', () => {
    const viewportWidth = 1280;
    const cart = rect(viewportWidth - 380, 380);

    expect(
      resolveHelpDockSide({
        preferredSide: 'right',
        avoidSelectors: ['cart'],
        viewportWidth,
        occupiedRects: [cart],
        blockedSides: ['left'],
      }),
    ).toBe('right');
  });

  it('coordinates help and contextual surfaces without overlapping', () => {
    const viewportWidth = 1280;
    const cart = rect(viewportWidth - 380, 380);

    const layout = resolveSdkDockLayout({
      helpPreferredSide: 'right',
      contextualPreferredSide: 'right',
      avoidSelectors: ['cart'],
      viewportWidth,
      occupiedRects: [cart],
      helpEnabled: true,
      contextualEnabled: true,
      helpSidebarOpen: false,
    });

    expect(layout.helpSide).toBe('left');
    expect(layout.contextualSide).toBe('right');
  });

  it('separates help and contextual when both prefer the same side', () => {
    const layout = resolveSdkDockLayout({
      helpPreferredSide: 'right',
      contextualPreferredSide: 'right',
      helpEnabled: true,
      contextualEnabled: true,
      helpSidebarOpen: false,
    });

    expect(layout.helpSide).toBe('right');
    expect(layout.contextualSide).toBe('left');
    expect(layout.helpSide).not.toBe(layout.contextualSide);
  });

  it('keeps contextual chrome opposite help when the sidebar is open', () => {
    const layout = resolveSdkDockLayout({
      helpPreferredSide: 'left',
      contextualPreferredSide: 'right',
      helpEnabled: true,
      contextualEnabled: true,
      helpSidebarOpen: true,
    });

    expect(layout.helpSide).toBe('left');
    expect(layout.contextualSide).toBe('right');
  });
});
