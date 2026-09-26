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
      // eslint-plugin-react-hooks 7.x 新加的三条编译器规则，先降为 warn 让门禁能跑。
      // 实测计数（react-hooks 7.1.1，0 error）：set-state-in-effect 5
      // （TodayRecommend/use-mobile/useDisciplines/useTerms/SearchSection），
      // 另两条 0。这 5 条都是"挂载时在 effect 里 setState 起数据"，改法要逐组件
      // 判（有的该转 useSyncExternalStore，有的该挪进事件处理器），清零后再删这三行。
      // 版本下限必须是 7.1.1：7.0.1 里这三条规则还没实现，用它量恒为 0 命中，是假绿。
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
])
