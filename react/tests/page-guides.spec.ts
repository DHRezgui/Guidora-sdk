import {
  buildPageGuides,
  clearRememberedPageGuideToursForTests,
  filterToursForPageGuides,
  mergeToursForPageGuides,
  pageGuideCtaLabel,
  rememberPageGuideTours,
  getRememberedPageGuideTours,
} from '../src/utils/page-guides';
import type { GuidedTour } from '../src/types';

jest.mock('../src/utils/tour-audience-finish', () => {
  const actual = jest.requireActual('../src/utils/tour-audience-finish');
  return {
    ...actual,
    isTourFinishedLocally: jest.fn((tour: { id?: string }) => tour.id === 'done'),
  };
});

function tour(partial: Partial<GuidedTour> & { id: string; name: string }): GuidedTour {
  return {
    targetUrl: '/',
    steps: [{ title: 'A', content: '…', targetSelector: '#a' }],
    isActive: true,
    showInGuides: true,
    environment: 'production',
    priority: 1,
    ...partial,
  };
}

describe('buildPageGuides', () => {
  afterEach(() => {
    clearRememberedPageGuideToursForTests();
  });

  it('returns all curated guides sorted by priority (no default cap)', () => {
    const tours = [
      tour({ id: '1', name: 'Alpha', priority: 1 }),
      tour({ id: '2', name: 'Beta', priority: 5 }),
      tour({ id: '3', name: 'Gamma', priority: 3 }),
      tour({ id: '4', name: 'Delta', priority: 2 }),
    ];

    const guides = buildPageGuides({ tours });
    expect(guides).toHaveLength(4);
    expect(guides.map((g) => g.id)).toEqual(['2', '3', '4', '1']);
  });

  it('honors an explicit limit when provided', () => {
    const tours = [
      tour({ id: '1', name: 'Alpha', priority: 1 }),
      tour({ id: '2', name: 'Beta', priority: 5 }),
      tour({ id: '3', name: 'Gamma', priority: 3 }),
      tour({ id: '4', name: 'Delta', priority: 2 }),
    ];

    const guides = buildPageGuides({ tours, limit: 3 });
    expect(guides).toHaveLength(3);
    expect(guides.map((g) => g.id)).toEqual(['2', '3', '4']);
  });

  it('excludes tours without showInGuides even if active', () => {
    const guides = buildPageGuides({
      tours: [
        tour({ id: 'discovery', name: 'Discovery', priority: 99, showInGuides: false }),
        tour({ id: 'action', name: 'Action guide', priority: 1, showInGuides: true }),
      ],
    });

    expect(guides.map((g) => g.id)).toEqual(['action']);
  });

  it('keeps finished curated tours for Relancer after available ones', () => {
    const guides = buildPageGuides({
      tours: [
        tour({ id: 'done', name: 'Done', priority: 9 }),
        tour({ id: 'fresh', name: 'Fresh', priority: 1 }),
      ],
    });

    expect(guides.map((g) => g.id)).toEqual(['fresh', 'done']);
    expect(guides[1].status).toBe('completed_local');
    expect(pageGuideCtaLabel(guides[1].status)).toBe('Relancer');
  });

  it('marks the active tour as in_progress first', () => {
    const tours = [
      tour({ id: 'a', name: 'A', priority: 1 }),
      tour({ id: 'b', name: 'B', priority: 9 }),
    ];
    const guides = buildPageGuides({ tours, activeTourId: 'a' });
    expect(guides[0].id).toBe('a');
    expect(guides[0].status).toBe('in_progress');
    expect(pageGuideCtaLabel(guides[0].status)).toBe('Continuer');
  });

  it('keeps unscoped tours for guides even when unrelated scoped tours exist', () => {
    const scopedOther = tour({
      id: 'other',
      name: 'Other app',
      triggerConditions: {
        contextualEngine: { flowVersion: 'test-9-v1' },
      } as never,
    });
    const unscoped = tour({ id: 'manual', name: 'Manual', priority: 4 });
    const filtered = filterToursForPageGuides([scopedOther, unscoped], 'test-13-v1');
    expect(filtered.map((t) => t.id)).toEqual(['manual']);
  });

  it('merges remembered curated tours after live list becomes empty', () => {
    const cached = tour({ id: 'cached', name: 'Cached guide', priority: 2 });
    rememberPageGuideTours('org::test-13-v1::/', [cached]);
    const merged = mergeToursForPageGuides({
      liveTours: [],
      rememberedTours: getRememberedPageGuideTours('org::test-13-v1::/'),
    });
    const guides = buildPageGuides({ tours: merged, flowVersion: 'test-13-v1' });
    expect(guides).toHaveLength(1);
    expect(guides[0].id).toBe('cached');
  });

  it('does not merge remembered or active tours that are not curated guides', () => {
    const discovery = tour({
      id: 'discovery',
      name: 'Discovery',
      showInGuides: false,
      priority: 50,
    });
    rememberPageGuideTours('org::test-13-v1::/', [discovery]);
    const merged = mergeToursForPageGuides({
      liveTours: [],
      rememberedTours: getRememberedPageGuideTours('org::test-13-v1::/'),
      activeTour: discovery,
    });
    expect(merged).toHaveLength(0);
    expect(buildPageGuides({ tours: merged })).toHaveLength(0);
  });
});
