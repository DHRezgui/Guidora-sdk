import { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useFaqSemanticSearch, type UseFaqSemanticSearchOptions } from '../hooks/useFaqSemanticSearch';
import { subscribeProactiveHelp } from '../utils/proactive-help-bus';
import { useFaqFrequentQuestions } from '../hooks/useFaqFrequentQuestions';
import { useHelpDockSide } from '../hooks/useHelpDockSide';
import type { FaqContentOptions, FaqPageContext, FaqSemanticSearchResult, SDKConfig } from '../types';
import { collectFaqPageContext } from '../utils/faq-context';
import { resolveFaqContentOptions } from '../utils/faq-content';
import { resolveFaqProjectKey } from '../utils/faq-project-key';
import { FaqSearchPanel } from './FaqSearchPanel';
import { useFaqTheme } from '../hooks/useFaqThemeMode';
import { OnboardingTheme, useThemeCssVars } from './theme';
import { type FaqThemeMode } from '../utils/faq-theme';

export interface FaqSearchWidgetProps extends UseFaqSemanticSearchOptions, FaqContentOptions {
  config?: Partial<SDKConfig>;
  title?: string;
  placeholder?: string;
  pageContext?: Partial<FaqPageContext>;
  position?: 'bottom-right' | 'bottom-left' | 'inline';
  avoidSelectors?: string[];
  minDockClearancePx?: number;
  side?: 'left' | 'right';
  startCollapsed?: boolean;
  className?: string;
  style?: CSSProperties;
  theme?: OnboardingTheme;
  themeMode?: FaqThemeMode;
  hostThemeReference?: string;
  resolvedDockSide?: 'left' | 'right';
  showResultFeedback?: boolean;
  onResultClick?: (result: FaqSemanticSearchResult) => void;
  /** Notifies parent when the widget opens or closes (assistance orchestration). */
  onOpenChange?: (open: boolean) => void;
}

function preferredWidgetSide(
  position: FaqSearchWidgetProps['position'],
  side: FaqSearchWidgetProps['side'],
): 'left' | 'right' {
  if (position === 'bottom-right') return 'right';
  if (position === 'bottom-left') return 'left';
  if (side === 'left' || side === 'right') return side;
  return 'left';
}

function positionStyle(position: 'bottom-right' | 'bottom-left' | 'inline'): CSSProperties {
  if (position === 'inline') {
    return { position: 'relative', width: '100%', maxWidth: 420 };
  }
  const base: CSSProperties = {
    position: 'fixed',
    bottom: 16,
    zIndex: 'calc(var(--td-z-index) + 8)',
  };
  if (position === 'bottom-left') {
    return { ...base, left: 16 };
  }
  return { ...base, right: 16 };
}

export function FaqSearchWidget({
  config,
  enabled = true,
  title = 'Aide FAQ',
  placeholder = 'Posez votre question…',
  position = 'bottom-left',
  avoidSelectors,
  minDockClearancePx,
  side,
  startCollapsed = true,
  className,
  style,
  theme,
  themeMode,
  hostThemeReference,
  resolvedDockSide,
  topK,
  minSimilarity,
  timeoutMs,
  minQueryLength,
  cacheTtlMs,
  showResultFeedback,
  onResultClick,
  onOpenChange,
  subtitle,
  audience,
  showResultScore,
  showStrategyFootnote,
  contextDisplay,
  showDetailedLoadingHint,
  starterQuestions,
  frequentQuestionsMode,
  frequentQuestionsLimit,
  pageContext,
  projectKey,
}: FaqSearchWidgetProps) {
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
    ],
  );
  const resolvedContext = useMemo(
    () =>
      collectFaqPageContext({
        organizationId: config?.organizationId,
        ...pageContext,
      }),
    [config?.organizationId, pageContext],
  );
  const resolvedProjectKey = useMemo(
    () => resolveFaqProjectKey({ projectKey, pageContext: resolvedContext }),
    [projectKey, resolvedContext],
  );
  const themeVars = useThemeCssVars(theme);
  const faqTheme = useFaqTheme(themeMode, hostThemeReference);
  const preferredSide = useMemo(() => preferredWidgetSide(position, side), [position, side]);
  const autoDockSide = useHelpDockSide({
    preferredSide,
    avoidSelectors,
    minClearancePx: minDockClearancePx,
    enabled: enabled && position !== 'inline' && resolvedDockSide == null,
  });
  const resolvedSide = resolvedDockSide ?? autoDockSide;
  const resolvedPosition =
    position === 'inline' ? 'inline' : resolvedSide === 'right' ? 'bottom-right' : 'bottom-left';
  const [open, setOpen] = useState(!startCollapsed || position === 'inline');
  const [query, setQuery] = useState('');

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

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

  const { questions: frequentQuestions, isLoading: frequentQuestionsLoading } =
    useFaqFrequentQuestions({
      config,
      enabled: enabled && (open || position === 'inline') && contentOptions.frequentQuestionsMode !== 'off',
      context: resolvedContext,
      mode: contentOptions.frequentQuestionsMode,
      manualQuestions: contentOptions.starterQuestions,
      limit: contentOptions.frequentQuestionsLimit,
      projectKey: resolvedProjectKey,
    });

  const faq = useFaqSemanticSearch({
    config,
    enabled: enabled && (open || position === 'inline'),
    topK,
    minSimilarity,
    timeoutMs,
    minQueryLength,
    cacheTtlMs,
    projectKey: resolvedProjectKey,
  });

  const submitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    void faq.search(trimmed);
  }, [faq, query]);

  if (!enabled) return null;

  const rootClass = [
    faqTheme.className,
    'trustdev-faq-widget',
    `trustdev-faq-widget--${resolvedPosition}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const showLauncher = position !== 'inline' && startCollapsed && !open;

  return (
    <div
      className={rootClass}
      data-tour-id="trustdev-faq-widget"
      data-trustdev-faq-panel="true"
      style={{ ...themeVars, ...faqTheme.cssVars, ...positionStyle(resolvedPosition), ...style }}
    >
      {showLauncher ? (
        <button
          type="button"
          className="trustdev-faq-widget__launcher"
          aria-label={title}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="trustdev-faq-widget__launcher-glow" aria-hidden />
          <span className="trustdev-faq-widget__launcher-icon" aria-hidden>
            ?
          </span>
          <span className="trustdev-faq-widget__launcher-label">{title}</span>
        </button>
      ) : (
        <div className="trustdev-faq-widget__panel">
          <FaqSearchPanel
            title={title}
            subtitle={contentOptions.subtitle}
            placeholder={placeholder}
            query={query}
            onQueryChange={setQuery}
            onSubmitSearch={submitSearch}
            faq={faq}
            audience={audience ?? 'end-user'}
            showResultScore={contentOptions.showResultScore}
            showStrategyFootnote={contentOptions.showStrategyFootnote}
            showDetailedLoadingHint={contentOptions.showDetailedLoadingHint}
            trackingConfig={config}
            showResultFeedback={showResultFeedback}
            starterQuestions={frequentQuestions}
            frequentQuestionsLoading={frequentQuestionsLoading}
            showFrequentQuestionsSection={contentOptions.frequentQuestionsMode !== 'off'}
            onResultClick={onResultClick}
            onClose={position !== 'inline' ? () => setOpen(false) : undefined}
            showCloseButton={position !== 'inline'}
            compact={position === 'inline'}
            autoFocus={open && position !== 'inline'}
          />
        </div>
      )}
    </div>
  );
}
