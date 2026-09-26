/**
 * API 配置文件
 * 开发环境用相对路径，通过 vite 代理转发到后端 3000
 * 生产环境同源部署（Caddy 反代到 twym 容器），无路径前缀
 */

// 开发环境：使用 .env 中的 VITE_API_BASE_URL
// 生产环境：同源部署，空前缀
const envBase =
  typeof import.meta !== 'undefined'
    ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
    : undefined

export const API_BASE_URL = envBase || ''

// API 端点定义
export const API_ENDPOINTS = {
  aiChat: '/api/v1/ai/chat',
  aiStream: '/api/v1/ai/stream',
  aiProviders: '/api/v1/ai/providers',
  aiGenerateTerm: '/api/v1/ai/generate-term',
  aiGenerateComparison: '/api/v1/ai/generate-comparison',
  terms: '/api/v1/terms',
  termById: (id: string) => `/api/v1/terms/${id}`,
  searchTerms: '/api/v1/terms/search',
  randomTerm: '/api/v1/terms/random',
  disciplines: '/api/v1/terms/disciplines',
  graphNodes: '/api/v1/graph/nodes',
  graphLinks: '/api/v1/graph/links',
  comparisons: '/api/v1/comparisons',
  comparisonById: (id: string) => `/api/v1/comparisons/${id}`,
  scenarios: '/api/v1/scenarios',
  conceptAntibodies: '/api/v1/concept-antibodies',
  submissions: '/api/v1/submissions',
  submissionsAdmin: '/api/v1/submissions/admin',
  approveSubmission: (id: number) => `/api/v1/submissions/admin/${id}/approve`,
  rejectSubmission: (id: number) => `/api/v1/submissions/admin/${id}/reject`,
  feedback: '/api/v1/stats/feedback',
  health: '/api/v1/stats/health',
  stats: '/api/v1/stats',
  jobs: '/api/v1/jobs',
  jobById: (id: number) => `/api/v1/jobs/${id}`,
  jobCategories: '/api/v1/jobs/categories',
} as const

// 超时配置
export const REQUEST_TIMEOUT = 30000
export const STREAM_TIMEOUT = 120000

// 重试配置
export const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
}
