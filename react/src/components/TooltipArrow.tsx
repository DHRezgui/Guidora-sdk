import { CSSProperties } from 'react';
import { PositionType } from '../types';

export interface TooltipArrowProps {
  position?: PositionType;
}

function getArrowStyle(position: PositionType): CSSProperties {
  switch (position) {
    case 'TOP':
      return { bottom: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
    case 'LEFT':
      return { top: '50%', right: -6, transform: 'translateY(-50%) rotate(45deg)' };
    case 'RIGHT':
      return { top: '50%', left: -6, transform: 'translateY(-50%) rotate(45deg)' };
    case 'BOTTOM':
    default:
      return { top: -6, left: '50%', transform: 'translateX(-50%) rotate(45deg)' };
  }
}

export function TooltipArrow({ position = 'BOTTOM' }: TooltipArrowProps) {
  return <span className="td-tooltip__arrow" style={getArrowStyle(position)} aria-hidden="true" />;
}
