/* eslint-disable */
'use strict';

const path = require('path');
const assert = require('node:assert/strict');

const distPath = path.join(__dirname, '..', 'dist', 'index.cjs.js');
let sdk;
try {
  sdk = require(distPath);
} catch (err) {
  console.error(`[structural-guards] Failed to require ${distPath}. Run "npm run build" first.`);
  console.error(err.message);
  process.exit(2);
}

const { isBloatedCopyText, enforceSemanticStepCopy, isOversizedStepTarget } = sdk;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('isBloatedCopyText detects long DOM dump', () => {
  const dump =
    'chili pos menu table 4 floyd miles all 235 items breakfast soups pasta veg1 burger $23.99 juice $12.99 sushi $9.99 sub total $61.96 tax cash card qr place order';
  assert.equal(isBloatedCopyText(dump), true);
});

test('isBloatedCopyText allows short label', () => {
  assert.equal(isBloatedCopyText('Credit/Debit Card'), false);
});

test('enforceSemanticStepCopy rewrites bloated content', () => {
  const dump =
    'menu table 4 floyd miles all 235 items breakfast soups pasta burger $23.99 juice $12.99 sushi tacos sub total tax cash credit debit card qr code place order';
  const result = enforceSemanticStepCopy('Paiement', dump, {
    fallbackLabel: 'Credit/Debit Card',
    semanticRole: 'utility',
  });
  assert.equal(result.rewritten, true);
  assert.ok(result.content.length <= 200);
  assert.ok(!isBloatedCopyText(result.content));
});

test('isOversizedStepTarget rejects wide interactive container', () => {
  const children = Array.from({ length: 12 }, (_, i) => ({
    tagName: 'BUTTON',
    matches: () => false,
  }));
  const element = {
    tagName: 'DIV',
    getAttribute: () => null,
    childNodes: [],
    querySelectorAll: () => children,
    textContent: 'Menu Table 4 Floyd Miles All 235 Items',
  };
  assert.equal(isOversizedStepTarget(element), true);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
    process.exit(1);
  }
}
console.log(`\n${passed}/${tests.length} structural guard tests passed\n`);
