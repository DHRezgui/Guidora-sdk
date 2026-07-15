import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFaqTheme } from '../hooks/useFaqThemeMode';
import {
  requestProactiveHelp,
  subscribeProactiveHelp,
  type ProactiveHelpRequest,
} from '../utils/proactive-help-bus';
import { detectHostThemeReference } from '../utils/sdk-auto-defaults';
import { type FaqThemeMode } from '../utils/faq-theme';

const PROACTIVE_TOAST_PORTAL_ID = 'trustdev-proactive-toast-portal';

function useProactiveToastPortal(): HTMLElement | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    let target = document.getElementById(PROACTIVE_TOAST_PORTAL_ID);
    if (!target) {
      target = document.createElement('div');
      target.id = PROACTIVE_TOAST_PORTAL_ID;
      target.setAttribute('data-trustdev-proactive-toast-portal', 'true');
      document.body.appendChild(target);
    }

    setContainer(target);
  }, []);

  return container;
}

export interface ProactiveHelpToastProps {
  enabled?: boolean;
  /** Auto-hide duration in ms (default 12s). Set 0 to keep until dismissed. */
  autoHideMs?: number;
  /**
   * Same contract as HelpSidebar / FaqSearchWidget.
   * Defaults to `host` so the toast blends with the client UI (chameleon).
   */
  themeMode?: FaqThemeMode;
  /** Host element selector mirrored when `themeMode` is `host`. */
  hostThemeReference?: string;
  onOpenHelp?: (request: ProactiveHelpRequest) => void;
  /** Notifies orchestrator when the toast becomes visible or is dismissed. */
  onVisibleChange?: (visible: boolean) => void;
}

export function ProactiveHelpToast({
  enabled = true,
  autoHideMs = 12_000,
  themeMode = 'host',
  hostThemeReference,
  onOpenHelp,
  onVisibleChange,
}: ProactiveHelpToastProps) {
  const portal = useProactiveToastPortal();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [lastRequest, setLastRequest] = useState<ProactiveHelpRequest | null>(null);

  const resolvedHostThemeReference = useMemo(
    () =>
      hostThemeReference ??
      (themeMode === 'host' ? detectHostThemeReference() : undefined),
    [hostThemeReference, themeMode],
  );
  const faqTheme = useFaqTheme(themeMode, resolvedHostThemeReference);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  const onOpenHelpRef = useRef(onOpenHelp);
  onOpenHelpRef.current = onOpenHelp;
  const onVisibleChangeRef = useRef(onVisibleChange);
  onVisibleChangeRef.current = onVisibleChange;

  useEffect(() => {
    onVisibleChangeRef.current?.(visible);
  }, [visible]);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    return subscribeProactiveHelp((request) => {
      // openFaq events are CTA / sidebar open — do not (re)show the toast.
      if (request.openFaq) return;

      setMessage(
        request.message?.trim() ||
          'Souhaitez-vous consulter l’aide ?',
      );
      setLastRequest(request);
      setVisible(true);
    });
  }, [enabled]);

  useEffect(() => {
    if (!visible || autoHideMs <= 0) return;
    const timer = window.setTimeout(() => setVisible(false), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [autoHideMs, visible]);

  if (!enabled || !visible || !portal) return null;

  const rootClass = [faqTheme.className, 'trustdev-proactive-toast'].filter(Boolean).join(' ');

  return createPortal(
    <div
      className={rootClass}
      style={faqTheme.cssVars}
      role="status"
      aria-live="polite"
      data-trustdev-proactive-toast="true"
    >
      <div className="trustdev-proactive-toast__glow" aria-hidden />
      <span className="trustdev-proactive-toast__accent" aria-hidden />
      <div className="trustdev-proactive-toast__content">
        <div className="trustdev-proactive-toast__header">
          <span className="trustdev-proactive-toast__mark" aria-hidden>
            ?
          </span>
          <div className="trustdev-proactive-toast__titles">
            <p className="trustdev-proactive-toast__eyebrow">Aide proactive</p>
            <p className="trustdev-proactive-toast__message">{message}</p>
          </div>
        </div>
        <div className="trustdev-proactive-toast__actions">
          <button
            type="button"
            className="trustdev-proactive-toast__primary"
            onClick={() => {
              const openRequest = {
                ...lastRequest,
                openFaq: true as const,
              };
              onOpenHelpRef.current?.(openRequest);
              requestProactiveHelp(openRequest);
              dismiss();
            }}
          >
            Voir l’aide
          </button>
          <button type="button" className="trustdev-proactive-toast__secondary" onClick={dismiss}>
            Plus tard
          </button>
        </div>
      </div>
      <button
        type="button"
        className="trustdev-proactive-toast__close"
        aria-label="Fermer"
        onClick={dismiss}
      >
        ×
      </button>
    </div>,
    portal,
  );
}
