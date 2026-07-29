/**
 * Open a host-side chat widget (Intercom / Crisp / custom launcher).
 * Does not embed third-party SDKs — the host app must already load the widget.
 */

export type SupportExternalWidgetProvider = 'intercom' | 'crisp' | 'custom';

export interface SupportExternalWidgetOptions {
  provider: SupportExternalWidgetProvider;
  /** CSS selector of host launcher; defaults per provider when omitted. */
  openSelector?: string;
  /** Fallback URL if launcher is not found. */
  openUrl?: string;
}

const DEFAULT_SELECTORS: Record<SupportExternalWidgetProvider, string[]> = {
  intercom: [
    '.intercom-launcher',
    '#intercom-container .intercom-launcher',
    'div[class*="intercom-launcher"]',
    '[data-intercom-target="launcher"]',
  ],
  crisp: ['#crisp-chatbox-button', '.crisp-client .cc-1xry', '[aria-label="Open chat"]'],
  custom: [],
};

export type OpenExternalSupportWidgetResult =
  | { ok: true; method: 'click' | 'url' }
  | { ok: false; reason: string };

function queryFirst(selectors: string[]): Element | null {
  for (const selector of selectors) {
    const trimmed = selector.trim();
    if (!trimmed) continue;
    try {
      const el = document.querySelector(trimmed);
      if (el) return el;
    } catch {
      // invalid selector — skip
    }
  }
  return null;
}

export function openExternalSupportWidget(
  options: SupportExternalWidgetOptions,
): OpenExternalSupportWidgetResult {
  if (typeof document === 'undefined') {
    return { ok: false, reason: 'Document unavailable' };
  }

  const selectors = [
    ...(options.openSelector ? [options.openSelector] : []),
    ...DEFAULT_SELECTORS[options.provider],
  ];

  const launcher = queryFirst(selectors);
  if (launcher instanceof HTMLElement) {
    launcher.click();
    return { ok: true, method: 'click' };
  }

  if (options.openUrl?.trim()) {
    window.open(options.openUrl.trim(), '_blank', 'noopener,noreferrer');
    return { ok: true, method: 'url' };
  }

  return {
    ok: false,
    reason: `Launcher introuvable pour ${options.provider}. Vérifiez openSelector ou openUrl.`,
  };
}
