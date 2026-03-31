import { CSSProperties, ReactNode } from 'react';
import { FocusTrap } from './FocusTrap';
import { KeyboardNavigation } from './KeyboardNavigation';
import { TourOverlay } from './TourOverlay';
import { TourPortal } from './TourPortal';
import { OnboardingTheme, useThemeCssVars } from './theme';

export interface ModalProps {
  open: boolean;
  title?: string;
  children?: ReactNode;
  content?: string;
  showClose?: boolean;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  onClose?: () => void;
  enableKeyboardNavigation?: boolean;
  trapFocus?: boolean;
}

export function Modal({
  open,
  title,
  children,
  content,
  showClose = true,
  className,
  style,
  theme,
  onClose,
  enableKeyboardNavigation = true,
  trapFocus = true,
}: ModalProps) {
  const cssVars = useThemeCssVars(theme);

  if (!open) return null;

  return (
    <TourPortal>
      <div className="td-layer" style={cssVars}>
        <KeyboardNavigation enabled={enableKeyboardNavigation && open} onClose={onClose} />
        <TourOverlay open={open} onClick={onClose} />

        <section className={`td-modal ${className || ''}`.trim()} style={style} role="dialog" aria-modal="true" aria-label={title || 'Onboarding modal'}>
          <FocusTrap enabled={trapFocus}>
            {showClose ? (
              <button type="button" className="td-modal__close" onClick={onClose} aria-label="Close modal">
                ×
              </button>
            ) : null}

            {title ? <h3 className="td-modal__title">{title}</h3> : null}
            {content ? <p className="td-modal__content">{content}</p> : null}
            {children}
          </FocusTrap>
        </section>
      </div>
    </TourPortal>
  );
}
