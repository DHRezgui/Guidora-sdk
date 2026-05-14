import {
  CSSProperties,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
  useRef,
} from 'react';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

type RectLike = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>;

function isScrollableElement(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canScrollY =
    (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
    element.scrollHeight > element.clientHeight;
  const canScrollX =
    (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay') &&
    element.scrollWidth > element.clientWidth;
  return canScrollY || canScrollX;
}

function findScrollableAtPoint(clientX: number, clientY: number): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
  for (const element of elementsAtPoint) {
    if (element.closest('.td-layer')) continue;

    let current: Element | null = element;
    while (current && current !== document.body && current !== document.documentElement) {
      if (isScrollableElement(current)) return current;
      current = current.parentElement;
    }
  }

  const documentScroller = document.scrollingElement;
  return documentScroller instanceof HTMLElement ? documentScroller : null;
}

function scrollElementBy(
  element: HTMLElement | null,
  deltaX: number,
  deltaY: number,
): void {
  if (!element) {
    window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
    return;
  }

  element.scrollLeft += deltaX;
  element.scrollTop += deltaY;
}

export interface HighlightProps {
  open: boolean;
  targetRect?: RectLike | null;
  padding?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  withOverlay?: boolean;
  onOverlayClick?: () => void;
}

export function Highlight({
  open,
  targetRect,
  padding = 8,
  borderRadius = 10,
  className,
  style,
  theme,
  withOverlay = true,
  onOverlayClick,
}: HighlightProps) {
  const cssVars = useThemeCssVars(theme);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);

  if (!open || !targetRect) return null;

  // Keep highlight anchored to the real selector position, even when partially off-screen.
  const top = Math.round(targetRect.top - padding);
  const left = Math.round(targetRect.left - padding);
  const width = Math.round(targetRect.width + padding * 2);
  const height = Math.round(targetRect.height + padding * 2);
  const rightStart = left + width;
  const bottomStart = top + height;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(viewportWidth, rightStart);
  const clippedWidth = Math.max(0, clippedRight - clippedLeft);
  const showTopEdgeLine = top < 0 && clippedWidth > 0;
  const showBottomEdgeLine = bottomStart > viewportHeight && clippedWidth > 0;

  // Overlay cuts must remain non-negative even if target is outside viewport.
  const overlayTop = Math.max(0, top);
  const overlayLeft = Math.max(0, left);
  const overlayRightStart = Math.max(0, rightStart);
  const overlayBottomStart = Math.max(0, bottomStart);
  const overlayMiddleHeight = Math.max(0, overlayBottomStart - overlayTop);

  const overlayPieceStyle: CSSProperties = {
    position: 'fixed',
    background: 'var(--td-overlay-color)',
    pointerEvents: 'auto',
    touchAction: 'none',
  };
  const forwardWheelToPage = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    scrollElementBy(findScrollableAtPoint(event.clientX, event.clientY), event.deltaX, event.deltaY);
  };
  const rememberTouchY = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    lastTouchRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const forwardTouchToPage = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    const previous = lastTouchRef.current;
    if (!touch || !previous) return;

    event.preventDefault();
    scrollElementBy(
      findScrollableAtPoint(touch.clientX, touch.clientY),
      previous.x - touch.clientX,
      previous.y - touch.clientY,
    );
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const overlayInteractionProps = {
    onClick: onOverlayClick,
    onWheel: forwardWheelToPage,
    onTouchStart: rememberTouchY,
    onTouchMove: forwardTouchToPage,
    onTouchEnd: () => {
      lastTouchRef.current = null;
    },
  };

  return (
    <TourPortal>
      <div className="td-layer td-layer--highlight" style={cssVars}>
        {withOverlay ? (
          <>
            <div
              style={{
                ...overlayPieceStyle,
                top: 0,
                left: 0,
                right: 0,
                height: overlayTop,
              }}
              {...overlayInteractionProps}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayTop,
                left: 0,
                width: overlayLeft,
                height: overlayMiddleHeight,
              }}
              {...overlayInteractionProps}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayTop,
                left: overlayRightStart,
                right: 0,
                height: overlayMiddleHeight,
              }}
              {...overlayInteractionProps}
              aria-hidden="true"
            />
            <div
              style={{
                ...overlayPieceStyle,
                top: overlayBottomStart,
                left: 0,
                right: 0,
                bottom: 0,
              }}
              {...overlayInteractionProps}
              aria-hidden="true"
            />
          </>
        ) : null}
        <div
          className={`td-highlight ${className || ''}`.trim()}
          style={{
            top,
            left,
            width,
            height,
            borderRadius,
            ...style,
          }}
          aria-hidden="true"
        />
        {showTopEdgeLine ? (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              top: 0,
              left: clippedLeft,
              width: clippedWidth,
              height: 2,
              borderRadius: 999,
              background: 'rgba(249, 115, 22, 0.9)',
              boxShadow: '0 0 0 3px rgba(148, 163, 184, 0.38)',
              pointerEvents: 'none',
              zIndex: 'calc(var(--td-z-index) + 1)',
            }}
          />
        ) : null}
        {showBottomEdgeLine ? (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              bottom: 0,
              left: clippedLeft,
              width: clippedWidth,
              height: 2,
              borderRadius: 999,
              background: 'rgba(249, 115, 22, 0.9)',
              boxShadow: '0 0 0 3px rgba(148, 163, 184, 0.38)',
              pointerEvents: 'none',
              zIndex: 'calc(var(--td-z-index) + 1)',
            }}
          />
        ) : null}
      </div>
    </TourPortal>
  );
}
