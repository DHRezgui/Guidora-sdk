/**
 * Optional backend semantic enrichment client.
 *
 * The SDK uses this module only when `semanticEngineMode` is set to
 * `'backend'` or `'hybrid'` AND `semanticBackendUrl` is provided. Any
 * failure (timeout, non-2xx, malformed response) falls back silently to
 * local-only inference so the generator stays operational offline.
 */

import type { TourDraftGenerationOptions } from '../types';
import type {
  SemanticCandidateRole,
  SemanticPageSnapshot,
  SemanticRole,
} from './semantic-step-intelligence';

export type BackendSemanticInferenceStatus = 'ok' | 'timeout' | 'error' | 'disabled' | 'unconfigured';

export interface BackendSemanticHint {
  selector: string;
  role: SemanticRole;
  confidence: number;
  rationale?: string[];
}

/**
 * Backend self-description for a single response. Mirrors the shape
 * returned by `/v1/tours/contextual/semantic-hints` so the SDK can
 * surface in telemetry which engine (Phase 1 rule mirror vs. Phase 2
 * sentence-transformers) actually powered the response.
 */
export interface BackendSemanticImplementation {
  kind: 'rule-based-mirror' | 'sentence-transformers';
  phase: 'phase-1-local' | 'phase-2-embeddings';
  note?: string;
  model?: string;
  fallbackReason?:
    | 'embeddings_disabled'
    | 'embeddings_timeout'
    | 'embeddings_error'
    | 'embeddings_worker_unavailable'
    | 'sdk_http_timeout'
    | 'sdk_http_error';
}

/** Telemetry block when the SDK HTTP client times out before the backend responds. */
export const SDK_SEMANTIC_HTTP_TIMEOUT_IMPLEMENTATION: BackendSemanticImplementation = {
  kind: 'rule-based-mirror',
  phase: 'phase-1-local',
  fallbackReason: 'sdk_http_timeout',
  note:
    'SDK HTTP timeout before backend semantic-hints responded. Fusion uses the local rule engine only.',
};

export interface BackendSemanticInferenceResponse {
  roles: BackendSemanticHint[];
  preferredOrder?: string[];
  implementation?: BackendSemanticImplementation;
}

export interface BackendSemanticInferenceRequest {
  snapshot: SemanticPageSnapshot;
  candidates: Array<{
    selector: string;
    label: string;
    tag: string;
    intent: string;
    zone: string;
  }>;
  hints?: string[];
  objectives?: string[];
  persona?: string;
  pathname?: string;
}

export interface BackendSemanticInferenceResult {
  status: BackendSemanticInferenceStatus;
  hints: BackendSemanticHint[];
  preferredOrder: string[] | null;
  implementation: BackendSemanticImplementation | null;
}

function resolveAuthToken(
  token: TourDraftGenerationOptions['semanticBackendAccessToken'],
): string | null {
  if (!token) return null;
  if (typeof token === 'function') {
    try {
      const value = token();
      return value ? String(value) : null;
    } catch {
      return null;
    }
  }
  return String(token);
}

export async function fetchBackendSemanticHints(
  request: BackendSemanticInferenceRequest,
  options?: TourDraftGenerationOptions,
): Promise<BackendSemanticInferenceResult> {
  const mode = options?.semanticEngineMode ?? 'local';
  if (mode === 'local') {
    return { status: 'disabled', hints: [], preferredOrder: null, implementation: null };
  }

  const url = options?.semanticBackendUrl;
  if (!url) {
    return { status: 'unconfigured', hints: [], preferredOrder: null, implementation: null };
  }

  const timeoutMs = Math.max(50, options?.semanticBackendTimeoutMs ?? 600);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const token =
      resolveAuthToken(options?.semanticBackendAccessToken) ??
      resolveAuthToken(options?.publishConfig?.getAccessToken);
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: controller?.signal,
    });
    if (!response.ok) {
      return {
        status: 'error',
        hints: [],
        preferredOrder: null,
        implementation: {
          kind: 'rule-based-mirror',
          phase: 'phase-1-local',
          fallbackReason: 'sdk_http_error',
          note: `Backend semantic-hints returned HTTP ${response.status}.`,
        },
      };
    }
    const data = (await response.json()) as BackendSemanticInferenceResponse;
    const hints = Array.isArray(data.roles)
      ? data.roles.filter(
          (hint) =>
            typeof hint?.selector === 'string' &&
            typeof hint?.role === 'string' &&
            typeof hint?.confidence === 'number',
        )
      : [];
    const preferredOrder = Array.isArray(data.preferredOrder)
      ? data.preferredOrder.filter((value) => typeof value === 'string')
      : null;
    const implementation = sanitiseImplementation(data.implementation);
    return { status: 'ok', hints, preferredOrder, implementation };
  } catch (error) {
    const isAbort =
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError';
    if (isAbort) {
      return {
        status: 'timeout',
        hints: [],
        preferredOrder: null,
        implementation: SDK_SEMANTIC_HTTP_TIMEOUT_IMPLEMENTATION,
      };
    }
    return {
      status: 'error',
      hints: [],
      preferredOrder: null,
      implementation: {
        kind: 'rule-based-mirror',
        phase: 'phase-1-local',
        fallbackReason: 'sdk_http_error',
        note: error instanceof Error ? error.message : 'SDK semantic-hints fetch failed',
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sanitiseImplementation(
  raw: BackendSemanticImplementation | undefined,
): BackendSemanticImplementation | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'sentence-transformers' ? 'sentence-transformers' : 'rule-based-mirror';
  const phase = raw.phase === 'phase-2-embeddings' ? 'phase-2-embeddings' : 'phase-1-local';
  return {
    kind,
    phase,
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
    ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
    ...(raw.fallbackReason &&
    [
      'embeddings_disabled',
      'embeddings_timeout',
      'embeddings_error',
      'embeddings_worker_unavailable',
      'sdk_http_timeout',
      'sdk_http_error',
    ].includes(raw.fallbackReason)
      ? { fallbackReason: raw.fallbackReason }
      : {}),
  };
}

/**
 * Merge backend semantic hints with the local roles. Backend wins when
 * confidence is strictly greater; otherwise the local decision is
 * preserved so the local engine remains authoritative under uncertainty.
 *
 * The merged confidence is the weighted average so the fusion stage can
 * still detect "low confidence" and skip score deltas.
 */
export function mergeBackendHints(
  localRoles: SemanticCandidateRole[],
  hints: BackendSemanticHint[],
): SemanticCandidateRole[] {
  if (hints.length === 0) return localRoles;
  const hintBySelector = new Map<string, BackendSemanticHint>();
  for (const hint of hints) hintBySelector.set(hint.selector, hint);

  return localRoles.map((local) => {
    const backend = hintBySelector.get(local.selector);
    if (!backend) return local;
    if (backend.confidence > local.confidence + 0.1) {
      return {
        selector: local.selector,
        role: backend.role,
        confidence: Math.min(1, (backend.confidence + local.confidence) / 2 + 0.1),
        rationale: [
          ...local.rationale.slice(0, 2),
          ...(backend.rationale?.slice(0, 2) ?? ['backend semantic vote']),
        ],
      };
    }
    return {
      ...local,
      confidence: Math.min(1, (local.confidence + backend.confidence) / 2),
      rationale: local.rationale.slice(0, 3),
    };
  });
}
