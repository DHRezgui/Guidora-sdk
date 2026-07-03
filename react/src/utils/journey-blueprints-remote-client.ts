/**
 * Fetches organization-specific journey blueprints from TrustDev API.
 * Failures are non-fatal: returns [] and leaves built-in / local blueprints intact.
 */

import { resolveSdkAuthBearerTokenFromSources } from '../core/auth-token';
import { resolveSDKConfig } from '../core/sdk-state';
import type { JourneyBlueprint, TourDraftGenerationOptions } from '../types';
import { DEFAULT_SDK_PROJECT_KEY, resolveSdkProjectKey } from './sdk-project-key';

export type RemoteBlueprintsFetchStatus = 'ok' | 'timeout' | 'error' | 'disabled' | 'unconfigured';

export interface RemoteBlueprintsFetchResult {
  status: RemoteBlueprintsFetchStatus;
  blueprints: JourneyBlueprint[];
  note?: string;
}

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

interface RemoteBlueprintCacheEntry {
  key: string;
  blueprints: JourneyBlueprint[];
  fetchedAt: number;
  status: RemoteBlueprintsFetchStatus;
}

let remoteBlueprintCache: RemoteBlueprintCacheEntry | null = null;

export function clearRemoteJourneyBlueprintsCache(): void {
  remoteBlueprintCache = null;
}

export function resolveJourneyBlueprintsRemoteUrl(
  options?: TourDraftGenerationOptions,
): string | null {
  const explicit = options?.journeyBlueprintsRemoteUrl?.trim();
  if (explicit) return explicit;

  if (options?.journeyBlueprintsRemoteEnabled === false) {
    return null;
  }

  if (options?.journeyBlueprintsRemoteEnabled !== true && !options?.publishConfig?.apiUrl) {
    return null;
  }

  const apiUrl = options?.publishConfig?.apiUrl;
  if (!apiUrl) return null;

  const base = apiUrl.replace(/\/$/, '');
  return `${base}/tours/contextual/blueprints`;
}

function buildCacheKey(url: string, token: string | null, projectKey?: string): string {
  const projectSegment = projectKey?.trim() || '';
  return `${url}::${token ?? ''}::${projectSegment}`;
}

function appendProjectKeyToUrl(url: string, projectKey: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}projectKey=${encodeURIComponent(projectKey)}`;
}

function isValidBlueprintShape(value: unknown): value is JourneyBlueprint {
  if (!value || typeof value !== 'object') return false;
  const bp = value as JourneyBlueprint;
  return (
    typeof bp.id === 'string' &&
    typeof bp.name === 'string' &&
    typeof bp.description === 'string' &&
    typeof bp.vertical === 'string' &&
    typeof bp.intent === 'string' &&
    Array.isArray(bp.steps) &&
    bp.steps.length > 0
  );
}

function parseBlueprintsResponse(body: unknown): JourneyBlueprint[] {
  if (!body || typeof body !== 'object') return [];
  const record = body as { blueprints?: unknown };
  if (!Array.isArray(record.blueprints)) return [];
  return record.blueprints.filter(isValidBlueprintShape);
}

/**
 * Merge order: local `journeyBlueprints` first, then remote (append only).
 * Built-ins are merged separately in `selectActiveBlueprints`.
 */
export function mergeLocalAndRemoteJourneyBlueprints(
  local: JourneyBlueprint[] | undefined,
  remote: JourneyBlueprint[],
  projectKey?: string,
): JourneyBlueprint[] {
  const scopedKey = projectKey?.trim() || DEFAULT_SDK_PROJECT_KEY;
  const result: JourneyBlueprint[] = [];
  if (local?.length) {
    for (const blueprint of local) {
      result.push({
        ...blueprint,
        catalogSource: blueprint.catalogSource ?? 'pack',
      });
    }
  }
  for (const blueprint of remote) {
    result.push({
      ...blueprint,
      catalogSource: 'remote-project',
      projectKey: blueprint.projectKey?.trim() || scopedKey,
    });
  }
  return result;
}

export function resolveRemoteBlueprintsProjectKey(
  options?: Pick<TourDraftGenerationOptions, 'flowVersion'>,
): string {
  return resolveSdkProjectKey({ flowVersion: options?.flowVersion });
}

export async function fetchRemoteJourneyBlueprints(
  options?: TourDraftGenerationOptions,
): Promise<RemoteBlueprintsFetchResult> {
  const url = resolveJourneyBlueprintsRemoteUrl(options);
  if (!url) {
    return { status: 'unconfigured', blueprints: [] };
  }

  const projectKey = resolveRemoteBlueprintsProjectKey(options);
  const requestUrl = appendProjectKeyToUrl(url, projectKey);

  if (options?.journeyBlueprintsRemoteEnabled === false) {
    return { status: 'disabled', blueprints: [] };
  }

  const timeoutMs = options?.journeyBlueprintsRemoteTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options?.journeyBlueprintsRemoteCacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  let resolvedPublishToken = options?.publishConfig?.sdkToken ?? null;
  let debug = options?.publishConfig?.debug;
  try {
    const config = resolveSDKConfig(options?.publishConfig);
    resolvedPublishToken = resolvedPublishToken ?? config.sdkToken ?? null;
    debug = config.debug;
  } catch {
    // publishConfig may be partial when only remote blueprints are requested.
  }

  const token = resolveSdkAuthBearerTokenFromSources(
    [
      options?.journeyBlueprintsAccessToken,
      resolvedPublishToken,
      options?.publishConfig?.getAccessToken,
      options?.publishConfig?.accessToken,
    ],
    debug,
  );

  const cacheKey = buildCacheKey(requestUrl, token, projectKey);
  const now = Date.now();
  if (
    remoteBlueprintCache &&
    remoteBlueprintCache.key === cacheKey &&
    now - remoteBlueprintCache.fetchedAt < cacheTtlMs
  ) {
    return {
      status: remoteBlueprintCache.status,
      blueprints: remoteBlueprintCache.blueprints,
      note: 'served-from-cache',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      credentials: 'omit',
    });

    if (!response.ok) {
      const result: RemoteBlueprintsFetchResult = {
        status: 'error',
        blueprints: [],
        note: `HTTP ${response.status}`,
      };
      remoteBlueprintCache = { key: cacheKey, ...result, fetchedAt: now };
      return result;
    }

    const body = await response.json();
    const blueprints = parseBlueprintsResponse(body);
    const result: RemoteBlueprintsFetchResult = {
      status: 'ok',
      blueprints,
    };
    remoteBlueprintCache = { key: cacheKey, ...result, fetchedAt: now };
    return result;
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
    const result: RemoteBlueprintsFetchResult = {
      status: isTimeout ? 'timeout' : 'error',
      blueprints: [],
      note: error instanceof Error ? error.message : 'fetch failed',
    };
    remoteBlueprintCache = { key: cacheKey, ...result, fetchedAt: now };
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export function getCachedRemoteJourneyBlueprints(): JourneyBlueprint[] {
  return remoteBlueprintCache?.blueprints ?? [];
}

export async function resolveTourDraftOptionsWithRemoteBlueprints(
  options?: TourDraftGenerationOptions,
): Promise<TourDraftGenerationOptions | undefined> {
  if (!options) return options;

  const url = resolveJourneyBlueprintsRemoteUrl(options);
  if (!url || options.journeyBlueprintsRemoteEnabled === false) {
    return options;
  }

  const remoteResult = await fetchRemoteJourneyBlueprints(options);
  const remote = remoteResult.blueprints;
  if (remote.length === 0) {
    return options;
  }

  const merged = mergeLocalAndRemoteJourneyBlueprints(
    options.journeyBlueprints as JourneyBlueprint[] | undefined,
    remote,
    resolveRemoteBlueprintsProjectKey(options),
  );

  return {
    ...options,
    journeyBlueprints: merged,
  };
}
