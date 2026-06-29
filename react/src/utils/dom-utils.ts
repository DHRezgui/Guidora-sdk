export interface FindElementOptions {
  preferredText?: string;
  preferActive?: boolean;
  requirePreferredMatch?: boolean;
}

const TEXT_EQUIVALENCE_GROUPS = [
  ['dashboard', 'overview', 'tableau de bord', 'accueil', 'pilotage'],
  ['patient', 'patients', 'record', 'records', 'dossier', 'dossiers'],
  ['pharmacy', 'pharmacies', 'pharmacie', 'inventory', 'inventaire', 'stock', 'medication', 'medicament'],
  [
    'facility',
    'facilities',
    'etablissement',
    'etablissements',
    'hospital',
    'hospitals',
    'hopital',
    'hopitaux',
    'clinic',
    'clinics',
    'clinique',
    'cliniques',
  ],
  ['report', 'reports', 'rapport', 'rapports', 'reporting', 'analytics', 'analyse'],
];

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getElementSearchText(element: HTMLElement): string {
  return normalizeText(
    [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('value'),
      element.getAttribute('id'),
      element.getAttribute('aria-controls'),
      element.textContent,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function isVisibleElement(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function scoreElementAgainstText(element: HTMLElement, preferredText: string, preferActive: boolean): number {
  const elementText = getElementSearchText(element);
  const preferred = normalizeText(preferredText);
  if (!elementText || !preferred) return 0;

  let score = 0;
  if (preferActive) {
    if (element.getAttribute('aria-selected') === 'true') score += 20;
    if (element.getAttribute('data-state') === 'active') score += 20;
    if (element.getAttribute('aria-current')) score += 12;
  }

  const preferredTokens = preferred.split(' ').filter((token) => token.length >= 3);
  for (const token of preferredTokens) {
    if (elementText.includes(token)) score += token.length >= 6 ? 8 : 4;
  }

  for (const group of TEXT_EQUIVALENCE_GROUPS) {
    const preferredGroupHits = group.filter((token) => preferred.includes(normalizeText(token))).length;
    const elementMatchesGroup = group.some((token) => elementText.includes(normalizeText(token)));
    if (preferredGroupHits > 0 && elementMatchesGroup) score += 24 + preferredGroupHits * 8;
  }

  return score;
}

/**
 * Trouve un élément dans le DOM selon un sélecteur.
 * Quand plusieurs éléments matchent, `preferredText` aide à choisir la cible
 * métier correcte (ex: un tab "Facilities" pour une étape "établissements").
 */
export const findElement = (selector: string, options?: FindElementOptions): HTMLElement | null => {
  if (!selector) return null;
  try {
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    if (elements.length === 0) return null;

    const visibleElements = elements.filter(isVisibleElement);
    const candidates = visibleElements.length > 0 ? visibleElements : elements.filter((element) => element.isConnected);

    if (options?.preferredText) {
      let bestElement: HTMLElement | null = null;
      let bestScore = 0;

      for (const element of candidates) {
        const score = scoreElementAgainstText(element, options.preferredText, options.preferActive ?? false);
        if (score > bestScore) {
          bestElement = element;
          bestScore = score;
        }
      }

      if (bestElement && bestScore > 0) return bestElement;
      if (options.requirePreferredMatch) return null;
    }

    return candidates[0] ?? null;
  } catch {
    console.warn('[TrustDev SDK] Invalid selector:', selector);
    return null;
  }
};

/**
 * Calcule la position d'un élément par rapport au viewport
 */
export const getElementPosition = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
};