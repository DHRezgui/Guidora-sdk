/// <reference types="jest" />

import { measureSideClearance } from '../src/utils/help-dock-side';
import { shouldFlipDockSide } from '../src/utils/dock-layout-observer';

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

describe('dock-layout-observer', () => {
  it('requires meaningful clearance gain before flipping a stable side', () => {
    const viewportWidth = 1280;
    const cart = rect(viewportWidth - 380, 380);
    const leftClearance = measureSideClearance('left', viewportWidth, [cart], 24);
    const rightClearance = measureSideClearance('right', viewportWidth, [cart], 24);

    expect(leftClearance).toBeGreaterThan(rightClearance);
    expect(shouldFlipDockSide('left', 'right', ['cart'], 420)).toBe(false);
  });
});
