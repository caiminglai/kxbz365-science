import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Search,
  Brain,
  Zap,
  Users,
  BookOpen,
  AlertTriangle,
  ChevronRight,
  Star,
  RotateCcw,
  CheckCircle2,
  FlaskConical,
  Trophy,
  Target,
  Eye,
  BarChart3,
  Clock,
  ArrowLeft,
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { getConceptAntibodies } from '../api/services'
import type { ConceptAntibodyEntry } from '../api/types'

// ========== 五类忽悠数据 ==========
const fraudTypes = [
  {
    id: 'rhetoric',
    name: '修辞堆砌型',
    icon: BookOpen,
    color: '#B8783A',
    desc: '把简单概念用复杂修辞包装',
    examples:
      '赋能、生态化反、颗粒度、抓手、底层逻辑、组合拳、闭环、链路、矩阵、裂变、对齐、拉通、对焦、落地、沉淀',
    test: '把这些词全部删掉，看句子是否还通顺。删掉后意思不变？就是修辞堆砌。',
    badge: '黑话过滤器',
  },
  {
    id: 'acronym',
    name: '缩写恐吓型',
    icon: AlertTriangle,
    color: '#A45D6A',
    desc: '用英文缩写制造信息壁垒',
    examples:
      'RLHF、RAG、CoT、API、SDK、SaaS、PaaS、IaaS、KPI、OKR、ROI、GMV、DAU、LTV、ESG、VaR、QE、MLF、LPR',
    test: '要求对方写出全称并用人话解释。写不出或解释不清？说明他自己也不懂，只是在用缩写装懂。',
    badge: '缩写解码器',
  },
  {
    id: 'rebrand',
    name: '新旧换瓶型',
    icon: RotateCcw,
    color: '#5B7BA0',
    desc: '老概念起新名字，假装创新',
    examples:
      '大数据=统计学+计算机、AI=函数拟合、区块链=分布式账本+密码学、元宇宙=VR+社交网络、新质生产力=高科技驱动的生产力',
    test: '追问：这个概念十年前叫什么？如果答案是某个你已知的概念，就是换瓶。真正的创新会创造新的数学结构。',
    badge: '新瓶检测器',
  },
  {
    id: 'authority',
    name: '权威绑架型',
    icon: Users,
    color: '#7B6BA0',
    desc: '用权威、趋势、未来恐吓你',
    examples:
      '这是趋势、未来已来、不跟上就淘汰、某某大佬都在做、国家战略、国际惯例、风口来了、赛道对了',
    test: '把"趋势"换成"流行"，把"未来"换成"明年"，看逻辑是否还成立。论证依赖时间压力而非逻辑必然？就是绑架。',
    badge: '权威解绑器',
  },
  {
    id: 'math-scare',
    name: '数学恐吓型',
    icon: BarChart3,
    color: '#6B7B5E',
    desc: '用复杂公式吓唬非专业人士',
    examples: 'PPT里放满偏微分方程、矩阵分解、概率图模型，但从不解释其物理意义',
    test: '要求对方解释公式中每个符号的物理/日常含义。解释不了？说明公式是装饰品。真正的专家能用三种方式解释同一个公式。',
    badge: '公式透视器',
  },
]

// ========== 认知等级 ==========
const levels = [
  {
    level: 1,
    name: '术语消费者',
    icon: Eye,
    desc: '听到新词就查百度，记住定义，能复述但不懂。',
    risk: '容易被忽悠，因为只记住了包装纸。',
    ability: '被动接受',
  },
  {
    level: 2,
    name: '类比翻译者',
    icon: Search,
    desc: '能把新词翻译成日常语言，找到熟悉类比。',
    risk: '不容易被修辞吓到，但可能被数学恐吓。',
    ability: '人话翻译',
  },
  {
    level: 3,
    name: '结构识别者',
    icon: Target,
    desc: '能识别新概念背后的数学/逻辑结构。',
    risk: '能判断创新的真假，不被换瓶术迷惑。',
    ability: '结构穿透',
  },
  {
    level: 4,
    name: '权力分析者',
    icon: Brain,
    desc: '能分析术语背后的利益格局，知道谁在通过这个词获利。',
    risk: '能看穿政策、商业、学术中的话语策略。',
    ability: '权力透视',
  },
  {
    level: 5,
    name: '概念建构者',
    icon: Trophy,
    desc: '不仅能解构别人的概念，还能自己创造清晰、跨学科、可验证的概念框架。',
    risk: '成为规则的制定者而非接受者。',
    ability: '概念创造',
  },
]

// ========== 可信度评分问题 ==========
const scoreQuestions = [
  { q: '这个说法能否被实验证明错误？', low: '完全无法验证', high: '可以设计实验验证' },
  { q: '说话者是否从中获利？', low: '直接获利（销售/融资）', high: '无直接利益（独立学者）' },
  { q: '说话者过去的预测准不准？', low: '经常被打脸', high: '历史准确率很高' },
  { q: '每句话里有多少黑话？', low: '密度极高，听不懂', high: '大白话，清晰易懂' },
  { q: '是否主动呈现反对意见？', low: '只讲一面，回避质疑', high: '主动讨论反方观点' },
]

export default function ConceptAntibody() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'steps' | 'frauds' | 'tools' | 'levels'>('steps')
  const [stepTerm, setStepTerm] = useState('')
  const [activeStep, setActiveStep] = useState(0)
  const [scores, setScores] = useState<number[]>(new Array(scoreQuestions.length).fill(5))
  const [fourGrid, setFourGrid] = useState({
    term: '',
    source: '',
    daily: '',
    math: '',
    promoter: '',
    profit: '',
    decade: '',
  })

  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

  // 后台「概念抗体」页签录入的真实案例。空数组或请求失败都保持整页与接入接口前一模一样
  const [antibodyLibrary, setAntibodyLibrary] = useState<ConceptAntibodyEntry[]>([])

  useEffect(() => {
    let cancelled = false
    getConceptAntibodies()
      .then((list) => {
        if (!cancelled && Array.isArray(list)) setAntibodyLibrary(list)
      })
      .catch(() => {
        // 这是增强区块，接口异常不能冒泡成页面报错或空态占位
      })
    return () => {
      cancelled = true
    }
  }, [])

  const tabs = [
    { id: 'steps' as const, label: '三步还原法', icon: FlaskConical },
    { id: 'frauds' as const, label: '五类忽悠识别', icon: Shield },
    { id: 'tools' as const, label: '实战工具箱', icon: Zap },
    { id: 'levels' as const, label: '认知升级路径', icon: Trophy },
  ]

  return (
    <div className="min-h-screen bg-warm-bg dark:bg-[#1C1B1A]">
      {/* 返回按钮 */}
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/80 dark:bg-[#252423]/80 dark:border-[#3A3835] backdrop-blur-sm border border-warm-border
            text-sm text-warm-text hover:text-warm-dark hover:border-warm-accent transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回首页
        </button>
      </div>

      {/* Hero区 */}
      <section className="pt-24 pb-12 px-4">
        <div className="max-w-[900px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-warm-accent to-[#E8A85C] flex items-center justify-center mx-auto mb-6 shadow-glow">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-warm-dark dark:text-[#F0EEE7] font-display mb-4">
              概念抗体
            </h1>
            <p className="text-lg text-warm-text max-w-[600px] mx-auto leading-relaxed">
              终身防忽悠方法论。不是记忆术语对照表，而是一种元认知能力——
              <span className="text-warm-accent font-medium">
                遇到任何新概念，三步之内还原本质。
              </span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* 标签导航 */}
      <div className="sticky top-16 z-30 bg-warm-bg/90 dark:bg-[#1C1B1A]/90 dark:border-[#3A3835] backdrop-blur-md border-b border-warm-border">
        <div className="max-w-[900px] mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide py-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === t.id
                    ? 'bg-warm-dark dark:bg-[#252423] text-warm-bg'
                    : 'text-warm-text hover:text-warm-dark hover:bg-white dark:hover:bg-[#252423]'
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[900px] mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {/* ===== 三步还原法 ===== */}
          {activeTab === 'steps' && (
            <motion.div
              key="steps"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* 输入框 */}
              <div className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-6 mb-8">
                <label className="block text-sm font-medium text-warm-dark dark:text-[#F0EEE7] mb-2">
                  输入一个你遇到的术语
                </label>
                <input
                  type="text"
                  value={stepTerm}
                  onChange={(e) => setStepTerm(e.target.value)}
                  placeholder="例如：赋能、元宇宙、新质生产力、区块链..."
                  className="w-full h-12 px-4 rounded-xl bg-warm-bg dark:bg-[#1C1B1A] dark:text-[#E8E6E0] dark:border-[#3A3835] border-2 border-warm-border text-warm-dark
                    placeholder:text-warm-text/40 focus:outline-none focus:border-warm-accent focus:ring-4 focus:ring-warm-accent/15
                    transition-all text-base"
                />
                {stepTerm && (
                  <p className="text-xs text-warm-text mt-2">
                    已输入："{stepTerm}"，按下面三步拆解它
                  </p>
                )}
              </div>

              {/* 三步卡片 */}
              <div className="space-y-4">
                {/* 第一步 */}
                <StepCard
                  number={1}
                  title="物理还原"
                  subtitle="它在描述什么日常现象？"
                  icon={Search}
                  color="#5B7BA0"
                  expanded={activeStep === 1}
                  onClick={() => setActiveStep(activeStep === 1 ? 0 : 1)}
                  term={stepTerm}
                >
                  <p className="text-sm text-warm-text mb-3">
                    把这个概念讲给菜市场大妈/工地包工头/农村老太太，他们会怎么理解？
                  </p>
                  <CheckList
                    items={[
                      '能不能用一个日常动作类比？（如梯度下降=下山）',
                      '能不能用一个家庭场景类比？（如反馈=空调恒温）',
                      '能不能用一个身体感受类比？（如过拟合=死记硬背）',
                    ]}
                  />
                  <WarnBox text="如果找不到日常类比，说明这个概念要么极其前沿（如量子纠缠），要么故意模糊（如赋能、生态化反）。" />
                </StepCard>

                {/* 第二步 */}
                <StepCard
                  number={2}
                  title="数学还原"
                  subtitle="它的数学/逻辑本质是什么？"
                  icon={Target}
                  color="#B8783A"
                  expanded={activeStep === 2}
                  onClick={() => setActiveStep(activeStep === 2 ? 0 : 2)}
                  term={stepTerm}
                >
                  <p className="text-sm text-warm-text mb-3">
                    一切可量化的概念，最终都能还原为数学结构。
                  </p>
                  <CheckList
                    items={[
                      '有没有一个公式能表达它？（如注意力=softmax(QK^T)V）',
                      '它是不是某个已知算法的变种？（如扩散模型=朗之万动力学+神经网络）',
                      '它是不是某个数学结构的重新命名？（如张量=多维数组）',
                    ]}
                  />
                  <WarnBox text="如果找不到数学本质，说明这个概念要么是纯修辞（如元宇宙），要么是多个已知概念的缝合怪。" />
                </StepCard>

                {/* 第三步 */}
                <StepCard
                  number={3}
                  title="权力还原"
                  subtitle="谁在通过这个名字获利？"
                  icon={Users}
                  color="#A45D6A"
                  expanded={activeStep === 3}
                  onClick={() => setActiveStep(activeStep === 3 ? 0 : 3)}
                  term={stepTerm}
                >
                  <p className="text-sm text-warm-text mb-3">
                    术语不是中立的。每一个新词的创造和推广，都伴随着权力的重新分配。
                  </p>
                  <CheckList
                    items={[
                      '这个词最早出现在哪里？（学术论文？咨询报告？营销文案？）',
                      '使用这个词的人获得了什么？（融资？升职？政策倾斜？客户信任？）',
                      '如果不使用这个词，会有什么损失？（被排除在对话之外？被视为外行？拿不到预算？）',
                    ]}
                  />
                  <WarnBox text="如果答案指向使用这个词的人明显获利，而理解这个词的人没有，那么这是一个权力术语而非知识术语。" />
                </StepCard>
              </div>

              {/* 最终判断 */}
              {stepTerm && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-6 bg-gradient-to-r from-warm-dark to-[#2a2a4e] rounded-xl p-6 text-white"
                >
                  <h3 className="text-lg font-semibold font-display mb-2">最终判断标准</h3>
                  <p className="text-sm text-white/70 leading-relaxed">
                    一个概念如果不能被
                    <span className="text-[#5B7BA0] font-medium">日常语言解释</span>、不能被
                    <span className="text-[#B8783A] font-medium">数学结构表达</span>、不能被
                    <span className="text-[#A45D6A] font-medium">权力分析定位</span>，
                    那么它大概率不是知识，而是修辞。
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ===== 五类忽悠识别 ===== */}
          {activeTab === 'frauds' && (
            <motion.div
              key="frauds"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {fraudTypes.map((f, i) => (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-5 hover:shadow-card transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: f.color + '15' }}
                    >
                      <f.icon className="w-5 h-5" style={{ color: f.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                          {f.name}
                        </h3>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: f.color + '15', color: f.color }}
                        >
                          {f.badge}
                        </span>
                      </div>
                      <p className="text-sm text-warm-text mb-2">{f.desc}</p>
                      <p className="text-xs text-warm-text/70 mb-3 p-2 bg-warm-bg dark:bg-[#1C1B1A] rounded-lg">
                        {f.examples}
                      </p>
                      <div
                        className="flex items-start gap-2 p-3 rounded-lg"
                        style={{ backgroundColor: f.color + '08' }}
                      >
                        <CheckCircle2
                          className="w-4 h-4 flex-shrink-0 mt-0.5"
                          style={{ color: f.color }}
                        />
                        <p className="text-sm" style={{ color: f.color }}>
                          {f.test}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* ===== 实战工具箱 ===== */}
          {activeTab === 'tools' && (
            <motion.div
              key="tools"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* 工具1：术语拆解表 */}
              <div className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <FlaskConical className="w-5 h-5 text-warm-accent" />
                  <h3 className="text-lg font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                    术语拆解表
                  </h3>
                </div>
                <p className="text-sm text-warm-text mb-4">遇到任何新术语，填完四格，本质自现。</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="col-span-2">
                    <label className="text-xs text-warm-text">术语名称</label>
                    <input
                      type="text"
                      value={fourGrid.term}
                      onChange={(e) => setFourGrid({ ...fourGrid, term: e.target.value })}
                      placeholder="输入术语..."
                      className="w-full h-10 px-3 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-warm-text">全称/来源</label>
                    <textarea
                      value={fourGrid.source}
                      onChange={(e) => setFourGrid({ ...fourGrid, source: e.target.value })}
                      placeholder="全称和出处"
                      className="w-full h-16 p-2 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm resize-none focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-warm-text">日常类比</label>
                    <textarea
                      value={fourGrid.daily}
                      onChange={(e) => setFourGrid({ ...fourGrid, daily: e.target.value })}
                      placeholder="用大白话解释"
                      className="w-full h-16 p-2 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm resize-none focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-warm-text">数学本质</label>
                    <textarea
                      value={fourGrid.math}
                      onChange={(e) => setFourGrid({ ...fourGrid, math: e.target.value })}
                      placeholder="背后的数学/逻辑"
                      className="w-full h-16 p-2 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm resize-none focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-warm-text">十年前叫什么</label>
                    <textarea
                      value={fourGrid.decade}
                      onChange={(e) => setFourGrid({ ...fourGrid, decade: e.target.value })}
                      placeholder="是否换瓶"
                      className="w-full h-16 p-2 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm resize-none focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-warm-text">谁在推广 / 获利</label>
                    <textarea
                      value={fourGrid.promoter}
                      onChange={(e) => setFourGrid({ ...fourGrid, promoter: e.target.value })}
                      placeholder="权力分析：谁发明这个词？谁获利？"
                      className="w-full h-16 p-2 rounded-lg bg-warm-bg dark:bg-[#1C1B1A] dark:border-[#3A3835] border border-warm-border text-sm resize-none focus:border-warm-accent focus:outline-none"
                    />
                  </div>
                </div>

                {fourGrid.term && (
                  <div className="p-4 rounded-lg bg-warm-dark text-white text-sm">
                    <p className="font-medium mb-1">{fourGrid.term} 拆解结果：</p>
                    <p className="text-white/60">
                      {!fourGrid.daily ? '❌ 找不到日常类比 → 可能是故意模糊' : '✅ 有日常类比'}
                      {' | '}
                      {!fourGrid.math ? '❌ 找不到数学本质 → 可能是纯修辞' : '✅ 有数学本质'}
                      {' | '}
                      {fourGrid.decade ? '⚠️ 十年前就有 → 换瓶术' : '可能是新概念'}
                      {' | '}
                      {fourGrid.promoter ? '⚠️ 有人从中获利 → 注意权力术语' : '未做权力分析'}
                    </p>
                  </div>
                )}
              </div>

              {/* 工具2：可信度评分卡 */}
              <div className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-warm-accent" />
                  <h3 className="text-lg font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                    可信度评分卡
                  </h3>
                </div>
                <p className="text-sm text-warm-text mb-4">
                  给信息源打分，总分低于5分自动进入待验证区。
                </p>

                <div className="space-y-4">
                  {scoreQuestions.map((item, i) => (
                    <div key={item.q} className="p-4 rounded-lg bg-warm-bg dark:bg-[#1C1B1A]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-warm-dark dark:text-[#F0EEE7]">
                          {item.q}
                        </span>
                        <span className="text-sm font-bold text-warm-accent">{scores[i]}/10</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={scores[i]}
                        onChange={(e) => {
                          const newScores = [...scores]
                          newScores[i] = parseInt(e.target.value)
                          setScores(newScores)
                        }}
                        className="w-full h-2 rounded-full appearance-none bg-warm-border cursor-pointer accent-warm-accent"
                      />
                      <div className="flex justify-between text-[11px] text-warm-text mt-1">
                        <span>{item.low} (0)</span>
                        <span>{item.high} (10)</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 总分 */}
                <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-warm-dark to-[#2a2a4e] text-white text-center">
                  <p className="text-sm text-white/60 mb-1">综合可信度</p>
                  <p
                    className={`text-4xl font-bold ${avgScore >= 7 ? 'text-green-400' : avgScore >= 5 ? 'text-amber-400' : 'text-red-400'}`}
                  >
                    {avgScore.toFixed(1)}
                  </p>
                  <p className="text-sm mt-2">
                    {avgScore >= 7
                      ? '✅ 可信度高，可放心参考'
                      : avgScore >= 5
                        ? '⚠️ 中等可信度，建议交叉验证'
                        : '❌ 可信度低，建议深入调查'}
                  </p>
                </div>
              </div>

              {/* 工具3：时间压力测试 */}
              <div className="bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-warm-accent" />
                  <h3 className="text-lg font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                    时间压力测试
                  </h3>
                </div>
                <p className="text-sm text-warm-text mb-3">
                  任何告诉你"立即行动""错过等十年"的信息，启动以下测试：
                </p>
                <CheckList
                  items={[
                    '如果这是真的机会，为什么需要通过制造焦虑来推销？',
                    '三年前是否有人说过同样的话？结果如何？',
                    '如果我现在不行动，最坏结果是什么？我能承受吗？',
                    '如果我现在行动，最坏结果是什么？我能承受吗？',
                  ]}
                />
                <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>核心原则：</strong>真正的知识和机会，经得起时间检验。需要 urgency
                    的，通常是销售策略。
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== 认知升级路径 ===== */}
          {activeTab === 'levels' && (
            <motion.div
              key="levels"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-sm text-warm-text mb-6 text-center">
                从被动接受到主动建构，你现在在哪一级？
              </p>
              <div className="space-y-4">
                {levels.map((lv, i) => (
                  <motion.div
                    key={lv.level}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                    className="relative bg-white dark:bg-[#252423] rounded-xl border border-warm-border p-5 hover:shadow-card transition-shadow"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warm-accent/20 to-warm-accent/5 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-warm-accent font-display">
                          L{lv.level}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <lv.icon className="w-4 h-4 text-warm-accent" />
                          <h3 className="text-base font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                            {lv.name}
                          </h3>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-warm-accent/10 text-warm-accent font-medium">
                            {lv.ability}
                          </span>
                        </div>
                        <p className="text-sm text-warm-text mb-1">{lv.desc}</p>
                        <p className="text-xs text-warm-text/60">{lv.risk}</p>
                      </div>
                      <div className="text-2xl font-bold text-warm-accent/20 font-display">
                        {lv.level}
                      </div>
                    </div>
                    {/* 连接线 */}
                    {i < levels.length - 1 && (
                      <div className="absolute left-[38px] -bottom-4 w-px h-4 bg-warm-accent/20" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* 核心提醒 */}
              <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-warm-dark to-[#2a2a4e] text-white text-center">
                <p className="text-sm text-white/60 mb-2">最终检验标准</p>
                <p className="text-base font-medium leading-relaxed">
                  在这个概念通货膨胀的时代，
                  <span className="text-warm-accent">防忽悠能力比获取信息能力更重要。</span>
                  <br />
                  概念抗体的核心不是知道更多，而是
                  <span className="text-warm-accent">知道如何知道</span>。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== 实战抗体库（后台录入，只增不换；无数据时整块不渲染） ===== */}
      {antibodyLibrary.length > 0 && (
        <div className="max-w-[900px] mx-auto px-4 pb-8">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-warm-accent" />
            <h2 className="text-xl font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
              实战抗体库
            </h2>
          </div>
          <p className="text-sm text-warm-text mb-6">
            编辑部按三步还原法拆解的真实案例，持续补充。
          </p>
          <div className="space-y-4">
            {antibodyLibrary.map((ab, i) => (
              <motion.div
                key={ab.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 6) * 0.05, duration: 0.4 }}
                className="bg-white dark:bg-[#252423] dark:border-[#3A3835] rounded-xl border border-warm-border p-5 hover:shadow-card transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-warm-accent/20 to-warm-accent/5 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-warm-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
                        {ab.title}
                      </h3>
                      {ab.category && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-warm-accent/10 text-warm-accent font-medium">
                          {ab.category}
                        </span>
                      )}
                    </div>
                    {ab.description && (
                      <p className="text-sm text-warm-text mb-2">{ab.description}</p>
                    )}
                    {ab.content && (
                      <p className="text-sm text-warm-dark dark:text-[#E8E6E0] leading-relaxed whitespace-pre-line">
                        {ab.content}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 底部 */}
      <footer className="text-center py-8 text-sm text-warm-text">
        愿你在概念的丛林中，永远保持清醒
      </footer>
    </div>
  )
}

// ===== 子组件 =====

function StepCard({
  number,
  title,
  subtitle,
  icon: Icon,
  color,
  expanded,
  onClick,
  children,
}: {
  number: number
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  expanded: boolean
  onClick: () => void
  children: React.ReactNode
  term?: string
}) {
  return (
    <div
      className="bg-white dark:bg-[#252423] dark:border-[#3A3835] rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden"
      style={{ borderColor: expanded ? color + '60' : '#E5E2DA' }}
      onClick={onClick}
    >
      <div className="flex items-center gap-4 p-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '15' }}>
            <div style={{ color }} className="flex items-center justify-center w-full h-full">
              <Icon className="w-5 h-5" />
            </div>
          </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: color + '15', color }}
            >
              第{number}步
            </span>
            <h3 className="text-lg font-semibold text-warm-dark dark:text-[#F0EEE7] font-display">
              {title}
            </h3>
          </div>
          <p className="text-sm text-warm-text">{subtitle}</p>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-warm-text transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-warm-border/50 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2 mb-3">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-disc-law flex-shrink-0 mt-0.5" />
          <span className="text-sm text-warm-dark">{item}</span>
        </div>
      ))}
    </div>
  )
}

function WarnBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800">{text}</p>
    </div>
  )
}
