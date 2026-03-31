export type PositionType =
  | 'TOP'
  | 'BOTTOM'
  | 'LEFT'
  | 'RIGHT'
  | 'CENTER'
  | 'TOP_LEFT'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_RIGHT';

export type ActionType = 'CLICK' | 'HOVER' | 'SCROLL' | 'NEXT' | 'SKIP' | 'COMPLETE';

export type EventType = 'PAGE_VIEW' | 'CLICK' | 'SCROLL' | 'HOVER' | 'EXIT' | 'FORM_SUBMIT' | 'ERROR';

export type FrictionType =
  | 'CLICK_MISS'
  | 'SCROLL_HESITATION'
  | 'TIME_ON_PAGE_EXCESSIVE'
  | 'FORM_ABANDONMENT'
  | 'NAVIGATION_BACK';

export interface SDKConfig {
  apiKey: string;
  apiUrl?: string;
  sdkToken?: string;
  accessToken?: string;
  getAccessToken?: () => string | null;
  organizationId?: string;
  debug?: boolean;
  trackBatchSize?: number;
  trackFlushIntervalMs?: number;
  syncEnabled?: boolean;
  syncIntervalMs?: number;
  syncOnFocus?: boolean;
  syncOnReconnect?: boolean;
}

export interface NormalizedSDKConfig {
  apiKey: string;
  apiUrl: string;
  sdkToken?: string;
  accessToken?: string;
  getAccessToken?: () => string | null;
  organizationId?: string;
  debug: boolean;
  trackBatchSize: number;
  trackFlushIntervalMs: number;
  syncEnabled: boolean;
  syncIntervalMs: number;
  syncOnFocus: boolean;
  syncOnReconnect: boolean;
}

export interface SDKInitResult {
  status: 'initialized';
  version: string;
  config: NormalizedSDKConfig;
}

export interface Step {
  id?: string;
  orderIndex?: number;
  title: string;
  content: string;
  targetSelector?: string;
  position?: PositionType;
  action?: ActionType;
  skipAllowed?: boolean;
  highlightElement?: boolean;
  waitTimeoutMs?: number;
}

export interface GuidedTour {
  id?: string;
  name: string;
  description?: string;
  targetUrl: string;
  isActive?: boolean;
  priority?: number;
  triggerConditions?: TriggerConditions;
  steps: Step[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TriggerConditions {
  minTimeOnPage?: number;
  minVisits?: number;
  maxDisplays?: number;
  roles?: string[];
  device?: 'mobile' | 'tablet' | 'desktop';
}

export interface TrackEventInput {
  userId?: string;
  sessionId: string;
  organizationId: string;
  eventType: EventType;
  pageUrl: string;
  elementSelector?: string;
  elementText?: string;
  scrollDepth?: number;
  timeOnPage?: number;
  metadata?: Record<string, unknown>;
}

export interface TrackEventResponse {
  success: boolean;
  message: string;
  accepted: boolean;
}

export interface TrackBatchResponse {
  success: boolean;
  message: string;
  accepted: boolean;
  count: number;
}

export interface ActiveToursResponse {
  success: boolean;
  count: number;
  tours: GuidedTour[];
}

export interface TourProgress {
  tourId: string;
  stepIndex: number;
  updatedAt: number;
}

export interface FrictionCounters {
  clickMiss: number;
  scrollHesitation: number;
  timeOnPageExcessive: number;
  formAbandonment: number;
  navigationBack: number;
}

export interface OnboardingDebugLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  payload?: unknown;
}
