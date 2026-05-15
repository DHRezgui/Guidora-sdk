/// <reference types="jest" />

import {
  fetchBackendSemanticHints,
  mergeBackendHints,
  type BackendSemanticHint,
} from '../src/utils/semantic-backend-client';
import type { SemanticCandidateRole } from '../src/utils/semantic-step-intelligence';

describe('mergeBackendHints', () => {
  const localRoles: SemanticCandidateRole[] = [
    { selector: '#a', role: 'form-field', confidence: 0.6, rationale: ['form control <input>'] },
    { selector: '#b', role: 'utility', confidence: 0.5, rationale: ['utility vocabulary'] },
  ];

  it('keeps local roles when no backend hints provided', () => {
    const merged = mergeBackendHints(localRoles, []);
    expect(merged).toEqual(localRoles);
  });

  it('keeps local decision when backend confidence is similar', () => {
    const hints: BackendSemanticHint[] = [
      { selector: '#a', role: 'form-submit', confidence: 0.62 },
    ];
    const merged = mergeBackendHints(localRoles, hints);
    expect(merged[0].role).toBe('form-field');
  });

  it('lets backend win when its confidence is strictly higher (≥ +0.1)', () => {
    const hints: BackendSemanticHint[] = [
      { selector: '#a', role: 'form-submit', confidence: 0.95, rationale: ['backend vote'] },
    ];
    const merged = mergeBackendHints(localRoles, hints);
    expect(merged[0].role).toBe('form-submit');
    expect(merged[0].rationale).toContain('backend vote');
  });
});

describe('fetchBackendSemanticHints', () => {
  it('returns disabled status in local mode without calling fetch', async () => {
    const result = await fetchBackendSemanticHints(
      {
        snapshot: {
          hasForm: false,
          hasNavigation: false,
          formFieldCount: 0,
          navigationLinkCount: 0,
          ctaCount: 0,
          pageTitle: '',
          pageHeading: '',
          contextTokens: [],
        },
        candidates: [],
      },
      { semanticEngineMode: 'local' },
    );
    expect(result.status).toBe('disabled');
    expect(result.hints).toEqual([]);
  });

  it('returns unconfigured status when URL is missing in hybrid mode', async () => {
    const result = await fetchBackendSemanticHints(
      {
        snapshot: {
          hasForm: false,
          hasNavigation: false,
          formFieldCount: 0,
          navigationLinkCount: 0,
          ctaCount: 0,
          pageTitle: '',
          pageHeading: '',
          contextTokens: [],
        },
        candidates: [],
      },
      { semanticEngineMode: 'hybrid' },
    );
    expect(result.status).toBe('unconfigured');
  });
});
