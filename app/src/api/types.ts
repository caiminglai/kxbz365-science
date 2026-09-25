/**
 * API 请求/响应类型定义
 * 前后端对接时，两边都用这套类型
 */

// ============= AI 问答 =============

export interface AIChatRequest {
  question: string // 用户问题
  provider: string // 提供商：openai | anthropic | alibaba | zhipu | custom
  apiKey: string // API Key（保存在浏览器，不记录到服务器）
  baseUrl?: string // 自定义 API 地址（可选）
  model?: string // 自定义模型名（可选）
  conversationId?: string // 会话ID（支持多轮对话）
  context?: string[] // 上下文（前几轮对话）
}

export interface AIProvider {
  provider: string
  name: string
  defaultModel: string
}

export interface AIChatResponse {
  answer: string // AI回答
  sources?: Source[] // 引用的来源词条
  conversationId: string // 会话ID
}

export interface Source {
  termId: string // 词条ID
  term: string // 词条名称
  discipline: string // 学科
  relevance: number // 相关度 0-1
  excerpt: string // 引用片段
}

// ============= 词条 =============

export interface TermListResponse {
  terms: APITerm[]
  total: number
  page: number
  pageSize: number
}

export interface TermAlias {
  discipline: string
  name: string
}

export interface APITerm {
  id: string
  discipline: string
  name: string // 术语名称
  translation: string // 人话翻译
  essence: string // 本质解释
  tip: string // 防忽悠提示
  aliases?: TermAlias[] // 跨学科别名
  hot: number // 是否热门
  created_at?: string // 创建时间
  useCases?: string[] // 应用场景
  learningPath?: string[] // 学习路径
  relatedTerms?: string[] // 相关词条ID
}

// ============= 搜索 =============

export interface SearchRequest {
  q: string // 搜索关键词
  discipline?: string // 学科筛选
  limit?: number // 返回数量
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  query: string
}

export interface SearchResult {
  term: APITerm
  score: number // 匹配度
  highlights: {
    // 高亮片段
    field: string
    text: string
  }[]
}

// ============= 图谱 =============

export interface GraphDataResponse {
  nodes: GraphNodeData[]
  links: GraphLinkData[]
}

export interface GraphNodeData {
  id: string
  name: string
  discipline: string
  color: string
  radius: number
  translation: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
}

export interface GraphLinkData {
  source: string
  target: string
  label: string
}

// ============= 反馈 =============

export interface FeedbackRequest {
  type: 'correction' | 'suggestion' | 'new_term' | 'other'
  content: string
  termId?: string // 如果是词条相关反馈
  contact?: string // 联系方式（可选）
}

// ============= 提交审核 =============

export interface Submission {
  id: number
  submission_type: string
  term1?: string
  term2?: string
  explanation?: string
  examples?: string
  contact?: string
  term_name?: string
  term_discipline?: string
  term_translation?: string
  term_essence?: string
  term_tip?: string
  term_aliases?: TermAlias[]
  status: string
  review_note?: string
  created_at?: number
  updated_at?: number
}

export interface SubmissionStats {
  pending: number
  approved: number
  rejected: number
}

export interface SubmissionCreatePayload {
  submission_type: string
  term1?: string
  term2?: string
  explanation?: string
  contact?: string
  examples?: string
  term_name?: string
  term_discipline?: string
  term_translation?: string
  term_essence?: string
  term_tip?: string
  term_aliases?: TermAlias[]
}

// ============= 概念对比 =============

export interface ComparisonConcept {
  name: string
  discipline: string
  plain: string
  symptom: string
  analogy: string
  fix: string
}

export interface Comparison {
  id: string
  title: string
  concept_a_name: string
  concept_a_discipline: string
  concept_a_plain: string
  concept_a_symptom: string
  concept_a_analogy: string
  concept_a_fix: string
  concept_b_name: string
  concept_b_discipline: string
  concept_b_plain: string
  concept_b_symptom: string
  concept_b_analogy: string
  concept_b_fix: string
  summary: string
  relationship_type?: string // 同一性/相似性/关联性/对立性/包含性/无关性
}

export interface ComparisonRow {
  id: string
  title: string
  concept_a_name: string
  concept_a_discipline: string
  concept_a_plain: string
  concept_a_symptom?: string
  concept_a_analogy?: string
  concept_a_fix?: string
  concept_b_name: string
  concept_b_discipline: string
  concept_b_plain: string
  concept_b_symptom?: string
  concept_b_analogy?: string
  concept_b_fix?: string
  summary: string
  relationship_type?: string
}

export interface ComparisonCreatePayload {
  id?: string
  title: string
  concept_a_name: string
  concept_a_discipline: string
  concept_a_plain: string
  concept_a_symptom?: string
  concept_a_analogy?: string
  concept_a_fix?: string
  concept_b_name: string
  concept_b_discipline: string
  concept_b_plain: string
  concept_b_symptom?: string
  concept_b_analogy?: string
  concept_b_fix?: string
  summary: string
  relationship_type?: string
}

export interface AIGenerateComparisonRequest {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
  nameA: string
  nameB: string
}

// ============= 情景还原 =============

export interface DialogueLine {
  speaker: string
  text: string
  highlight?: string
}

export interface Scenario {
  id: string
  scene: string
  lesson: string
  dialogue: DialogueLine[]
}

// ============= 通用 =============

export interface APIError {
  code: string // 错误码
  message: string // 错误信息
  details?: Record<string, unknown>
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: APIError
}

// ============= 共享 / 前端通用 =============

/** 学科信息（含 description，用于前端渲染） */
export interface DisciplineInfo {
  id: string
  name: string
  color: string
  description: string
}

/** 搜索建议（搜索框自动补全） */
export interface SearchSuggestion {
  id: string
  name: string
  translation: string
  discipline: string
}

/** AI 配置（AI 助手 / 用户提交页共用） */
export interface AIConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

/** 前端词条条目（与 APITerm 基本一致，hot 为 boolean） */
export interface TermEntry {
  id: string
  discipline: string
  name: string
  translation: string
  essence: string
  tip: string
  aliases?: TermAlias[]
  hot?: boolean
}

/** 认知梯度路径 */
export interface LearningGradient {
  use: string
  path: string[]
}

/** 跨学科词条 */
export interface CrossDisciplineEntry {
  id: string
  concept: string
  names: { discipline: string; name: string }[]
  summary: string
}

/** 概念抗体（后台录入、前台只读展示；字段名与 /api/v1/concept-antibodies 一致） */
export interface ConceptAntibodyEntry {
  id: string
  term_id?: string | null
  title: string
  category?: string | null
  description?: string | null
  content?: string | null
  created_at?: string | null
}
