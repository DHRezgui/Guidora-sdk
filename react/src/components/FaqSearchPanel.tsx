import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef } from 'react';
import type { UseFaqSemanticSearchResult } from '../hooks/useFaqSemanticSearch';
import type { FaqAudienceMode } from '../types/faq';
import type { ContextualFaqSuggestion } from '../utils/faq-context';
import type { FaqPageContext, FaqSemanticSearchResult, SDKConfig } from '../types';
import { formatFaqCategoryLabel } from '../utils/faq-content';
import { useFaqResultUsageTracking, type FaqFeedbackChoice } from '../hooks/useFaqResultUsageTracking';

function formatScore(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

interface FaqSearchResultCardProps {
  result: FaqSemanticSearchResult;
  audience: FaqAudienceMode;
  showResultScore: boolean;
  showResultFeedback?: boolean;
  feedbackChoice?: FaqFeedbackChoice | null;
  onFeedback?: (helpful: boolean) => void;
  onResultClick?: (result: FaqSemanticSearchResult) => void;
}

function FaqSearchResultCard({
  result,
  audience,
  showResultScore,
  showResultFeedback = false,
  feedbackChoice = null,
  onFeedback,
  onResultClick,
}: FaqSearchResultCardProps) {
  const className = [
    'trustdev-faq-panel__result',
    onResultClick
      ? 'trustdev-faq-panel__result--interactive'
      : 'trustdev-faq-panel__result--static',
  ].join(' ');

  const content = (
    <>
      <div className="trustdev-faq-panel__result-meta">
        <span className="trustdev-faq-panel__result-category">
          {formatFaqCategoryLabel(result.category, audience)}
        </span>
        {showResultScore ? (
          <span className="trustdev-faq-panel__result-score">{formatScore(result.score)}</span>
        ) : null}
      </div>
      <p className="trustdev-faq-panel__result-question">{result.question}</p>
      <p className="trustdev-faq-panel__result-answer">{result.answer}</p>
      {showResultFeedback && onFeedback ? (
        <div className="trustdev-faq-panel__result-feedback">
          {feedbackChoice ? (
            <p className="trustdev-faq-panel__result-feedback-thanks" aria-live="polite">
              Merci pour votre retour.
            </p>
          ) : (
            <>
              <span className="trustdev-faq-panel__result-feedback-label">Cette réponse vous aide ?</span>
              <div className="trustdev-faq-panel__result-feedback-actions">
                <button
                  type="button"
                  className="trustdev-faq-panel__result-feedback-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onFeedback(true);
                  }}
                >
                  Oui
                </button>
                <button
                  type="button"
                  className="trustdev-faq-panel__result-feedback-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    onFeedback(false);
                  }}
                >
                  Non
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );

  if (onResultClick) {
    return (
      <button type="button" className={className} onClick={() => onResultClick(result)}>
        {content}
      </button>
    );
  }

  return <article className={className}>{content}</article>;
}

export interface FaqSearchPanelProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmitSearch: () => void;
  faq: UseFaqSemanticSearchResult;
  contextSummary?: string | null;
  contextDetails?: FaqPageContext | null;
  contextSectionLabel?: string;
  showContextMeta?: boolean;
  suggestions?: ContextualFaqSuggestion[];
  suggestionsLabel?: string;
  starterQuestions?: string[];
  showFrequentQuestionsSection?: boolean;
  frequentQuestionsLoading?: boolean;
  showContextSection?: boolean;
  showSuggestionsSection?: boolean;
  audience?: FaqAudienceMode;
  showResultScore?: boolean;
  showStrategyFootnote?: boolean;
  showDetailedLoadingHint?: boolean;
  trackingConfig?: Partial<SDKConfig>;
  showResultFeedback?: boolean;
  onSuggestionSelect?: (suggestion: ContextualFaqSuggestion) => void;
  onResultClick?: (result: FaqSemanticSearchResult) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  compact?: boolean;
  autoFocus?: boolean;
}

export function FaqSearchPanel({
  title = 'Aide FAQ',
  subtitle = 'Recherche sémantique sur la base d’aide de votre organisation',
  placeholder = 'Posez votre question…',
  query,
  onQueryChange,
  onSubmitSearch,
  faq,
  contextSummary,
  contextDetails,
  contextSectionLabel = 'Contexte',
  showContextMeta = false,
  suggestions = [],
  suggestionsLabel = 'Suggestions pour cette page',
  starterQuestions = [],
  showFrequentQuestionsSection = true,
  frequentQuestionsLoading = false,
  showContextSection = false,
  showSuggestionsSection,
  audience = 'developer',
  showResultScore = true,
  showStrategyFootnote = true,
  showDetailedLoadingHint = true,
  trackingConfig,
  showResultFeedback,
  onSuggestionSelect,
  onResultClick,
  onClose,
  showCloseButton = false,
  compact = false,
  autoFocus = false,
}: FaqSearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resolvedShowResultFeedback =
    showResultFeedback ?? (audience === 'end-user' && Boolean(trackingConfig));
  const { submitFeedback, getFeedbackForResult } = useFaqResultUsageTracking(
    trackingConfig,
    faq.results,
    resolvedShowResultFeedback,
  );

  useEffect(() => {
    if (!autoFocus) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmitSearch();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmitSearch();
    }
  };

  const handleQueryChange = useCallback(
    (value: string) => {
      onQueryChange(value);
      if (!value.trim()) {
        faq.clear();
      }
    },
    [faq, onQueryChange],
  );

  const handleSuggestion = useCallback(
    (suggestion: ContextualFaqSuggestion) => {
      handleQueryChange(suggestion.query);
      onSuggestionSelect?.(suggestion);
      void faq.search(suggestion.query);
    },
    [faq, handleQueryChange, onSuggestionSelect],
  );

  const handleStarterQuestion = useCallback(
    (question: string) => {
      handleQueryChange(question);
      void faq.search(question);
    },
    [faq, handleQueryChange],
  );

  const showSuggestions = showSuggestionsSection ?? showContextSection;

  const showStarterQuestions =
    showFrequentQuestionsSection &&
    !frequentQuestionsLoading &&
    starterQuestions.length > 0 &&
    !faq.lastQuery &&
    !faq.isLoading &&
    faq.results.length === 0;

  return (    <section
      className={['trustdev-faq-panel', compact ? 'trustdev-faq-panel--compact' : ''].filter(Boolean).join(' ')}
      role="search"
      aria-label={title}
    >
      <header className="trustdev-faq-panel__header">
        <div className="trustdev-faq-panel__heading">
          <div className="trustdev-faq-panel__title-row">
            <span className="trustdev-faq-panel__title-dot" aria-hidden />
            <h2 className="trustdev-faq-panel__title">{title}</h2>
          </div>
          {!compact && subtitle ? (
            <p className="trustdev-faq-panel__subtitle">{subtitle}</p>
          ) : null}
        </div>
        {showCloseButton && onClose ? (
          <button
            type="button"
            className="trustdev-faq-panel__close td-btn td-btn--icon"
            aria-label="Fermer l'aide"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </header>

      {showContextSection && contextSummary ? (
        <div className="trustdev-faq-panel__context" aria-live="polite">
          <p className="trustdev-faq-panel__context-label">{contextSectionLabel}</p>
          <p className="trustdev-faq-panel__context-value">{contextSummary}</p>
          {showContextMeta && contextDetails?.pageTitle ? (
            <p className="trustdev-faq-panel__context-meta">{contextDetails.pageTitle}</p>
          ) : null}
        </div>
      ) : null}

      {showStarterQuestions ? (
        <div className="trustdev-faq-panel__suggestions">
          <p className="trustdev-faq-panel__suggestions-label">Questions fréquentes</p>
          <div className="trustdev-faq-panel__suggestion-list">
            {starterQuestions.map((question) => (
              <button
                key={question}
                type="button"
                className="trustdev-faq-panel__suggestion-chip"
                disabled={faq.isLoading}
                onClick={() => handleStarterQuestion(question)}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showSuggestions && suggestions.length > 0 ? (
        <div className="trustdev-faq-panel__suggestions">
          <p className="trustdev-faq-panel__suggestions-label">{suggestionsLabel}</p>          <div className="trustdev-faq-panel__suggestion-list">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.label}-${suggestion.query}`}
                type="button"
                className="trustdev-faq-panel__suggestion-chip"
                title={suggestion.reason}
                disabled={faq.isLoading}
                onClick={() => handleSuggestion(suggestion)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form className="trustdev-faq-panel__form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="search"
          className="trustdev-faq-panel__input"
          value={query}
          placeholder={placeholder}
          aria-label="Question FAQ"
          autoComplete="off"
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="submit"
          className="trustdev-faq-panel__submit td-btn td-btn--primary"
          disabled={faq.isLoading || query.trim().length === 0}
        >
          {faq.isLoading ? '…' : 'Rechercher'}
        </button>
      </form>

      {faq.error ? (
        <p className="trustdev-faq-panel__status trustdev-faq-panel__status--error" role="alert">
          {faq.error}
        </p>
      ) : null}

      {faq.isLoading ? (
        <p className="trustdev-faq-panel__status" aria-live="polite">
          Recherche en cours…
          {showDetailedLoadingHint ? ' (la première requête peut prendre jusqu’à 2 min)' : null}
        </p>
      ) : null}
      {!faq.isLoading && faq.lastQuery && faq.results.length === 0 && !faq.error ? (
        <p className="trustdev-faq-panel__status" aria-live="polite">
          Aucune réponse pertinente. Reformulez votre question.
        </p>
      ) : null}

      {faq.results.length > 0 ? (
        <ul className="trustdev-faq-panel__results" aria-live="polite">
          {faq.results.map((result) => (
            <li key={result.id}>
              <FaqSearchResultCard
                result={result}
                audience={audience}
                showResultScore={showResultScore}
                showResultFeedback={resolvedShowResultFeedback}
                feedbackChoice={getFeedbackForResult(result.id)}
                onFeedback={(helpful) => submitFeedback(result.id, helpful)}
                onResultClick={onResultClick}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {showStrategyFootnote && faq.lastStrategyStep ? (
        <p className="trustdev-faq-panel__footnote">
          Stratégie : {faq.lastStrategyStep.replace(/_/g, ' ')}
        </p>
      ) : null}    </section>
  );
}
