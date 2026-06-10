import type { ContextualPublishTourState, PublishContextualDraftsResponse } from '../types';

export type ContextualPublishReport = PublishContextualDraftsResponse['report'] & {
  /** Set when the report comes from a dry-run preview, not an actual publish. */
  preview?: boolean;
};
export type ContextualPublishDetail = ContextualPublishReport['details'][number];

export type ContextualPublishTourSnapshot = {
  id?: string;
  environment?: string;
  sandboxStatus?: string | null;
  createdBy?: string | null;
  assignedToModeration?: boolean;
};

export function isContextualTourApprovedOrLive(
  tour: Pick<ContextualPublishTourSnapshot, 'environment' | 'sandboxStatus'>,
): boolean {
  return tour.environment === 'production' || tour.sandboxStatus === 'approved';
}

export function shouldRefreshPublishReport(report: ContextualPublishReport | null): boolean {
  return Boolean(report && (report.details?.length ?? 0) > 0);
}

export function shouldRevalidateBlockedPublishReport(report: ContextualPublishReport | null): boolean {
  return Boolean(report && (report.blocked ?? 0) > 0);
}

function tourStatesMatch(
  left?: ContextualPublishTourState | null,
  right?: ContextualPublishTourSnapshot | null,
): boolean {
  if (!left || !right) {
    return false;
  }
  return (
    left.environment === right.environment &&
    (left.sandboxStatus ?? null) === (right.sandboxStatus ?? null) &&
    (left.createdBy ?? null) === (right.createdBy ?? null) &&
    Boolean(left.assignedToModeration) === Boolean(right.assignedToModeration)
  );
}

/**
 * Report is stale when linked tour environment/moderation changed since the snapshot.
 */
export function isContextualPublishReportStale(
  report: ContextualPublishReport | null,
  tours: ContextualPublishTourSnapshot[],
): boolean {
  if (!shouldRefreshPublishReport(report)) {
    return false;
  }

  const tourById = new Map(
    tours.filter((tour) => tour.id).map((tour) => [tour.id as string, tour]),
  );

  for (const detail of report?.details ?? []) {
    if (!detail.tourId || !detail.tourState) {
      continue;
    }

    const tour = tourById.get(detail.tourId);
    if (!tour) {
      return true;
    }

    if (!tourStatesMatch(detail.tourState, tour)) {
      return true;
    }
  }

  return false;
}

export function reconcileContextualPublishReport(
  report: ContextualPublishReport | null,
  tours: ContextualPublishTourSnapshot[],
): ContextualPublishReport | null {
  if (!report) {
    return null;
  }
  return isContextualPublishReportStale(report, tours) ? null : report;
}

export function countSuccessfulPublishActions(report: ContextualPublishReport): number {
  return (report.created ?? 0) + (report.refreshed ?? 0) + (report.takenOver ?? 0);
}

export function formatPublishReportSummary(report: ContextualPublishReport): string {
  const parts = [
    `Created: ${report.created ?? 0}`,
    `Refreshed: ${report.refreshed ?? 0}`,
    `Taken over: ${report.takenOver ?? 0}`,
    `Activated: ${report.activated ?? 0}`,
    `Blocked: ${report.blocked ?? 0}`,
    `Rejected: ${report.rejected ?? 0}`,
  ];
  if ((report.skipped ?? 0) > 0) {
    parts.push(`Skipped: ${report.skipped ?? 0}`);
  }
  return parts.join(' | ');
}

export function describeBlockedReason(
  reason: string | undefined,
  tourState?: ContextualPublishTourState,
): string {
  if (reason === 'tour_awaiting_admin_moderation') {
    return 'awaiting admin moderation — assignee must approve, reject, or return before SDK refresh';
  }
  if (reason === 'tour_owned_by_higher_role') {
    return 'owned by an admin (pending sandbox)';
  }
  if (reason === 'tour_owned_by_another_publisher') {
    if (tourState?.sandboxStatus === 'rejected') {
      return 'rejected — owned by another developer (correction required on their side)';
    }
    if (tourState?.sandboxStatus === 'returned') {
      return 'returned to another developer — you are not the current owner';
    }
    return 'owned by another account';
  }
  if (reason === 'tour_already_approved_or_live') {
    if (tourState?.environment === 'production') {
      return 'in production (SDK republish locked)';
    }
    if (tourState?.sandboxStatus === 'approved') {
      return 'approved in sandbox (SDK republish locked)';
    }
    return 'already approved or live';
  }
  return reason ?? 'blocked by ownership rules';
}

export function describePublishDetailStatus(
  detail: ContextualPublishDetail,
  options?: { preview?: boolean },
): string {
  const preview = options?.preview === true;
  if (detail.outcome === 'blocked') {
    return describeBlockedReason(detail.reasons[0], detail.tourState);
  }
  if (detail.outcome === 'refreshed') {
    const moderationStatus = detail.tourState?.sandboxStatus;
    if (moderationStatus === 'returned' || moderationStatus === 'rejected') {
      return preview
        ? `would update content in place (moderation stays ${moderationStatus})`
        : `updated in place — moderation unchanged (${moderationStatus}), assign admin from dashboard when ready`;
    }
    return preview ? 'would refresh in place (same owner)' : 'updated in place (same owner)';
  }
  if (detail.outcome === 'taken_over') {
    return preview
      ? 'would be taken over by current admin publisher'
      : 'taken over by current admin publisher';
  }
  if (detail.outcome === 'created') {
    return preview ? 'new tour would be created' : 'created';
  }
  if (detail.outcome === 'activated') {
    return preview ? 'new tour would be created and activated' : 'created and activated';
  }
  if (detail.outcome === 'rejected') {
    return `rejected (${detail.reasons.join(', ') || 'quality gates'})`;
  }
  if (detail.outcome === 'skipped') {
    return `skipped (${detail.reasons.join(', ') || 'policy'})`;
  }
  return formatPublishDetailOutcome(detail.outcome);
}

export function describePublishReportDetailLines(report: ContextualPublishReport): string[] {
  return (report.details ?? []).map(
    (detail) => `${detail.draftName}: ${describePublishDetailStatus(detail, { preview: report.preview })}`,
  );
}

export function describePublishReportStatus(report: ContextualPublishReport): string | null {
  const detailLines = describePublishReportDetailLines(report);
  if (detailLines.length > 1) {
    return detailLines.join(' · ');
  }
  if (detailLines.length === 1) {
    return detailLines[0];
  }

  const refreshed = report.refreshed ?? 0;
  const takenOver = report.takenOver ?? 0;
  const created = report.created ?? 0;
  const rejected = report.rejected ?? 0;

  if (refreshed > 0 && created === 0 && takenOver === 0) {
    return `Republish OK — ${refreshed} existing tour(s) updated in place (same owner).`;
  }
  if (takenOver > 0) {
    return `Admin takeover — ${takenOver} tour(s) transferred to the current publisher.`;
  }
  if (created > 0 && refreshed === 0) {
    return `${created} new tour(s) created.`;
  }
  if (created > 0 && refreshed > 0) {
    return `${created} created, ${refreshed} refreshed in place.`;
  }
  if (rejected > 0 && countSuccessfulPublishActions(report) === 0) {
    return 'No tours published — drafts rejected by quality gates.';
  }
  return null;
}

const OUTCOME_LABELS: Record<string, string> = {
  created: 'created',
  activated: 'activated',
  rejected: 'rejected',
  skipped: 'skipped',
  blocked: 'blocked',
  refreshed: 'refreshed (in-place update)',
  taken_over: 'taken over (admin takeover)',
};

export function formatPublishDetailOutcome(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}

export function formatPublishDetailLine(
  detail: ContextualPublishDetail,
  options?: { preview?: boolean },
): string {
  const status = describePublishDetailStatus(detail, options);
  if (detail.outcome === 'blocked' || detail.outcome === 'rejected' || detail.outcome === 'skipped') {
    return `${detail.draftName}: ${status}`;
  }
  return `${detail.draftName}: ${formatPublishDetailOutcome(detail.outcome)} — ${status}`;
}

export function publishReportPanelTone(
  report: ContextualPublishReport,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (countSuccessfulPublishActions(report) > 0 && (report.blocked ?? 0) === 0) {
    return 'success';
  }
  if ((report.blocked ?? 0) > 0 && countSuccessfulPublishActions(report) > 0) {
    return 'warning';
  }
  if (countSuccessfulPublishActions(report) > 0) {
    return 'success';
  }
  if ((report.blocked ?? 0) > 0) {
    return 'warning';
  }
  if ((report.rejected ?? 0) > 0) {
    return 'error';
  }
  return 'neutral';
}

export function publishReportsEquivalent(
  left: ContextualPublishReport | null,
  right: ContextualPublishReport | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
