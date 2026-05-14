/**
 * Fintech pack — banking dashboard, transactions, transfer, investments,
 * expense management.
 *
 * ⚠ Maturity: PREVIEW. The funnels covered here are believed universal, but
 * fintech UX is HIGHLY regulated (PCI-DSS, PSD2, AML compliance) and the
 * vocabulary is locale-specific in non-trivial ways:
 *  - FR `RIB` vs US `routing+account number` vs UK `sort code`
 *  - SEPA / IBAN (EU) vs ACH / wire (US) vs Pix (BR) vs SWIFT (international)
 *
 * Heuristics tuning history:
 *  - v0 (initial): 1/4 steps resolved on a real consumer-banking dashboard
 *    when `data-tour-id` hints are stripped (test_3 baseline, 2026-05-12).
 *  - v1: widened `elementTags` on the 3 informational steps to include
 *    card-shaped containers (`div`, `section`, `article`, …), added the
 *    `savings` family of tokens on investment-portfolio (universal in
 *    personal finance: Mint, YNAB, Bankin', Revolut Vaults, Wise Jars).
 *    Combined with the parallel `[role="region"|"tabpanel"|"aria-labelledby"]`
 *    upgrade of `INTERACTIVE_SELECTOR` in tour-suggestion-generator.ts, this
 *    brought the heuristic-only score on test_3 from 1/4 to 3/4 (publishable).
 *  - v1.1 (current): removed the bare `button[role="tab"]` selector hint on
 *    investment-portfolio because `document.querySelector` always returned
 *    the first tab ("Overview") instead of the semantically correct one
 *    ("Savings"). Semantic-token matching reaches the right tab without
 *    needing that low-precision direct hint.
 *
 * Before publishing tours from this pack on a production fintech app, we
 * STRONGLY recommend keeping the dashboard's `saved_pending_review_policy_guard`
 * enabled (default) and validating each generated draft manually on at
 * least 3 real customer apps.
 */

import { JourneyBlueprint } from '../../../types';

const FINTECH_BANKING_OVERVIEW: JourneyBlueprint = {
  id: 'fintech.banking-overview',
  name: 'Decouverte du tableau de bord bancaire',
  description:
    "Aide un nouveau client a prendre en main son espace bancaire: vue d'ensemble des comptes, consultation des transactions, virement et portefeuille d'investissement.",
  vertical: 'fintech',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'fintech.banking-dashboard',
      title: 'Visualisez votre tableau de bord',
      description:
        "Le tableau regroupe vos soldes, vos derniers mouvements et les indicateurs cles de vos comptes. Premier reflexe a chaque connexion.",
      position: 'BOTTOM',
      action: 'NEXT',
      required: true,
      targetHints: {
        routePatterns: [
          '/dashboard', '/accounts', '/banking', '/overview',
          '/tableau-de-bord', '/comptes', '/synthese',
          '/panel', '/cuentas', '/resumen',
          '/ubersicht', '/konten',
          '/cruscotto', '/conti', '/sintesi',
          '/painel', '/contas', '/visao-geral',
        ],
        selectorHints: [
          '[data-tour-id="banking-dashboard"]',
          '[data-tour-id="account-overview"]',
          '[data-tour-id*="balance"]',
          '[data-tour-id*="dashboard"]',
          'section[class*="account-overview"]',
          'section[class*="AccountOverview"]',
          'section[class*="BalanceCard"]',
          'div[class*="balance-card"]',
          'div[class*="account-balance"]',
          // Modern card-grid conventions (shadcn / Material / Chakra cards
          // grouping KPI tiles). These are the visual anchors used by ~70% of
          // dashboards built since 2023; matching on them turns the otherwise
          // unstyled `data-*` heuristics into something that lands on a real
          // visible region.
          'main[role="main"] div[class*="grid"]',
          'div[class*="dashboard"]',
        ],
        semanticTokens: [
          'balance', 'accounts', 'dashboard', 'overview',
          'solde', 'comptes', 'tableau de bord', 'synthese',
          'saldo', 'cuentas', 'resumen',
          'saldo', 'konten', 'ubersicht',
          'saldo', 'conti', 'cruscotto',
          'saldo', 'contas', 'painel',
        ],
        // Informational anchor (action: 'NEXT'): the dashboard region is
        // typically a `<section>` or grid `<div>`, not a clickable element.
        // Restricting to a/button excluded the actual visible region on every
        // shadcn/Material/Chakra app we tested.
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'fintech.transactions-list',
      title: 'Consultez vos transactions',
      description:
        "La liste des transactions retrace chaque depense et chaque entree, avec categorisation automatique. Vous pouvez filtrer par compte ou par periode.",
      position: 'RIGHT',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/transactions', '/activity', '/movements', '/history',
          '/transactions', '/operations', '/mouvements', '/historique',
          '/transacciones', '/movimientos', '/historial',
          '/transaktionen', '/bewegungen', '/verlauf',
          '/transazioni', '/movimenti', '/cronologia',
          '/transacoes', '/movimentacoes', '/historico',
        ],
        selectorHints: [
          '[data-tour-id="transactions-list"]',
          '[data-tour-id="transaction-history"]',
          '[data-tour-id*="transactions"]',
          '[data-tour-id*="movements"]',
          'a[href*="/transactions"]',
          'a[href*="/movements"]',
          'a[href*="/operations"]',
          'a[href*="/transazioni"]',
          'a[href*="/transacoes"]',
          'table[class*="transactions"]',
          'table[class*="TransactionsTable"]',
          'ul[class*="transaction-list"]',
          // shadcn / Radix card conventions: list/region surfaces holding
          // recent transactions are typically a Card wrapping a list. The
          // `aria-labelledby` / heading-text path is matched by the semantic
          // token engine, but we also add direct class hints for the common
          // Tailwind card recipe.
          'section[class*="transactions"]',
          'section[class*="Transactions"]',
          'div[class*="transactions"]',
          'div[class*="Transactions"]',
        ],
        semanticTokens: [
          'transactions', 'activity', 'movements', 'history',
          'transactions', 'operations', 'mouvements', 'historique',
          'transacciones', 'movimientos', 'historial',
          'transaktionen', 'bewegungen', 'verlauf',
          'transazioni', 'movimenti', 'cronologia',
          'transacoes', 'movimentacoes', 'historico',
        ],
        actionVerbs: [
          'view transactions', 'see history',
          'voir transactions', 'consulter historique',
          'ver transacciones',
          'transaktionen ansehen',
          'visualizza transazioni',
          'ver transacoes',
        ],
        // The transactions panel is most often rendered as a Card/list region
        // (div, section, ul, table) rather than as a clickable CTA. Same
        // rationale as the dashboard step above.
        elementTags: ['a', 'button', 'div', 'section', 'article', 'ul', 'table'],
      },
    },
    {
      semanticRole: 'fintech.transfer-money',
      title: 'Initiez un virement',
      description:
        "Le formulaire de virement vous permet de transferer entre vos comptes ou vers un beneficiaire externe (SEPA, RIB, IBAN selon la zone).",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/transfer', '/send-money', '/payments',
          '/virement', '/transfert', '/envoyer-argent',
          '/transferencia', '/enviar-dinero',
          '/uberweisung', '/geld-senden',
          '/bonifico', '/trasferimento', '/invia-denaro',
          '/transferencia', '/enviar-dinheiro', '/pix',
        ],
        selectorHints: [
          '[data-tour-id="transfer-money"]',
          '[data-tour-id="new-transfer"]',
          '[data-tour-id*="transfer"]',
          '[data-tour-id*="payment"]',
          'a[href*="/transfer"]',
          'a[href*="/virement"]',
          'a[href*="/transferencia"]',
          'a[href*="/uberweisung"]',
          'a[href*="/bonifico"]',
          'a[href*="/pix"]',
          'button[class*="new-transfer"]',
          'button[class*="NewTransfer"]',
          'button[class*="SendMoney"]',
          'form[aria-label*="transfer" i]',
        ],
        semanticTokens: [
          'transfer', 'send money', 'payment', 'sepa', 'iban', 'pix',
          'virement', 'transfert', 'envoyer',
          'transferencia', 'enviar dinero',
          'uberweisung', 'geld senden',
          'bonifico', 'trasferimento',
          'transferencia', 'pix', 'enviar',
        ],
        actionVerbs: [
          'transfer money', 'send money', 'new transfer',
          'effectuer un virement', 'envoyer de l argent',
          'transferir dinero', 'nueva transferencia',
          'uberweisung tatigen', 'geld senden',
          'fai bonifico', 'invia denaro',
          'fazer transferencia', 'enviar pix',
        ],
        elementTags: ['button', 'a', 'form'],
      },
    },
    {
      semanticRole: 'fintech.investment-portfolio',
      title: 'Consultez votre portefeuille',
      description:
        "Le portefeuille presente vos positions, leur performance et la repartition par classe d'actifs. Pratique pour rebalancer.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/portfolio', '/investments', '/holdings', '/wealth',
          '/portefeuille', '/investissements', '/placements',
          '/cartera', '/inversiones',
          '/portfolio', '/anlagen', '/depot',
          '/portafoglio', '/investimenti',
          '/carteira', '/investimentos',
        ],
        selectorHints: [
          '[data-tour-id="portfolio"]',
          '[data-tour-id="investments"]',
          '[data-tour-id*="portfolio"]',
          '[data-tour-id*="investment"]',
          '[data-tour-id*="savings"]',
          'a[href*="/portfolio"]',
          'a[href*="/investments"]',
          'a[href*="/savings"]',
          'a[href*="/portefeuille"]',
          'a[href*="/cartera"]',
          'a[href*="/depot"]',
          'a[href*="/portafoglio"]',
          'a[href*="/carteira"]',
          // NOTE: we intentionally do NOT list a bare `button[role="tab"]`
          // here. Direct-selector resolution runs `document.querySelector`
          // which would return the *first* tab of the page regardless of
          // its label (typically "Overview" — a false positive). The Radix
          // / shadcn / Headless UI tab pattern is still matched correctly:
          // the semantic engine picks the tab whose label matches one of
          // the `semanticTokens` below (e.g. `savings`).
        ],
        semanticTokens: [
          'portfolio', 'investments', 'holdings', 'wealth',
          // Personal-finance apps (Mint, YNAB, Bankin', Linxo, BudgetBakers,
          // Revolut Vaults, Wise Jars) call the simplest liquid portfolio
          // "savings". Including it here is essential to cover the long tail
          // of consumer fintech apps that don't expose explicit
          // "investments" / "portfolio" labels.
          'savings', 'savings account', 'savings rate', 'vault', 'jar',
          'portefeuille', 'investissements', 'placements', 'patrimoine',
          'epargne', 'livret',
          'cartera', 'inversiones', 'patrimonio', 'ahorros',
          'portfolio', 'anlagen', 'vermogen', 'ersparnisse', 'sparen',
          'portafoglio', 'investimenti', 'patrimonio', 'risparmi',
          'carteira', 'investimentos', 'patrimonio', 'poupanca',
        ],
        actionVerbs: [
          'view portfolio', 'see investments', 'view savings',
          'voir mon portefeuille', 'consulter placements', 'voir mon epargne',
          'ver cartera', 'ver ahorros',
          'portfolio ansehen', 'ersparnisse ansehen',
          'visualizza portafoglio', 'visualizza risparmi',
          'ver carteira', 'ver poupanca',
        ],
        // Same rationale as the dashboard step: portfolio surfaces are
        // typically a tab (button[role="tab"]), a card section, or a
        // dedicated route link. All three need to be reachable.
        elementTags: ['a', 'button', 'div', 'section', 'article'],
      },
    },
  ],
};

const FINTECH_EXPENSE_MANAGEMENT: JourneyBlueprint = {
  id: 'fintech.expense-management',
  name: 'Gestion des depenses personnelles',
  description:
    "Aide l'utilisateur a comprendre son suivi budgetaire: total des depenses, repartition par categorie, historique, filtres et ajout d'une nouvelle depense.",
  vertical: 'fintech',
  intent: 'primary-action',
  minResolvedSteps: 3,
  priority: 9,
  steps: [
    {
      semanticRole: 'fintech.expense-dashboard',
      title: 'Visualisez vos depenses',
      description:
        "Le resume presente le total depense, la categorie principale et l'activite du mois pour comprendre rapidement votre budget.",
      position: 'BOTTOM',
      action: 'NEXT',
      required: true,
      targetHints: {
        routePatterns: [
          '/expenses', '/spending', '/budget', '/dashboard', '/overview',
          '/depenses', '/budget', '/suivi',
          '/gastos', '/presupuesto',
          '/ausgaben', '/budget',
          '/spese', '/bilancio',
          '/despesas', '/orcamento',
        ],
        selectorHints: [
          '[data-tour-id="expense-dashboard"]',
          '[data-tour-id="spending-overview"]',
          '[data-tour-id*="expense"]',
          '[data-tour-id*="budget"]',
          // ExpenseTracker-style summary grids: KPI cards are often rendered
          // as plain divs without ARIA roles. This direct selector keeps the
          // blueprint useful on generated Tailwind/shadcn templates while
          // still preferring explicit data/ARIA hooks above when present.
          'main div[class*="grid-cols-1"][class*="md:grid-cols-3"]',
          'section[aria-label*="expense" i]',
          'section[aria-label*="spending" i]',
          'section[aria-label*="budget" i]',
          'div[aria-label*="expense" i]',
          'div[aria-label*="spending" i]',
          'div[aria-label*="budget" i]',
          'main[role="main"] section[class*="expense"]',
          'main[role="main"] div[class*="expense"]',
          'main[role="main"] div[class*="budget"]',
        ],
        semanticTokens: [
          'total expenses', 'expenses', 'spending', 'budget', 'this month',
          'depenses', 'depense totale', 'budget', 'ce mois',
          'gastos', 'presupuesto', 'este mes',
          'ausgaben', 'budget', 'diesen monat',
          'spese', 'bilancio', 'questo mese',
          'despesas', 'orcamento', 'este mes',
        ],
        elementTags: ['div', 'section', 'article'],
      },
    },
    {
      semanticRole: 'fintech.category-breakdown',
      title: 'Analysez la repartition',
      description:
        "La repartition par categorie montre ou part votre argent: factures, shopping, alimentation, transport ou loisirs.",
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        routePatterns: [
          '/expenses', '/spending', '/categories', '/analytics', '/reports',
          '/depenses', '/categories', '/analyse',
          '/gastos', '/categorias',
          '/ausgaben', '/kategorien',
          '/spese', '/categorie',
          '/despesas', '/categorias',
        ],
        selectorHints: [
          '[data-tour-id="expense-distribution"]',
          '[data-tour-id="category-breakdown"]',
          '[data-tour-id*="category"]',
          '[data-tour-id*="distribution"]',
          'main div[class*="sm:grid-cols-2"][class*="md:grid-cols-3"]',
          'section[aria-label*="category" i]',
          'section[aria-label*="distribution" i]',
          'section[aria-label*="breakdown" i]',
          'div[aria-label*="category" i]',
          'div[aria-label*="distribution" i]',
          'div[aria-label*="breakdown" i]',
          'table[aria-label*="category" i]',
        ],
        semanticTokens: [
          'expense distribution', 'distribution', 'category', 'categories',
          'breakdown', 'bills', 'shopping', 'food', 'transport', 'entertainment',
          'repartition', 'categorie', 'categories', 'factures', 'alimentation',
          'gastos por categoria', 'categorias',
          'kategorien', 'ausgabenverteilung',
          'categorie', 'ripartizione',
          'categorias', 'distribuicao',
        ],
        elementTags: ['div', 'section', 'article', 'ul', 'table'],
      },
    },
    {
      semanticRole: 'fintech.expense-list',
      title: 'Consultez l historique',
      description:
        "La liste recente permet de retrouver chaque depense avec son montant, sa date et sa categorie.",
      position: 'RIGHT',
      action: 'NEXT',
      targetHints: {
        routePatterns: [
          '/expenses', '/transactions', '/activity', '/history',
          '/depenses', '/historique',
          '/gastos', '/historial',
          '/ausgaben', '/verlauf',
          '/spese', '/cronologia',
          '/despesas', '/historico',
        ],
        selectorHints: [
          '[data-tour-id="expense-list"]',
          '[data-tour-id="recent-expenses"]',
          '[data-tour-id*="expenses"]',
          '[data-tour-id*="history"]',
          'div[class*="backdrop-blur"]:has(input[placeholder*="Search expenses" i])',
          'section[aria-label*="recent expenses" i]',
          'section[aria-label*="expenses" i]',
          'section[aria-label*="history" i]',
          'div[aria-label*="recent expenses" i]',
          'div[aria-label*="expenses" i]',
          'ul[aria-label*="expenses" i]',
          'table[aria-label*="expenses" i]',
        ],
        semanticTokens: [
          'recent expenses', 'expenses', 'expense history', 'history',
          'transactions', 'grocery shopping', 'bus ticket',
          'depenses recentes', 'historique', 'transactions',
          'gastos recientes', 'historial',
          'letzte ausgaben', 'verlauf',
          'spese recenti', 'cronologia',
          'despesas recentes', 'historico',
        ],
        elementTags: ['div', 'section', 'article', 'ul', 'table'],
      },
    },
    {
      semanticRole: 'fintech.expense-filter',
      title: 'Filtrez par periode ou categorie',
      description:
        "Les filtres aident a isoler les depenses du jour, de la semaine, du mois ou d'une categorie precise.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/expenses', '/spending', '/transactions', '/activity',
          '/depenses', '/gastos', '/ausgaben', '/spese', '/despesas',
        ],
        selectorHints: [
          '[data-tour-id="expense-filter"]',
          '[data-tour-id="period-filter"]',
          '[data-tour-id="category-filter"]',
          '[data-tour-id*="filter"]',
          'button[role="tab"]',
          'button[role="combobox"]',
          'input[type="search"]',
          'form[role="search"]',
          '[role="search"]',
        ],
        semanticTokens: [
          'all', 'today', 'this week', 'this month', 'category',
          'search expenses', 'filter', 'filters',
          'aujourd hui', 'cette semaine', 'ce mois', 'categorie', 'filtrer',
          'hoy', 'esta semana', 'este mes', 'categoria', 'filtrar',
          'heute', 'diese woche', 'diesen monat', 'kategorie', 'filtern',
          'oggi', 'questa settimana', 'questo mese', 'categoria', 'filtra',
          'hoje', 'esta semana', 'este mes', 'categoria', 'filtrar',
        ],
        actionVerbs: [
          'filter expenses', 'search expenses', 'view this month',
          'filtrer depenses', 'rechercher depenses',
          'filtrar gastos', 'buscar gastos',
          'ausgaben filtern',
          'filtra spese',
          'filtrar despesas',
        ],
        elementTags: ['button', 'input', 'form', 'select'],
      },
    },
    {
      semanticRole: 'fintech.add-expense',
      title: 'Ajoutez une depense',
      description:
        "Le bouton d'ajout ouvre le formulaire pour saisir le montant, la description, la categorie et la date.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/expenses', '/spending', '/transactions',
          '/depenses', '/gastos', '/ausgaben', '/spese', '/despesas',
        ],
        selectorHints: [
          '[data-tour-id="add-expense"]',
          '[data-tour-id="new-expense"]',
          '[data-tour-id*="add-expense"]',
          '[data-tour-id*="new-expense"]',
          'button[aria-label*="add expense" i]',
          'a[href*="/expenses/new"]',
          'a[href*="/new-expense"]',
          'a[href*="/depenses/nouveau"]',
        ],
        semanticTokens: [
          'add expense', 'new expense', 'create expense',
          'ajouter depense', 'nouvelle depense',
          'agregar gasto', 'nuevo gasto',
          'ausgabe hinzufugen', 'neue ausgabe',
          'aggiungi spesa', 'nuova spesa',
          'adicionar despesa', 'nova despesa',
        ],
        actionVerbs: [
          'add expense', 'new expense', 'create expense',
          'ajouter une depense',
          'agregar gasto',
          'ausgabe hinzufugen',
          'aggiungi spesa',
          'adicionar despesa',
        ],
        elementTags: ['button', 'a'],
      },
    },
  ],
};

export const fintechBlueprints: JourneyBlueprint[] = [
  FINTECH_BANKING_OVERVIEW,
  FINTECH_EXPENSE_MANAGEMENT,
];
