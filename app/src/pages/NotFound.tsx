import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Home, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-warm-bg dark:bg-warm-bg flex items-center justify-center px-4">
      <motion.div
        className="max-w-md text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-6xl mb-4 opacity-40">🔍</div>
        <h1 className="text-4xl font-bold text-warm-dark dark:text-warm-text mb-2">404</h1>
        <p className="text-lg text-warm-text mb-6">这个页面似乎不存在，也许它从未被定义过。</p>
        <div className="flex items-center gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-warm-accent/10 text-warm-accent hover:bg-warm-accent/20 transition-colors"
          >
            <Home size={18} />
            返回首页
          </Link>
          <Link
            to="/#search-section"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-warm-card dark:bg-warm-card border border-warm-border text-warm-dark dark:text-warm-text hover:border-warm-accent transition-colors"
          >
            <Search size={18} />
            搜索术语
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
