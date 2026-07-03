import type { FaqPageContext } from '../types/faq';

export interface ContextualFaqSuggestion {
  label: string;
  query: string;
  reason?: string;
}

const PATH_TOPIC_RULES: Array<{ pattern: RegExp; topics: string[]; label: string }> = [
  { pattern: /settings|profile|account|compte|profil/i, topics: ['auth', 'account'], label: 'Compte & profil' },
  { pattern: /login|signin|auth|password|mot-de-passe/i, topics: ['auth'], label: 'Connexion & mot de passe' },
  { pattern: /checkout|payment|order|commande|paiement|pos/i, topics: ['billing', 'ecommerce'], label: 'Commande & paiement' },
  { pattern: /dashboard|analytics|report|stats/i, topics: ['dashboard', 'analytics'], label: 'Tableau de bord' },
  { pattern: /help|support|faq|aide/i, topics: ['support'], label: 'Support' },
  { pattern: /billing|invoice|facture|abonnement/i, topics: ['billing'], label: 'Facturation' },
  { pattern: /tour|onboarding|guide/i, topics: ['onboarding'], label: 'Parcours guidé' },
];

const TOPIC_QUERIES: Record<string, string[]> = {
  auth: [
    'Comment reinitialiser mon mot de passe ?',
    'Comment creer un compte sur la plateforme ?',
  ],
  account: ['Comment modifier mon profil utilisateur ?', 'Comment changer mon email ?'],
  billing: ['Comment consulter ma facturation ?', 'Comment mettre a jour mon moyen de paiement ?'],
  ecommerce: ['Comment passer une commande ?', 'Comment annuler une commande ?'],
  dashboard: ['Comment utiliser le tableau de bord ?', 'Comment exporter mes donnees ?'],
  analytics: ['Comment lire les indicateurs analytics ?'],
  support: ['Comment contacter le support ?', 'Ou trouver la documentation ?'],
  onboarding: ['Comment demarrer un parcours guide ?', 'Comment ignorer une etape de tour ?'],
};

function readBrowserPageContext(): Pick<FaqPageContext, 'pageUrl' | 'pathname' | 'pageTitle'> {
  if (typeof window === 'undefined') {
    return { pageUrl: '', pathname: '', pageTitle: '' };
  }
  return {
    pageUrl: window.location.href,
    pathname: window.location.pathname,
    pageTitle: typeof document !== 'undefined' ? document.title : '',
  };
}

export function collectFaqPageContext(partial?: Partial<FaqPageContext>): FaqPageContext {
  const browser = readBrowserPageContext();
  return {
    pageUrl: partial?.pageUrl ?? browser.pageUrl,
    pathname: partial?.pathname ?? browser.pathname,
    pageTitle: partial?.pageTitle ?? browser.pageTitle,
    organizationId: partial?.organizationId,
    tourId: partial?.tourId,
    tourName: partial?.tourName,
    tourStepTitle: partial?.tourStepTitle,
    projectDomain: partial?.projectDomain,
    suggestionKeywords: partial?.suggestionKeywords,
    flowVersion: partial?.flowVersion,
  };
}

export function formatFaqContextSummary(context: FaqPageContext): string {
  const parts: string[] = [];
  if (context.pathname) parts.push(context.pathname);
  if (context.tourName) parts.push(`Tour : ${context.tourName}`);
  if (context.tourStepTitle) parts.push(`Étape : ${context.tourStepTitle}`);
  return parts.join(' · ') || 'Page courante';
}

export interface ContextualFaqSuggestionsOptions {
  /** Hides generic project-domain probes for end-user panels. */
  endUser?: boolean;
}

export function buildContextualFaqSuggestions(
  context: FaqPageContext,
  options: ContextualFaqSuggestionsOptions = {},
): ContextualFaqSuggestion[] {
  const suggestions: ContextualFaqSuggestion[] = [];
  const seen = new Set<string>();
  const haystack = [context.pathname, context.pageTitle, context.projectDomain ?? '', context.tourName ?? '', context.tourStepTitle ?? '']
    .join(' ')
    .toLowerCase();

  const push = (label: string, query: string, reason?: string) => {
    const key = query.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({ label, query, reason });
  };

  if (context.tourStepTitle?.trim()) {
    push(
      `Aide : ${context.tourStepTitle.slice(0, 48)}`,
      `Comment utiliser l etape ${context.tourStepTitle} ?`,
      'Étape du parcours actif',
    );
  }

  if (context.tourName?.trim()) {
    push(
      `Parcours : ${context.tourName.slice(0, 40)}`,
      `Comment terminer le parcours ${context.tourName} ?`,
      'Parcours guidé en cours',
    );
  }

  for (const rule of PATH_TOPIC_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    const queries = rule.topics.flatMap((topic) => TOPIC_QUERIES[topic] ?? []);
    for (const query of queries.slice(0, 2)) {
      push(rule.label, query, `Contexte page (${rule.label})`);
    }
  }

  if (context.projectDomain?.trim() && !options.endUser) {
    push(
      'Aide métier',
      `Comment demarrer sur ${context.projectDomain} ?`,
      'Domaine projet configuré',
    );
  }

  if (suggestions.length === 0 && !options.endUser) {
    push('Premiers pas', 'Comment creer un compte sur la plateforme ?', 'Suggestion générale');
    push('Mot de passe', 'Comment reinitialiser mon mot de passe ?', 'Suggestion générale');
  }

  return suggestions.slice(0, 5);
}
