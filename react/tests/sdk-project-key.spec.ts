import { DEFAULT_SDK_PROJECT_KEY, resolveSdkProjectKey } from '../src/utils/sdk-project-key';

describe('resolveSdkProjectKey', () => {
  it('prefers explicit projectKey', () => {
    expect(
      resolveSdkProjectKey({ projectKey: 'test-13-v1', flowVersion: 'other-v1' }),
    ).toBe('test-13-v1');
  });

  it('falls back to flowVersion', () => {
    expect(resolveSdkProjectKey({ flowVersion: 'test-9-v1' })).toBe('test-9-v1');
  });

  it('defaults to generic corpus when absent', () => {
    expect(resolveSdkProjectKey()).toBe(DEFAULT_SDK_PROJECT_KEY);
    expect(resolveSdkProjectKey({ projectKey: '  ', flowVersion: '' })).toBe(DEFAULT_SDK_PROJECT_KEY);
  });

  it('keeps literal default as its own scope', () => {
    expect(resolveSdkProjectKey({ projectKey: 'default' })).toBe('default');
    expect(resolveSdkProjectKey({ flowVersion: 'default' })).toBe('default');
  });
});
