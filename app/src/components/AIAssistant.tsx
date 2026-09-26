import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  X,
  Sparkles,
  Send,
  User,
  AlertCircle,
  Loader2,
  Settings,
  Key,
  ChevronDown,
  RefreshCw,
  Lightbulb,
} from 'lucide-react'
import { aiChatStream, getAIProviders } from '@/api'
import type { AIProvider } from '@/api'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  error?: boolean
}

interface AIConfig {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

const STORAGE_KEY = 'twym_ai_config'

const EXAMPLE_QUESTIONS = [
  '什么是"涌现"？它和普通的系统行为有什么区别？',
  '有人说"这就是一个复杂系统"，他到底在说什么？',
  '请用通俗的语言解释"范式转移"是什么意思？',
  '深度学习和机器学习的本质区别是什么？',
]

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [config, setConfig] = useState<AIConfig>({
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: '',
  })
  const [providerOpen, setProviderOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 从 sessionStorage 恢复配置（关闭标签页后自动清除，更安全）
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setConfig(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  // 获取支持的提供商列表
  useEffect(() => {
    if (isOpen && providers.length === 0) {
      ;(async () => {
        try {
          setProviders(await getAIProviders())
        } catch {
          // 获取提供商列表失败时静默忽略
        }
      })()
    }
  }, [isOpen, providers.length])

  // 保存配置到 sessionStorage（关闭标签页后自动清除，更安全）
  const saveConfig = useCallback((newConfig: AIConfig) => {
    setConfig(newConfig)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig))
    } catch {
      // ignore
    }
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // 组件卸载时取消正在进行的流
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const hasConfig = config.apiKey.trim().length > 0

  const currentProviderInfo = providers.find((p) => p.provider === config.provider)
  const displayModel = config.model || currentProviderInfo?.defaultModel || ''

  const handleSend = useCallback(async () => {
    const question = input.trim()
    if (!question || isLoading) return

    if (!hasConfig) {
      setShowSettings(true)
      setError('请先配置 API Key')
      return
    }

    setError(null)
    setIsLoading(true)

    // 添加用户消息
    const userMessage: Message = { id: `u-${Date.now()}`, role: 'user', content: question }
    setMessages((prev) => [...prev, userMessage])
    setInput('')

    // 添加空的助理消息（流式填充）
    const assistantMessage: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      const request = {
        question,
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl || undefined,
        model: config.model || undefined,
      }

      // 创建 AbortController，用于取消流
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      const stream = aiChatStream(request, controller.signal)
      let fullContent = ''

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content
          setMessages((prev) => {
            const newMessages = [...prev]
            const lastIdx = newMessages.length - 1
            if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
              newMessages[lastIdx] = { ...newMessages[lastIdx], content: fullContent }
            }
            return newMessages
          })
        }
        if (chunk.done) break
      }

      setMessages((prev) => {
        const newMessages = [...prev]
        const lastIdx = newMessages.length - 1
        if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
          newMessages[lastIdx] = {
            ...newMessages[lastIdx],
            isStreaming: false,
            content: newMessages[lastIdx].content || '（无响应内容）',
          }
        }
        return newMessages
      })
    } catch (err: unknown) {
      // 用户主动取消（如组件卸载、发起新请求），不显示错误
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      setMessages((prev) => {
        const newMessages = [...prev]
        const lastIdx = newMessages.length - 1
        if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
          newMessages[lastIdx] = {
            ...newMessages[lastIdx],
            content:
              '出错了：' + ((err as Error)?.message || '网络请求失败，请检查 API Key 和网络连接。'),
            error: true,
            isStreaming: false,
          }
        }
        return newMessages
      })
    } finally {
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [input, isLoading, hasConfig, config])

  const clearChat = () => {
    setMessages([])
    setError(null)
  }

  return (
    <>
      <motion.div drag dragMomentum={false} className="fixed right-6 bottom-6 z-50 w-fit h-fit">
        {/* 入口按钮 */}
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-2 whitespace-nowrap bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 text-white px-5 py-3.5 rounded-2xl shadow-2xl shadow-purple-500/30 ring-2 ring-white/20 dark:ring-purple-400/30 hover:shadow-purple-500/50 hover:scale-105 active:scale-95 transition-all"
            >
              <Sparkles size={20} />
              <span className="font-semibold">AI 助手</span>
              <span className="hidden sm:inline-block text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                Beta
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* 主面板 */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="absolute right-0 bottom-0 z-40 w-[420px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
            >
              {/* 顶部栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <Bot size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">
                      同物异名 AI
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {currentProviderInfo?.name || config.provider} · {displayModel || '默认模型'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSettings((s) => !s)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 transition-colors"
                    title="配置"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={clearChat}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 transition-colors"
                    title="清空对话"
                  >
                    <RefreshCw size={18} />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* 配置面板 */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850"
                  >
                    <div className="p-4 space-y-3">
                      {/* 提供商选择 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          AI 提供商
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setProviderOpen((o) => !o)}
                            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500"
                          >
                            <span className="text-gray-900 dark:text-white">
                              {currentProviderInfo?.name || config.provider}
                            </span>
                            <ChevronDown size={16} className="text-gray-500" />
                          </button>
                          {providerOpen && (
                            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                              {providers.map((p) => (
                                <button
                                  key={p.provider}
                                  onClick={() => {
                                    saveConfig({ ...config, provider: p.provider, model: '' })
                                    setProviderOpen(false)
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  {p.name}
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                    · {p.defaultModel}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* API Key */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          <span className="inline-flex items-center gap-1">
                            <Key size={12} />
                            API Key
                          </span>
                        </label>
                        <input
                          type="password"
                          value={config.apiKey}
                          onChange={(e) => saveConfig({ ...config, apiKey: e.target.value })}
                          placeholder="输入你的 API Key（保存在浏览器本地，不上传服务器）"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white placeholder-gray-400"
                          autoComplete="off"
                        />
                      </div>

                      {/* 自定义 Base URL */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          API 地址（可选）
                        </label>
                        <input
                          type="text"
                          value={config.baseUrl}
                          onChange={(e) => saveConfig({ ...config, baseUrl: e.target.value })}
                          placeholder="https://api.example.com/v1  留空用默认地址"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white placeholder-gray-400"
                          autoComplete="off"
                        />
                      </div>

                      {/* 自定义模型 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          模型名（可选）
                        </label>
                        <input
                          type="text"
                          value={config.model}
                          onChange={(e) => saveConfig({ ...config, model: e.target.value })}
                          placeholder={`默认：${currentProviderInfo?.defaultModel || 'gpt-4o-mini'}`}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white placeholder-gray-400"
                          autoComplete="off"
                        />
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                        💡 API Key 保存在浏览器本地（关闭标签页后清除）。每次对话时 Key
                        会通过加密连接发送到后端代理转发，不会存储在服务器。
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 配置缺失时的提示 */}
              {!hasConfig && !showSettings && (
                <div className="mx-4 mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      size={16}
                      className="text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5"
                    />
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      <div className="font-medium mb-1">需要先配置 API Key</div>
                      <div className="leading-relaxed">
                        点击右上角 ⚙ 设置，选择 AI 提供商并填入 API Key，就能开始使用啦！
                      </div>
                      <button
                        onClick={() => setShowSettings(true)}
                        className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        去配置 →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center py-8">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
                      <Lightbulb size={28} className="text-purple-500" />
                    </div>
                    <div className="font-medium text-gray-900 dark:text-white mb-1">
                      有什么想拆解的概念？
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-xs">
                      输入你的问题，我会帮你分析"同物异名"、揭示本质
                    </div>
                    {/* 示例问题 */}
                    <div className="w-full space-y-2">
                      {EXAMPLE_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setInput(q)}
                          className="w-full text-left text-xs px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div
                        className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center ${
                          msg.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gradient-to-br from-purple-500 to-blue-500 text-white'
                        }`}
                      >
                        {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                      </div>
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-blue-500 text-white rounded-tr-md'
                            : msg.error
                              ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-tl-md'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-tl-md'
                        }`}
                      >
                        {msg.content || (msg.isStreaming ? '正在思考...' : '')}
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-4 bg-gray-500 dark:bg-gray-300 ml-0.5 animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
                {error && (
                  <div className="text-xs text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={
                      hasConfig ? '输入问题，Enter 发送，Shift+Enter 换行' : '请先配置 API Key...'
                    }
                    rows={1}
                    disabled={isLoading}
                    className="flex-1 resize-none px-3 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white placeholder-gray-400 disabled:opacity-50 max-h-32"
                    style={{ minHeight: '42px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim() || !hasConfig}
                    className="p-2.5 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 点击背景关闭提供商下拉 */}
      {providerOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setProviderOpen(false)} />
      )}
    </>
  )
}
