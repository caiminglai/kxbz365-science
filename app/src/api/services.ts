/**
 * API 服务层 - 每个业务模块的调用函数
 * 前端组件调用这些函数，不用关心底层HTTP细节
 */

import { apiClient } from './client'
import { API_ENDPOINTS, API_BASE_URL } from './config'
import type {
  AIChatRequest,
  AIChatResponse,
  AIProvider,
  APITerm,
  TermAlias,
  SearchResponse,
  GraphDataResponse,
  GraphNodeData,
  GraphLinkData,
  FeedbackRequest,
  Comparison,
  ComparisonCreatePayload,
  AIGenerateComparisonRequest,
  Scenario,
  ConceptAntibodyEntry,
} from './types'

// ============= AI 问答 =============

/**
 * 发送问题给AI，获取完整回答
 * 后端需要：接收question → RAG检索词条 → 调用LLM → 返回回答+引用来源
 */
export async function aiChat(request: AIChatRequest): Promise<AIChatResponse> {
  return apiClient.post<AIChatResponse>(API_ENDPOINTS.aiChat, request)
}

/**
 * 流式AI问答（打字机效果）
 * 后端需要：SSE (Server-Sent Events) 流式推送
 * 使用方式：
 *   const stream = aiChatStream({ question: '什么是梯度下降？' });
 *   for await (const chunk of stream) {
 *     console.log(chunk.content); // 逐字输出
 *   }
 */
export async function* aiChatStream(
  request: AIChatRequest,
  signal?: AbortSignal,
) {
  // 开发环境使用相对路径通过代理，生产环境自动检测部署路径前缀
  const baseUrl = API_BASE_URL

  const response = await fetch(`${baseUrl}${API_ENDPOINTS.aiStream}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)
            yield parsed // { content: "...", sources?: [...] }
          } catch {
            // 忽略解析失败的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 获取支持的 AI 提供商列表
 */
export async function getAIProviders(): Promise<AIProvider[]> {
  return apiClient.get<AIProvider[]>(API_ENDPOINTS.aiProviders)
}

export interface AIGenerateTermRequest {
  name: string
  discipline: string
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface AIGenerateTermResponse {
  translation: string
  essence: string
  tip: string
  aliases: TermAlias[]
}

/**
 * 调用 LLM 自动生成词条的大白话翻译、本质解释、防忽悠提示和跨学科别名
 */
export async function generateTermWithAI(
  request: AIGenerateTermRequest,
): Promise<AIGenerateTermResponse> {
  return apiClient.post<AIGenerateTermResponse>(API_ENDPOINTS.aiGenerateTerm, request)
}

// ============= 词条 =============

/**
 * 获取词条列表（带分页）
 * 后端需要：支持 page/pageSize/discipline 筛选
 */
export async function getTerms(
  page = 1,
  pageSize = 50,
  discipline?: string,
): Promise<{ terms: APITerm[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (discipline) params.append('discipline', discipline)

  return apiClient.get<{ terms: APITerm[]; total: number }>(
    `${API_ENDPOINTS.terms}?${params.toString()}`,
  )
}

/**
 * 获取单个词条详情
 */
export async function getTermById(id: string): Promise<APITerm> {
  return apiClient.get<APITerm>(API_ENDPOINTS.termById(id))
}

/**
 * 获取随机词条
 */
export async function getRandomTerm(): Promise<APITerm> {
  return apiClient.get<APITerm>(API_ENDPOINTS.randomTerm)
}

/**
 * 搜索词条
 * 后端需要：全文搜索 term/translation/essence/tip 字段，返回匹配度排序
 */
export async function searchTerms(query: string, limit = 20): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  })

  return apiClient.get<SearchResponse>(`${API_ENDPOINTS.searchTerms}?${params.toString()}`)
}

// ============= 学科 =============

/**
 * 获取所有学科列表
 */
export interface DisciplineData {
  id: string
  name: string
  color: string
  description?: string
}

export async function getDisciplines(): Promise<DisciplineData[]> {
  const result = await apiClient.get<DisciplineData[]>(API_ENDPOINTS.disciplines)
  return result
}

// ============= 图谱 =============

/**
 * 获取图谱节点
 */
export async function getGraphNodes(): Promise<GraphNodeData[]> {
  return apiClient.get<GraphNodeData[]>(API_ENDPOINTS.graphNodes)
}

/**
 * 获取图谱关系
 */
export async function getGraphLinks(): Promise<GraphLinkData[]> {
  return apiClient.get<GraphLinkData[]>(API_ENDPOINTS.graphLinks)
}

/**
 * 获取完整图谱数据（节点+关系）
 * 后端需要：返回所有词条作为节点，词条间关系作为边
 */
export async function getGraphData(): Promise<GraphDataResponse> {
  const [nodes, links] = await Promise.all([getGraphNodes(), getGraphLinks()])
  return { nodes, links }
}

// ============= 统计数据 =============

/**
 * 获取系统统计数据（词条总数、学科数等）
 */
export async function getStats(): Promise<Record<string, unknown>> {
  return apiClient.get<Record<string, unknown>>(API_ENDPOINTS.stats)
}

// ============= 概念对比 =============

/**
 * 获取所有概念对比
 */
export async function getComparisons(): Promise<Comparison[]> {
  return apiClient.get<Comparison[]>(API_ENDPOINTS.comparisons)
}

// ============= 情景还原 =============

/**
 * 获取所有情景还原
 */
export async function getScenarios(): Promise<Scenario[]> {
  return apiClient.get<Scenario[]>(API_ENDPOINTS.scenarios)
}

// ============= 概念抗体（前台只读区块） =============

/**
 * 获取后台已启用的概念抗体条目
 * 接口免鉴权且只回白名单字段，返回空数组时页面不渲染该区块
 */
export async function getConceptAntibodies(): Promise<ConceptAntibodyEntry[]> {
  return apiClient.get<ConceptAntibodyEntry[]>(API_ENDPOINTS.conceptAntibodies)
}

// ============= 用户提交 =============

export interface TermSubmissionPayload {
  submission_type: 'term'
  term_name: string
  term_discipline: string
  term_translation?: string
  term_essence?: string
  term_tip?: string
  term_aliases?: TermAlias[]
  contact?: string
}

export interface PairSubmissionPayload {
  submission_type: 'pair'
  term1: string
  term2: string
  explanation?: string
  contact?: string
  examples?: string
}

/**
 * 提交"同物异名"词条对或新词条
 * 后端需要：存储提交内容（未审核状态），可选发送通知给管理员
 */
export async function createSubmission(
  payload: PairSubmissionPayload | TermSubmissionPayload,
): Promise<{ id: string; status: string }> {
  return apiClient.post<{ id: string; status: string }>(API_ENDPOINTS.submissions, payload)
}

/**
 * 获取所有用户提交（管理员用）
 */
export async function getSubmissions(): Promise<unknown[]> {
  return apiClient.get<unknown[]>(`${API_ENDPOINTS.submissions}/admin`)
}

export async function approveSubmission(id: number): Promise<void> {
  return apiClient.post<void>(API_ENDPOINTS.approveSubmission(id))
}

export async function rejectSubmission(id: number): Promise<void> {
  return apiClient.post<void>(API_ENDPOINTS.rejectSubmission(id))
}

export async function createComparison(
  payload: ComparisonCreatePayload,
): Promise<Comparison> {
  return apiClient.post<Comparison>(API_ENDPOINTS.comparisons, payload)
}

export async function updateComparison(
  id: string,
  payload: ComparisonCreatePayload,
): Promise<Comparison> {
  return apiClient.put<Comparison>(API_ENDPOINTS.comparisonById(id), payload)
}

export async function deleteComparison(id: string): Promise<void> {
  return apiClient.del<void>(API_ENDPOINTS.comparisonById(id))
}

export async function aiGenerateComparison(
  request: AIGenerateComparisonRequest,
): Promise<Comparison> {
  return apiClient.post<Comparison>(API_ENDPOINTS.aiGenerateComparison, request)
}

// ============= 高薪技术岗 =============

/**
 * 获取岗位分类列表
 */
export async function getJobCategories(): Promise<Array<{ id: number; name: string; icon: string }>> {
  return apiClient.get<Array<{ id: number; name: string; icon: string }>>(API_ENDPOINTS.jobCategories)
}

/**
 * 获取所有岗位详情（带阶段/技能/资源）
 */
export async function getDetailedJobs(categoryId?: number): Promise<unknown[]> {
  const params = new URLSearchParams()
  if (categoryId) params.set('categoryId', String(categoryId))
  const query = params.toString()
  return apiClient.get<unknown[]>(query ? `${API_ENDPOINTS.jobs}/detailed?${query}` : `${API_ENDPOINTS.jobs}/detailed`)
}

// ============= 反馈 =============

/**
 * 提交用户反馈
 * 后端需要：存储反馈内容，可选发送通知
 */
export async function submitFeedback(feedback: FeedbackRequest): Promise<void> {
  return apiClient.post<void>(API_ENDPOINTS.feedback, feedback)
}

// ============= 开发测试 =============

/**
 * 检查后端是否在线
 * 后端需要：GET /api/v1/health 返回 { status: "ok" }
 */
export async function checkBackend(): Promise<boolean> {
  // 开发环境：使用相对路径（通过 Vite 代理转发）
  // 生产环境：自动检测部署路径前缀
  const baseUrl = API_BASE_URL
  const healthUrl = baseUrl ? `${baseUrl}/api/v1/stats/health` : '/api/v1/stats/health'

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}
