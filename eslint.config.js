const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

function boundary(layers, patterns) {
  return {
    files: layers.map((layer) => `src/${layer}/**/*.{ts,tsx}`),
    rules: { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] },
  };
}

const FROM_SRC = '^(?:@/|(?:\\.\\./)+)';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'site/*', 'priv/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  boundary(
    ['core'],
    [
      {
        regex: '^(?:@/(?:features|app)|(?:\\.\\./)+features)(?:/|$)',
        message: 'Core may not import the UI.',
      },
      {
        regex: `${FROM_SRC}design(?!/widgets(?:/|$))(?:/|$)`,
        message: 'Core may import design types, and widgets, which are data.',
        allowTypeImports: true,
      },
    ]
  ),
  boundary(
    ['protocols', 'storage'],
    [
      {
        regex: `${FROM_SRC}(?:features|design|app|plugins|core/app)(?:/|$)`,
        message: 'Protocols and storage may not import the UI, plugins or app state.',
      },
    ]
  ),
]);
