/**
 * HR / People Ops pack — employee onboarding, leave requests, org chart,
 * performance reviews.
 *
 * Maturity: STABLE. HR vocabulary is fairly standardized across the industry
 * thanks to global HRIS players (Workday, BambooHR, Personio, PeopleHR). Most
 * verbs map cleanly across locales.
 */

import { JourneyBlueprint } from '../../../types';

const HR_EMPLOYEE_ONBOARDING: JourneyBlueprint = {
  id: 'hr.employee-onboarding',
  name: 'Onboarding employe - premiers pas',
  description:
    "Accompagne un nouvel employe dans les actions cles de sa premiere semaine: completer son profil, signer les documents, decouvrir l'organigramme.",
  vertical: 'hr',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'hr.employee-onboarding',
      title: 'Demarrez votre integration',
      description:
        "La checklist d'integration regroupe les actions a realiser durant vos premiers jours: documents administratifs, equipements, presentations.",
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/onboarding', '/welcome', '/new-hire', '/getting-started',
          '/integration', '/bienvenue', '/nouveau-arrivant',
          '/incorporacion', '/bienvenida',
          '/einarbeitung', '/willkommen',
          '/inserimento', '/benvenuto',
          '/integracao', '/bem-vindo',
        ],
        selectorHints: [
          '[data-tour-id="onboarding-checklist"]',
          '[data-tour-id="new-hire-welcome"]',
          '[data-tour-id*="onboarding"]',
          '[data-tour-id*="new-hire"]',
          'a[href*="/onboarding"]',
          'a[href*="/welcome"]',
          'a[href*="/integration"]',
          'section[class*="onboarding"]',
          'section[class*="Onboarding"]',
          'div[class*="welcome-checklist"]',
          'div[class*="WelcomeChecklist"]',
        ],
        semanticTokens: [
          'onboarding', 'welcome', 'new hire', 'first day',
          'integration', 'bienvenue', 'nouveau collaborateur',
          'incorporacion', 'bienvenida', 'nuevo empleado',
          'einarbeitung', 'willkommen', 'neueinsteiger',
          'inserimento', 'benvenuto', 'nuovo dipendente',
          'integracao', 'bem-vindo', 'novo colaborador',
        ],
        actionVerbs: [
          'start onboarding', 'complete checklist', 'first steps',
          'demarrer mon integration', 'premiers pas',
          'iniciar incorporacion',
          'einarbeitung starten',
          'inizia inserimento',
          'iniciar integracao',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'hr.org-chart',
      title: 'Decouvrez l organigramme',
      description:
        "Visualisez la structure de l'entreprise (equipes, managers, departements). Reperer rapidement qui fait quoi accelere votre integration.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/org-chart', '/organization', '/team', '/people', '/directory',
          '/organigramme', '/equipe', '/annuaire',
          '/organigrama', '/equipo', '/personas',
          '/organigramm', '/team', '/mitarbeiter',
          '/organigramma', '/team', '/persone',
          '/organograma', '/equipe', '/pessoas',
        ],
        selectorHints: [
          '[data-tour-id="org-chart"]',
          '[data-tour-id="organization-chart"]',
          '[data-tour-id*="org-chart"]',
          '[data-tour-id*="directory"]',
          'a[href*="/org-chart"]',
          'a[href*="/organigramme"]',
          'a[href*="/directory"]',
          'a[href*="/annuaire"]',
          'a[href*="/people"]',
          'a[href*="/team"]',
          'div[class*="org-chart"]',
          'div[class*="OrgChart"]',
          'svg[class*="OrgChart"]',
        ],
        semanticTokens: [
          'org chart', 'organization', 'directory', 'people', 'team',
          'organigramme', 'organisation', 'annuaire', 'equipe',
          'organigrama', 'organizacion', 'directorio', 'equipo',
          'organigramm', 'organisation', 'verzeichnis', 'team',
          'organigramma', 'organizzazione', 'rubrica', 'team',
          'organograma', 'organizacao', 'diretorio', 'equipe',
        ],
        actionVerbs: [
          'view org chart', 'browse directory', 'see team',
          'voir organigramme', 'consulter annuaire',
          'ver organigrama',
          'organigramm anzeigen',
          'visualizza organigramma',
          'ver organograma',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'hr.leave-request',
      title: 'Soumettez une demande de conge',
      description:
        "Le formulaire de demande de conge precise les dates, le type d'absence et le manager approbateur. Vous pouvez suivre le statut depuis votre tableau.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/leave', '/time-off', '/pto', '/vacation', '/absences',
          '/conges', '/absences', '/demande-conge',
          '/vacaciones', '/permisos', '/ausencias',
          '/urlaub', '/abwesenheit', '/freistellung',
          '/ferie', '/permessi', '/assenze',
          '/ferias', '/folgas', '/ausencias',
        ],
        selectorHints: [
          '[data-tour-id="leave-request"]',
          '[data-tour-id="request-leave"]',
          '[data-tour-id="request-time-off"]',
          '[data-tour-id*="leave"]',
          '[data-tour-id*="time-off"]',
          '[data-tour-id*="pto"]',
          'a[href*="/leave"]',
          'a[href*="/time-off"]',
          'a[href*="/conges"]',
          'a[href*="/vacaciones"]',
          'a[href*="/urlaub"]',
          'button[class*="request-leave"]',
          'button[class*="RequestLeave"]',
          'button[class*="LeaveRequest"]',
        ],
        semanticTokens: [
          'leave', 'time off', 'pto', 'vacation', 'absence',
          'conges', 'absence', 'rtt',
          'vacaciones', 'permiso', 'ausencia',
          'urlaub', 'abwesenheit', 'freistellung',
          'ferie', 'permesso', 'assenza',
          'ferias', 'folga', 'ausencia',
        ],
        actionVerbs: [
          'request leave', 'request time off', 'book vacation',
          'demander un conge', 'poser des conges',
          'solicitar vacaciones',
          'urlaub beantragen',
          'richiedi ferie',
          'solicitar ferias',
        ],
        elementTags: ['a', 'button', 'form'],
      },
    },
    {
      semanticRole: 'hr.performance-review',
      title: 'Preparez votre evaluation de performance',
      description:
        "Consultez les objectifs de la periode, ajoutez vos auto-evaluations et planifiez l'entretien avec votre manager.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/performance', '/reviews', '/feedback', '/goals',
          '/performance', '/evaluations', '/entretiens', '/objectifs',
          '/desempeno', '/evaluaciones', '/objetivos',
          '/leistung', '/beurteilungen', '/ziele',
          '/performance', '/valutazioni', '/obiettivi',
          '/desempenho', '/avaliacoes', '/objetivos',
        ],
        selectorHints: [
          '[data-tour-id="performance-review"]',
          '[data-tour-id="self-review"]',
          '[data-tour-id*="performance"]',
          '[data-tour-id*="review"]',
          '[data-tour-id*="evaluation"]',
          'a[href*="/performance"]',
          'a[href*="/reviews"]',
          'a[href*="/evaluations"]',
          'button[class*="start-review"]',
          'button[class*="StartReview"]',
        ],
        semanticTokens: [
          'performance', 'review', 'feedback', 'goals', 'evaluation',
          'performance', 'evaluation', 'objectifs', 'entretien',
          'desempeno', 'evaluacion', 'objetivos',
          'leistung', 'beurteilung', 'ziele',
          'performance', 'valutazione', 'obiettivi',
          'desempenho', 'avaliacao', 'objetivos',
        ],
        actionVerbs: [
          'start review', 'self-assessment', 'set goals',
          'demarrer evaluation', 'fixer mes objectifs',
          'iniciar evaluacion',
          'beurteilung starten',
          'inizia valutazione',
          'iniciar avaliacao',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

export const hrBlueprints: JourneyBlueprint[] = [HR_EMPLOYEE_ONBOARDING];
