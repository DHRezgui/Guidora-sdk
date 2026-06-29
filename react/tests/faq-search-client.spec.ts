/// <reference types="jest" />

import { clearFaqSearchCache, normalizeFaqQuery, searchFaq } from '../src/utils/faq-search-client';
import type { NormalizedSDKConfig } from '../src/types';

const baseConfig: NormalizedSDKConfig = {
  apiKey: 'demo-key',
  apiUrl: 'http://localhost:3020/api/v1',
  sdkToken: 'td_sdk_test_faq_scope',
  debug: false,
  trackBatchSize: 20,
  trackFlushIntervalMs: 5000,
  syncEnabled: true,
  syncIntervalMs: 15000,
  syncOnFocus: true,
  syncOnReconnect: true,
};

describe('normalizeFaqQuery', () => {
  it('trims and lowercases questions', () => {
    expect(normalizeFaqQuery('  Mot   DE   Passe  ')).toBe('mot de passe');
  });
});

describe('searchFaq', () => {
  beforeEach(() => {
    clearFaqSearchCache();
    jest.restoreAllMocks();
  });

  it('returns invalid for short questions', async () => {
    const result = await searchFaq(baseConfig, 'ab', { minQueryLength: 3 });
    expect(result.status).toBe('invalid');
    expect(result.results).toEqual([]);
  });

  it('returns FAQ results on HTTP 200', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        query: 'mot de passe',
        total: 1,
        strategyStep: 'threshold_0.7',
        results: [
          {
            id: 'faq-003',
            question: 'Comment reinitialiser mon mot de passe ?',
            answer: 'Depuis la connexion.',
            category: 'auth',
            priority: 'high',
            score: 0.96,
          },
        ],
      }),
    } as Response);

    const result = await searchFaq(baseConfig, 'mot de passe');
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe('faq-003');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3020/api/v1/faq/semantic-search',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses in-memory cache for repeated queries', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        query: 'mot de passe',
        total: 1,
        results: [
          {
            id: 'faq-003',
            question: 'Q',
            answer: 'A',
            category: 'auth',
            priority: 'high',
            score: 0.9,
          },
        ],
      }),
    } as Response);

    await searchFaq(baseConfig, 'mot de passe', { cacheTtlMs: 60_000 });
    await searchFaq(baseConfig, 'mot de passe', { cacheTtlMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns error status on HTTP 403', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as Response);

    const result = await searchFaq(baseConfig, 'mot de passe');
    expect(result.status).toBe('error');
    expect(result.error).toContain('403');
  });
});
