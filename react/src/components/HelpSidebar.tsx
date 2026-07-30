import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeProactiveHelp } from '../utils/proactive-help-bus';
import { useFaqSemanticSearch, type UseFaqSemanticSearchOptions } from '../hooks/useFaqSemanticSearch';
import { useFaqFrequentQuestions } from '../hooks/useFaqFrequentQuestions';
import { useHelpDockSide } from '../hooks/useHelpDockSide';
import type { FaqContentOptions, FaqPageContext, FaqSemanticSearchResult, SDKConfig } from '../types';
import type { SupportTicketSessionContext } from '../types/support';
import {
  buildContextualFaqSuggestions,
  collectFaqPageContext,
} from '../utils/faq-context';
import {
  formatFaqContextLabel,
  resolveContextualSuggestionsEnabled,
  resolveFaqContentOptions,
} from '../utils/faq-content';
import { resolveFaqProjectKey } from '../utils/faq-project-key';
import { FaqSearchPanel } from './FaqSearchPanel';
import { useFaqTheme } from '../hooks/useFaqThemeMode';
import { useHelpTabEdgeInset } from '../hooks/useHelpTabEdgeInset';
import { applyHelpPushLayout } from '../utils/help-push-layout';
import {
  detectHostThemeReference,
  detectPushTargetSelector,
} from '../utils/sdk-auto-defaults';
import { OnboardingTheme, useThemeCssVars } from './theme';
import { type FaqThemeMode } from '../utils/faq-theme';

export interface HelpSidebarProps extends UseFaqSemanticSearchOptions, FaqContentOptions {
  config?: Partial<SDKConfig>;
  title?: string;
  placeholder?: string;
  side?: 'left' | 'right';
  avoidSelectors?: string[];
  minDockClearancePx?: number;
  startCollapsed?: boolean;
  contextualSuggestionsEnabled?: boolean;
  pageContext?: Partial<FaqPageContext>;
  runtimePageContext?: Partial<FaqPageContext>;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  themeMode?: FaqThemeMode;
  /** Host element selector mirrored when `themeMode` is `host`. */
  hostThemeReference?: string;
  modal?: boolean;
  sidebarLayout?: 'overlay' | 'push';
  pushTargetSelector?: string | string[];
  showResultFeedback?: boolean;
  onResultClick?: (result: FaqSemanticSearchResult) => void;
  /** Notifies parent when the sidebar opens or closes (layout coordination). */
  onOpenChange?: (open: boolean) => void;
  /** Notifies parent when the resolved dock side changes (layout coordination). */
  onDockSideChange?: (side: 'left' | 'right') => void;
  /** When set, skips internal collision resolution (used by `TourViewer` orchestration). */
  resolvedDockSide?: 'left' | 'right';
  /** Runtime context merged into support ticket `session_data`. */
  supportTicketContext?: Partial<SupportTicketSessionContext>;
  resolveSupportTicketContext?: () => Partial<SupportTicketSessionContext>;
  /** On-demand guides for the current page (from TourViewer / useOnboarding). */
  guides?: import('../utils/page-guides').PageGuideItem[];
  guidesLoading?: boolean;
  guidesLaunchingId?: string | null;
  onLaunchGuide?: (guide: import('../utils/page-guides').PageGuideItem) => void;
}

export function HelpSidebar({
  config,
  enabled = true,
  title = 'Aide',
  placeholder = 'Posez votre question…',
  side = 'right',
  avoidSelectors,
  minDockClearancePx,
  startCollapsed = true,
  contextualSuggestionsEnabled = true,
  pageContext,
  runtimePageContext,
  className,
  style,
  theme,
  themeMode,
  hostThemeReference,
  modal = true,
  sidebarLayout = 'overlay',
  pushTargetSelector,
  showResultFeedback,
  topK,
  minSimilarity,
  timeoutMs,
  minQueryLength,
  cacheTtlMs,
  onResultClick,
  onOpenChange,
  onDockSideChange,
  resolvedDockSide,
  subtitle,
  audience,
  showResultScore,
  showStrategyFootnote,
  contextDisplay,
  showDetailedLoadingHint,
  starterQuestions,
  frequentQuestionsMode,
  frequentQuestionsLimit,
  projectKey,
  supportContactUrl,
  supportContactLabel,
  supportInlineForm,
  supportExternalWidget,
  supportExternalWidgetLabel,
  guidesEnabled,
  supportTicketContext,
  resolveSupportTicketContext,
  guides,
  guidesLoading,
  guidesLaunchingId,
  onLaunchGuide,
}: HelpSidebarProps) {
  const themeVars = useThemeCssVars(theme);
  const resolvedPushTargetSelector = useMemo(
    () =>
      pushTargetSelector ??
      (sidebarLayout === 'push' ? detectPushTargetSelector() : undefined),
    [pushTargetSelector, sidebarLayout],
  );
  const resolvedHostThemeReference = useMemo(
    () =>
      hostThemeReference ??
      (themeMode === 'host' ? detectHostThemeReference() : undefined),
    [hostThemeReference, themeMode],
  );
  const faqTheme = useFaqTheme(themeMode, resolvedHostThemeReference);
  const autoDockSide = useHelpDockSide({
    preferredSide: side,
    avoidSelectors,
    minClearancePx: minDockClearancePx,
    enabled: enabled && resolvedDockSide == null,
  });
  const resolvedSide = resolvedDockSide ?? autoDockSide;
  const [open, setOpen] = useState(!startCollapsed);
  const prevOpenForNotifyRef = useRef<boolean | null>(null);
  // Keep measuring while open so overlay panels can clear an inner host scrollbar.
  const tabEdgeInset = useHelpTabEdgeInset(resolvedSide, enabled, open);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!enabled) return;
    return subscribeProactiveHelp((request) => {
      if (!request.openFaq) return;
      setOpen(true);
      if (request.suggestedQuery?.trim()) {
        setQuery(request.suggestedQuery.trim());
      }
    });
  }, [enabled]);

  const resolvedContext = useMemo(
    () =>
      collectFaqPageContext({
        organizationId: config?.organizationId,
        ...pageContext,
        ...runtimePageContext,
      }),
    [config?.organizationId, pageContext, runtimePageContext],
  );

  const resolvedProjectKey = useMemo(
    () => resolveFaqProjectKey({ projectKey, pageContext: resolvedContext }),
    [projectKey, resolvedContext],
  );

  const faq = useFaqSemanticSearch({
    config,
    enabled: enabled && open,
    topK,
    minSimilarity,
    timeoutMs,
    minQueryLength,
    cacheTtlMs,
    projectKey: resolvedProjectKey,
  });

  const contentOptions = useMemo(
    () =>
      resolveFaqContentOptions({
        subtitle,
        audience,
        showResultScore,
        showStrategyFootnote,
        contextDisplay,
        showDetailedLoadingHint,
        starterQuestions,
        frequentQuestionsMode,
        frequentQuestionsLimit,
        guidesEnabled,
        supportContactUrl,
        supportContactLabel,
        supportInlineForm,
        supportExternalWidget,
        supportExternalWidgetLabel,
      }),
    [
      subtitle,
      audience,
      showResultScore,
      showStrategyFootnote,
      contextDisplay,
      showDetailedLoadingHint,
      starterQuestions,
      frequentQuestionsMode,
      frequentQuestionsLimit,
      guidesEnabled,
      supportContactUrl,
      supportContactLabel,
      supportInlineForm,
      supportExternalWidget,
      supportExternalWidgetLabel,
    ],
  );

  const contextSummary = useMemo(
    () => formatFaqContextLabel(resolvedContext, contentOptions.contextDisplay),
    [contentOptions.contextDisplay, resolvedContext],
  );

  const { questions: frequentQuestions, isLoading: frequentQuestionsLoading } =
    useFaqFrequentQuestions({
      config,
      enabled: enabled && open && contentOptions.frequentQuestionsMode !== 'off',
      context: resolvedContext,
      mode: contentOptions.frequentQuestionsMode,
      manualQuestions: contentOptions.starterQuestions,
      limit: contentOptions.frequentQuestionsLimit,
      projectKey: resolvedProjectKey,
    });

  const suggestionsLabel =
    (audience ?? 'end-user') === 'end-user'
      ? 'Questions suggérées'
      : 'Suggestions pour cette page';

  const showContextualSuggestions = resolveContextualSuggestionsEnabled({
    audience,
    frequentQuestionsMode: contentOptions.frequentQuestionsMode,
    contextualSuggestionsEnabled,
  });

  const suggestions = useMemo(() => {
    if (!showContextualSuggestions) return [];
    const contextual = buildContextualFaqSuggestions(resolvedContext, {
      endUser: (audience ?? 'end-user') === 'end-user',
    });
    const frequentSet = new Set(frequentQuestions.map((question) => question.toLowerCase()));
    return contextual.filter((item) => !frequentSet.has(item.query.toLowerCase()));
  }, [audience, frequentQuestions, resolvedContext, showContextualSuggestions]);

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void faq.search(trimmed);
  }, [faq, query]);

  const closeSidebar = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || typeof document === 'undefined' || sidebarLayout !== 'push') return undefined;

    const root = document.documentElement;
    const activeClass = 'trustdev-help-push-active';
    const sideClass = `trustdev-help-push--${resolvedSide}`;
    root.classList.add(activeClass, sideClass);

    let releaseLayout = applyHelpPushLayout(resolvedSide, resolvedPushTargetSelector);
    const onResize = () => {
      releaseLayout();
      releaseLayout = applyHelpPushLayout(resolvedSide, resolvedPushTargetSelector);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      releaseLayout();
      root.classList.remove(activeClass, sideClass);
    };
  }, [open, resolvedPushTargetSelector, resolvedSide, sidebarLayout]);

  useEffect(() => {
    const prev = prevOpenForNotifyRef.current;
    prevOpenForNotifyRef.current = open;
    // Only notify on real open/close transitions — `onOpenChange` identity
    // changes must not re-fire while the sidebar stays open (e.g. after a tour).
    if (prev === open) return;
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    onDockSideChange?.(resolvedSide);
  }, [onDockSideChange, resolvedSide]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebar();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSidebar, open]);

  if (!enabled) return null;

  const rootClass = [
    faqTheme.className,
    'trustdev-help-sidebar',
    `trustdev-help-sidebar--${resolvedSide}`,
    open ? 'trustdev-help-sidebar--open' : 'trustdev-help-sidebar--closed',
    modal ? 'trustdev-help-sidebar--modal' : 'trustdev-help-sidebar--non-modal',
    sidebarLayout === 'push' ? 'trustdev-help-sidebar--push-layout' : 'trustdev-help-sidebar--overlay-layout',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={rootClass}
      data-tour-id="trustdev-help-sidebar"
      data-trustdev-help-sidebar="true"
      data-trustdev-faq-panel="true"
      style={{
        ...themeVars,
        ...faqTheme.cssVars,
        ...style,
        ...(tabEdgeInset > 0
          ? {
              '--td-help-tab-edge-inset': `${tabEdgeInset}px`,
              // Push layout already shrinks the host; only overlay needs panel clearance.
              ...(sidebarLayout === 'overlay' && open
                ? { '--td-help-panel-edge-inset': `${tabEdgeInset}px` }
                : {}),
            }
          : {}),
      }}
    >
      {!open ? (
        <button
          type="button"
          className="trustdev-help-sidebar__tab"
          aria-label={title}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="trustdev-help-sidebar__tab-glow" aria-hidden />
          <span className="trustdev-help-sidebar__tab-icon" aria-hidden>
            ?
          </span>
          <span className="trustdev-help-sidebar__tab-label">{title}</span>
        </button>
      ) : (
        <>
          {modal ? (
            <button
              type="button"
              className="trustdev-help-sidebar__backdrop"
              aria-label="Fermer l'aide"
              onClick={closeSidebar}
            />
          ) : null}
          <aside className="trustdev-help-sidebar__panel" aria-label={title}>
            <FaqSearchPanel
              title={title}
              subtitle={contentOptions.subtitle}
              placeholder={placeholder}
              query={query}
              onQueryChange={setQuery}
              onSubmitSearch={submitSearch}
              faq={faq}
              contextSummary={contextSummary}
              contextDetails={resolvedContext}
              contextSectionLabel={contentOptions.contextSectionLabel}
              showContextMeta={contentOptions.contextDisplay === 'summary'}
              suggestions={suggestions}
              suggestionsLabel={suggestionsLabel}
              starterQuestions={frequentQuestions}
              frequentQuestionsLoading={frequentQuestionsLoading}
              showFrequentQuestionsSection={contentOptions.frequentQuestionsMode !== 'off'}
              showContextSection={
                contentOptions.contextDisplay !== 'hidden' && Boolean(contextSummary)
              }
              showSuggestionsSection={showContextualSuggestions}
              audience={audience ?? 'end-user'}
              showResultScore={contentOptions.showResultScore}
              showStrategyFootnote={contentOptions.showStrategyFootnote}
              showDetailedLoadingHint={contentOptions.showDetailedLoadingHint}
              trackingConfig={config}
              showResultFeedback={showResultFeedback}
              onResultClick={onResultClick}
              onClose={closeSidebar}
              showCloseButton
              autoFocus
              supportContactUrl={contentOptions.supportContactUrl}
              supportContactLabel={contentOptions.supportContactLabel}
              supportPresentation={contentOptions.supportPresentation}
              supportTicketConfig={config}
              supportTicketContext={supportTicketContext}
              resolveSupportTicketContext={resolveSupportTicketContext}
              supportExternalWidget={contentOptions.supportExternalWidget}
              supportExternalWidgetLabel={contentOptions.supportExternalWidgetLabel}
              guidesEnabled={contentOptions.guidesEnabled}
              guides={guides}
              guidesLoading={guidesLoading}
              guidesLaunchingId={guidesLaunchingId}
              onLaunchGuide={onLaunchGuide}
            />
          </aside>
        </>
      )}
    </div>
  );
}
