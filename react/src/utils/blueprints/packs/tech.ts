/**
 * Tech / DevTools pack — API explorers, code playgrounds, interactive docs,
 * auth-token flows.
 *
 * Maturity: STABLE. Developer tooling vocabulary is consistent across
 * languages and conventions (English dominates, even in non-English locales).
 * Low risk of false positives.
 */

import { JourneyBlueprint } from '../../../types';

const TECH_API_EXPLORATION: JourneyBlueprint = {
  id: 'tech.api-exploration',
  name: 'Explorer une API et tester un endpoint',
  description:
    "Guide le developpeur dans l'API explorer: copier un token d'authentification, choisir un endpoint puis executer une requete de test.",
  vertical: 'tech',
  intent: 'primary-action',
  minResolvedSteps: 2,
  priority: 10,
  steps: [
    {
      semanticRole: 'tech.auth-token',
      title: 'Recuperez votre token d API',
      description:
        "Copiez votre cle API personnelle. Elle servira a authentifier toutes vos requetes pendant la session.",
      position: 'BOTTOM',
      action: 'CLICK',
      targetHints: {
        routePatterns: [
          '/api-keys', '/tokens', '/credentials', '/access-tokens',
          '/cles-api', '/jetons',
          '/llaves-api', '/tokens',
          '/api-schlussel', '/zugangstoken',
          '/chiavi-api',
          '/chaves-api',
        ],
        selectorHints: [
          '[data-tour-id="api-token"]',
          '[data-tour-id="copy-api-key"]',
          '[data-tour-id*="api-key"]',
          '[data-tour-id*="api-token"]',
          'button[class*="copy-token"]',
          'button[class*="CopyToken"]',
          'button[class*="copy-api-key"]',
          'code[class*="api-key"]',
          'button[aria-label*="copy token" i]',
          'button[aria-label*="copier le token" i]',
          'button[aria-label*="copy api key" i]',
        ],
        semanticTokens: [
          'api key', 'api token', 'access token', 'bearer token', 'secret key',
          'cle api', 'jeton', 'token api',
          'llave api', 'clave secreta',
          'api-schlussel', 'zugangstoken',
          'chiave api',
          'chave api',
        ],
        actionVerbs: [
          'copy token', 'copy api key', 'reveal key', 'regenerate token',
          'copier le token', 'copier la cle',
          'copiar token',
          'token kopieren',
          'copia token',
          'copiar token',
        ],
        elementTags: ['button', 'a'],
      },
    },
    {
      semanticRole: 'tech.api-explorer',
      title: 'Selectionnez un endpoint a tester',
      description:
        "Parcourez le catalogue d'endpoints (REST, GraphQL) et choisissez celui dont vous voulez voir le comportement.",
      position: 'RIGHT',
      action: 'CLICK',
      required: true,
      targetHints: {
        routePatterns: [
          '/api-explorer', '/api/explorer', '/api-reference',
          '/playground', '/sandbox',
          '/api-docs',
        ],
        selectorHints: [
          '[data-tour-id="api-explorer"]',
          '[data-tour-id="endpoint-list"]',
          '[data-tour-id*="endpoint"]',
          'div[class*="api-explorer"]',
          'div[class*="ApiExplorer"]',
          'div[class*="EndpointList"]',
          'aside[class*="endpoint-sidebar"]',
          'button[class*="endpoint-item"]',
          'li[class*="endpoint-link"]',
          'a[href*="/api-explorer"]',
          'a[href*="/api-reference"]',
          'a[aria-label*="endpoint" i]',
        ],
        semanticTokens: [
          'endpoint', 'route', 'method', 'request', 'api explorer',
          'point de terminaison', 'endpoint', 'requete',
          'endpoint', 'metodo',
          'endpunkt', 'methode',
          'endpoint',
          'endpoint',
        ],
        actionVerbs: [
          'try endpoint', 'try it', 'send request', 'execute',
          'tester', 'envoyer la requete',
          'probar', 'ejecutar',
          'ausprobieren', 'ausfuhren',
          'prova',
          'experimentar',
        ],
        elementTags: ['a', 'button'],
      },
    },
    {
      semanticRole: 'tech.code-playground',
      title: 'Executez votre extrait de code',
      description:
        "Modifiez l'extrait de code pre-rempli (curl, JS, Python...) et lancez la requete. Le resultat s'affiche en direct dans le panneau de droite.",
      position: 'TOP',
      action: 'CLICK',
      targetHints: {
        selectorHints: [
          '[data-tour-id="code-playground"]',
          '[data-tour-id="run-request"]',
          '[data-tour-id*="playground"]',
          '[data-tour-id*="run-code"]',
          'button[class*="run-button"]',
          'button[class*="RunButton"]',
          'button[class*="ExecuteButton"]',
          'div[class*="monaco-editor"]',
          'div[class*="code-editor"]',
          'div[class*="CodeMirror"]',
          'pre[class*="language-"]',
          'button[aria-label*="run" i]',
          'button[aria-label*="execute" i]',
          'button[aria-label*="executer" i]',
        ],
        semanticTokens: [
          'run', 'execute', 'try it', 'playground', 'sandbox',
          'executer', 'lancer', 'sandbox',
          'ejecutar', 'lanzar',
          'ausfuhren',
          'eseguire',
          'executar',
        ],
        actionVerbs: [
          'run code', 'execute', 'send request',
          'executer le code', 'lancer',
          'ejecutar codigo',
          'code ausfuhren',
          'esegui codice',
          'executar codigo',
        ],
        elementTags: ['button'],
      },
    },
    {
      semanticRole: 'tech.interactive-docs',
      title: 'Consultez la documentation interactive',
      description:
        "La doc interactive presente chaque endpoint avec des exemples cliquables, les codes de retour et la liste des erreurs courantes.",
      position: 'BOTTOM',
      action: 'NEXT',
      targetHints: {
        routePatterns: [
          '/docs', '/documentation', '/api-docs', '/reference',
          '/documentation',
          '/documentacion',
          '/dokumentation',
          '/documentazione',
          '/documentacao',
        ],
        selectorHints: [
          '[data-tour-id="interactive-docs"]',
          '[data-tour-id="api-docs"]',
          'a[href*="/api-docs"]',
          'a[href*="/reference"]',
          'a[href*="/swagger"]',
          'a[href*="/redoc"]',
          'div[class*="swagger-ui"]',
          'div[class*="redoc"]',
          'iframe[src*="swagger"]',
          'iframe[src*="redoc"]',
        ],
        semanticTokens: [
          'api docs', 'documentation', 'reference', 'swagger', 'redoc', 'openapi',
          'documentation', 'reference',
          'documentacion',
          'dokumentation',
          'documentazione',
          'documentacao',
        ],
        actionVerbs: [
          'open docs', 'view reference', 'browse api',
          'consulter la doc', 'voir la reference',
          'ver documentacion',
          'dokumentation offnen',
          'apri documentazione',
          'abrir documentacao',
        ],
        elementTags: ['a', 'button'],
      },
    },
  ],
};

export const techBlueprints: JourneyBlueprint[] = [TECH_API_EXPLORATION];
