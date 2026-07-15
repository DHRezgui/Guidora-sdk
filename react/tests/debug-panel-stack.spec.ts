import { describe, expect, it } from 'vitest';
import {
  DEBUG_PANEL_EDGE_PX,
  DEBUG_PANEL_STACK_GAP_PX,
  DEBUG_PANEL_WIDTH_PX,
  measureDebugPanelStackOffsets,
} from '../src/utils/debug-panel-stack';

describe('measureDebugPanelStackOffsets', () => {
  it('returns solo offsets when contextual is hidden', () => {
    expect(measureDebugPanelStackOffsets(false, 1400)).toEqual({
      offsetX: 0,
      offsetY: 0,
      mode: 'solo',
    });
  });

  it('places panels side-by-side on wide viewports', () => {
    const result = measureDebugPanelStackOffsets(true, 1400);
    expect(result.mode).toBe('side');
    expect(result.offsetY).toBe(0);
    expect(result.offsetX).toBe(DEBUG_PANEL_WIDTH_PX + DEBUG_PANEL_STACK_GAP_PX);
  });

  it('stacks panels vertically when two widths do not fit', () => {
    const narrow =
      DEBUG_PANEL_EDGE_PX * 2 + DEBUG_PANEL_WIDTH_PX * 2 + DEBUG_PANEL_STACK_GAP_PX - 1;
    const result = measureDebugPanelStackOffsets(true, narrow);
    expect(result.mode).toBe('stack');
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBeGreaterThan(0);
  });
});
