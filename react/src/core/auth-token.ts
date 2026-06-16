import type { SDKConfig } from '../types';

/** Prefix for dashboard-created SDK integration tokens (PAT). */
export const SDK_INTEGRATION_TOKEN_PREFIX = 'td_sdk_';

/** Prefix for short-lived browser session tokens (BFF exchange). */
export const SDK_SESSION_TOKEN_PREFIX = 'td_sess_';

export function isSdkIntegrationToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SDK_INTEGRATION_TOKEN_PREFIX);
}

export function isSdkSessionToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(SDK_SESSION_TOKEN_PREFIX);
}

export function isSdkBearerToken(value: string | null | undefined): value is string {
  return isSdkIntegrationToken(value) || isSdkSessionToken(value);
}

function isLegacyJwtToken(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('eyJ');
}

type TokenSource = string | (() => string | null | undefined) | null | undefined;

function resolveTokenSource(source: TokenSource): string | null {
  if (!source) return null;
  if (typeof source === 'function') {
    const value = source();
    return value ? String(value) : null;
  }
  return String(source);
}

function warnDeprecatedSdkAuth(debug: boolean | undefined, message: string): void {
  if (!debug) return;
  console.warn(`[TrustDev SDK] ${message}`);
}

type SdkAuthConfigInput = Pick<
  SDKConfig,
  'sdkToken' | 'getSdkToken' | 'getAccessToken' | 'accessToken' | 'debug'
>;

function resolveTokenSourceAsync(
  source: TokenSource | (() => string | null | undefined | Promise<string | null | undefined>) | null | undefined,
): Promise<string | null> {
  if (!source) return Promise.resolve(null);
  if (typeof source === 'function') {
    return Promise.resolve(source()).then((value) => (value ? String(value) : null));
  }
  return Promise.resolve(String(source));
}

/**
 * Resolves the Bearer token for SDK API routes (`/tours/active/url`, publish, feedback, …).
 * Prefers integration PAT (`td_sdk_...`) or session token (`td_sess_...`).
 * Legacy JWT fallbacks are deprecated.
 */
export function resolveSdkAuthBearerToken(
  config?: SdkAuthConfigInput | null,
): string | null {
  if (!config) return null;

  if (isSdkBearerToken(config.sdkToken)) {
    return config.sdkToken;
  }

  if (isLegacyJwtToken(config.sdkToken)) {
    warnDeprecatedSdkAuth(
      config.debug,
      'JWT in sdkToken is deprecated. Create a PAT in dashboard Settings or run refresh-sdk-token.ps1.',
    );
    return config.sdkToken ?? null;
  }

  const legacy =
    resolveTokenSource(config.getAccessToken) ?? resolveTokenSource(config.accessToken) ?? null;
  if (legacy) {
    warnDeprecatedSdkAuth(
      config.debug,
      'getAccessToken/accessToken for SDK API calls is deprecated. Pass sdkToken (td_sdk_...).',
    );
  }
  return legacy;
}

export async function resolveSdkAuthBearerTokenAsync(
  config?: SdkAuthConfigInput | null,
): Promise<string | null> {
  if (!config) return null;

  // PAT / session statique en priorité (lab NEXT_PUBLIC_*, e2e) — BFF seulement en secours.
  const staticToken = resolveSdkAuthBearerToken(config);
  if (staticToken) {
    return staticToken;
  }

  const dynamicToken = await resolveTokenSourceAsync(config.getSdkToken);
  if (isSdkBearerToken(dynamicToken)) {
    return dynamicToken;
  }

  return null;
}

export function resolveSdkAuthBearerTokenFromSources(
  sources: TokenSource[],
  debug?: boolean,
): string | null {
  for (const source of sources) {
    const value = resolveTokenSource(source);
    if (!value) continue;
    if (isSdkBearerToken(value)) return value;
  }

  for (const source of sources) {
    const value = resolveTokenSource(source);
    if (!value) continue;
    if (isLegacyJwtToken(value)) {
      warnDeprecatedSdkAuth(
        debug,
        'JWT bearer for SDK API is deprecated. Use an integration token (td_sdk_...).',
      );
      return value;
    }
    return value;
  }

  return null;
}

export function assertSdkIntegrationTokenConfigured(config: SdkAuthConfigInput): void {
  const token = resolveSdkAuthBearerToken(config);
  if (!token) {
    throw new Error(
      '[TrustDev SDK] sdkToken (td_sdk_...) or getSdkToken (td_sess_...) is required. Create a PAT in dashboard Settings → Tokens SDK.',
    );
  }
  if (!isSdkBearerToken(token)) {
    throw new Error(
      '[TrustDev SDK] sdkToken must be an integration or session token (td_sdk_... / td_sess_...). Session JWT is not supported.',
    );
  }
}
