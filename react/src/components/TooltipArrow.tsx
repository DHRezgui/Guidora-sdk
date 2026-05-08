import { CSSProperties } from 'react';
import { PositionType } from '../types';

export interface TooltipArrowProps {
  position?: PositionType;
  from?: { x: number; y: number } | null;
  to?: { x: number; y: number } | null;
}

function getArrowStyle(position: PositionType): CSSProperties {
  switch (position) {
    case 'TOP':
      // Tooltip is above target: attach arrow to bottom edge, pointing down.
      return { top: 'calc(100% - 2px)', left: '50%', transform: 'translateX(-50%)' };
    case 'TOP_LEFT':
      // Keep arrow near the side that faces the target anchor.
      return { top: 'calc(100% - 2px)', left: '20%', transform: 'translateX(-50%)' };
    case 'TOP_RIGHT':
      return { top: 'calc(100% - 2px)', left: '80%', transform: 'translateX(-50%)' };
    case 'LEFT':
      return { top: '50%', right: 'calc(100% - 2px)', transform: 'translateY(-50%)' };
    case 'RIGHT':
      return { top: '50%', left: 'calc(100% - 2px)', transform: 'translateY(-50%)' };
    case 'BOTTOM_LEFT':
      return { bottom: 'calc(100% - 2px)', left: '20%', transform: 'translateX(-50%)' };
    case 'BOTTOM_RIGHT':
      return { bottom: 'calc(100% - 2px)', left: '80%', transform: 'translateX(-50%)' };
    case 'BOTTOM':
    default:
      // Tooltip is below target: attach arrow to top edge, pointing up.
      return { bottom: 'calc(100% - 2px)', left: '50%', transform: 'translateX(-50%)' };
  }
}

function getArrowDirection(position: PositionType): 'top' | 'left' | 'right' | 'bottom' {
  if (position === 'TOP' || position === 'TOP_LEFT' || position === 'TOP_RIGHT') return 'top';
  if (position === 'LEFT') return 'left';
  if (position === 'RIGHT') return 'right';
  return 'bottom';
}

export function TooltipArrow({ position = 'BOTTOM' }: TooltipArrowProps) {
  const direction = getArrowDirection(position);
  const directionClass =
    direction === 'top'
      ? 'td-tooltip__arrow--top'
      : direction === 'left'
        ? 'td-tooltip__arrow--left'
        : direction === 'right'
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

export function FlexibleTooltipArrow({
  from,
  to,
  debug = false,
}: {
  from?: { x: number; y: number } | null;
  to?: { x: number; y: number } | null;
  debug?: boolean;
}) {
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 10) return null;
  const c1 = {
    x: from.x + dx * 0.28,
    y: from.y + (Math.abs(dy) > 20 ? dy * 0.1 : (dy >= 0 ? 18 : -18)),
  };
  const c2 = {
    x: from.x + dx * 0.72,
    y: to.y - (Math.abs(dy) > 20 ? dy * 0.16 : (dy >= 0 ? 12 : -12)),
  };
  const path = `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
  const markerId = 'td-tooltip-arrow-head';

  return (
    <svg
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 'calc(var(--td-z-index) + 3)',
      }}
    >
      <defs>
        <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M0 0 L10 5 L0 10 z" fill="#ec4899" />
        </marker>
      </defs>
      <circle cx={from.x} cy={from.y} r={3.5} fill="#f97316" stroke="rgba(255,255,255,0.72)" strokeWidth="1" />
      <path
        d={path}
        fill="none"
        stroke="#f97316"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${markerId})`}
      />
      {debug ? (
        <>
          <circle cx={to.x} cy={to.y} r={4} fill="#22c55e" stroke="white" strokeWidth="1" />
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="rgba(34,197,94,0.35)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        </>
      ) : null}
    </svg>
  );
}

export function LegacyTooltipArrow({ position = 'BOTTOM' }: TooltipArrowProps) {
  const direction = getArrowDirection(position);
  const directionClass =
    direction === 'top'
      ? 'td-tooltip__arrow--top'
      : direction === 'left'
        ? 'td-tooltip__arrow--left'
        : direction === 'right'
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
