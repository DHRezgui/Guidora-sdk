import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { SDKConfig } from '../types/sdk';
import type { SupportTicketSessionContext, SupportTicketSubmitStatus } from '../types/support';
import { buildSupportTicketSessionContext } from '../utils/support-ticket-context';
import { submitSupportTicket } from '../utils/support-ticket-client';

const MIN_SUBJECT_LENGTH = 3;
const MAX_SUBJECT_LENGTH = 200;
const MIN_MESSAGE_LENGTH = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export interface UseSupportTicketSubmitOptions {
  config?: Partial<SDKConfig>;
  sessionContext?: Partial<SupportTicketSessionContext>;
  /** Fresh runtime values captured at submit time (preferred over static `sessionContext`). */
  resolveSessionContext?: () => Partial<SupportTicketSessionContext>;
}

export function useSupportTicketSubmit({
  config,
  sessionContext,
  resolveSessionContext,
}: UseSupportTicketSubmitOptions) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(() => sessionContext?.contactEmail?.trim() || '');
  const [status, setStatus] = useState<SupportTicketSubmitStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  useEffect(() => {
    const prefill = sessionContext?.contactEmail?.trim();
    if (prefill && !email) {
      setEmail(prefill);
    }
  }, [email, sessionContext?.contactEmail]);

  const reset = useCallback(() => {
    setSubject('');
    setMessage('');
    setEmail(sessionContext?.contactEmail?.trim() || '');
    setStatus('idle');
    setError(null);
    setSubmittedEmail(null);
  }, [sessionContext?.contactEmail]);

  const emailValid = isValidEmail(email);
  const canSubmit =
    subject.trim().length >= MIN_SUBJECT_LENGTH &&
    message.trim().length >= MIN_MESSAGE_LENGTH &&
    emailValid &&
    status !== 'submitting';

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const trimmedSubject = subject.trim();
      const trimmedMessage = message.trim();
      const trimmedEmail = email.trim();

      if (trimmedSubject.length < MIN_SUBJECT_LENGTH) {
        setError(`Le sujet doit contenir au moins ${MIN_SUBJECT_LENGTH} caractères.`);
        setStatus('error');
        return;
      }

      if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
        setError(`Le message doit contenir au moins ${MIN_MESSAGE_LENGTH} caractères.`);
        setStatus('error');
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        setError('E-mail requis pour recevoir une réponse.');
        setStatus('error');
        return;
      }

      setStatus('submitting');
      setError(null);

      try {
        const runtimeContext = resolveSessionContext?.() ?? sessionContext ?? {};
        const pageUrl =
          runtimeContext.pageUrl ??
          (typeof window !== 'undefined' ? window.location.href : undefined);

        await submitSupportTicket(config, {
          subject: trimmedSubject.slice(0, MAX_SUBJECT_LENGTH),
          message: trimmedMessage,
          email: trimmedEmail,
          pageUrl,
          projectKey: runtimeContext.projectKey,
          sessionData: buildSupportTicketSessionContext({
            ...runtimeContext,
            pageUrl,
            contactEmail: trimmedEmail,
          }),
        });

        setSubmittedEmail(trimmedEmail);
        setStatus('success');
        setSubject('');
        setMessage('');
      } catch (err) {
        const text = err instanceof Error ? err.message : 'Envoi impossible.';
        setError(text.replace(/^\[TrustDev SDK\] API \d+: /, ''));
        setStatus('error');
      }
    },
    [config, email, message, resolveSessionContext, sessionContext, subject],
  );

  return {
    subject,
    setSubject,
    message,
    setMessage,
    email,
    setEmail,
    emailValid,
    canSubmit,
    status,
    error,
    submittedEmail,
    submit,
    reset,
    minSubjectLength: MIN_SUBJECT_LENGTH,
    maxSubjectLength: MAX_SUBJECT_LENGTH,
    minMessageLength: MIN_MESSAGE_LENGTH,
  };
}
