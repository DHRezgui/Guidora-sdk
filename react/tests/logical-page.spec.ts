/// <reference types="jest" />

/**
 * @jest-environment jsdom
 */

import { getLogicalPageKey } from '../src/utils/logical-page';

describe('getLogicalPageKey', () => {
  beforeEach(() => {
    document.title = 'Host App';
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('changes when primary H1 changes without URL change (SPA view swap)', () => {
    document.body.innerHTML = '<main><h1>Portfolio Overview</h1></main>';
    const first = getLogicalPageKey();

    document.body.innerHTML = '<main><h1>Settings</h1></main>';
    const second = getLogicalPageKey();

    expect(first).not.toBe(second);
    expect(second).toContain('settings');
  });

  it('ignores TrustDev chrome headings', () => {
    document.body.innerHTML = `
      <main><h1>Analytics</h1></main>
      <div data-trustdev-abandonment-panel="true"><h1>Abandon — debug</h1></div>
    `;
    const key = getLogicalPageKey();
    expect(key).toContain('analytics');
    expect(key).not.toContain('abandon');
  });

  it('includes URL when pathname changes', () => {
    document.body.innerHTML = '<main><h1>Same Title</h1></main>';
    window.history.replaceState(null, '', '/a');
    const first = getLogicalPageKey();
    window.history.replaceState(null, '', '/b');
    const second = getLogicalPageKey();
    expect(first).not.toBe(second);
  });
});
