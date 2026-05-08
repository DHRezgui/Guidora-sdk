import { CSSProperties, useMemo, useState } from 'react';
import { SuggestedTourDraft } from '../types';
import { UseContextualTourSuggestionsOptions, useContextualTourSuggestions } from '../hooks/useContextualTourSuggestions';

export type ContextualSuggestionsUIMode = 'auto' | 'hidden' | 'manual' | 'debug';

export interface ContextualSuggestionsPublisherProps extends UseContextualTourSuggestionsOptions {
  uiMode?: ContextualSuggestionsUIMode;
  title?: string;
  className?: string;
  style?: CSSProperties;
  stableOnly?: boolean;
}

const STABLE_SELECTOR_HINTS = ['[data-tour-id=', '[data-testid=', '[data-cy=', '[data-qa='];
const PHOENIX_GLASS_BG =
  'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(187,0,140,0.12) 35%, rgba(12,18,30,0.9) 100%)';
const PHOENIX_SURFACE_BG = 'rgba(15,23,42,0.5)';
const PHOENIX_SURFACE_BORDER = '1px solid rgba(255,255,255,0.2)';

function isStableSelector(selector?: string): boolean {
  if (!selector) return false;
  return STABLE_SELECTOR_HINTS.some((hint) => selector.includes(hint));
}

function isStableDraft(draft: SuggestedTourDraft): boolean {
  if (draft.steps.length === 0) return false;
  return draft.steps.every((step) => isStableSelector(step.targetSelector));
}

function resolveUIMode(uiMode: ContextualSuggestionsUIMode | undefined, autoPublish: boolean): Exclude<ContextualSuggestionsUIMode, 'auto'> {
  if (uiMode && uiMode !== 'auto') return uiMode;
  return autoPublish ? 'hidden' : 'manual';
}

export function ContextualSuggestionsPublisher({
  uiMode = 'auto',
  autoPublish = false,
  title = 'Contextual Suggestions',
  className,
  style,
  stableOnly = true,
  ...options
}: ContextualSuggestionsPublisherProps) {
  const suggestions = useContextualTourSuggestions({
    ...options,
    autoPublish,
  });
  const [collapsed, setCollapsed] = useState(true);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [publishHovered, setPublishHovered] = useState(false);
  const [publishPressed, setPublishPressed] = useState(false);

  const mode = resolveUIMode(uiMode, autoPublish);
  const publishableDrafts = useMemo(
    () => (stableOnly ? suggestions.drafts.filter(isStableDraft) : suggestions.drafts),
    [stableOnly, suggestions.drafts],
  );
  const debugReport = suggestions.getDebugReport();
  const flowRegistry = suggestions.getFlowRegistry();

  if (mode === 'hidden') return null;

  const onPublish = async () => {
    setLocalMessage(null);
    if (publishableDrafts.length === 0) {
      setLocalMessage(stableOnly ? 'No stable drafts to publish yet.' : 'No drafts to publish yet.');
      return;
    }

    const report = await suggestions.publishDrafts(publishableDrafts);
    if (!report) {
      setLocalMessage('Publish request failed.');
      return;
    }

    setLocalMessage(`Published: ${report.created}, rejected: ${report.rejected}.`);
  };

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 'calc(var(--td-z-index) + 10)',
        width: 360,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: mode === 'debug' ? '72vh' : 'calc(100vh - 24px)',
        overflow: 'auto',
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.22)',
        background: PHOENIX_GLASS_BG,
        color: '#ffffff',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.12), 0 14px 36px rgba(2,6,23,0.5)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 6px' }}>
        <strong style={{ fontSize: 14, fontWeight: 800, flex: 1, color: '#ffffff' }}>{title}</strong>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          style={{
            minWidth: 36,
            height: 32,
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8,
            background: 'linear-gradient(180deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.95) 100%)',
            color: '#ffffff',
            padding: '0 10px',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(2,6,23,0.35)',
            cursor: 'pointer',
          }}
          aria-label={collapsed ? 'Expand suggestions panel' : 'Collapse suggestions panel'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {!collapsed ? (
        <div style={{ padding: '0 10px 10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: PHOENIX_SURFACE_BG, padding: '6px 8px', fontSize: 12, color: '#f8fafc' }}>
              Drafts: <strong>{suggestions.drafts.length}</strong>
            </div>
            <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: PHOENIX_SURFACE_BG, padding: '6px 8px', fontSize: 12, color: '#f8fafc' }}>
              Publishable: <strong>{publishableDrafts.length}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => suggestions.refresh()}
              disabled={suggestions.isGenerating || suggestions.isPublishing}
              style={{
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: 8,
                background: 'rgba(15,23,42,0.56)',
                color: '#ffffff',
                padding: '7px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={suggestions.isPublishing}
              onMouseEnter={() => setPublishHovered(true)}
              onMouseLeave={() => {
                setPublishHovered(false);
                setPublishPressed(false);
              }}
              onMouseDown={() => setPublishPressed(true)}
              onMouseUp={() => setPublishPressed(false)}
              style={{
                border: '1px solid rgba(255,107,0,0.6)',
                borderRadius: 8,
                background: publishHovered
                  ? 'linear-gradient(135deg, #ff7a1a 0%, #cc149a 100%)'
                  : 'linear-gradient(135deg, #ff6b00 0%, #bb008c 100%)',
                color: '#ffffff',
                padding: '7px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: suggestions.isPublishing ? 'not-allowed' : 'pointer',
                opacity: suggestions.isPublishing ? 0.65 : 1,
                transform: publishPressed ? 'translateY(1px) scale(0.985)' : publishHovered ? 'translateY(-1px)' : 'translateY(0)',
                boxShadow: publishPressed
                  ? 'inset 0 2px 4px rgba(2,6,23,0.35)'
                  : publishHovered
                    ? '0 8px 20px rgba(255,107,0,0.35)'
                    : '0 4px 12px rgba(255,107,0,0.24)',
                transition: 'transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
              }}
            >
              {suggestions.isPublishing ? 'Publishing...' : 'Publish drafts'}
            </button>
          </div>

          {mode === 'debug' ? (
            <>
              <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: 'rgba(12,18,30,0.7)', padding: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 8, color: '#f8fafc' }}>
                <div style={{ marginBottom: 6, color: '#fdba74', fontWeight: 800 }}>Contextual Suggestions Debug</div>
                <div>Mode: {mode}</div>
                <div>Scenario: {options.publishScenario ?? 'medium'}</div>
                <div>Generating: {String(suggestions.isGenerating)}</div>
                <div>Publishing: {String(suggestions.isPublishing)}</div>
                <div>Drafts total: {suggestions.drafts.length}</div>
                <div>Stable drafts: {publishableDrafts.length}</div>
                {suggestions.error ? <div style={{ color: '#fca5a5' }}>Generate error: {suggestions.error}</div> : null}
                {suggestions.publishError ? <div style={{ color: '#fca5a5' }}>Publish error: {suggestions.publishError}</div> : null}
              </div>

              {suggestions.lastPublishReport ? (
                <div style={{ borderRadius: 8, border: '1px solid rgba(16,185,129,0.45)', background: 'rgba(6,40,32,0.55)', padding: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 8, color: '#d1fae5' }}>
                  Created: {suggestions.lastPublishReport.created} | Activated: {suggestions.lastPublishReport.activated} | Rejected:{' '}
                  {suggestions.lastPublishReport.rejected}
                </div>
              ) : null}

              {suggestions.lastPublishReport?.details?.length ? (
                <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: 'rgba(12,18,30,0.62)', padding: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 8, color: '#f8fafc' }}>
                  <div style={{ marginBottom: 6, fontWeight: 700 }}>Publish details</div>
                  {suggestions.lastPublishReport.details.map((detail, idx) => (
                    <div key={`${detail.draftName}-${idx}`} style={{ marginBottom: 4 }}>
                      {detail.draftName}: {detail.outcome}
                      {detail.reasons.length ? ` (${detail.reasons.join(', ')})` : ''}
                    </div>
                  ))}
                </div>
              ) : null}

              {debugReport ? (
                <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: 'rgba(12,18,30,0.62)', padding: 8, fontSize: 12, lineHeight: 1.45, marginBottom: 8, color: '#f8fafc' }}>
                  <div>Considered: {debugReport.candidateMetrics.considered}</div>
                  <div>Accepted: {debugReport.candidateMetrics.accepted}</div>
                  <div>Rejected noise: {debugReport.candidateMetrics.rejectedNoise}</div>
                  <div>After confidence filter: {debugReport.draftMetrics.afterConfidenceFilter}</div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 8 }}>
                {suggestions.drafts.map((draft, idx) => (
                  <div
                    key={`${draft.name}-${idx}`}
                    style={{
                      borderRadius: 8,
                      border: PHOENIX_SURFACE_BORDER,
                      background: 'rgba(12,18,30,0.62)',
                      padding: 8,
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{draft.name}</div>
                    <div>Intent: {draft.intent}</div>
                    <div>Confidence: {draft.confidence.toFixed(1)}</div>
                    <div>Score: {draft.score.toFixed(1)}</div>
                    <div>Steps: {draft.steps.length}</div>
                    <div>Target: {draft.targetUrl}</div>
                    <div>Step 1 selector: {draft.steps[0]?.targetSelector || 'N/A'}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() =>
                          suggestions.recordFeedback({
                            intent: draft.intent,
                            selector: draft.steps[0]?.targetSelector,
                            event: 'shown',
                          })
                        }
                        style={{
                          border: '1px solid rgba(255,255,255,0.22)',
                          borderRadius: 8,
                          background: 'rgba(15,23,42,0.56)',
                          color: '#ffffff',
                          padding: '6px 8px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Feedback shown
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          suggestions.recordFeedback({
                            intent: draft.intent,
                            selector: draft.steps[0]?.targetSelector,
                            event: 'clicked',
                          })
                        }
                        style={{
                          border: '1px solid rgba(255,255,255,0.22)',
                          borderRadius: 8,
                          background: 'rgba(15,23,42,0.56)',
                          color: '#ffffff',
                          padding: '6px 8px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Feedback clicked
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderRadius: 8, border: PHOENIX_SURFACE_BORDER, background: 'rgba(12,18,30,0.62)', padding: 8, fontSize: 12, lineHeight: 1.45, marginTop: 8, color: '#f8fafc' }}>
                <div style={{ marginBottom: 6, fontWeight: 700 }}>Flow Registry ({flowRegistry.length})</div>
                {flowRegistry.slice(0, 3).map((entry) => (
                  <div key={`${entry.version}-${entry.signature}`}>
                    {entry.version} - {entry.targetUrl}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={suggestions.resetFeedback}
                style={{
                  marginTop: 8,
                  border: '1px solid rgba(255,255,255,0.22)',
                  borderRadius: 8,
                  background: 'rgba(15,23,42,0.56)',
                  color: '#ffffff',
                  padding: '7px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Reset feedback
              </button>
            </>
          ) : null}

          {localMessage ? (
            <div
              style={{
                marginTop: 8,
                borderRadius: 8,
                border: PHOENIX_SURFACE_BORDER,
                background: PHOENIX_SURFACE_BG,
                padding: '6px 8px',
                fontSize: 12,
              }}
            >
              {localMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
