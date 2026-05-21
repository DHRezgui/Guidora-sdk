/**
 * Productivity / PM pack — project & task dashboards (Tasko-style apps):
 * workspace overview, task boards, team collaboration, analytics, calendar.
 *
 * Maturity: STABLE for demo hosts (test_11 / Tasko). Validated against common
 * PM UX: sidebar nav (Dashboard, Tasks, Calendar, Analytics, Team), header
 * search, primary CTAs (+ Add Project / + Add Task / + Add Member).
 *
 * Instrumentation: pair with `data-tour-id` hints such as `add-project`,
 * `search-task`, `import-data` (see e2e test_11) for highest resolver scores.
 */

import { JourneyBlueprint } from '../../../types';

const PRODUCTIVITY_WORKSPACE_ONBOARDING: JourneyBlueprint = {
  id: 'productivity.workspace-onboarding',
  name: 'Prise en main de l espace de travail',
  description:
    "Onboarding pour un outil PM: decouvrir le tableau de bord, rechercher une tache, creer un projet et importer des donnees.",
  vertical: 'productivity',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'productivity.dashboard-overview',
      title: 'Vue d ensemble du tableau de bord',
      description:
        'Cette page regroupe vos projets, indicateurs et rappels. Familiarisez-vous avec la vue avant votre premiere action.',
      position: 'BOTTOM',
      action: 'NEXT',
      required: true,
      targetHints: {
        routePatterns: [
          '/',
          '/dashboard',
          '/home',
          '/app',
          '/workspace',
          '/tableau-de-bord',
          '/accueil',
        ],
        selectorHints: [
          '[data-tour-id="dashboard-overview"]',
          '[data-tour-id="dashboard-stats"]',
          '[data-tour-id*="dashboard"]',
          'main h1',
          'main[role="main"]',
          'div[class*="stats"]',
        ],
        semanticTokens: [
          'dashboard',
          'overview',
          'projects',
          'workspace',
          'tableau de bord',
          'apercu',
          'projets',
          'plan',
          'prioritize',
          'accomplish',
          'tasks with ease',
        ],
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'productivity.search-workspace',
      title: 'Rechercher une tache ou un projet',
      description:
        'Utilisez la barre de recherche pour retrouver rapidement une tache, un projet ou un collaborateur.',
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="search-task"]',
          '[data-tour-id="search"]',
          '[data-tour-id*="search"]',
          'input[type="search"]',
          'input[placeholder*="search" i]',
          'input[placeholder*="recherche" i]',
          'input[placeholder*="task" i]',
          'input[placeholder*="tache" i]',
        ],
        semanticTokens: [
          'search',
          'find',
          'filter',
          'recherche',
          'chercher',
          'tache',
          'task',
          'query',
        ],
        elementTags: ['input', 'button', 'a'],
      },
    },
    {
      semanticRole: 'productivity.create-project',
      title: 'Creer un projet',
      description:
        'Lancez la creation d un projet: le SDK cible le CTA principal de la page (ex. + Add Project).',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        selectorHints: [
          '[data-tour-id="add-project"]',
          '[data-tour-id="create-project"]',
          '[data-tour-id^="add-"]',
          '[data-tour-id^="create-"]',
          '[data-tour-id*="primary"]',
          'button[class*="primary"]',
          'button[class*="btn-primary"]',
        ],
        semanticTokens: [
          'add project',
          'create project',
          'new project',
          'creer projet',
          'nouveau projet',
          '+ add',
          'add project',
        ],
        actionVerbs: [
          'add project',
          'create project',
          'new project',
          '+ add project',
          'creer un projet',
          'nouveau projet',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'productivity.import-data',
      title: 'Importer des donnees',
      description:
        'Importez des taches ou des projets existants depuis un fichier ou un autre outil.',
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="import-data"]',
          '[data-tour-id="import"]',
          '[data-tour-id*="import"]',
          'button[class*="outline"]',
        ],
        semanticTokens: [
          'import',
          'import data',
          'upload',
          'sync',
          'importer',
          'donnees',
        ],
        actionVerbs: ['import', 'import data', 'upload', 'importer'],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

const PRODUCTIVITY_TASK_MANAGEMENT: JourneyBlueprint = {
  id: 'productivity.task-management',
  name: 'Gerer vos taches',
  description:
    "Parcours taches: ouvrir la liste, filtrer ou rechercher, puis creer une nouvelle tache.",
  vertical: 'productivity',
  intent: 'form-flow',
  minResolvedSteps: 2,
  priority: 8,
  steps: [
    {
      semanticRole: 'productivity.open-tasks',
      title: 'Ouvrir vos taches',
      description:
        'Accedez a la vue Taches pour suivre l avancement, les priorites et les echeances.',
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/tasks',
          '/task',
          '/todo',
          '/taches',
          '/to-do',
          '/my-tasks',
        ],
        selectorHints: [
          '[data-tour-id="nav-tasks"]',
          '[data-tour-id="tasks-link"]',
          'a[href*="/tasks"]',
          'a[href*="/taches"]',
          'nav a',
        ],
        semanticTokens: [
          'tasks',
          'task',
          'todo',
          'to-do',
          'taches',
          'my tasks',
          'checklist',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'productivity.create-task',
      title: 'Ajouter une tache',
      description:
        'Creez une tache et associez-la a un projet, une priorite et une date limite.',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: ['/tasks', '/task', '/taches'],
        selectorHints: [
          '[data-tour-id="add-task"]',
          '[data-tour-id="create-task"]',
          '[data-tour-id^="add-"]',
          'button[class*="primary"]',
        ],
        semanticTokens: [
          'add task',
          'create task',
          'new task',
          'ajouter tache',
          'nouvelle tache',
          '+ add task',
        ],
        actionVerbs: [
          'add task',
          'create task',
          'new task',
          '+ add task',
          'ajouter une tache',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'productivity.task-list',
      title: 'Suivre votre liste de taches',
      description:
        'Consultez les taches en cours, cochez celles terminees et utilisez les filtres si besoin.',
      position: 'RIGHT',
      action: 'NEXT',
      targetHints: {
        routePatterns: ['/tasks', '/taches'],
        selectorHints: [
          '[data-tour-id="task-list"]',
          '[data-tour-id*="task"]',
          'ul',
          'div[class*="task"]',
          'div[role="list"]',
        ],
        semanticTokens: [
          'task list',
          'tasks',
          'priority',
          'due date',
          'completed',
          'liste',
          'priorite',
          'echeance',
        ],
        elementTags: ['ul', 'div', 'section', 'input'],
      },
    },
  ],
};

const PRODUCTIVITY_TEAM_COLLABORATION: JourneyBlueprint = {
  id: 'productivity.team-collaboration',
  name: 'Collaborer en equipe',
  description:
    "Invitez des collaborateurs et gerez les roles depuis la section equipe.",
  vertical: 'productivity',
  intent: 'support-navigation',
  minResolvedSteps: 2,
  priority: 6,
  steps: [
    {
      semanticRole: 'productivity.open-team',
      title: 'Ouvrir la section equipe',
      description:
        'La page equipe centralise les membres, leurs roles et les permissions.',
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/team',
          '/teams',
          '/members',
          '/users',
          '/equipe',
          '/membres',
          '/collaborators',
        ],
        selectorHints: [
          '[data-tour-id="nav-team"]',
          '[data-tour-id="team-link"]',
          'a[href*="/team"]',
          'a[href*="/members"]',
          'a[href*="/equipe"]',
        ],
        semanticTokens: [
          'team',
          'members',
          'users',
          'collaborators',
          'equipe',
          'membres',
          'roles',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'productivity.invite-member',
      title: 'Ajouter un membre',
      description:
        'Invitez un collaborateur par email ou ajoutez-le directement a l espace.',
      position: 'BOTTOM',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: ['/team', '/members', '/equipe'],
        selectorHints: [
          '[data-tour-id="add-member"]',
          '[data-tour-id="invite-member"]',
          '[data-tour-id^="add-"]',
          'button[class*="primary"]',
        ],
        semanticTokens: [
          'add member',
          'invite',
          'invite teammate',
          'ajouter membre',
          'inviter',
          '+ add member',
        ],
        actionVerbs: [
          'add member',
          'invite',
          'invite member',
          '+ add member',
          'ajouter un membre',
        ],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

const PRODUCTIVITY_ANALYTICS_INSIGHTS: JourneyBlueprint = {
  id: 'productivity.analytics-insights',
  name: 'Analyser la productivite',
  description:
    "Explorez les indicateurs de performance et exportez un rapport pour votre equipe.",
  vertical: 'productivity',
  intent: 'discovery',
  minResolvedSteps: 2,
  priority: 5,
  steps: [
    {
      semanticRole: 'productivity.open-analytics',
      title: 'Ouvrir les analytics',
      description:
        'Les analytics synthetisent l activite des projets et l avancement des taches.',
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/analytics',
          '/insights',
          '/reports',
          '/statistiques',
          '/rapports',
        ],
        selectorHints: [
          '[data-tour-id="nav-analytics"]',
          '[data-tour-id="analytics-link"]',
          'a[href*="/analytics"]',
          'a[href*="/reports"]',
        ],
        semanticTokens: [
          'analytics',
          'insights',
          'reports',
          'metrics',
          'performance',
          'productivity',
          'statistiques',
          'rapports',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'productivity.kpi-overview',
      title: 'Lire vos indicateurs',
      description:
        'Les cartes KPI en tete de page resument projets actifs, charge et tendances.',
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        routePatterns: ['/analytics', '/reports', '/dashboard'],
        selectorHints: [
          '[data-tour-id="kpi-overview"]',
          '[data-tour-id="analytics-kpi"]',
          '[data-tour-id*="kpi"]',
          '[data-tour-id*="metric"]',
        ],
        semanticTokens: [
          'kpi',
          'metrics',
          'stats',
          'overview',
          'performance',
          'productivity',
          'chart',
          'graph',
        ],
        elementTags: ['div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'productivity.export-report',
      title: 'Exporter un rapport',
      description:
        'Telechargez ou partagez un rapport pour communiquer l avancement a vos parties prenantes.',
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="export-report"]',
          '[data-tour-id="export"]',
          'button[class*="outline"]',
        ],
        semanticTokens: [
          'export',
          'export report',
          'download',
          'share report',
          'exporter',
          'rapport',
        ],
        actionVerbs: ['export', 'export report', 'download', 'exporter'],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

const PRODUCTIVITY_CALENDAR_PLANNING: JourneyBlueprint = {
  id: 'productivity.calendar-planning',
  name: 'Planifier avec le calendrier',
  description:
    "Visualisez les echeances et planifiez vos taches dans le calendrier.",
  vertical: 'productivity',
  intent: 'support-navigation',
  minResolvedSteps: 2,
  priority: 4,
  steps: [
    {
      semanticRole: 'productivity.open-calendar',
      title: 'Ouvrir le calendrier',
      description:
        'Le calendrier affiche les jalons, reunions et dates limites des taches.',
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/calendar',
          '/calendrier',
          '/schedule',
          '/planning',
          '/agenda',
        ],
        selectorHints: [
          '[data-tour-id="nav-calendar"]',
          '[data-tour-id="calendar-link"]',
          'a[href*="/calendar"]',
          'a[href*="/calendrier"]',
        ],
        semanticTokens: [
          'calendar',
          'schedule',
          'planning',
          'agenda',
          'calendrier',
          'echeances',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'productivity.calendar-view',
      title: 'Parcourir le calendrier',
      description:
        'Naviguez par semaine ou par mois pour ajuster vos priorites.',
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        routePatterns: ['/calendar', '/calendrier', '/schedule'],
        selectorHints: [
          '[data-tour-id="calendar-view"]',
          '[data-tour-id*="calendar"]',
          'div[class*="calendar"]',
          'table',
        ],
        semanticTokens: [
          'calendar',
          'month',
          'week',
          'day',
          'event',
          'deadline',
          'calendrier',
        ],
        elementTags: [  'div', 'section', 'table'],
      },
    },
  ],
};

export const productivityBlueprints: JourneyBlueprint[] = [
  PRODUCTIVITY_WORKSPACE_ONBOARDING,
  PRODUCTIVITY_TASK_MANAGEMENT,
  PRODUCTIVITY_TEAM_COLLABORATION,
  PRODUCTIVITY_ANALYTICS_INSIGHTS,
  PRODUCTIVITY_CALENDAR_PLANNING,
];
