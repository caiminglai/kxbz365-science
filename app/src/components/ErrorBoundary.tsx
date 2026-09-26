import { Component, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Home, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-warm-bg dark:bg-warm-bg flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="text-5xl mb-4 opacity-40">⚠️</div>
            <h1 className="text-2xl font-bold text-warm-dark dark:text-warm-text mb-2">
              页面出错了
            </h1>
            <p className="text-warm-text mb-2">渲染过程中发生了意外错误。</p>
            {this.state.error && (
              <pre className="text-xs text-left bg-warm-card dark:bg-warm-card border border-warm-border rounded-lg p-3 mb-4 overflow-auto max-h-32 text-warm-text">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-warm-accent/10 text-warm-accent hover:bg-warm-accent/20 transition-colors"
              >
                <RefreshCw size={18} />
                重试
              </button>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-warm-card dark:bg-warm-card border border-warm-border text-warm-dark dark:text-warm-text hover:border-warm-accent transition-colors"
              >
                <Home size={18} />
                返回首页
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
