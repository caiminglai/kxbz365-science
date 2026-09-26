import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig([
  // public/ 是三方 vendor（three.js 构建产物），里面有指向未安装规则的行内 eslint-disable，会被报 error
  globalIgnores(['dist', 'public']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      {
        plugins: { 'react-refresh': reactRefresh },
        rules: { 'react-refresh/only-export-components': 'warn' },
      },
      prettierConfig,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // eslint-plugin-react-hooks 7.x 新增的三条编译器规则。定案（09-26 深夜）：三站都没启用 React
      // Compiler（react-compiler 在 vite.config.ts 与 package.json 里 0 命中），这三条只是编译器的
      // 配套告警、不改变任何产物，所以 warn 是长期设置而非过渡；哪天真要启用编译器，这三行必须升回
      // error 并逐组件清零，理由与判据见 compose/CONVENTIONS.md §10。
      // 实测计数（react-hooks 7.1.1，0 error / 7 warning）：set-state-in-effect 5
      // （TodayRecommend:42 / use-mobile:14 / useDisciplines:79 / useTerms:68 /
      // SearchSection:195，都是挂载时在 effect 里 setState 起数据），另两条 0。
      // 版本下限必须是 7.1.1：7.0.1 里这三条规则还没实现，用它量恒为 0 命中，是假绿。
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
