import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router'
import {
  ArrowLeft,
  Cpu,
  DollarSign,
  Factory,
  Shield,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  Users,
  AlertCircle,
  CheckCircle,
  X,
  BookOpen,
  Award,
  GraduationCap,
  Clock,
  Target,
} from 'lucide-react'
import { useSmoothScroll } from '@/hooks/useSmoothScroll'
import {
  PROFIT_PYRAMID,
  COMPONENTS,
  DOMESTIC_ASSESSMENT,
  CORE_CONCLUSIONS,
  CAREER_PATHS,
  TECH_NAV_ITEMS,
} from '@/data/tech_data'
import { getJobCategories, getDetailedJobs } from '@/api/services'
import {
  HIGH_PAY_JOBS,
  CATEGORIES,
  FOUNDATION_SKILLS,
  FOUNDATION_RESOURCES,
  type HighPayJob,
} from '@/data/career_guide'
import type { TechComponent } from '@/data/tech_data'
import { TechDeconstructionSkeleton } from '@/components/LoadingSkeletons'
import SectionAnchor from '@/components/SectionAnchor'
import SectionTitle from '@/components/SectionTitle'
import StarRating from '@/components/StarRating'
import SideNav from '@/components/SideNav'
import type { SideNavItem } from '@/components/SideNav'

// API 响应类型（避免 any）
interface APISkill {
  name: string
  description?: string
}
interface APIStage {
  stage_number: number
  title: string
  duration: string
  skills?: APISkill[]
}
interface APIResource {
  resource_type?: string
  title: string
  description?: string
  link?: string
}
interface APIProject {
  steps: unknown
}
interface APIJobItem {
  id?: string
  job_key?: string
  category_name?: string
  title?: string
  company?: string
  salary?: string
  education?: string
  duration?: string
  intro?: string
  stages?: APIStage[]
  resources?: APIResource[]
  project?: APIProject
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

function PageNavBar() {
  const navigate = useNavigate()
  const { scrollTo } = useSmoothScroll()
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-warm-bg/80 dark:bg-[#1C1B1A]/90 backdrop-blur-xl border-b border-warm-border">
      <div className="max-w-[1200px] mx-auto h-full flex items-center justify-between px-4 lg:px-6">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-warm-text" />
          <span className="text-xl font-bold text-warm-dark dark:text-[#F0EEE7] font-display">
            岗位拆解
          </span>
        </button>
        <div className="hidden lg:flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {TECH_NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => scrollTo(item.id)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate('/antibody')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors"
        >
          <Cpu className="w-3.5 h-3.5" />
          概念抗体
        </button>
      </div>
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-[120px] pb-16 px-4 lg:px-6">
      <motion.div
        className="max-w-[1200px] mx-auto text-center"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
        }}
      >
        <motion.div
          variants={itemVariants}
          className="w-[120px] h-px bg-warm-border mx-auto mb-8"
        />
        <motion.h1
          variants={itemVariants}
          className="text-5xl md:text-[56px] font-bold text-warm-dark dark:text-[#F0EEE7] leading-tight tracking-tight font-display"
        >
          岗位拆解
        </motion.h1>
        <motion.p
          variants={itemVariants}
          className="text-lg md:text-[22px] text-warm-text mt-5 max-w-[680px] mx-auto leading-relaxed"
        >
          从芯片到系统，拆解万亿产业链的核心岗位与利润分配
        </motion.p>
        <motion.div
          variants={itemVariants}
          className="flex items-center justify-center gap-6 md:gap-10 mt-8"
        >
          {[
            { n: '20', l: '核心部件' },
            { n: '4', l: '利润层级' },
            { n: '55%', l: '中国能造' },
            { n: '4', l: '职业阶梯' },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-warm-accent">{s.n}</div>
              <div className="text-xs text-warm-text mt-0.5">{s.l}</div>
            </div>
          ))}
        </motion.div>
        <motion.div
          variants={itemVariants}
          className="mt-8 flex items-center justify-center gap-3 flex-wrap"
        >
          <button
            onClick={() =>
              document.getElementById('components')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-1.5 px-6 py-3 rounded-lg text-white text-sm font-semibold bg-gradient-to-br from-[#D4853B] to-[#E8A85C] hover:scale-[1.02] hover:shadow-glow transition-all"
          >
            <Factory className="w-4 h-4" />
            看20个部件
          </button>
          <button
            onClick={() =>
              document.getElementById('profit-pyramid')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg text-warm-dark text-sm font-semibold bg-white border-2 border-warm-border hover:border-warm-accent hover:text-warm-accent transition-all"
          >
            <DollarSign className="w-4 h-4" />
            利润金字塔
          </button>
          <button
            onClick={() =>
              document.getElementById('domestic')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg text-warm-dark text-sm font-semibold bg-white border-2 border-warm-border hover:border-warm-accent hover:text-warm-accent transition-all"
          >
            <Shield className="w-4 h-4" />
            国产替代
          </button>
          <button
            onClick={() =>
              document.getElementById('career-paths')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg text-warm-dark text-sm font-semibold bg-white border-2 border-warm-border hover:border-warm-accent hover:text-warm-accent transition-all"
          >
            <TrendingUp className="w-4 h-4" />
            职业路径
          </button>
          <button
            onClick={() =>
              document.getElementById('career-guide')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-lg text-warm-dark text-sm font-semibold bg-white border-2 border-warm-border hover:border-warm-accent hover:text-warm-accent transition-all"
          >
            <BookOpen className="w-4 h-4" />
            高薪岗指南
          </button>
        </motion.div>
      </motion.div>
    </section>
  )
}

function ProfitPyramidSection() {
  return (
    <SectionAnchor id="profit-pyramid">
      <section className="py-12 px-4 lg:px-6 bg-white/50 dark:bg-[#252423]/50">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle
            icon={DollarSign}
            title="利润金字塔"
            subtitle="从芯片到系统，按利润从高到低排列 —— 利润去哪了一目了然"
          />
          <div className="space-y-3">
            {PROFIT_PYRAMID.map((layer, i) => (
              <motion.div
                key={layer.level}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border-l-4 p-5 shadow-card bg-white dark:bg-[#252423]"
                style={{ borderLeftColor: layer.color }}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold" style={{ color: layer.color }}>
                        {layer.level}
                      </span>
                      <span className="text-xs text-warm-text bg-warm-bg px-2 py-0.5 rounded-full">
                        {layer.label}
                      </span>
                    </div>
                    <p className="text-sm text-warm-dark font-medium mb-1">
                      {layer.components.join(' / ')}
                    </p>
                    <p className="text-xs text-warm-text">{layer.barrier}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-6 bg-warm-dark rounded-xl p-5 text-center">
            <p className="text-white/60 text-xs mb-1">核心洞察</p>
            <p className="text-white text-base font-medium">
              中国能造 <span className="text-warm-accent font-bold">80%</span>{' '}
              的部件（物料成本55%），但缺失的 <span className="text-red-400 font-bold">20%</span>{' '}
              恰恰是利润最高的部分（芯片+基带+专利费）
            </p>
          </div>
        </div>
      </section>
    </SectionAnchor>
  )
}

function ComponentCard({ comp }: { comp: TechComponent }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <motion.div
      layout
      className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border shadow-card overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-warm-bg/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-warm-dark text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {comp.id.slice(1)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-warm-dark text-sm">{comp.name}</h3>
              <span className="text-[10px] text-warm-text bg-warm-bg px-1.5 py-0.5 rounded">
                {comp.nameEn}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating rating={comp.starRating} />
              <span className="text-[10px] text-warm-text">国产替代</span>
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-warm-text" />
        ) : (
          <ChevronDown className="w-4 h-4 text-warm-text" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-warm-text">
                <strong className="text-warm-dark">供应商：</strong>
                {comp.vendors}
              </p>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-medium mb-1">大白话</p>
                <p className="text-sm text-amber-900">{comp.principle}</p>
              </div>
              <div>
                <p className="text-xs text-warm-text font-medium mb-1.5">怎么造（关键步骤）</p>
                <ol className="space-y-1">
                  {comp.manufacturing.map((step, i) => (
                    <li key={step} className="text-xs text-warm-text flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-warm-bg text-warm-accent text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <p className="text-xs text-red-600 font-medium mb-1">核心难点</p>
                <ul className="space-y-1">
                  {comp.painPoints.map((p) => (
                    <li key={p} className="text-xs text-red-700 flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs text-green-700 font-medium mb-1">国产能力</p>
                <p className="text-sm text-green-800">{comp.domestic}</p>
              </div>
              <div className="bg-warm-dark rounded-lg p-3">
                <p className="text-xs text-warm-accent font-medium mb-1">普通人怎么进这个职业</p>
                <p className="text-sm text-white">{comp.careerEntry}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function ComponentsSection() {
  return (
    <SectionAnchor id="components">
      <section className="py-12 px-4 lg:px-6">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle
            icon={Factory}
            title="20 个核心部件拆解"
            subtitle="点击展开看每个部件的：大白话原理 / 怎么造 / 核心难点 / 国产能力 / 职业入口"
          />
          <p className="text-center text-sm text-warm-text mb-4">
            星级 = 国产替代进度（★★★★★ = 中国完全主导，★☆☆☆☆ = 差距巨大）
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {COMPONENTS.map((comp) => (
              <ComponentCard key={comp.id} comp={comp} />
            ))}
          </div>
        </div>
      </section>
    </SectionAnchor>
  )
}

function DomesticSection() {
  return (
    <SectionAnchor id="domestic">
      <section className="py-12 px-4 lg:px-6 bg-white/50 dark:bg-[#252423]/50">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle
            icon={Star}
            title="国产替代五维评估"
            subtitle={'从"完全主导"到"差距巨大"—— 看清中国在每个领域的真实位置'}
          />
          <div className="space-y-3">
            {DOMESTIC_ASSESSMENT.map((item, i) => (
              <motion.div
                key={item.dimension}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-4 shadow-card"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-4 h-4 ${s <= item.stars ? 'text-warm-accent fill-warm-accent' : 'text-warm-border'}`}
                      />
                    ))}
                  </div>
                  <h3 className="font-bold text-warm-dark text-sm">{item.dimension}</h3>
                </div>
                <p className="text-sm text-warm-dark mb-1">{item.components}</p>
                <p className="text-xs text-warm-text">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </SectionAnchor>
  )
}

function ConclusionsSection() {
  return (
    <SectionAnchor id="conclusions">
      <section className="py-12 px-4 lg:px-6">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle icon={AlertCircle} title="核心结论" subtitle="三个问题的答案" />
          <div className="space-y-4">
            {CORE_CONCLUSIONS.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-warm-dark rounded-xl p-5"
              >
                <h3 className="text-warm-accent text-sm font-bold mb-1">{c.title}</h3>
                <p className="text-white text-base font-medium mb-2">{c.answer}</p>
                <p className="text-white/70 text-sm leading-relaxed">{c.details}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </SectionAnchor>
  )
}

function CareerPathsSection() {
  return (
    <SectionAnchor id="career-paths">
      <section className="py-12 px-4 lg:px-6 bg-white/50 dark:bg-[#252423]/50">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle
            icon={Users}
            title="普通人怎么进入高科技产业"
            subtitle={'从"产线技术员"到"芯片架构师"—— 4 个阶梯，总有一个适合你'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CAREER_PATHS.map((path, i) => (
              <motion.div
                key={path.level}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-5 shadow-card"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: path.color }} />
                  <h3 className="font-bold text-warm-dark text-sm">{path.level}</h3>
                  <span className="text-[10px] text-warm-text bg-warm-bg px-2 py-0.5 rounded-full ml-auto">
                    {path.salaryRange}
                  </span>
                </div>
                <p className="text-xs text-warm-accent font-medium mb-2">{path.label}</p>
                <div className="space-y-2 mb-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-warm-text">
                      <strong className="text-warm-dark">门槛：</strong>
                      {path.entryBarrier}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-warm-text">
                      <strong className="text-warm-dark">学历/培训：</strong>
                      {path.education}
                    </p>
                  </div>
                </div>
                <div className="bg-warm-bg rounded-lg p-3">
                  <p className="text-[10px] text-warm-text font-medium mb-1.5">典型岗位</p>
                  <ul className="space-y-1">
                    {path.examples.map((ex, j) => (
                      <li key={j} className="text-xs text-warm-dark flex items-start gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-warm-accent mt-1.5 flex-shrink-0" />
                        {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-6 bg-warm-accent/10 rounded-xl border border-warm-accent/30 p-4 text-center"
          >
            <p className="text-sm text-warm-dark font-medium">
              关键原则：<strong>不要一上来就追芯片设计</strong>
              （差距5年）。先在能赢的地方站稳脚跟，再向上攀升。
            </p>
            <p className="text-xs text-warm-text mt-1">
              低利润层（★★★★★）产能大、需求稳、入门门槛低，是中国普通人的主战场。
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-4"
          >
            <button
              onClick={() =>
                document.getElementById('career-guide')?.scrollIntoView({ behavior: 'smooth' })
              }
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold bg-gradient-to-br from-[#D4853B] to-[#E8A85C] hover:scale-[1.02] hover:shadow-glow transition-all"
            >
              <BookOpen className="w-4 h-4" />
              查看高薪技术岗完整指南
            </button>
          </motion.div>
        </div>
      </section>
    </SectionAnchor>
  )
}

function CareerGuideSection() {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedJob, setSelectedJob] = useState<HighPayJob | null>(null)
  const [jobs, setJobs] = useState<HighPayJob[]>([])
  const [categories, setCategories] = useState<{ name: string; icon: string; id: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取分类（通过 apiClient 统一处理）
        const cats = await getJobCategories()
        if (cats && cats.length > 0) {
          setCategories(cats)
          setSelectedCategory(cats[0].name)
        }

        // 用带详情接口一次性获取（N+1优化）
        const rawJobs = (await getDetailedJobs()) as APIJobItem[]
        if (rawJobs && rawJobs.length > 0) {
          const validJobs = rawJobs.map(
            (d: APIJobItem) =>
              ({
                id: d.job_key || d.id,
                category: d.category_name,
                title: d.title,
                companies: d.company ? d.company.split('、') : [],
                salary: d.salary || '',
                education: d.education || '',
                duration: d.duration || '',
                definition: d.intro || '',
                stages:
                  d.stages?.map((s: APIStage) => ({
                    stage: `Stage ${s.stage_number}`,
                    title: s.title,
                    duration: s.duration,
                    skills:
                      s.skills?.map((sk: APISkill) => ({
                        name: sk.name,
                        desc: sk.description || '',
                      })) || [],
                  })) || [],
                resources:
                  d.resources?.map((r: APIResource) => ({
                    type: r.resource_type || '',
                    title: r.title,
                    desc: r.description || '',
                    link: r.link || '',
                  })) || [],
                project:
                  d.project && d.project.steps
                    ? typeof d.project.steps === 'string'
                      ? (() => {
                          try {
                            return JSON.parse(d.project.steps)
                          } catch {
                            console.warn('无法解析 project.steps:', d.project.steps)
                            return []
                          }
                        })()
                      : d.project.steps
                    : [],
              }) as HighPayJob,
          )
          if (validJobs.length > 0) {
            setJobs(validJobs)
            setLoading(false)
            return
          }
        }
      } catch (error) {
        console.error('Failed to fetch job data from API:', error)
      }
      // 回退到静态数据
      console.log('Using fallback static data')
      setJobs(HIGH_PAY_JOBS)
      setCategories(CATEGORIES.map((c) => ({ name: c.name, icon: c.icon, id: 0 })))
      setSelectedCategory(CATEGORIES[0].name)
      setLoading(false)
    }

    fetchData()
  }, [])

  const filteredJobs = jobs.filter((job) => job.category === selectedCategory)

  if (loading) {
    return <TechDeconstructionSkeleton />
  }

  return (
    <SectionAnchor id="career-guide">
      <section className="py-12 px-4 lg:px-6">
        <div className="max-w-[1200px] mx-auto">
          <SectionTitle
            icon={BookOpen}
            title="高薪技术岗拆解手册"
            subtitle="普通人从零到入职的完整路线图 —— 不要一上来就追芯片设计，先在能赢的地方站稳脚跟"
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border shadow-card p-6 mb-6"
          >
            <h3 className="text-sm font-bold text-warm-dark mb-4">
              所有高薪岗都要的通用底子（必学）
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {FOUNDATION_SKILLS.map((skill) => (
                <div key={skill.name} className="bg-warm-bg rounded-lg p-3">
                  <p className="text-xs font-bold text-warm-dark">{skill.name}</p>
                  <p className="text-[10px] text-warm-text mt-1 line-clamp-2">{skill.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <h4 className="text-xs font-medium text-warm-text mb-2">学习资源</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {FOUNDATION_RESOURCES.slice(0, 4).map((res) => (
                  <a
                    key={res.title}
                    href={res.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-amber-50 rounded-lg p-2 text-left hover:bg-amber-100 transition-colors"
                  >
                    <p className="text-[10px] text-amber-600 font-medium">{res.type}</p>
                    <p className="text-xs text-amber-800 line-clamp-1">{res.title}</p>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="flex flex-wrap gap-2 mb-6">
            {categories.map((cat) => (
              <button
                key={cat.name}
                onClick={() => {
                  setSelectedCategory(cat.name)
                  setSelectedJob(null)
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedCategory === cat.name
                    ? 'bg-warm-accent text-white'
                    : 'bg-white dark:bg-[#252423] border border-warm-border text-warm-dark hover:border-warm-accent'
                }`}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 space-y-2">
              {filteredJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedJob?.id === job.id
                      ? 'border-warm-accent bg-warm-accent/5'
                      : 'border-warm-border hover:border-warm-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-bold text-warm-dark">{job.title}</h3>
                    <span className="text-[10px] bg-warm-accent/20 text-warm-accent px-2 py-0.5 rounded">
                      {job.salary}
                    </span>
                  </div>
                  <p className="text-xs text-warm-text">{job.companies.slice(0, 3).join(' / ')}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-warm-text">
                      <GraduationCap className="w-3 h-3 inline mr-1" />
                      {job.education}
                    </span>
                    <span className="text-[10px] text-warm-text">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {job.duration}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {selectedJob ? (
                  <motion.div
                    key={selectedJob.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border shadow-card overflow-hidden"
                  >
                    <div className="bg-gradient-to-r from-warm-dark to-warm-accent/20 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="text-lg font-bold text-white">{selectedJob.title}</h2>
                          <p className="text-white/80 text-sm mt-1">{selectedJob.definition}</p>
                        </div>
                        <button
                          onClick={() => setSelectedJob(null)}
                          className="text-white/60 hover:text-white"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="bg-white/20 text-white text-xs px-2 py-1 rounded">
                          {selectedJob.salary}
                        </span>
                        <span className="bg-white/20 text-white text-xs px-2 py-1 rounded">
                          {selectedJob.education}
                        </span>
                        <span className="bg-white/20 text-white text-xs px-2 py-1 rounded">
                          {selectedJob.duration}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-6">
                      <div>
                        <h3 className="text-sm font-bold text-warm-dark mb-3 flex items-center gap-2">
                          <Target className="w-4 h-4 text-warm-accent" />
                          入门路线（三个阶段）
                        </h3>
                        <div className="space-y-3">
                          {selectedJob.stages.map((stage, i) => (
                            <div key={stage.title} className="bg-warm-bg rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 rounded-full bg-warm-accent text-white text-xs font-bold flex items-center justify-center">
                                  {i + 1}
                                </span>
                                <span className="text-sm font-bold text-warm-dark">
                                  {stage.title}
                                </span>
                                <span className="text-xs text-warm-text bg-white px-2 py-0.5 rounded">
                                  {stage.duration}
                                </span>
                              </div>
                              <ul className="space-y-2">
                                {stage.skills.map((skill, j) => (
                                  <li key={j} className="flex items-start gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-warm-accent mt-1.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-xs font-medium text-warm-dark">
                                        {skill.name}
                                      </p>
                                      <p className="text-[10px] text-warm-text mt-0.5">
                                        {skill.desc}
                                      </p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-warm-dark mb-3 flex items-center gap-2">
                          <Award className="w-4 h-4 text-warm-accent" />
                          推荐学习资源
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {selectedJob.resources.map((res) => (
                            <div
                              key={res.title}
                              className="flex items-center gap-2 bg-warm-bg rounded-lg p-3"
                            >
                              <div className="w-8 h-8 rounded-lg bg-warm-accent/20 flex items-center justify-center">
                                <span className="text-xs font-bold text-warm-accent">
                                  {res.type.slice(0, 2)}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-warm-dark truncate">
                                  {res.title}
                                </p>
                                <p className="text-[10px] text-warm-text truncate">{res.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                        <h3 className="text-sm font-bold text-green-800 mb-3">跟着做：实战项目</h3>
                        <ol className="space-y-1.5">
                          {selectedJob.project.map((step, i) => (
                            <li key={step} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <p className="text-xs text-green-900">{step}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border shadow-card p-8 text-center"
                  >
                    <BookOpen className="w-12 h-12 text-warm-accent/30 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-warm-dark mb-2">
                      选择一个岗位查看详细指南
                    </h3>
                    <p className="text-sm text-warm-text">
                      从左侧列表选择一个高薪技术岗，查看从零到入职的完整路线图
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
    </SectionAnchor>
  )
}

export default function TechDeconstruction() {
  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#1C1B1A]">
      <PageNavBar />
      <SideNav items={TECH_NAV_ITEMS as SideNavItem[]} extraItems={[{ id: 'career-guide', label: '高薪岗指南', icon: '指南' }]} />
      <HeroSection />
      <ProfitPyramidSection />
      <ComponentsSection />
      <DomesticSection />
      <ConclusionsSection />
      <CareerPathsSection />
      <CareerGuideSection />
      <footer className="py-8 text-center border-t border-warm-border bg-white/30 dark:bg-[#252423]/30">
        <p className="text-sm text-warm-text">岗位拆解模块 · 万亿产业链全维度拆解</p>
      </footer>
    </div>
  )
}
