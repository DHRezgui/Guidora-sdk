import { sdkApiClient } from '../core/api-client';
import { resolveSDKConfig } from '../core/sdk-state';
import type { CreateSupportTicketRequest, CreateSupportTicketResponse } from '../types/support';
import type { SDKConfig } from '../types/sdk';

export async function submitSupportTicket(
  config: Partial<SDKConfig> | undefined,
  payload: CreateSupportTicketRequest,
): Promise<CreateSupportTicketResponse> {
  if (!config) {
    throw new Error('[TrustDev SDK] Configuration requise pour envoyer un ticket support.');
  }

  const normalized = resolveSDKConfig(config);
  return sdkApiClient.createSupportTicket(normalized, payload);
}
