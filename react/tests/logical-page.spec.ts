/// <reference types="jest" />

import { isLogicalPageKeyStabilization, isSameLogicalPageUrl, resolveFrictionPageIdentity } from '../src/utils/logical-page';

describe('isLogicalPageKeyStabilization', () => {
  const sep = '\u0001';

  it('treats empty→filled landmarks on the same URL as stabilization (refresh)', () => {
    const beforePaint = [`http://localhost/contacts`, '', '', ''].join(sep);
    const afterPaint = [`http://localhost/contacts`, 'orbit crm', 'contacts', 'contacts'].join(
      sep,
    );
    expect(isLogicalPageKeyStabilization(beforePaint, afterPaint)).toBe(true);
  });

  it('treats title refinement on the same URL as stabilization', () => {
    const before = [`http://localhost/settings`, 'orbit crm', '', ''].join(sep);
    const after = [`http://localhost/settings`, 'settings | orbit crm', 'settings', 'settings'].join(
      sep,
    );
    expect(isLogicalPageKeyStabilization(before, after)).toBe(true);
  });

  it('does not treat a real H1 swap on the same URL as stabilization', () => {
    const dashboard = [`http://localhost/`, 'app', 'dashboard', 'dashboard'].join(sep);
    const deals = [`http://localhost/`, 'app', 'deals', 'deals'].join(sep);
    expect(isLogicalPageKeyStabilization(dashboard, deals)).toBe(false);
  });

  it('does not treat a URL change as stabilization', () => {
    const a = [`http://localhost/a`, 'app', '', 'a'].join(sep);
    const b = [`http://localhost/b`, 'app', '', 'b'].join(sep);
    expect(isLogicalPageKeyStabilization(a, b)).toBe(false);
  });
});

describe('isSameLogicalPageUrl', () => {
  const sep = '\u0001';

  it('compares only the URL segment of logical keys', () => {
    const a = [`http://localhost/deals`, 'app', 'deals', 'deals'].join(sep);
    const b = [`http://localhost/deals`, 'app', 'pipeline', 'deals'].join(sep);
    const c = [`http://localhost/contacts`, 'app', 'contacts', 'contacts'].join(sep);
    expect(isSameLogicalPageUrl(a, b)).toBe(true);
    expect(isSameLogicalPageUrl(a, c)).toBe(false);
  });
});

describe('resolveFrictionPageIdentity', () => {
  const sep = '\u0001';

  it('prefers aria-current nav cue over lagging H1 on the same URL', () => {
    const hybrid = [`/`, 'orbit', 'settings', 'portfolio pulse'].join(sep);
    const settled = [`/`, 'orbit', 'settings', 'settings'].join(sep);
    expect(resolveFrictionPageIdentity(hybrid)).toBe(`/\u0001nav:settings`);
    expect(resolveFrictionPageIdentity(settled)).toBe(`/\u0001nav:settings`);
    expect(resolveFrictionPageIdentity(hybrid)).toBe(resolveFrictionPageIdentity(settled));
  });
});
