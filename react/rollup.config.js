const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('@rollup/plugin-typescript');
const postcss = require('rollup-plugin-postcss');

const external = (id) =>
  id === 'react' ||
  id === 'react-dom' ||
  id === 'framer-motion' ||
  id.startsWith('react/') ||
  id.startsWith('react-dom/');

// Shared plugin chain. We instantiate fresh objects for each entry so plugins
// that hold internal state (postcss extraction) don't double-emit.
const buildPlugins = ({ extractCss }) => [
  resolve.nodeResolve(),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
  }),
  postcss({
    // CSS is extracted only once (from the main entry). The `/packs` entry
    // reuses zero CSS — its blueprints are pure data — so we disable
    // extraction to avoid emitting an empty stylesheet next to it.
    extract: extractCss ? 'styles.css' : false,
    inject: false,
    minimize: true,
  }),
];

// Main public entry: `@trustdev/onboarding-sdk-react`.
const mainBundle = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  external,
  plugins: buildPlugins({ extractCss: true }),
};

// Opt-in entry: `@trustdev/onboarding-sdk-react/packs`. Loaded only by hosts
// that explicitly need the specialized blueprint catalogs (tech, hr, social,
// elearning, realestate, fintech, healthtech). Tree-shaking ensures only
// the imported packs end up in the consumer's final bundle.
const packsBundle = {
  input: 'src/packs/index.ts',
  output: [
    {
      file: 'dist/packs/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/packs/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
  external,
  plugins: buildPlugins({ extractCss: false }),
};

module.exports = [mainBundle, packsBundle];