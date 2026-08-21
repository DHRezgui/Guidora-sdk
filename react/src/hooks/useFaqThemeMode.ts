import { useLayoutEffect, useState, type CSSProperties } from 'react';
import {
  buildFaqThemeClassName,
  resolveAutoFaqThemeAppearance,
  resolveFaqThemeAppearanceInitial,
  type FaqThemeAppearance,
  type FaqThemeMode,
} from '../utils/faq-theme';
import { hostFaqThemeCssVarsToStyle, resolveHostFaqTheme } from '../utils/host-faq-theme';

export interface FaqThemeSnapshot {
  appearance: FaqThemeAppearance;
  className: string;
  cssVars: CSSProperties;
}

function createHostFaqThemeSnapshot(hostThemeReference?: string): FaqThemeSnapshot {
  const hostTheme = resolveHostFaqTheme({ referenceSelector: hostThemeReference });
  return {
    appearance: hostTheme.appearance,
    className: buildFaqThemeClassName(hostTheme.appearance, 'host'),
    cssVars: hostFaqThemeCssVarsToStyle(hostTheme.cssVars as Record<string, string>),
  };
}

function createInitialFaqThemeSnapshot(
  themeMode?: FaqThemeMode,
  hostThemeReference?: string,
): FaqThemeSnapshot {
  // Resolve host/chameleon tokens synchronously on the client so the help tab
  // never paints with Phoenix orange before the first effect runs.
  if (themeMode === 'host') {
    return createHostFaqThemeSnapshot(hostThemeReference);
  }

  const appearance = resolveFaqThemeAppearanceInitial(themeMode);
  return {
    appearance,
    className: buildFaqThemeClassName(appearance, themeMode),
    cssVars: {},
  };
}

export function useFaqTheme(
  themeMode?: FaqThemeMode,
  hostThemeReference?: string,
): FaqThemeSnapshot {
  const [snapshot, setSnapshot] = useState<FaqThemeSnapshot>(() =>
    createInitialFaqThemeSnapshot(themeMode, hostThemeReference),
  );

  // useLayoutEffect: apply before browser paint to avoid orange → blue FOUC.
  useLayoutEffect(() => {
    if (!themeMode || themeMode === 'dark') {
      const appearance = 'dark';
      setSnapshot({
        appearance,
        className: buildFaqThemeClassName(appearance, themeMode),
        cssVars: {},
      });
      return undefined;
    }

    if (themeMode === 'light') {
      const appearance = 'light';
      setSnapshot({
        appearance,
        className: buildFaqThemeClassName(appearance, themeMode),
        cssVars: {},
      });
      return undefined;
    }

    if (themeMode === 'host') {
      if (typeof window === 'undefined') return undefined;

      let rafId: number | null = null;

      const applyHostTheme = () => {
        setSnapshot(createHostFaqThemeSnapshot(hostThemeReference));
      };

      const scheduleUpdate = () => {
        if (rafId != null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applyHostTheme();
        });
      };

      // Immediate first apply (no rAF) so paint already has chameleon accents.
      applyHostTheme();

      // Host CSS (Tailwind/Next) can land after first paint — retry briefly for demos.
      const retryTimers = [50, 200, 600].map((ms) => window.setTimeout(applyHostTheme, ms));

      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', scheduleUpdate);

      const mutationObserver = new MutationObserver(scheduleUpdate);
      mutationObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
      });
      if (document.body) {
        mutationObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
        });
      }

      window.addEventListener('load', scheduleUpdate);
      window.addEventListener('resize', scheduleUpdate);

      // Next/Tailwind may inject theme CSS after mount — re-apply when stylesheets appear.
      const headObserver = new MutationObserver(scheduleUpdate);
      if (document.head) {
        headObserver.observe(document.head, { childList: true, subtree: true });
      }

      return () => {
        if (rafId != null) window.cancelAnimationFrame(rafId);
        for (const timer of retryTimers) window.clearTimeout(timer);
        media.removeEventListener('change', scheduleUpdate);
        mutationObserver.disconnect();
        headObserver.disconnect();
        window.removeEventListener('load', scheduleUpdate);
        window.removeEventListener('resize', scheduleUpdate);
      };
    }

    if (typeof window === 'undefined') return undefined;

    let rafId: number | null = null;

    const update = () => {
      const appearance = resolveAutoFaqThemeAppearance().appearance;
      setSnapshot({
        appearance,
        className: buildFaqThemeClassName(appearance, themeMode),
        cssVars: {},
      });
    };

    const scheduleUpdate = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    update();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', scheduleUpdate);

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
    });
    if (document.body) {
      mutationObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
      });
    }

    window.addEventListener('load', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId);
      media.removeEventListener('change', scheduleUpdate);
      mutationObserver.disconnect();
      window.removeEventListener('load', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [hostThemeReference, themeMode]);

  return snapshot;
}

export function useFaqThemeMode(themeMode?: FaqThemeMode, hostThemeReference?: string): FaqThemeAppearance {
  return useFaqTheme(themeMode, hostThemeReference).appearance;
}
