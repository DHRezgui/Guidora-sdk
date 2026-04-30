import { CSSProperties } from 'react';
import { PositionType } from '../types';

export interface TooltipArrowProps {
  position?: PositionType;
}

function getArrowStyle(position: PositionType): CSSProperties {
  switch (position) {
    case 'TOP':
      // Tooltip is above target: attach arrow to bottom edge, pointing down.
      return { top: 'calc(100% - 2px)', left: '50%', transform: 'translateX(-50%)' };
    case 'LEFT':
      return { top: '50%', right: 'calc(100% - 2px)', transform: 'translateY(-50%)' };
    case 'RIGHT':
      return { top: '50%', left: 'calc(100% - 2px)', transform: 'translateY(-50%)' };
    case 'BOTTOM':
    default:
      // Tooltip is below target: attach arrow to top edge, pointing up.
      return { bottom: 'calc(100% - 2px)', left: '50%', transform: 'translateX(-50%)' };
  }
}

export function TooltipArrow({ position = 'BOTTOM' }: TooltipArrowProps) {
  const directionClass =
    position === 'TOP'
      ? 'td-tooltip__arrow--top'
      : position === 'LEFT'
        ? 'td-tooltip__arrow--left'
        : position === 'RIGHT'
          ? 'td-tooltip__arrow--right'
          : 'td-tooltip__arrow--bottom';

  return (
    <span className={`td-tooltip__arrow ${directionClass}`} style={getArrowStyle(position)} aria-hidden="true">
      <span className="td-tooltip__arrow-head" />
      <span className="td-tooltip__arrow-stem" />
      <span className="td-tooltip__arrow-dot" />
    </span>
  );
}
