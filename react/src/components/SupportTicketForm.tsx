import { useState } from 'react';
import type { SDKConfig } from '../types/sdk';
import type { SupportExternalWidgetOptions, SupportTicketSessionContext } from '../types/support';
import { useSupportTicketSubmit } from '../hooks/useSupportTicketSubmit';
import { openExternalSupportWidget } from '../utils/support-external-widget';

export interface SupportTicketFormProps {
  config?: Partial<SDKConfig>;
  sessionContext?: Partial<SupportTicketSessionContext>;
  resolveSessionContext?: () => Partial<SupportTicketSessionContext>;
  title?: string;
  submitLabel?: string;
  successTitle?: string;
  successMessage?: string;
  externalWidget?: SupportExternalWidgetOptions | null;
  externalWidgetLabel?: string;
}

export function SupportTicketForm({
  config,
  sessionContext,
  resolveSessionContext,
  title = 'Contacter le support',
  submitLabel = 'Envoyer au support',
  successTitle = 'Message envoyé',
  successMessage,
  externalWidget = null,
  externalWidgetLabel = 'Ouvrir le chat',
}: SupportTicketFormProps) {
  const ticket = useSupportTicketSubmit({ config, sessionContext, resolveSessionContext });
  const [widgetError, setWidgetError] = useState<string | null>(null);

  const handleOpenExternalWidget = () => {
    if (!externalWidget) return;
    const result = openExternalSupportWidget(externalWidget);
    setWidgetError(result.ok ? null : result.reason);
  };

  const resolvedSuccessMessage =
    successMessage ||
    (ticket.submittedEmail
      ? `Notre équipe a bien reçu votre demande. Vous recevrez une réponse à ${ticket.submittedEmail}.`
      : 'Notre équipe a bien reçu votre demande et vous répondra rapidement.');

  if (ticket.status === 'success') {
    return (
      <div className="trustdev-faq-panel__support-form trustdev-faq-panel__support-form--success">
        {title ? <p className="trustdev-faq-panel__section-label">{title}</p> : null}
        <div className="trustdev-faq-panel__support-success" role="status" aria-live="polite">
          <span className="trustdev-faq-panel__support-success-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="trustdev-faq-panel__support-success-copy">
            <p className="trustdev-faq-panel__support-success-title">{successTitle}</p>
            <p className="trustdev-faq-panel__support-success-text">{resolvedSuccessMessage}</p>
          </div>
        </div>
        <button
          type="button"
          className="trustdev-faq-panel__support-reset td-btn td-btn--ghost"
          onClick={ticket.reset}
        >
          Nouveau message
        </button>
      </div>
    );
  }

  return (
    <form className="trustdev-faq-panel__support-form" onSubmit={ticket.submit}>
      {title ? <p className="trustdev-faq-panel__section-label">{title}</p> : null}
      <label className="trustdev-faq-panel__support-label" htmlFor="trustdev-support-subject">
        Sujet
      </label>
      <input
        id="trustdev-support-subject"
        type="text"
        className="trustdev-faq-panel__support-input"
        value={ticket.subject}
        placeholder="Ex. : Impossible d’accéder à ma facture"
        autoComplete="off"
        required
        minLength={ticket.minSubjectLength}
        maxLength={ticket.maxSubjectLength}
        disabled={ticket.status === 'submitting'}
        onChange={(event) => ticket.setSubject(event.target.value)}
      />
      <label className="trustdev-faq-panel__support-label" htmlFor="trustdev-support-message">
        Message
      </label>
      <textarea
        id="trustdev-support-message"
        className="trustdev-faq-panel__support-textarea"
        value={ticket.message}
        placeholder="Décrivez votre problème…"
        rows={3}
        required
        minLength={ticket.minMessageLength}
        disabled={ticket.status === 'submitting'}
        onChange={(event) => ticket.setMessage(event.target.value)}
      />
      <label className="trustdev-faq-panel__support-label" htmlFor="trustdev-support-email">
        E-mail pour vous répondre
      </label>
      <input
        id="trustdev-support-email"
        type="email"
        className="trustdev-faq-panel__support-input"
        value={ticket.email}
        placeholder="vous@exemple.com"
        autoComplete="email"
        required
        disabled={ticket.status === 'submitting'}
        onChange={(event) => ticket.setEmail(event.target.value)}
      />
      {!ticket.email.trim() ? (
        <p className="trustdev-faq-panel__status">E-mail requis pour recevoir une réponse</p>
      ) : !ticket.emailValid ? (
        <p className="trustdev-faq-panel__status trustdev-faq-panel__status--error" role="alert">
          Adresse e-mail invalide
        </p>
      ) : null}
      {ticket.error ? (
        <p className="trustdev-faq-panel__status trustdev-faq-panel__status--error" role="alert">
          {ticket.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="trustdev-faq-panel__support-submit td-btn td-btn--primary"
        disabled={!ticket.canSubmit}
      >
        {ticket.status === 'submitting' ? 'Envoi…' : submitLabel}
      </button>
      {externalWidget ? (
        <>
          <button
            type="button"
            className="trustdev-faq-panel__support-chat td-btn td-btn--ghost"
            onClick={handleOpenExternalWidget}
          >
            {externalWidgetLabel}
          </button>
          {widgetError ? (
            <p className="trustdev-faq-panel__status trustdev-faq-panel__status--error" role="alert">
              {widgetError}
            </p>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
