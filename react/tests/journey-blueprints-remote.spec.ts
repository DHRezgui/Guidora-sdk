import {
  mergeLocalAndRemoteJourneyBlueprints,
  resolveJourneyBlueprintsRemoteUrl,
  resolveRemoteBlueprintsProjectKey,
} from '../src/utils/journey-blueprints-remote-client';
import { selectActiveBlueprints } from '../src/utils/journey-blueprints';
import type { JourneyBlueprint } from '../src/types';

const localBp: JourneyBlueprint = {
  id: 'custom.local.only',
  name: 'Local',
  description: 'Local blueprint',
  vertical: 'saas',
  intent: 'primary-action',
  steps: [
    {
      semanticRole: 'saas.dashboard-overview',
      title: 'A',
      description: 'B',
      targetHints: { semanticTokens: ['dashboard'] },
    },
  ],
};

const remoteBp: JourneyBlueprint = {
  id: 'custom.remote.only',
  name: 'Remote',
  description: 'Remote blueprint',
  vertical: 'saas',
  intent: 'discovery',
  steps: [
    {
      semanticRole: 'saas.create-resource',
      title: 'C',
      description: 'D',
      targetHints: { semanticTokens: ['create'] },
    },
  ],
};

describe('mergeLocalAndRemoteJourneyBlueprints', () => {
  it('appends remote after local without replacing', () => {
    const merged = mergeLocalAndRemoteJourneyBlueprints([localBp], [remoteBp]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('custom.local.only');
    expect(merged[0].catalogSource).toBe('pack');
    expect(merged[1].id).toBe('custom.remote.only');
    expect(merged[1].catalogSource).toBe('remote-project');
    expect(merged[1].projectKey).toBe('default');
  });

  it('tags remote rows with the active projectKey', () => {
    const merged = mergeLocalAndRemoteJourneyBlueprints([], [remoteBp], 'test-13-v1');
    expect(merged[0].projectKey).toBe('test-13-v1');
    expect(merged[0].catalogSource).toBe('remote-project');
  });
});

describe('selectActiveBlueprints merge order with customs', () => {
  it('keeps built-ins before custom (local+remote)', () => {
    const customs = mergeLocalAndRemoteJourneyBlueprints([localBp], [remoteBp]);
    const active = selectActiveBlueprints(['saas'], customs);
    expect(active.length).toBeGreaterThanOrEqual(2);
    const ids = active.map((b) => b.id);
    expect(ids).toContain('saas.first-resource-creation');
    expect(ids).toContain('custom.local.only');
    expect(ids).toContain('custom.remote.only');
    const firstBuiltin = ids.findIndex((id) => id.startsWith('saas.'));
    const firstCustom = ids.findIndex((id) => id.startsWith('custom.'));
    expect(firstBuiltin).toBeLessThan(firstCustom);
  });

  it('filters remote by journeyVerticals in auto mode', () => {
    const healthRemote: JourneyBlueprint = {
      ...remoteBp,
      id: 'custom.health',
      vertical: 'healthtech',
    };
    const customs = mergeLocalAndRemoteJourneyBlueprints([], [localBp, healthRemote]);
    const active = selectActiveBlueprints(['saas'], customs);
    expect(active.some((b) => b.id === 'custom.local.only')).toBe(true);
    expect(active.some((b) => b.id === 'custom.health')).toBe(false);
  });
});

describe('resolveJourneyBlueprintsRemoteUrl', () => {
  it('builds default path from publishConfig apiUrl', () => {
    const url = resolveJourneyBlueprintsRemoteUrl({
      journeyBlueprintsRemoteEnabled: true,
      publishConfig: { apiUrl: 'http://localhost:3002/api/v1' },
    });
    expect(url).toBe('http://localhost:3002/api/v1/tours/contextual/blueprints');
  });
});

describe('resolveRemoteBlueprintsProjectKey', () => {
  it('uses flowVersion when set', () => {
    expect(resolveRemoteBlueprintsProjectKey({ flowVersion: 'test-13-v1' })).toBe('test-13-v1');
  });

  it('defaults to generic corpus when flowVersion is absent', () => {
    expect(resolveRemoteBlueprintsProjectKey()).toBe('default');
  });
});
