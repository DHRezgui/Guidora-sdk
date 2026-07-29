/// <reference types="jest" />

import {
  isSafeSupportContactUrl,
  normalizeSupportContactUrl,
} from '../src/utils/support-contact';

describe('support-contact', () => {
  it('accepts mailto, tel and https urls', () => {
    expect(isSafeSupportContactUrl('mailto:support@example.com')).toBe(true);
    expect(isSafeSupportContactUrl('tel:+33123456789')).toBe(true);
    expect(isSafeSupportContactUrl('https://example.com/support')).toBe(true);
  });

  it('rejects unsafe or empty values', () => {
    expect(isSafeSupportContactUrl('')).toBe(false);
    expect(isSafeSupportContactUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeSupportContactUrl('not-a-url')).toBe(false);
    expect(normalizeSupportContactUrl('  ')).toBeNull();
  });
});
