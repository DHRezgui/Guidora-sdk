import type { AssistanceState } from './ml';
import type { SupportExternalWidgetOptions } from '../utils/support-external-widget';

export type { SupportExternalWidgetOptions, SupportExternalWidgetProvider } from '../utils/support-external-widget';

/** Why assistance opened for this help episode (frozen at trigger). */
export type SupportHelpEpisodeTrigger = 'proactiveToast' | 'manualFaq' | 'tour';

/**
 * Snapshot frozen when assistance leaves `none` (toast / FAQ / tour).
 * Explains *why* help was opened — distinct from submit-time metrics.
 */
export interface SupportHelpEpisode {
  trigger: SupportHelpEpisodeTrigger;
  frictionAtTrigger?: number;
  riskAtTrigger?: number;
  timeOnPageAtTrigger?: number;
  pageTimeAtTrigger?: number;
  idleSecondsAtTrigger?: number;
  /** ISO-8601 capture time. */
  capturedAt: string;
}

/** Runtime context attached to a support ticket (`session_data` JSONB). */
export interface SupportTicketSessionContext {
  pageUrl?: string;
  sessionId?: string;
  projectKey?: string;
  assistanceState?: AssistanceState;
  abandonmentRisk?: number;
  frictionScore?: number;
  timeOnPage?: number;
  pageTime?: number;
  contactEmail?: string;
  /** Host / project white-label for support emails (chameleon). */
  supportBrand?: SupportEmailBrand;
  /** Parsed browser summary (never raw UA). */
  browser?: string;
  /** FAQ searches in this SDK session before ticket submit. */
  faqSearchCount?: number;
  /** Last FAQ query typed by the user. */
  faqLastQuery?: string;
  /** Active guided tour id, if any. */
  activeTourId?: string | null;
  /** Active tour step index (0-based), if any. */
  activeTourStep?: number | null;
  /** Last completed guided tour in this session (id). */
  lastCompletedTourId?: string;
  /** Last completed guided tour display name. */
  lastCompletedTourName?: string;
  /** Last pages visited (max 5); may keep safe query/hash. */
  navigationHistory?: string[];
  /**
   * Frozen metrics at the start of the latest help episode
   * (`none` → toast | faq | tour). Overwritten on each new episode.
   */
  episode?: SupportHelpEpisode;
}

/** Branding attached to tickets so outbound emails match the host product. */
export interface SupportEmailBrand {
  productName?: string;
  supportLabel?: string;
  fromDisplayName?: string;
  accentColor?: string;
  accentColorTo?: string;
  logoUrl?: string;
  monogram?: string;
}

export interface CreateSupportTicketRequest {
  subject: string;
  message: string;
  email: string;
  pageUrl?: string;
  projectKey?: string;
  sessionData?: SupportTicketSessionContext;
}

export interface SupportTicketRecord {
  id: string;
  organizationId: string;
  userId?: string | null;
  userEmail?: string | null;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  projectKey?: string;
  assignedTo?: string | null;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
  pageUrl?: string | null;
  sessionData?: SupportTicketSessionContext;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketResponse {
  success: boolean;
  ticket: SupportTicketRecord;
}

export type SupportTicketSubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

export type { SupportExternalWidgetOptions as FaqSupportExternalWidget };
