import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getComparisons, searchTerms } from '@/api/services'
import type { Comparison, TermAlias, APITerm } from '@/api/types'
import { DISCIPLINES } from '@/types'

// 15种关系类型的测试数据（前端硬编码，不写入数据库）
const FALLBACK_COMPARISONS: Comparison[] = [
  {
    id: 'cmp_test_01',
    title: '过拟合 vs 欠拟合',
    concept_a_name: '过拟合',
    concept_a_discipline: '计算机',
    concept_a_plain: '把训练数据背下来了，但遇到新题目就不会做',
    concept_a_symptom: '训练集表现完美，测试集一塌糊涂',
    concept_a_analogy: '就像学生背下了所有习题答案，但换了新题就傻眼',
    concept_a_fix: '增加训练数据、用正则化、降低模型复杂度',
    concept_b_name: '欠拟合',
    concept_b_discipline: '计算机',
    concept_b_plain: '题目都没学会，连训练数据都答不好',
    concept_b_symptom: '训练集和测试集表现都不好',
    concept_b_analogy: '就像学生连基础都没学会，考试自然不及格',
    concept_b_fix: '增加模型复杂度、增加训练轮次、改进特征',
    summary: '过拟合是学过头了，欠拟合是学得不够，两者都需要调到刚刚好',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_02',
    title: '准确率 vs 召回率',
    concept_a_name: '准确率',
    concept_a_discipline: '计算机',
    concept_a_plain: '预测正确的占所有预测的比例',
    concept_a_symptom: '宁可漏检也不愿误报时准确率高',
    concept_a_analogy: '像考试的选择题，只选100%确定的答案',
    concept_a_fix: '提高模型置信度阈值、减少假阳性',
    concept_b_name: '召回率',
    concept_b_discipline: '计算机',
    concept_b_plain: '预测正确的占所有正确答案的比例',
    concept_b_symptom: '宁可误报也不能漏检时召回率高',
    concept_b_analogy: '像安检，宁可多报警几次也不能漏过危险品',
    concept_b_fix: '降低判断阈值、增加检测范围',
    summary: '准确率和召回率通常此消彼长，需要根据场景权衡',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_03',
    title: '监督学习 vs 无监督学习',
    concept_a_name: '监督学习',
    concept_a_discipline: '计算机',
    concept_a_plain: '有标准答案的学习，就像有老师批改作业',
    concept_a_symptom: '需要大量标注数据，成本高但效果好',
    concept_a_analogy: '像学生在老师指导下做练习题',
    concept_a_fix: '积累标注数据、使用预训练模型',
    concept_b_name: '无监督学习',
    concept_b_discipline: '计算机',
    concept_b_plain: '没有标准答案，自己发现规律',
    concept_b_symptom: '不需要标注数据，但结果解释性差',
    concept_b_analogy: '像让学生自己总结教材中的规律',
    concept_b_fix: '明确聚类目标、进行结果可视化验证',
    summary: '监督学习适合有明确答案的任务，无监督适合探索性分析',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_04',
    title: '损失函数 vs 评估指标',
    concept_a_name: '损失函数',
    concept_a_discipline: '计算机',
    concept_a_plain: '模型训练时用的内部计分器，指导优化方向',
    concept_a_symptom: '直接优化可能导致过拟合',
    concept_a_analogy: '像考试时的即时评分系统',
    concept_a_fix: '结合正则化、使用合适的损失函数',
    concept_b_name: '评估指标',
    concept_b_discipline: '计算机',
    concept_b_plain: '最终判断模型好坏的外部标准',
    concept_b_symptom: '可能和训练目标不一致',
    concept_b_analogy: '像高考成绩决定你上什么大学',
    concept_b_fix: '选择与业务目标一致的评估指标',
    summary: '损失函数是训练引擎，评估指标是最终裁判',
    relationship_type: '关联性',
  },
  {
    id: 'cmp_test_05',
    title: '梯度下降 vs 随机梯度下降',
    concept_a_name: '梯度下降',
    concept_a_discipline: '计算机',
    concept_a_plain: '每次用所有数据计算梯度，方向准但速度慢',
    concept_a_symptom: '大数据集上训练时间很长',
    concept_a_analogy: '像认真研究每道题后再做下一道',
    concept_a_fix: '使用小批量或随机版本',
    concept_b_name: '随机梯度下降',
    concept_b_discipline: '计算机',
    concept_b_plain: '每次用一个样本估算梯度，速度快但有噪声',
    concept_b_symptom: '收敛过程有震荡，可能跳过最优解',
    concept_b_analogy: '像边走边问路，速度快但可能走弯路',
    concept_b_fix: '使用学习率衰减、动量优化',
    summary: '全梯度准但慢，随机梯度快但颠簸，实际常用两者的折中',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_06',
    title: '分类 vs 回归',
    concept_a_name: '分类',
    concept_a_discipline: '计算机',
    concept_a_plain: '预测离散类别，如判断是猫还是狗',
    concept_a_symptom: '输出是概率分布，不能做算术运算',
    concept_a_analogy: '像选择题，从固定选项中选一个',
    concept_a_fix: '使用softmax、多分类时考虑类别不平衡',
    concept_b_name: '回归',
    concept_b_discipline: '计算机',
    concept_b_plain: '预测连续数值，如预测房价是多少钱',
    concept_b_symptom: '输出可以是任意实数，可能超出合理范围',
    concept_b_analogy: '像填空题，答案是某个具体的数字',
    concept_b_fix: '对输出做范围限制、使用归一化',
    summary: '分类是定类别，回归是定数值',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_07',
    title: '参数模型 vs 非参数模型',
    concept_a_name: '参数模型',
    concept_a_discipline: '计算机',
    concept_a_plain: '模型参数数量固定，与数据量无关',
    concept_a_symptom: '数据少时可能欠拟合，数据多时增长受限',
    concept_a_analogy: '像固定容量的容器，装不下更多知识',
    concept_a_fix: '增加模型层数、使用更复杂的架构',
    concept_b_name: '非参数模型',
    concept_b_discipline: '计算机',
    concept_b_plain: '参数数量随数据量增长而增加',
    concept_b_symptom: '数据多时效果好，但可能过拟合和内存爆炸',
    concept_b_analogy: '像无限容量的书包，数据越多背得越多',
    concept_b_fix: '使用正则化、限制树深度或近邻数量',
    summary: '参数模型省内存但受限，非参数模型灵活但费资源',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_08',
    title: '偏差 vs 方差',
    concept_a_name: '偏差',
    concept_a_discipline: '计算机',
    concept_a_plain: '模型预测值与真实值的系统性偏差',
    concept_a_symptom: '训练集和测试集表现都不好',
    concept_a_analogy: '像射击时子弹永远偏离靶心',
    concept_a_fix: '增加模型复杂度、添加更多特征',
    concept_b_name: '方差',
    concept_b_discipline: '计算机',
    concept_b_plain: '模型预测值在不同数据集间的波动程度',
    concept_b_symptom: '训练集好但测试集差，过拟合的标志',
    concept_b_analogy: '像射击时子弹散布很广但中心在靶心',
    concept_b_fix: '增加训练数据、使用正则化、简化模型',
    summary: '偏差高欠拟合，方差高过拟合，需要在两者间找平衡',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_09',
    title: '混淆矩阵',
    concept_a_name: '真阳性',
    concept_a_discipline: '计算机',
    concept_a_plain: '预测为正，实际也是正，预测对了',
    concept_a_symptom: '越高越好，但可能伴随假阳性增加',
    concept_a_analogy: '像火警响了确实有火灾',
    concept_a_fix: '优化模型、提高阈值',
    concept_b_name: '假阳性',
    concept_b_discipline: '计算机',
    concept_b_plain: '预测为正，实际是负，误报',
    concept_b_symptom: '太高会让人疲劳、浪费资源',
    concept_b_analogy: '像火警响了但没有火灾',
    concept_b_fix: '提高判断阈值、增加验证',
    summary: '真阳性和假阳性是此消彼长的关系',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_10',
    title: '特征工程 vs 特征学习',
    concept_a_name: '特征工程',
    concept_a_discipline: '计算机',
    concept_a_plain: '人工提取和设计特征，需要领域知识',
    concept_a_symptom: '耗时耗力，但可解释性强',
    concept_a_analogy: '像手工打造零件，精度高但慢',
    concept_a_fix: '结合领域专家知识、迭代优化',
    concept_b_name: '特征学习',
    concept_b_discipline: '计算机',
    concept_b_plain: '模型自动从数据中学习特征表示',
    concept_b_symptom: '省力但像黑箱，解释性差',
    concept_b_analogy: '像机器批量生产零件，效率高但不一定精准',
    concept_b_fix: '使用注意力机制解释、用预训练模型',
    summary: '特征工程靠人工经验，特征学习靠算法自动',
    relationship_type: '对立性',
  },
  {
    id: 'cmp_test_11',
    title: '训练集 vs 测试集',
    concept_a_name: '训练集',
    concept_a_discipline: '计算机',
    concept_a_plain: '用来教模型学习的数据',
    concept_a_symptom: '模型在训练集上表现好不代表真的好',
    concept_a_analogy: '像教材，学生用来学习的',
    concept_a_fix: '数据要全面、干净、有代表性',
    concept_b_name: '测试集',
    concept_b_discipline: '计算机',
    concept_b_plain: '用来最终考核模型的数据，要和训练集分开',
    concept_b_symptom: '测试集泄露会导致成绩虚高',
    concept_b_analogy: '像期末考试卷考前不能看',
    concept_b_fix: '严格划分数据集、不重复使用测试数据',
    summary: '训练集是练习题，测试集是期末考试',
    relationship_type: '关联性',
  },
  {
    id: 'cmp_test_12',
    title: 'L1正则化 vs L2正则化',
    concept_a_name: 'L1正则化',
    concept_a_discipline: '计算机',
    concept_a_plain: '惩罚参数绝对值之和，产生稀疏解',
    concept_a_symptom: '自动做特征选择，参数更容易为0',
    concept_a_analogy: '像把不重要的书直接扔掉',
    concept_a_fix: '适合高维稀疏数据',
    concept_b_name: 'L2正则化',
    concept_b_discipline: '计算机',
    concept_b_plain: '惩罚参数平方和，让参数都小但不归零',
    concept_b_symptom: '保留所有特征，参数值更平滑',
    concept_b_analogy: '像把所有书压缩变薄但都保留',
    concept_b_fix: '适合特征都重要的情况',
    summary: 'L1做特征选择，L2平滑参数',
    relationship_type: '关联性',
  },
  {
    id: 'cmp_test_13',
    title: '交叉熵 vs 均方误差',
    concept_a_name: '交叉熵',
    concept_a_discipline: '计算机',
    concept_a_plain: '衡量两个概率分布的差异，适合分类',
    concept_a_symptom: '梯度在概率接近时仍较大，收敛快',
    concept_a_analogy: '像比较两个骰子的概率分布',
    concept_a_fix: '适合分类任务，尤其是多分类',
    concept_b_name: '均方误差',
    concept_b_discipline: '计算机',
    concept_b_plain: '计算预测值与真实值的平方差的均值',
    concept_b_symptom: '梯度在误差大时很大，容易梯度爆炸',
    concept_b_analogy: '像测量射击点到靶心的平均距离',
    concept_b_fix: '适合回归任务，或对异常值不敏感的场景',
    summary: '分类用交叉熵，回归用均方误差',
    relationship_type: '关联性',
  },
  {
    id: 'cmp_test_14',
    title: 'Batch Normalization vs Layer Normalization',
    concept_a_name: 'Batch Normalization',
    concept_a_discipline: '计算机',
    concept_a_plain: '对批次维度做归一化',
    concept_a_symptom: '依赖batch大小，小batch效果差',
    concept_a_analogy: '像按班级成绩排名，同班同学互相比较',
    concept_a_fix: '使用足够大的batch，或改用Layer Norm',
    concept_b_name: 'Layer Normalization',
    concept_b_discipline: '计算机',
    concept_b_plain: '对单个样本的所有特征做归一化',
    concept_b_symptom: '不依赖batch，适合序列模型',
    concept_b_analogy: '像只看自己各科成绩的相对位置',
    concept_b_fix: '适合RNN、Transformer等序列模型',
    summary: 'Batch Norm按批次归一化，Layer Norm按层归一化',
    relationship_type: '关联性',
  },
  {
    id: 'cmp_test_15',
    title: '卷积神经网络 vs 循环神经网络',
    concept_a_name: '卷积神经网络',
    concept_a_discipline: '计算机',
    concept_a_plain: '擅长处理图像等网格结构数据',
    concept_a_symptom: '并行计算效率高，但处理序列需要额外设计',
    concept_a_analogy: '像用放大镜扫描图片提取特征',
    concept_a_fix: '处理序列时叠加多个卷积层或用注意力机制',
    concept_b_name: '循环神经网络',
    concept_b_discipline: '计算机',
    concept_b_plain: '擅长处理序列数据，有记忆能力',
    concept_b_symptom: '难以处理长序列，容易梯度消失/爆炸',
    concept_b_analogy: '像阅读文章时记住前文内容',
    concept_b_fix: '使用LSTM、GRU或Transformer',
    summary: 'CNN擅长空间特征，RNN擅长时序特征',
    relationship_type: '关联性',
  },
]

export default function ConceptCompareTool() {
  const [loading, setLoading] = useState(true)
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [termA, setTermA] = useState('')
  const [termB, setTermB] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<
    | { type: 'comparison'; data: Comparison }
    | { type: 'terms'; a: APITerm; b: APITerm }
    | { type: 'notFound'; message: string }
    | null
  >(null)

  // 自动轮播 state（让对比结果卡片自己轮番转动）
  const [autoIndex, setAutoIndex] = useState(0)
  const [autoPaused, setAutoPaused] = useState(false)
  const [autoMode, setAutoMode] = useState(true) // true=自动轮播所有对比；false=只展示用户搜索的结果
  const AUTO_INTERVAL_MS = 4000

  // 加载所有对比数据（用于匹配）
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const data = await getComparisons()
        if (mounted) {
          const apiData = Array.isArray(data) ? data : []
          // 如果 API 返回数据为空，使用前端硬编码的测试数据
          setComparisons(apiData.length > 0 ? apiData : FALLBACK_COMPARISONS)
        }
      } catch {
        if (mounted) setComparisons(FALLBACK_COMPARISONS)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // 自动轮播所有对比：每 AUTO_INTERVAL_MS 切下一条（悬停暂停，用户手动搜索时退出自动模式）
  useEffect(() => {
    if (!autoMode || autoPaused || comparisons.length === 0) return
    const timer = setInterval(() => {
      setAutoIndex((i) => (i + 1) % comparisons.length)
    }, AUTO_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [autoMode, autoPaused, comparisons.length])

  // 辅助函数
  const getDisciplineColor = (id: string) => {
    const d = DISCIPLINES.find((x) => x.id === id)
    return d?.color || '#8B7D6B'
  }

  const getDisciplineName = (id: string) => {
    const d = DISCIPLINES.find((x) => x.id === id)
    return d?.name || id
  }

  // 判断字符串是否相似（包含关系）
  const matchName = (input: string, target: string) => {
    if (!input?.trim() || !target?.trim()) return false
    const a = input.trim().toLowerCase()
    const b = target.trim().toLowerCase()
    return a === b || b.includes(a) || a.includes(b)
  }

  // 在 comparisons 里找匹配
  const findComparison = (a: string, b: string): Comparison | undefined => {
    return comparisons.find((c) => {
      const nameA = c.concept_a_name || ''
      const nameB = c.concept_b_name || ''
      return (
        (matchName(a, nameA) && matchName(b, nameB)) || (matchName(a, nameB) && matchName(b, nameA))
      )
    })
  }

  // 搜索词条
  const searchTerm = async (query: string): Promise<APITerm | null> => {
    if (!query.trim()) return null
    try {
      const res = await searchTerms(query, 20)
      const list: APITerm[] = Array.isArray(res?.results)
        ? res.results.map((r) => r.term).filter(Boolean)
        : []
      if (list.length === 0) return null
      // 精确匹配优先
      const exact = list.find((t: APITerm) => matchName(query, t.name))
      return exact || list[0]
    } catch {
      return null
    }
  }

  // 执行对比搜索（接受可选参数，方便预设按钮直接传入值）
  const handleCompare = async (aVal?: string, bVal?: string) => {
    const a = (aVal ?? termA).trim()
    const b = (bVal ?? termB).trim()
    if (!a || !b) {
      setResult({ type: 'notFound', message: '请在两个输入框里分别填写要对比的两个概念' })
      return
    }

    setSearching(true)
    setResult(null)
    setAutoMode(false) // 用户手动搜索后停止自动轮播，只展示搜索结果

    try {
      // 1. 先在 comparisons 里找现成的
      const found = findComparison(a, b)
      if (found) {
        setResult({ type: 'comparison', data: found })
        return
      }

      // 2. 没找到的话，搜索两个词条各自的解释，并排展示
      const [ta, tb] = await Promise.all([searchTerm(a), searchTerm(b)])
      if (ta && tb) {
        setResult({ type: 'terms', a: ta, b: tb })
      } else if (ta || tb) {
        const foundName = ta ? a : b
        const missingName = ta ? b : a
        setResult({
          type: 'notFound',
          message: `找到了"${foundName}"，但找不到"${missingName}"的解释。可以试试更常见的说法。`,
        })
      } else {
        setResult({
          type: 'notFound',
          message: `目前库里还没有"${a}"和"${b}"的对比。可以试着搜索其他概念。`,
        })
      }
    } catch {
      setResult({ type: 'notFound', message: '搜索失败，请稍后再试' })
    } finally {
      setSearching(false)
    }
  }

  // 渲染对比卡片 - comparison 模式
  const renderComparison = (cmp: Comparison) => {
    const items = [
      {
        prefix: 'a',
        name: cmp.concept_a_name,
        discipline: cmp.concept_a_discipline,
        plain: cmp.concept_a_plain,
        symptom: cmp.concept_a_symptom,
        analogy: cmp.concept_a_analogy,
        fix: cmp.concept_a_fix,
      },
      {
        prefix: 'b',
        name: cmp.concept_b_name,
        discipline: cmp.concept_b_discipline,
        plain: cmp.concept_b_plain,
        symptom: cmp.concept_b_symptom,
        analogy: cmp.concept_b_analogy,
        fix: cmp.concept_b_fix,
      },
    ]

    const cardKey = cmp.id || `${cmp.concept_a_name}-${cmp.concept_b_name}`
    return (
      <motion.div
        key={cardKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <div className="bg-white dark:bg-warm-card rounded-xl border border-warm-border overflow-hidden">
          {/* 顶部栏 */}
          <div className="px-5 py-3 border-b border-warm-border bg-warm-bg/30 flex items-center relative">
            <span className="font-semibold text-warm-dark dark:text-warm-text">{cmp.title}</span>
            <span className="font-semibold text-blue-600 absolute left-1/2 -translate-x-1/2">
              关系属性：{cmp.relationship_type}
            </span>
          </div>

          {/* 两个概念对比 */}
          <div className="grid md:grid-cols-2">
            {items.map((c, idx) => (
              <div
                key={c.prefix}
                className={`p-5 ${idx === 0 ? 'border-r border-warm-border' : ''}`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getDisciplineColor(c.discipline) }}
                  />
                  <h3 className="text-lg font-semibold text-warm-dark dark:text-warm-text">
                    {c.name}
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-warm-text mb-1">人话</div>
                    <div className="text-sm text-emerald-700 dark:text-emerald-400">{c.plain}</div>
                  </div>

                  {c.symptom && (
                    <div>
                      <div className="text-xs text-warm-text mb-1">表现</div>
                      <div className="text-sm text-warm-text">{c.symptom}</div>
                    </div>
                  )}

                  {c.analogy && (
                    <div>
                      <div className="text-xs text-warm-text mb-1">类比</div>
                      <div className="text-sm text-warm-text italic" style={{ color: '#B8783A' }}>
                        "{c.analogy}"
                      </div>
                    </div>
                  )}

                  {c.fix && (
                    <div>
                      <div className="text-xs text-warm-text mb-1">解决</div>
                      <div className="text-sm text-warm-text">{c.fix}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 底部一句话总结 */}
          <div className="px-5 py-3 bg-warm-bg/20 border-t border-warm-border">
            <span className="text-xs text-warm-text">一句话总结：</span>
            <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {cmp.summary}
            </span>
          </div>
        </div>
      </motion.div>
    )
  }

  // 渲染对比卡片 - terms 模式（从词条库各自搜到）
  const renderTermsCompare = (a: APITerm, b: APITerm) => {
    const items = [
      {
        name: a.name,
        discipline: a.discipline,
        translation: a.translation,
        essence: a.essence,
        tip: a.tip,
        aliases: a.aliases,
      },
      {
        name: b.name,
        discipline: b.discipline,
        translation: b.translation,
        essence: b.essence,
        tip: b.tip,
        aliases: b.aliases,
      },
    ]

    return (
      <motion.div
        key="terms-compare"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-6 text-center">
          <div className="inline-block mb-3 px-3 py-1 rounded-full text-xs font-medium text-white bg-[#5A7AB8]">
            词条对照
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-warm-dark dark:text-warm-text font-display mb-2">
            {a.name} <span className="text-warm-text mx-2">vs</span> {b.name}
          </h3>
          <p className="text-warm-text text-sm italic">
            还没有人专门整理过这两个概念的对比，下面是它们各自的解释，帮你自己做出判断。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {items.map((c) => (
            <div
              key={c.name}
              className="bg-white dark:bg-warm-card rounded-xl p-5 border border-warm-border hover:shadow-card transition-shadow"
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getDisciplineColor(c.discipline) }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: getDisciplineColor(c.discipline) }}
                >
                  {getDisciplineName(c.discipline)}
                </span>
              </div>

              <h3 className="text-xl font-semibold text-warm-dark dark:text-warm-text font-display mb-3">
                {c.name}
              </h3>

              <div className="space-y-3">
                {c.translation && (
                  <div>
                    <div className="text-[11px] text-warm-text mb-1">英文/术语</div>
                    <div className="text-sm text-warm-text">{c.translation}</div>
                  </div>
                )}
                <div>
                  <div className="text-[11px] text-warm-text mb-1">本质解释</div>
                  <div className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
                    {c.essence}
                  </div>
                </div>
                {c.tip && (
                  <div>
                    <div className="text-[11px] text-warm-text mb-1">防忽悠提示</div>
                    <div className="text-sm text-disc-law">{c.tip}</div>
                  </div>
                )}
                {c.aliases &&
                  Array.isArray(c.aliases) &&
                  c.aliases.length > 0 &&
                  (() => {
                    const aliasList: TermAlias[] = c.aliases
                    return (
                      <div>
                        <div className="text-[11px] text-warm-text mb-1">跨学科别名</div>
                        <div className="text-sm text-warm-text">
                          {aliasList.map((al, idx) => (
                            <span key={`${al.discipline}-${al.name}`}>
                              {getDisciplineName(al.discipline)}·{al.name}
                              {idx < aliasList.length - 1 ? '；' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    )
  }

  return (
    <div>
      {/* 顶部：两个输入框 */}
      <div className="grid md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end mb-5">
        <div>
          <label className="block text-sm text-warm-text mb-2">概念 A</label>
          <input
            type="text"
            value={termA}
            onChange={(e) => setTermA(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCompare(undefined, undefined)}
            placeholder="例如：过拟合"
            className="w-full h-12 px-4 rounded-lg bg-white dark:bg-warm-card border border-warm-border text-warm-dark dark:text-warm-text text-sm focus:outline-none focus:border-disc-econ focus:ring-2 focus:ring-disc-econ/15"
          />
        </div>
        <div className="text-center text-warm-text text-lg pb-3 hidden md:block">vs</div>
        <div>
          <label className="block text-sm text-warm-text mb-2">概念 B</label>
          <input
            type="text"
            value={termB}
            onChange={(e) => setTermB(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCompare(undefined, undefined)}
            placeholder="例如：欠拟合"
            className="w-full h-12 px-4 rounded-lg bg-white dark:bg-warm-card border border-warm-border text-warm-dark dark:text-warm-text text-sm focus:outline-none focus:border-disc-econ focus:ring-2 focus:ring-disc-econ/15"
          />
        </div>
        <button
          onClick={() => handleCompare()}
          disabled={searching}
          className="h-12 px-5 rounded-lg bg-warm-accent hover:bg-warm-accent/90 disabled:bg-warm-accent/50 text-white text-sm font-medium transition-colors whitespace-nowrap"
        >
          {searching ? '搜索中...' : '开始对比'}
        </button>
      </div>

      {/* 结果展示：autoMode=true 时自动轮播所有对比；否则展示用户搜索结果 */}
      {loading ? (
        <div className="text-center py-16 text-warm-text">正在加载...</div>
      ) : searching ? (
        <div className="text-center py-16 text-warm-text">正在搜索对比...</div>
      ) : autoMode && comparisons.length > 0 ? (
        <div onMouseEnter={() => setAutoPaused(true)} onMouseLeave={() => setAutoPaused(false)}>
          <AnimatePresence mode="wait">{renderComparison(comparisons[autoIndex])}</AnimatePresence>
          {/* 翻页控制 + 小圆点指示器 */}
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setAutoIndex((i) => (i - 1 + comparisons.length) % comparisons.length)
                }
                className="w-6 h-6 rounded-full border border-warm-border bg-white dark:bg-warm-card text-warm-text hover:bg-warm-bg hover:border-warm-accent/40 text-xs transition-colors"
                aria-label="上一条"
              >
                ‹
              </button>
              <span className="text-[11px] text-warm-text w-12 text-center">
                {autoIndex + 1}/{comparisons.length}
              </span>
              <button
                onClick={() => setAutoIndex((i) => (i + 1) % comparisons.length)}
                className="w-6 h-6 rounded-full border border-warm-border bg-white dark:bg-warm-card text-warm-text hover:bg-warm-bg hover:border-warm-accent/40 text-xs transition-colors"
                aria-label="下一条"
              >
                ›
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {comparisons.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setAutoIndex(idx)}
                aria-label={`第 ${idx + 1} 条`}
                className={`transition-all rounded-full ${
                  idx === autoIndex
                    ? 'w-6 h-1.5 bg-warm-accent'
                    : 'w-1.5 h-1.5 bg-warm-border hover:bg-warm-accent/60'
                }`}
              />
            ))}
          </div>
        </div>
      ) : result?.type === 'comparison' ? (
        <AnimatePresence mode="wait">{renderComparison(result.data)}</AnimatePresence>
      ) : result?.type === 'terms' ? (
        <AnimatePresence mode="wait">{renderTermsCompare(result.a, result.b)}</AnimatePresence>
      ) : result?.type === 'notFound' ? (
        <div className="py-12 text-center text-warm-text bg-warm-bg/30 rounded-xl border border-dashed border-warm-border">
          {result.message}
        </div>
      ) : (
        <div className="py-12 text-center text-warm-text bg-warm-bg/30 rounded-xl border border-dashed border-warm-border">
          在上方两个框里输入两个概念，点"开始对比"看看它们到底有什么区别
        </div>
      )}
    </div>
  )
}
