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
};

const COMPONENT_RELATIVE_PATH = path.join('components', 'trustdev', 'trustdev-onboarding.tsx');
const TRUSTDEV_IMPORT =
  "import { TrustdevOnboarding } from '@/components/trustdev/trustdev-onboarding'";

function normalizeFlowVersionName(value) {
  const normalized = (value || 'trustdev-app')
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'trustdev-app';
}

function buildComponentTemplate(flowVersionName) {
  return `'use client'
import { useMemo } from 'react'
import { TourViewer } from '@trustdev/onboarding-sdk-react'
import '@trustdev/onboarding-sdk-react/styles.css'

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
        preset: 'multi-vertical-default',
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

async function updateEnvFile(cwd, prompt) {
  const envPath = path.join(cwd, '.env.local');
  let envContent = readEnvFile(envPath);

  const currentOrganizationId = getEnvValue(envContent, 'NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID');
  const currentSdkToken = getEnvValue(envContent, 'NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN');

  const organizationId = await prompt.question(
    `NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID${currentOrganizationId ? ' (press Enter to keep existing)' : ''}: `,
  );
  const sdkToken = await prompt.question(
    `NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN${currentSdkToken ? ' (press Enter to keep existing)' : ''}: `,
  );

  const values = {
    ...ENV_DEFAULTS,
    NEXT_PUBLIC_TRUSTDEV_ORGANIZATION_ID: organizationId || currentOrganizationId || '',
    NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN: sdkToken || currentSdkToken || '',
  };

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

async function createComponentFile(cwd, prompt, flowVersionName) {
  const componentPath = path.join(cwd, COMPONENT_RELATIVE_PATH);

  if (fs.existsSync(componentPath)) {
    const overwrite = await prompt.question('trustdev-onboarding.tsx already exists. Overwrite? (y/n) ');
    if (overwrite.toLowerCase() !== 'y') {
      return { path: COMPONENT_RELATIVE_PATH, status: 'skipped' };
    }
  }

  fs.mkdirSync(path.dirname(componentPath), { recursive: true });
  fs.writeFileSync(componentPath, buildComponentTemplate(flowVersionName), 'utf8');

  return {
    path: COMPONENT_RELATIVE_PATH,
    status: fs.existsSync(componentPath) ? 'created' : 'updated',
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

function printSummary(results) {
  console.log('\n✅ TrustDev SDK initialized successfully!\n');
  console.log(`📁 ${results.component.status === 'skipped' ? 'Skipped' : 'Created'}: ${results.component.path}`);
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
  console.log('   1. Fill NEXT_PUBLIC_TRUSTDEV_SDK_TOKEN in .env.local if not done');
  console.log('   2. Run: npm run dev');
}

async function main() {
  const cwd = process.cwd();
  const prompt = createPrompt();

  try {
    detectProject(cwd);
    const flowVersionName = normalizeFlowVersionName(path.basename(cwd));

    const env = await updateEnvFile(cwd, prompt);
    const component = await createComponentFile(cwd, prompt, flowVersionName);
    const layout = patchLayout(cwd);

    printSummary({ env, component, layout });
  } catch (error) {
    console.error(`\n❌ TrustDev init failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    prompt.close();
  }
}

main();
