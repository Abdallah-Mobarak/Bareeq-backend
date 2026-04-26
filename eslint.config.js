// =============================================================
// ESLint configuration — Bareeq Backend
// =============================================================
// Format: flat config (the new standard since ESLint 9).
// Old projects used `.eslintrc.json`; we use `eslint.config.js`.
//
// What this file does:
//   1. Tells ESLint what JS dialect we're writing (CommonJS, modern syntax).
//   2. Tells ESLint about Node.js globals (process, console, Buffer, etc.)
//      so it doesn't flag them as undefined.
//   3. Enables a curated set of rules that catch real bugs.
//   4. Hands off all formatting concerns to Prettier (no fighting).
// =============================================================

const js = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // 1. Base JavaScript recommended rules from the ESLint team
  js.configs.recommended,

  // 2. Disable any built-in rules that would conflict with Prettier
  prettierConfig,

  // 3. Our project-wide rules
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        // Node.js globals (so `process`, `console`, etc. don't trigger no-undef)
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        global: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      // ---- Formatting (delegated to Prettier) ----
      'prettier/prettier': 'error',

      // ---- Real bug catchers ----
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'], // === instead of ==
      curly: ['error', 'all'], // always require { } even on single-line if
      'no-throw-literal': 'error', // throw new Error('...'), never throw '...'
      'no-return-await': 'warn', // return await is rarely needed
      'no-await-in-loop': 'warn', // usually a sign you should use Promise.all
      'no-console': 'warn', // we use pino logger; console only in scripts

      // ---- Code clarity ----
      'no-duplicate-imports': 'error',
      'prefer-template': 'warn', // use `${x}` instead of '' + x
    },
  },

  // 4. Per-folder overrides
  {
    // Scripts can use console freely (they're not part of the running server)
    files: ['scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },

  // 5. Files / folders ESLint should ignore
  {
    ignores: ['node_modules/**', 'logs/**', 'prisma/migrations/**', 'coverage/**', 'dist/**'],
  },
];
