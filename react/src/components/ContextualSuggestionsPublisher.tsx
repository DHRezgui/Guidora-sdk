import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { SuggestedTourDraft } from '../types';
import { UseContextualTourSuggestionsOptions, useContextualTourSuggestions } from '../hooks/useContextualTourSuggestions';

export type ContextualSuggestionsUIMode = 'auto' | 'hidden' | 'manual' | 'debug';

export interface ContextualSuggestionsPublisherProps extends UseContextualTourSuggestionsOptions {
  uiMode?: ContextualSuggestionsUIMode;
  title?: string;
  className?: string;
  style?: CSSProperties;
  stableOnly?: boolean;
  /**
   * Whether the host application is running in developer/authoring mode.
   * When false (default), the panel is always hidden in 'auto' uiMode,
   * regardless of autoPublish. End-users consuming activated tours will
   * therefore never see the publishing panel in production.
   *
   * Set to true (typically wired to TourViewer's `debug` prop) to enable
   * the panel during development.
   */
  developerMode?: boolean;
}

const STABLE_SELECTOR_HINTS = ['[data-tour-id=', '[data-testid=', '[data-cy=', '[data-qa='];
const PHOENIX_GLASS_BG =
  'linear-gradient(135deg, rgba(255,107,0,0.16) 0%, rgba(187,0,140,0.12) 35%, rgba(12,18,30,0.9) 100%)';
const PHOENIX_SURFACE_BG = 'rgba(15,23,42,0.5)';
const PHOENIX_SURFACE_BORDER = '1px solid rgba(255,255,255,0.2)';

// `a[href="/path"]` matches an anchor by its target URL. In practice an app's
// route map changes much less often than its DOM structure, so href-based
// anchor selectors are at least as stable as `data-tour-id` for the purpose
// of cross-page navigation. Treat them as "stable enough" for the publish
// pipeline so that journey-blueprint drafts emitted via cross-page link
// detection are not unduly filtered out.
const HREF_ANCHOR_STABLE_PATTERN = /^a\[href=/;

function isStableSelector(selector?: string): boolean {
  if (!selector) return false;
  if (STABLE_SELECTOR_HINTS.some((hint) => selector.includes(hint))) return true;
  if (HREF_ANCHOR_STABLE_PATTERN.test(selector)) return true;
  return false;
}

function isStableDraft(draft: SuggestedTourDraft): boolean {
  if (draft.steps.length === 0) return false;
  // Journey-blueprint drafts are intrinsically business-meaningful and built
  // from a curated template + a deterministic resolver: their selectors come
  // either from explicit `data-tour-id` hints or from internal anchors keyed
  // by `href`. Both are reliable enough that we always consider them
  // publishable; the heuristic stable-selector heuristic only applies to
  // legacy heuristic drafts where any kind of fragile selector
  // (e.g. `:nth-child(...)`) could sneak in.
  if (draft.origin?.kind === 'blueprint') return true;
  return draft.steps.every((step) => isStableSelector(step.targetSelector));
}

function resolveUIMode(
  uiMode: ContextualSuggestionsUIMode | undefined,
  autoPublish: boolean,
  developerMode: boolean,
): Exclude<ContextualSuggestionsUIMode, 'auto'> {
  if (uiMode && uiMode !== 'auto') return uiMode;
  // Production-safe default: end-users must never see the publishing panel.
  // The panel only appears in 'auto' mode when the host opts into developer mode.
  if (!developerMode) return 'hidden';
  return autoPublish ? 'hidden' : 'manual';
}

export function ContextualSuggestionsPublisher({
  uiMode = 'auto',
  autoPublish = false,
  title = 'Contextual Suggestions',
  className,
  style,
  stableOnly = true,
  developerMode = false,
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

  const mode = resolveUIMode(uiMode, autoPublish, developerMode);
  const publishableDrafts = useMemo(
    () => (stableOnly ? suggestions.drafts.filter(isStableDraft) : suggestions.drafts),
    [stableOnly, suggestions.drafts],
  );
  const debugReport = suggestions.getDebugReport();
  const flowRegistry = suggestions.getFlowRegistry();

  // Auto-clear transient feedback confirmation after 2.5s.
  useEffect(() => {
    if (!localMessage) return;
    const timer = setTimeout(() => setLocalMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [localMessage]);

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

  const onRecordFeedback = (
    draft: SuggestedTourDraft,
    event: 'shown' | 'clicked',
  ) => {
    const selector = draft.steps[0]?.targetSelector;
    // Forward blueprintId when this draft was produced from a journey blueprint
    // so the feedback feeds per-blueprint aggregates (Phase 4 boost signal).
    const blueprintId = draft.origin?.kind === 'blueprint' ? draft.origin.blueprintId : undefined;
    suggestions.recordFeedback({ intent: draft.intent, selector, event, blueprintId });
    const target = selector ? selector.slice(0, 40) : draft.intent;
    setLocalMessage(`Recorded ${event} on ${target}${selector && selector.length > 40 ? '…' : ''}`);
  };

  const onResetFeedback = () => {
    suggestions.resetFeedback();
    setLocalMessage('Feedback reset (local + remote cache cleared).');
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
                <div>
                  Feedback runtime:{' '}
                  <strong style={{ color: options.feedbackEnabled === true ? '#86efac' : '#fca5a5' }}>
                    {options.feedbackEnabled === true ? 'enabled (opt-in)' : 'disabled (default)'}
                  </strong>
                </div>
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
                  <div style={{ marginBottom: 6, fontWeight: 700 }}>Candidate funnel</div>
                  <div>Considered: {debugReport.candidateMetrics.considered}</div>
                  <div>Accepted: {debugReport.candidateMetrics.accepted}</div>
                  <div>Rejected noise: {debugReport.candidateMetrics.rejectedNoise}</div>
                  <div style={{ marginTop: 6, marginBottom: 6, fontWeight: 700 }}>Draft funnel</div>
                  <div>Initial drafts (diversified): {debugReport.draftMetrics.beforeConflict}</div>
                  <div>After confidence filter: {debugReport.draftMetrics.afterConfidenceFilter}</div>
                  <div>After conflict resolution: {debugReport.draftMetrics.afterConflict}</div>
                  <div>
                    After max drafts cap: <strong>{debugReport.draftMetrics.afterMaxDrafts}</strong>
                  </div>
                  {debugReport.conflicts?.length ? (
                    <div style={{ marginTop: 6, color: '#fdba74' }}>
                      Conflicts resolved: {debugReport.conflicts.length}
                    </div>
                  ) : null}
                  {debugReport.stability ? (
                    <>
                      <div style={{ marginTop: 6, marginBottom: 6, fontWeight: 700 }}>
                        Determinism / stability
                      </div>
                      <div>
                        Viewport weight:{' '}
                        <strong style={{ color: debugReport.stability.viewportWeightMode === 'document-relative' ? '#86efac' : '#fca5a5' }}>
                          {debugReport.stability.viewportWeightMode}
                        </strong>
                      </div>
                      <div>
                        Feedback applied to:{' '}
                        <strong style={{ color: debugReport.stability.feedbackAppliedTo === 'ranking-only' ? '#86efac' : '#fca5a5' }}>
                          {debugReport.stability.feedbackAppliedTo}
                        </strong>
                      </div>
                      <div>
                        Feedback used:{' '}
                        <strong style={{ color: debugReport.stability.feedbackUsed ? '#86efac' : '#cbd5f5' }}>
                          {debugReport.stability.feedbackUsed ? 'yes' : 'no (opt-in flag off)'}
                        </strong>
                      </div>
                      {debugReport.stability.feedbackUsed ? (
                        <div>
                          Remote feedback ready at scan time:{' '}
                          <strong style={{ color: debugReport.stability.remoteFeedbackReady ? '#86efac' : '#fdba74' }}>
                            {debugReport.stability.remoteFeedbackReady ? 'yes (cross-user signal applied)' : 'no (local only)'}
                          </strong>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {debugReport.journeyBlueprints ? (
                    <>
                      <div style={{ marginTop: 6, marginBottom: 6, fontWeight: 700 }}>
                        Journey blueprints
                      </div>
                      <div>
                        Active verticals:{' '}
                        <strong>
                          {debugReport.journeyBlueprints.activeVerticals.length > 0
                            ? debugReport.journeyBlueprints.activeVerticals.join(', ')
                            : 'none (custom only)'}
                        </strong>
                      </div>
                      <div>
                        Blueprints considered: {debugReport.journeyBlueprints.totalBlueprintsConsidered}
                      </div>
                      <div>
                        Blueprints producing drafts:{' '}
                        <strong style={{ color: debugReport.journeyBlueprints.blueprintsProducingDrafts > 0 ? '#86efac' : '#fca5a5' }}>
                          {debugReport.journeyBlueprints.blueprintsProducingDrafts}
                        </strong>
                      </div>
                      {debugReport.journeyBlueprints.blueprintResults.map((result) => (
                        <div
                          key={result.blueprintId}
                          style={{
                            marginTop: 4,
                            padding: 6,
                            borderRadius: 6,
                            background: 'rgba(15,23,42,0.5)',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>
                            <span style={{ color: result.produced ? '#86efac' : '#fca5a5' }}>
                              {result.produced ? 'OK' : 'KO'}
                            </span>{' '}
                            {result.blueprintId}{' '}
                            <span style={{ color: '#94a3b8', fontWeight: 400 }}>({result.vertical})</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#cbd5f5' }}>
                            Resolved {result.resolvedOnCurrentPage}/{result.declaredSteps} on current page
                            {result.resolvedCrossPage > 0 ? `, ${result.resolvedCrossPage} cross-page` : ''}
                            {result.resolvedDeduced > 0 ? `, ${result.resolvedDeduced} deduced` : ''}
                            {result.unresolvedSteps > 0 ? `, ${result.unresolvedSteps} unresolved` : ''}
                          </div>
                          {result.rejectionReason ? (
                            <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                              Rejected: {result.rejectionReason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                  {debugReport.qualityFilter && debugReport.qualityFilter.rejectedAsTrivial > 0 ? (
                    <>
                      <div style={{ marginTop: 6, marginBottom: 6, fontWeight: 700 }}>
                        Quality filter (heuristic drafts only)
                      </div>
                      <div>
                        Rejected as trivial:{' '}
                        <strong style={{ color: '#fdba74' }}>
                          {debugReport.qualityFilter.rejectedAsTrivial}
                        </strong>
                      </div>
                      {debugReport.qualityFilter.rejectedReasons.map((r) => (
                        <div key={r.reason} style={{ fontSize: 11, color: '#cbd5f5' }}>
                          - {r.reason} ({r.count})
                        </div>
                      ))}
                    </>
                  ) : null}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, flex: 1 }}>{draft.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background:
                            draft.origin?.kind === 'blueprint'
                              ? 'rgba(34,197,94,0.18)'
                              : 'rgba(148,163,184,0.18)',
                          color: draft.origin?.kind === 'blueprint' ? '#86efac' : '#cbd5f5',
                          border: `1px solid ${
                            draft.origin?.kind === 'blueprint'
                              ? 'rgba(34,197,94,0.4)'
                              : 'rgba(148,163,184,0.3)'
                          }`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {draft.origin?.kind === 'blueprint'
                          ? `BLUEPRINT · ${draft.origin.vertical}`
                          : 'HEURISTIC'}
                      </span>
                    </div>
                    {draft.origin?.kind === 'blueprint' ? (
                      <div style={{ fontSize: 11, color: '#cbd5f5', marginBottom: 4 }}>
                        Blueprint: <strong>{draft.origin.blueprintId}</strong> · Resolved{' '}
                        {draft.origin.resolvedSteps}/{draft.origin.declaredSteps} steps
                      </div>
                    ) : null}
                    <div>Intent: {draft.intent}</div>
                    <div>Confidence: {draft.confidence.toFixed(1)}</div>
                    <div>Score: {draft.score.toFixed(1)}</div>
                    <div>Steps: {draft.steps.length}</div>
                    <div>Target: {draft.targetUrl}</div>
                    <div>Step 1 selector: {draft.steps[0]?.targetSelector || 'N/A'}</div>
                    {draft.steps.some((s) => s.stepTargetUrl) ? (
                      <div style={{ fontSize: 11, color: '#86efac', marginTop: 2 }}>
                        Multi-page tour: visits{' '}
                        {Array.from(
                          new Set(
                            draft.steps
                              .map((s) => s.stepTargetUrl || draft.targetUrl)
                              .filter((u): u is string => Boolean(u)),
                          ),
                        ).join(' → ')}
                      </div>
                    ) : null}
                    {(() => {
                      const localStats = suggestions.getLocalFeedback(draft.steps[0]?.targetSelector);
                      return (
                        <div style={{ marginTop: 4, color: '#cbd5f5', fontSize: 11 }}>
                          Local feedback:{' '}
                          <strong>shown {localStats?.shown ?? 0}</strong>
                          {' · '}
                          <strong>clicked {localStats?.clicked ?? 0}</strong>
                          {' · '}
                          <strong>completed {localStats?.completed ?? 0}</strong>
                          {' · '}
                          <strong>skipped {localStats?.skipped ?? 0}</strong>
                        </div>
                      );
                    })()}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => onRecordFeedback(draft, 'shown')}
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
                        onClick={() => onRecordFeedback(draft, 'clicked')}
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
                onClick={onResetFeedback}
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
                border: '1px solid rgba(134,239,172,0.45)',
                background: 'rgba(6,40,32,0.55)',
                color: '#d1fae5',
                padding: '8px 10px',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(16,185,129,0.16)',
                transition: 'opacity 240ms ease',
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
