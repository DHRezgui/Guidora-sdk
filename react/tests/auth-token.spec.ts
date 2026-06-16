/// <reference types="jest" />

import { resolveSdkAuthBearerTokenAsync } from '../src/core/auth-token';

describe('resolveSdkAuthBearerTokenAsync', () => {
  it('prefers static sdkToken (lab PAT) over getSdkToken (BFF)', async () => {
    const token = await resolveSdkAuthBearerTokenAsync({
      apiKey: 'test',
      sdkToken: 'td_sdk_lab_pat',
      getSdkToken: async () => 'td_sess_should_not_win',
    });
    expect(token).toBe('td_sdk_lab_pat');
  });

  it('falls back to getSdkToken when sdkToken is absent', async () => {
    const token = await resolveSdkAuthBearerTokenAsync({
      apiKey: 'test',
      getSdkToken: async () => 'td_sess_bff_session',
    });
    expect(token).toBe('td_sess_bff_session');
  });
});
