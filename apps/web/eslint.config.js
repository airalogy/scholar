import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

const typescriptRules = tsPlugin.configs.recommended.rules

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...typescriptRules,
      'no-undef': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: tsParser,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...typescriptRules,
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
    },
  },
]
