import { useState } from 'react';
import type { PageGuideItem } from '../utils/page-guides';
import { pageGuideCtaLabel, pageGuideStatusLabel } from '../utils/page-guides';

export interface GuidesPanelProps {
  guides: PageGuideItem[];
  loading?: boolean;
  launchingId?: string | null;
  disabled?: boolean;
  onLaunch?: (guide: PageGuideItem) => void;
  /** Controlled open state (optional). Defaults to collapsed. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GuidesPanel({
  guides,
  loading = false,
  launchingId = null,
  disabled = false,
  onLaunch,
  open,
  onOpenChange,
}: GuidesPanelProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (open === undefined) {
      setUncontrolledOpen(next);
    }
  };

  const count = guides.length;
  const hint = loading && count === 0
    ? 'Chargement…'
    : count === 0
      ? 'Aucun guide pour cette page'
      : count === 1
        ? '1 parcours disponible'
        : `${count} parcours disponibles`;

  return (
    <div
      className={[
        'trustdev-faq-panel__section',
        'trustdev-faq-panel__section--guides',
        isOpen
          ? 'trustdev-faq-panel__section--guides-open'
          : 'trustdev-faq-panel__section--guides-collapsed',
      ].join(' ')}
    >
      <button
        type="button"
        className="trustdev-faq-panel__guides-toggle"
        aria-expanded={isOpen}
        onClick={() => setOpen(!isOpen)}
      >
        <span className="trustdev-faq-panel__guides-toggle-lead" aria-hidden>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="trustdev-faq-panel__guides-toggle-copy">
          <span className="trustdev-faq-panel__guides-toggle-title">
            {isOpen ? 'Masquer les guides' : 'Guides'}
          </span>
          {!isOpen ? (
            <span className="trustdev-faq-panel__guides-toggle-hint">{hint}</span>
          ) : null}
        </span>
        <span
          className={[
            'trustdev-faq-panel__guides-toggle-chevron',
            isOpen ? 'trustdev-faq-panel__guides-toggle-chevron--open' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div className="trustdev-faq-panel__guides-body">
          <div className="trustdev-faq-panel__guides-scroll">
            {loading && guides.length === 0 ? (
              <p className="trustdev-faq-panel__status" aria-live="polite">
                Chargement des guides…
              </p>
            ) : null}

            {!loading && guides.length === 0 ? (
              <p className="trustdev-faq-panel__status" aria-live="polite">
                Aucun guide pour cette page.
              </p>
            ) : null}

            {guides.length > 0 ? (
              <ul className="trustdev-faq-panel__guides" aria-label="Guides de cette page">
                {guides.map((guide) => {
                  const statusLabel = pageGuideStatusLabel(guide.status);
                  const isLaunching = launchingId === guide.id;
                  const isBusy = disabled || Boolean(launchingId);
                  return (
                    <li key={guide.id} className="trustdev-faq-panel__guide">
                      <div className="trustdev-faq-panel__guide-copy">
                        <p className="trustdev-faq-panel__guide-title">{guide.name}</p>
                        <p className="trustdev-faq-panel__guide-meta">
                          {guide.stepCount} étape{guide.stepCount === 1 ? '' : 's'}
                          {statusLabel ? ` · ${statusLabel}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="trustdev-faq-panel__guide-cta td-btn td-btn--primary"
                        disabled={isBusy}
                        aria-busy={isLaunching || undefined}
                        onClick={() => onLaunch?.(guide)}
                      >
                        {isLaunching ? '…' : pageGuideCtaLabel(guide.status)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
