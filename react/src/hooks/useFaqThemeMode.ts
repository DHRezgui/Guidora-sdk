import { useEffect, useState, type CSSProperties } from 'react';
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

export function useFaqTheme(
  themeMode?: FaqThemeMode,
  hostThemeReference?: string,
): FaqThemeSnapshot {
  const [snapshot, setSnapshot] = useState<FaqThemeSnapshot>(() => ({
    appearance: resolveFaqThemeAppearanceInitial(themeMode),
    className: buildFaqThemeClassName(resolveFaqThemeAppearanceInitial(themeMode), themeMode),
    cssVars: {},
  }));

  useEffect(() => {
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
        const hostTheme = resolveHostFaqTheme({ referenceSelector: hostThemeReference });
        setSnapshot({
          appearance: hostTheme.appearance,
          className: buildFaqThemeClassName(hostTheme.appearance, 'host'),
          cssVars: hostFaqThemeCssVarsToStyle(hostTheme.cssVars as Record<string, string>),
        });
      };

      const scheduleUpdate = () => {
        if (rafId != null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applyHostTheme();
        });
      };

      scheduleUpdate();

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

    scheduleUpdate();

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
