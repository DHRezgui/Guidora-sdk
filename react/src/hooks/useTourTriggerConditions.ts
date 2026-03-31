import { useMemo } from 'react';
import { TriggerConditions } from '../types';
import { getVisitCount } from '../utils/storage';
import { getCurrentDevice } from '../utils/url';

export interface TriggerContext {
  currentRole?: string;
  displays?: number;
  timeOnPageSeconds?: number;
  pageUrl?: string;
}

export function useTourTriggerConditions(
  conditions?: TriggerConditions,
  context?: TriggerContext,
): { shouldStart: boolean; reasons: string[] } {
  return useMemo(() => {
    if (!conditions) {
      return { shouldStart: true, reasons: [] };
    }

    const reasons: string[] = [];
    const timeOnPage = context?.timeOnPageSeconds ?? 0;
    const displays = context?.displays ?? 0;
    const role = context?.currentRole;
    const pageUrl = context?.pageUrl ?? '/';
    const visits = getVisitCount(pageUrl);
    const device = getCurrentDevice();

    if (conditions.minTimeOnPage && timeOnPage < conditions.minTimeOnPage) {
      reasons.push('minTimeOnPage not reached');
    }

    if (conditions.minVisits && visits < conditions.minVisits) {
      reasons.push('minVisits not reached');
    }

    if (conditions.maxDisplays && displays >= conditions.maxDisplays) {
      reasons.push('maxDisplays reached');
    }

    if (conditions.roles && conditions.roles.length > 0 && role && !conditions.roles.includes(role)) {
      reasons.push('role mismatch');
    }

    if (conditions.device && conditions.device !== device) {
      reasons.push('device mismatch');
    }

    return {
      shouldStart: reasons.length === 0,
      reasons,
    };
  }, [conditions, context?.currentRole, context?.displays, context?.pageUrl, context?.timeOnPageSeconds]);
}
