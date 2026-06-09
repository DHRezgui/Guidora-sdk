import type { JourneyBlueprint } from '../src/types';
import { selectActiveBlueprints } from '../src/utils/journey-blueprints';

function mockBlueprint(id: string, vertical: JourneyBlueprint['vertical']): JourneyBlueprint {
  return {
    id,
    name: id,
    description: id,
    vertical,
    intent: 'primary-action',
    steps: [],
  };
}

describe('selectActiveBlueprints', () => {
  const packMix = [
    mockBlueprint('healthtech.management-dashboard', 'healthtech'),
    mockBlueprint('fintech.banking-overview', 'fintech'),
    mockBlueprint('productivity.task-management', 'productivity'),
  ];

  it('returns all custom blueprints when journeyVerticals is omitted', () => {
    const active = selectActiveBlueprints(undefined, packMix);
    expect(active.map((bp) => bp.id)).toEqual(packMix.map((bp) => bp.id));
  });

  it('filters custom packs by journeyVerticals', () => {
    const active = selectActiveBlueprints(['healthtech'], packMix);
    expect(active.map((bp) => bp.id)).toEqual(['healthtech.management-dashboard']);
  });

  it('filters multiple verticals', () => {
    const active = selectActiveBlueprints(['healthtech', 'fintech'], packMix);
    expect(active.map((bp) => bp.id)).toEqual([
      'healthtech.management-dashboard',
      'fintech.banking-overview',
    ]);
  });

  it('returns empty when verticals match no custom pack and no built-ins', () => {
    const active = selectActiveBlueprints(['healthtech'], []);
    expect(active).toHaveLength(0);
  });

  it('includes built-ins for core verticals alongside filtered packs', () => {
    const active = selectActiveBlueprints(['ecommerce'], [mockBlueprint('custom.only', 'healthtech')]);
    expect(active.some((bp) => bp.vertical === 'ecommerce')).toBe(true);
    expect(active.some((bp) => bp.id === 'custom.only')).toBe(false);
  });
});
