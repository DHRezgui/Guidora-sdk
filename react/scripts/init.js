#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_DEFAULTS = {
  NEXT_PUBLIC_TRUSTDEV_API_URL: 'http://localhost:3020/api/v1',
  NEXT_PUBLIC_TRUSTDEV_API_KEY: 'demo-local-key',
  NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID: '',
  NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN: '',
  NEXT_PUBLIC_TRUSTDEV_SEMANTIC_ENGINE_MODE: 'hybrid',
};

const COMPONENT_RELATIVE_PATH = path.join('components', 'trustdev', 'trustdev-onboarding.tsx');
const TOUR_ID_RELATIVE_PATH = path.join('lib', 'tour-id.ts');
const TRUSTDEV_IMPORT =
  "import { TrustdevOnboarding } from '@/components/trustdev/trustdev-onboarding'";

const BLUEPRINT_PACKS = {
  fintech: { exportName: 'fintechBlueprints', label: 'fintech' },
  healthtech: { exportName: 'healthtechBlueprints', label: 'healthtech' },
  tech: { exportName: 'techBlueprints', label: 'tech' },
  hr: { exportName: 'hrBlueprints', label: 'hr' },
  social: { exportName: 'socialBlueprints', label: 'social' },
  elearning: { exportName: 'elearningBlueprints', label: 'elearning' },
  realestate: { exportName: 'realestateBlueprints', label: 'realestate' },
  productivity: { exportName: 'productivityBlueprints', label: 'productivity' },
  'multi-vertical': { preset: 'multi-vertical-default', label: 'multi-vertical (preset)' },
};

const TOUR_ID_FILE_TEMPLATE = `/**
 * A/B instrumentation for contextual tour generation.
 *
 * - Default: \`data-tour-id\` attributes are rendered (stable anchors).
 * - Baseline: set \`NEXT_PUBLIC_TRUSTDEV_DISABLE_TOUR_IDS=true\` in \`.env.local\`
 *   to omit every \`data-tour-id\` and exercise fragile-selector heuristics only.
 */
export const tourIdsDisabled =
  process.env.NEXT_PUBLIC_TRUSTDEV_DISABLE_TOUR_IDS === 'true'

export function tourId(id: string): { 'data-tour-id'?: string } {
  if (tourIdsDisabled) return {}
  return { 'data-tour-id': id }
}
`;

function parseArgs(argv) {
  const options = {
    mode: undefined,
    pack: 'fintech',
    singlePageTour: false,
    yes: false,
    projectDomain: undefined,
    targetDir: undefined,
  };

  for (const arg of argv) {
    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }
    if (arg === '--single-page-tour') {
      options.singlePageTour = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length).trim().toLowerCase();
      continue;
    }
    if (arg.startsWith('--pack=')) {
      options.pack = arg.slice('--pack='.length).trim().toLowerCase();
      continue;
    }
    if (arg.startsWith('--project-domain=')) {
      options.projectDomain = arg.slice('--project-domain='.length).trim();
      continue;
    }
    if (arg.startsWith('--target-dir=')) {
      options.targetDir = path.resolve(arg.slice('--target-dir='.length).trim());
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (options.mode && !['heuristic', 'blueprints'].includes(options.mode)) {
    throw new Error(`Invalid --mode=${options.mode}. Use heuristic or blueprints.`);
  }

  if (!BLUEPRINT_PACKS[options.pack] && options.mode === 'blueprints') {
    throw new Error(
      `Invalid --pack=${options.pack}. Use: ${Object.keys(BLUEPRINT_PACKS).join(', ')}`,
    );
  }

  return options;
}

function printHelp() {
  console.log(`
TrustDev SDK init — usage

  node scripts/init.js [options]

Options:
  --mode=heuristic|blueprints   Generation profile (required for non-interactive)
  --pack=fintech                Blueprint pack (blueprints mode only, default: fintech)
  --single-page-tour            Heuristic: enable singlePageTour (max 1 sequence draft)
  --project-domain="..."        Heuristic: projectDomain hint for the generator
  --target-dir="C:/path/app"    Project root (overrides process.cwd())
  --yes, -y                     Non-interactive (no prompts, overwrite component)
  --help, -h                    Show this help

Blueprint packs: ${Object.keys(BLUEPRINT_PACKS).join(', ')}

Examples:
  node scripts/init.js --mode=blueprints --pack=fintech --yes
  node scripts/init.js --mode=heuristic --single-page-tour --yes
`);
}

function normalizeFlowVersionName(value) {
  const normalized = (value || 'trustdev-app')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'trustdev-app';
}

function inferProjectDomain(flowVersionName, explicit) {
  if (explicit && explicit.trim()) return explicit.trim();
  // e.g. folder test_11 → test-11 → "test-11 web application"
  return flowVersionName ? `${flowVersionName} web application` : 'web application onboarding';
}

/** Domain-agnostic heuristic baseline — no vertical-specific terminology. */
const HEURISTIC_CONTEXT_BLOCK = `
      businessObjectives: [
        'discover and use the main features',
        'complete the primary action on this page',
        'navigate between sections',
        'search and filter content',
        'manage account and settings',
      ],
      semanticHints: [
        'search',
        'add',
        'create',
        'save',
        'submit',
        'dashboard',
        'settings',
        'profile',
        'navigation',
        'filter',
        'actions',
        'notifications',
      ],
      customKeywords: {
        'primary-action': [
          'Add',
          'Create',
          'New',
          'Save',
          'Submit',
          'Confirm',
          'Start',
          'Begin',
          'Continue',
          'Done',
        ],
        'support-navigation': [
          'Dashboard',
          'Home',
          'Overview',
          'Menu',
          'Navigation',
          'Settings',
          'Help',
          'Back',
        ],
        'discovery': ['Analytics', 'Reports', 'Insights', 'Overview', 'Summary', 'Activity'],
      },`;

function buildBlueprintsComponentTemplate(flowVersionName, packKey) {
  const pack = BLUEPRINT_PACKS[packKey] || BLUEPRINT_PACKS.fintech;

  if (pack.preset) {
    return `'use client'
import { useMemo } from 'react'
import { TourViewer } from '@trustdev/onboarding-sdk-react'
import '@trustdev/onboarding-sdk-react/styles.css'

/**
 * TrustDev — contextual generation with blueprint preset "${pack.preset}".
 * Initialized via: trustdev-init --mode=blueprints --pack=${packKey}
 */
export function TrustdevOnboarding() {
  const sdkToken = process.env.NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN

  const sdkConfig = useMemo(() => ({
    apiKey: process.env.NEXT_PUBLIC_TRUSTDEV_API_KEY || 'demo-local-key',
    apiUrl: process.env.NEXT_PUBLIC_TRUSTDEV_API_URL || 'http://localhost:3020/api/v1',
    sdkToken,
    organizationId: process.env.NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID || 'org_demo_1',
    debug: true,
    syncEnabled: true,
    syncIntervalMs: 8000,
    trackBatchSize: 20,
    trackFlushIntervalMs: 5000,
  }), [sdkToken])

  if (!sdkToken) return null

  return (
    <TourViewer
      config={sdkConfig}
      autoStart={true}
      debug={true}
      showHighlight={true}
      showTooltip={true}
      showBeacon={false}
      contextualSuggestions={{
        uiMode: 'debug',
        title: '${flowVersionName} — blueprints (${pack.label})',
        preset: '${pack.preset}',
        autoPublish: false,
        publishScenario: 'simple',
        noiseSelectors: [
          '.trustdev-contextual-debug-panel',
          '[data-tour-id="contextual-debug-panel"]',
        ],
        flowVersioningEnabled: true,
        flowVersion: '${flowVersionName}-v1',
        baselineFlowVersion: '${flowVersionName}-v0',
        stableOnly: true,
      }}
    />
  )
}
`;
  }

  return `'use client'
import { useMemo } from 'react'
import { TourViewer } from '@trustdev/onboarding-sdk-react'
import { ${pack.exportName} } from '@trustdev/onboarding-sdk-react/packs'
import '@trustdev/onboarding-sdk-react/styles.css'

/**
 * TrustDev — contextual generation with journeyBlueprints (${pack.label}).
 * Initialized via: trustdev-init --mode=blueprints --pack=${packKey}
 */
export function TrustdevOnboarding() {
  const sdkToken = process.env.NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN

  const sdkConfig = useMemo(() => ({
    apiKey: process.env.NEXT_PUBLIC_TRUSTDEV_API_KEY || 'demo-local-key',
    apiUrl: process.env.NEXT_PUBLIC_TRUSTDEV_API_URL || 'http://localhost:3020/api/v1',
    sdkToken,
    organizationId: process.env.NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID || 'org_demo_1',
    debug: true,
    syncEnabled: true,
    syncIntervalMs: 8000,
    trackBatchSize: 20,
    trackFlushIntervalMs: 5000,
  }), [sdkToken])

  if (!sdkToken) return null

  return (
    <TourViewer
      config={sdkConfig}
      autoStart={true}
      debug={true}
      showHighlight={true}
      showTooltip={true}
      showBeacon={false}
      contextualSuggestions={{
        uiMode: 'debug',
        title: '${flowVersionName} — blueprints (${pack.label})',
        journeyBlueprints: ${pack.exportName},
        autoPublish: false,
        publishScenario: 'simple',
        noiseSelectors: [
          '.trustdev-contextual-debug-panel',
          '[data-tour-id="contextual-debug-panel"]',
        ],
        flowVersioningEnabled: true,
        flowVersion: '${flowVersionName}-v1',
        baselineFlowVersion: '${flowVersionName}-v0',
        stableOnly: true,
      }}
    />
  )
}
`;
}

function buildHeuristicComponentTemplate(flowVersionName, options) {
  const singlePage = options.singlePageTour;
  const domain = inferProjectDomain(flowVersionName, options.projectDomain);
  const flowSuffix = singlePage ? '-single' : '';
  const titleSuffix = singlePage ? ', singlePageTour' : '';
  const singlePageBlock = singlePage
    ? `
      singlePageTour: true,
      maxDrafts: 1,
      maxSteps: 7,
      sequenceMinConfidence: 35,`
    : `
      maxDrafts: 2,`;

  return `'use client'

import { useMemo } from 'react'
import { TourViewer } from '@trustdev/onboarding-sdk-react'
import '@trustdev/onboarding-sdk-react/styles.css'

/**
 * TrustDev — heuristic contextual generation (no blueprints, no preset).
 * Initialized via: trustdev-init --mode=heuristic${singlePage ? ' --single-page-tour' : ''}
 *
 * Optional baseline without data-tour-id: NEXT_PUBLIC_TRUSTDEV_DISABLE_TOUR_IDS=true
 */
const SEMANTIC_HINTS_PATH = '/tours/contextual/semantic-hints'

const NOISE_SELECTORS = [
  '.trustdev-contextual-debug-panel',
  '[data-tour-id="contextual-debug-panel"]',
  '[data-trustdev-contextual-panel]',
  '[aria-label="Trustdev contextual suggestions panel"]',
] as const

function resolveSemanticBackendUrl(apiUrl: string): string | undefined {
  const mode = (process.env.NEXT_PUBLIC_TRUSTDEV_SEMANTIC_ENGINE_MODE || 'hybrid').toLowerCase()
  if (mode === 'local') return undefined
  return \`\${apiUrl.replace(/\\/$/, '')}\${SEMANTIC_HINTS_PATH}\`
}

export function TrustdevOnboarding() {
  const sdkToken = process.env.NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN

  const sdkConfig = useMemo(
    () => ({
      apiKey: process.env.NEXT_PUBLIC_TRUSTDEV_API_KEY || 'demo-local-key',
      apiUrl: process.env.NEXT_PUBLIC_TRUSTDEV_API_URL || 'http://localhost:3020/api/v1',
      sdkToken,
      organizationId: process.env.NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID || 'org_demo_1',
      debug: true,
      syncEnabled: true,
      syncIntervalMs: 8000,
      trackBatchSize: 20,
      trackFlushIntervalMs: 5000,
    }),
    [sdkToken],
  )

  const apiUrl = sdkConfig.apiUrl as string

  const contextualSuggestions = useMemo(() => {
    const semanticEngineMode = (process.env.NEXT_PUBLIC_TRUSTDEV_SEMANTIC_ENGINE_MODE || 'hybrid') as
      | 'local'
      | 'hybrid'
      | 'backend'
    const semanticBackendUrl = resolveSemanticBackendUrl(apiUrl)

    return {
      uiMode: 'debug' as const,
      title: '${flowVersionName} — contextual (no blueprints${titleSuffix})',
      projectDomain: '${domain}',${HEURISTIC_CONTEXT_BLOCK}
      persona: 'admin' as const,
      autoPublish: false,
      publishScenario: 'simple' as const,
      feedbackEnabled: true,
      useSemanticRanking: true,
      enableSequenceDetection: true,
      explainabilityEnabled: true,
      conflictResolutionEnabled: true,
      conflictResolutionStrategy: 'hybrid' as const,
      includeSupportDraft: false,
      includeNavigationDraft: false,
      includeFormDraft: false,${singlePageBlock}
      minConfidence: 45,
      noiseSelectors: [...NOISE_SELECTORS],
      flowVersioningEnabled: true,
      flowVersion: '${flowVersionName}${flowSuffix}-v1',
      baselineFlowVersion: '${flowVersionName}${flowSuffix}-v0',
      stableOnly: false,
      semanticEnhancementEnabled: true,
      semanticEngineMode,
      semanticBackendUrl,
      semanticBackendTimeoutMs: 12_000,
      semanticSnapshotMinDomAgeMs: 300,
      semanticBackendAccessToken: () => sdkToken ?? null,
      semanticRoleWeights: { role: 0.6, order: 0.4, copy: 0.5 },
    }
  }, [apiUrl, sdkToken])

  if (!sdkToken) return null

  return (
    <TourViewer
      config={sdkConfig}
      autoStart={true}
      debug={true}
      showHighlight={true}
      showTooltip={true}
      showBeacon={false}
      contextualSuggestions={contextualSuggestions}
    />
  )
}
`;
}

function buildComponentTemplate(flowVersionName, initOptions) {
  const mode = initOptions.mode || 'blueprints';
  if (mode === 'heuristic') {
    return buildHeuristicComponentTemplate(flowVersionName, initOptions);
  }
  return buildBlueprintsComponentTemplate(flowVersionName, initOptions.pack);
}

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    question(query) {
      return new Promise((resolve) => {
        rl.question(query, (answer) => resolve(answer.trim()));
      });
    },
    close() {
      rl.close();
    },
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${path.basename(filePath)}: ${error.message}`);
  }
}

function detectProject(cwd) {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found. Run this command from the root of your project.');
  }

  const packageJson = readJsonFile(packageJsonPath);
  const dependencyBuckets = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ];
  const isNextProject = dependencyBuckets.some((dependencies) => dependencies && dependencies.next);

  if (!isNextProject) {
    console.warn('⚠️  Warning: next was not found in package.json dependencies. Continuing anyway.');
  }

  return { packageJson, isNextProject };
}

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return '';
  }

  return fs.readFileSync(envPath, 'utf8');
}

function getEnvValue(envContent, key) {
  const line = envContent
    .split(/\r?\n/)
    .find((entry) => new RegExp(`^\\s*${key}\\s*=`).test(entry));

  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim();
}

function hasEnvKey(envContent, key) {
  return getEnvValue(envContent, key) !== undefined;
}

function setEnvValue(envContent, key, value) {
  const lines = envContent.split(/\r?\n/);
  const keyRegex = new RegExp(`^(\\s*${key}\\s*=).*`);
  let changed = false;

  const nextLines = lines.map((line) => {
    if (!keyRegex.test(line)) return line;
    changed = true;
    return line.replace(keyRegex, `$1${value}`);
  });

  return changed ? nextLines.join('\n') : envContent;
}

function appendEnvValue(envContent, key, value) {
  const prefix = envContent && !envContent.endsWith('\n') ? '\n' : '';
  return `${envContent}${prefix}${key}=${value}\n`;
}

async function resolveInitOptions(prompt, initOptions) {
  let mode = initOptions.mode;
  if (!mode) {
    const answer = await prompt.question('Init mode [heuristic/blueprints] (default: blueprints): ');
    mode = answer.toLowerCase() === 'heuristic' ? 'heuristic' : 'blueprints';
  }

  let pack = initOptions.pack;
  if (mode === 'blueprints' && !initOptions.pack) {
    pack = 'fintech';
  }

  if (mode === 'blueprints' && initOptions.singlePageTour) {
    console.warn('⚠️  --single-page-tour is ignored in blueprints mode.');
  }

  if (mode === 'heuristic' && !initOptions.pack) {
    pack = initOptions.pack;
  }

  return {
    ...initOptions,
    mode,
    pack: pack || 'fintech',
  };
}

async function updateEnvFile(cwd, prompt, initOptions) {
  const envPath = path.join(cwd, '.env.local');
  let envContent = readEnvFile(envPath);

  const currentOrganizationId = getEnvValue(envContent, 'NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID');
  const currentSdkToken = getEnvValue(envContent, 'NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN');

  let organizationId = currentOrganizationId || '';
  let sdkToken = currentSdkToken || '';

  if (!initOptions.yes) {
    organizationId = await prompt.question(
      `NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID${currentOrganizationId ? ' (press Enter to keep existing)' : ''}: `,
    );
    sdkToken = await prompt.question(
      `NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN${currentSdkToken ? ' (press Enter to keep existing)' : ''}: `,
    );
    organizationId = organizationId || currentOrganizationId || '';
    sdkToken = sdkToken || currentSdkToken || '';
  }

  const values = {
    ...ENV_DEFAULTS,
    NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID: organizationId,
    NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN: sdkToken,
  };

  if (initOptions.mode === 'heuristic') {
    values.NEXT_PUBLIC_TRUSTDEV_SEMANTIC_ENGINE_MODE =
      getEnvValue(envContent, 'NEXT_PUBLIC_TRUSTDEV_SEMANTIC_ENGINE_MODE') || 'hybrid';
  }

  let changed = false;

  for (const [key, value] of Object.entries(values)) {
    if (!hasEnvKey(envContent, key)) {
      envContent = appendEnvValue(envContent, key, value);
      changed = true;
      continue;
    }

    const existingValue = getEnvValue(envContent, key);
    const shouldFillEmptyCredential =
      (key === 'NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID' || key === 'NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN') &&
      !existingValue &&
      value;

    if (shouldFillEmptyCredential) {
      envContent = setEnvValue(envContent, key, value);
      changed = true;
    }
  }

  if (changed || !fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent, 'utf8');
  }

  return {
    path: '.env.local',
    changed,
  };
}

async function createTourIdHelper(cwd, initOptions) {
  if (initOptions.mode !== 'heuristic') {
    return { path: TOUR_ID_RELATIVE_PATH, status: 'skipped' };
  }

  const tourIdPath = path.join(cwd, TOUR_ID_RELATIVE_PATH);
  const exists = fs.existsSync(tourIdPath);

  if (exists && !initOptions.yes) {
    return { path: TOUR_ID_RELATIVE_PATH, status: 'unchanged' };
  }

  fs.mkdirSync(path.dirname(tourIdPath), { recursive: true });
  fs.writeFileSync(tourIdPath, TOUR_ID_FILE_TEMPLATE, 'utf8');

  return {
    path: TOUR_ID_RELATIVE_PATH,
    status: exists ? 'updated' : 'created',
  };
}

async function createComponentFile(cwd, prompt, flowVersionName, initOptions) {
  const componentPath = path.join(cwd, COMPONENT_RELATIVE_PATH);
  const existedBefore = fs.existsSync(componentPath);

  if (existedBefore && !initOptions.yes) {
    const overwrite = await prompt.question('trustdev-onboarding.tsx already exists. Overwrite? (y/n) ');
    if (overwrite.toLowerCase() !== 'y') {
      return { path: COMPONENT_RELATIVE_PATH, status: 'skipped' };
    }
  }

  fs.mkdirSync(path.dirname(componentPath), { recursive: true });
  fs.writeFileSync(componentPath, buildComponentTemplate(flowVersionName, initOptions), 'utf8');

  return {
    path: COMPONENT_RELATIVE_PATH,
    status: existedBefore ? 'updated' : 'created',
  };
}

function findLayoutFile(cwd) {
  const candidates = [path.join(cwd, 'app', 'layout.tsx'), path.join(cwd, 'src', 'app', 'layout.tsx')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function insertTrustdevImport(content) {
  if (content.includes('@/components/trustdev/trustdev-onboarding')) {
    return { content, changed: false };
  }

  const lines = content.split(/\r?\n/);
  let insertAfter = -1;
  let inImport = false;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('import ')) {
      insertAfter = i;
      inImport = !trimmed.includes(' from ') && !/^import\s+['"][^'"]+['"];?$/.test(trimmed);
      continue;
    }

    if (inImport) {
      insertAfter = i;
      if (trimmed.includes(' from ') || trimmed.endsWith("';") || trimmed.endsWith('";')) {
        inImport = false;
      }
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }

    break;
  }

  if (insertAfter >= 0) {
    lines.splice(insertAfter + 1, 0, TRUSTDEV_IMPORT);
  } else {
    lines.unshift(TRUSTDEV_IMPORT);
  }

  return { content: lines.join('\n'), changed: true };
}

function insertTrustdevInBody(content) {
  if (content.includes('<TrustdevOnboarding />')) {
    return { content, changed: false };
  }

  const bodyRegex = /<body\b[^>]*>/i;

  if (!bodyRegex.test(content)) {
    return { content, changed: false, warning: 'Could not find <body> in layout.tsx.' };
  }

  return {
    content: content.replace(bodyRegex, (match) => `${match}\n        <TrustdevOnboarding />`),
    changed: true,
  };
}

function patchLayout(cwd) {
  const layoutPath = findLayoutFile(cwd);

  if (!layoutPath) {
    return {
      path: 'app/layout.tsx',
      status: 'missing',
      warning:
        "layout.tsx not found. Manually import TrustdevOnboarding and render <TrustdevOnboarding /> as the first child inside <body>.",
    };
  }

  const originalContent = fs.readFileSync(layoutPath, 'utf8');
  const withImport = insertTrustdevImport(originalContent);
  const withBody = insertTrustdevInBody(withImport.content);
  const changed = withImport.changed || withBody.changed;

  if (changed) {
    fs.writeFileSync(layoutPath, withBody.content, 'utf8');
  }

  return {
    path: path.relative(cwd, layoutPath).replace(/\\/g, '/'),
    status: changed ? 'patched' : 'unchanged',
    warning: withBody.warning,
  };
}

function printSummary(results, initOptions) {
  console.log('\n✅ TrustDev SDK initialized successfully!\n');
  console.log(`Mode: ${initOptions.mode}${initOptions.mode === 'blueprints' ? ` (pack: ${initOptions.pack})` : ''}`);
  if (initOptions.mode === 'heuristic' && initOptions.singlePageTour) {
    console.log('Profile: singlePageTour enabled');
  }
  const componentLabel =
    results.component.status === 'skipped'
      ? 'Skipped'
      : results.component.status === 'updated'
        ? 'Updated'
        : 'Created';
  console.log(`📁 ${componentLabel}: ${results.component.path}`);
  if (results.tourId.status !== 'skipped') {
    console.log(`🏷️  ${results.tourId.status}: ${results.tourId.path}`);
  }
  console.log(`🔐 ${results.env.changed ? 'Updated' : 'Checked'}: ${results.env.path}`);

  if (results.layout.status === 'missing') {
    console.log(`⚠️  Layout: ${results.layout.warning}`);
  } else {
    console.log(`📐 ${results.layout.status === 'patched' ? 'Patched' : 'Already patched'}:  ${results.layout.path}`);
  }

  if (results.layout.warning && results.layout.status !== 'missing') {
    console.log(`⚠️  Warning: ${results.layout.warning}`);
  }

  console.log('\n👉 Next steps:');
  console.log('   1. Fill NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN in .env.local (or use refresh-sdk-token.ps1)');
  console.log('   2. Add data-tour-id anchors in your UI (lib/tour-id.ts helper in heuristic mode)');
  console.log('   3. Run: npm run dev');
}

async function main() {
  const prompt = createPrompt();
  const cliOptions = parseArgs(process.argv.slice(2));
  const cwd = cliOptions.targetDir ? path.resolve(cliOptions.targetDir) : process.cwd();

  try {
    detectProject(cwd);
    console.log(`Target directory: ${cwd}`);
    const flowVersionName = normalizeFlowVersionName(path.basename(cwd));
    const initOptions = await resolveInitOptions(prompt, cliOptions);

    const env = await updateEnvFile(cwd, prompt, initOptions);
    const tourId = await createTourIdHelper(cwd, initOptions);
    const component = await createComponentFile(cwd, prompt, flowVersionName, initOptions);
    const layout = patchLayout(cwd);

    printSummary({ env, component, layout, tourId }, initOptions);
  } catch (error) {
    console.error(`\n❌ TrustDev init failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    prompt.close();
  }
}

main();
