import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import * as d3 from 'd3'
import { getGraphNodes, getGraphLinks } from '@/api'
import type { GraphNodeData, GraphLinkData } from '@/api/types'
import { DISCIPLINES } from '@/types'

/** API 返回的节点可能带 hot 字段 */
interface SimNode extends GraphNodeData {
  hot?: boolean
  degree?: number
}

/** D3 forceLink 会把 source/target 从 string 变成对象引用 */
type SimLink = {
  source: SimNode | string
  target: SimNode | string
  label: string
}

// 简单的边界钳制（防止节点跑出画面）
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface ConceptGraphProps {
  onNodeClick?: (nodeId: string) => void
  /** 只显示该学科的节点和关系（用于学科页专属图谱）。不传则显示所有 */
  discipline?: string
  /** 显示上方工具栏（搜索/重置/导出） */
  showToolbar?: boolean
  /** 图例上方的说明文字 */
  subtitle?: string
}

// 学科中文名称
const DISCIPLINE_NAMES: Record<string, string> = DISCIPLINES.reduce(
  (acc, d) => {
    acc[d.id] = d.name
    return acc
  },
  {} as Record<string, string>,
)

// 根据学科获取节点基础颜色
const getDisciplineColor = (id: string): string => {
  const d = DISCIPLINES.find((x) => x.id === id)
  return d?.color || '#8B7D6B'
}

// ========== 颜色变化工具（让同一学科内的节点不再是同一色） ==========

// #RRGGBB / #RGB -> HSL
function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let H = 0
  const L = (max + min) / 2
  if (max !== min) {
    const d = max - min
    const S = L > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        H = ((g - b) / d + (g < b ? 6 : 0)) * 60
        break
      case g:
        H = ((b - r) / d + 2) * 60
        break
      case b:
        H = ((r - g) / d + 4) * 60
        break
    }
    return [H, S * 100, L * 100]
  }
  return [0, 0, L * 100]
}

// HSL -> #RRGGBB
function hslToHex(h: number, s: number, l: number): string {
  const S = s / 100
  const L = l / 100
  const C = (1 - Math.abs(2 * L - 1)) * S
  const hh = h / 60
  const X = C * (1 - Math.abs((hh % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (hh >= 0 && hh < 1) [r1, g1, b1] = [C, X, 0]
  else if (hh < 2) [r1, g1, b1] = [X, C, 0]
  else if (hh < 3) [r1, g1, b1] = [0, C, X]
  else if (hh < 4) [r1, g1, b1] = [0, X, C]
  else if (hh < 5) [r1, g1, b1] = [X, 0, C]
  else [r1, g1, b1] = [C, 0, X]
  const m = L - C / 2
  const toByte = (v: number) => {
    const n = Math.round((v + m) * 255)
    return n.toString(16).padStart(2, '0')
  }
  return `#${toByte(r1)}${toByte(g1)}${toByte(b1)}`
}

// 稳定字符串哈希，返回正整数
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// 基于「学科基础色 + 节点连接度 + ID 哈希」生成同一学科内的颜色变体
// 策略：
//   连接度越高 → 颜色越"突出"（提高饱和度 + 轻微增加亮度）
//   ID 哈希   → 让孤立节点（degree=0）也有不同颜色，增加色相微抖动
function makeNodeVariation(
  baseHex: string,
  degree: number,
  maxDegree: number,
  nodeId: string,
): string {
  const [baseH, baseS, baseL] = hexToHsl(baseHex)
  // 1) saturation boost: 孤立节点保持基础饱和度，高连接度 +15~20%
  const sBoost = maxDegree > 0 ? (degree / maxDegree) * 22 : 0
  // 2) brightness: 中心节点稍亮，边缘节点稍暗（-10 ~ +8）
  const lShift = maxDegree > 0 ? (degree / maxDegree) * 18 - 10 : (hashStr(nodeId) % 17) - 8
  // 3) hue 微抖动（±12°），让即使连接度相同的节点也略有差异
  const hShift = ((hashStr(nodeId) % 2400) / 100) - 12

  const newH = (baseH + hShift + 360) % 360
  const newS = Math.min(90, Math.max(25, baseS + sBoost))
  const newL = Math.min(78, Math.max(35, baseL + lShift))
  return hslToHex(newH, newS, newL)
}

// 计算每个节点的连接度（degree）
function computeDegrees(
  nodesArr: SimNode[],
  linksArr: SimLink[],
): Record<string, number> {
  const deg: Record<string, number> = {}
  nodesArr.forEach((n) => (deg[n.id] = 0))
  linksArr.forEach((l) => {
    const s = typeof l.source === 'object' ? (l.source as SimNode)?.id : l.source
    const t = typeof l.target === 'object' ? (l.target as SimNode)?.id : l.target
    if (s && s in deg) deg[s]++
    if (t && t in deg) deg[t]++
  })
  return deg
}

export default function ConceptGraph({
  onNodeClick,
  discipline,
  showToolbar = true,
  subtitle,
}: ConceptGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const gRootRef = useRef<d3.Selection<SVGGElement, unknown, SVGSVGElement, unknown> | null>(null)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const simulationRef = useRef<d3.Simulation<GraphNodeData, GraphLinkData> | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [nodes, setNodes] = useState<GraphNodeData[]>([])
  const [links, setLinks] = useState<GraphLinkData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDisciplines, setActiveDisciplines] = useState<Set<string>>(new Set())
  const [layoutMode, setLayoutMode] = useState<'spread' | 'cluster'>('spread') // 默认平铺，点重置切到圆球聚团

  // 加载图谱数据
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [nodesData, linksData] = await Promise.all([getGraphNodes(), getGraphLinks()])

        // 基础结构：先分配学科基础色 + 半径（不做最终染色）
        const baseNodes: SimNode[] = (nodesData || []).map((n: GraphNodeData) => ({
          ...(n as SimNode),
          color: getDisciplineColor(n.discipline) || n.color,
          radius: n.radius || ((n as SimNode).hot ? 12 : 8),
        }))

        // 1) 若指定学科，先过滤节点和关系
        let filteredNodes = baseNodes
        let filteredLinks: SimLink[] = linksData || []
        if (discipline) {
          filteredNodes = baseNodes.filter((n) => n.discipline === discipline)
          const nodeIds = new Set(filteredNodes.map((n) => n.id))
          filteredLinks = (linksData || []).filter((l: GraphLinkData) => {
            const s = typeof l.source === 'object' ? (l.source as unknown as SimNode)?.id : l.source
            const t = typeof l.target === 'object' ? (l.target as unknown as SimNode)?.id : l.target
            return nodeIds.has(s) && nodeIds.has(t)
          })
        }

        // 2) 计算过滤后每个节点的连接度，用于颜色差异化
        const degrees = computeDegrees(filteredNodes, filteredLinks)
        const maxDegree = Math.max(1, ...Object.values(degrees))

        // 3) 二次映射：给每个节点一个专属颜色
        //    - 学科详情页：以学科色为基础，做较大程度的 degree + hash 变化
        //    - 首页：仍以学科色为主色，但做轻微的 degree 微抖，
        //            避免多个学科节点全部"平色"的同时保持跨学科分组视觉
        const isSingleDisc = Boolean(discipline)
        const richNodes = filteredNodes.map((n) => {
          const base = getDisciplineColor(n.discipline) || n.color
          const degree = degrees[n.id] || 0
          if (isSingleDisc) {
            // 同一学科内：强力区分
            return {
              ...n,
              color: makeNodeVariation(base, degree, maxDegree, String(n.id)),
              degree,
            }
          }
          // 跨学科首页：轻度区分（保留学科色的主导性）
          const [h, s, l] = hexToHsl(base)
          const hShift = ((hashStr(String(n.id)) % 1200) / 100) - 6 // ±6°
          const sShift = (degree / maxDegree) * 8 - 2
          const lShift = (degree / maxDegree) * 10 - 5
          return {
            ...n,
            color: hslToHex(
              (h + hShift + 360) % 360,
              Math.min(92, Math.max(20, s + sShift)),
              Math.min(82, Math.max(32, l + lShift)),
            ),
            degree,
          }
        })

        // 4) 初始化活跃学科（学科专属模式直接固定）
        if (discipline) {
          setActiveDisciplines(new Set([discipline]))
        } else {
          const allDiscs = Array.from(new Set(richNodes.map((n) => n.discipline)))
          setActiveDisciplines(new Set(allDiscs))
        }

        setNodes(richNodes)
        setLinks(filteredLinks as unknown as GraphLinkData[])
      } catch (err) {
        setError('加载图谱数据失败')
        console.error('Failed to load graph data:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [discipline])

  // 测量容器尺寸
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: 600 })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const handleNodeClick = useCallback(
    (node: GraphNodeData) => {
      setSelectedNode(node)
      if (onNodeClick) onNodeClick(node.id)
    },
    [onNodeClick],
  )

  // 重置视图：切到圆球聚团布局 + 重置缩放
  const handleReset = useCallback(() => {
    // 先把节点聚成一团的布局
    setLayoutMode((prev) => (prev === 'cluster' ? 'spread' : 'cluster'))

    // 同时重置缩放位置，让新布局可见
    if (zoomBehaviorRef.current && svgRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(600)
        .call(zoomBehaviorRef.current.transform, d3.zoomIdentity)
    }

    // 同时重启力模拟让布局变化后重新布局
    setTimeout(() => {
      const sim = simulationRef.current
      if (sim) {
        sim.alpha(1).restart()
      }
    }, 50)
  }, [])

  // 导出为 PNG 图片
  // 要点：
  // 1) 必须给 SVG 根节点加 xmlns，否则 Chromium/Safari 的 <img src={svgBlob}> 不会触发 onload
  // 2) d3 用 .style('filter', 'drop-shadow(...)') 设置的是 CSS，序列化后会丢失 —— 转成等价的 SVG <filter>
  // 3) width: 100% 这种相对值在 <img> 中会被当成 0 尺寸，要换成像素值
  const handleExport = useCallback(() => {
    const svgEl = svgRef.current
    if (!svgEl) {
      toast.error('图谱尚未加载完成')
      return
    }

    const rect = svgEl.getBoundingClientRect()
    const width = rect.width || svgEl.clientWidth || 1000
    const h = rect.height || svgEl.clientHeight || 600

    // 深度克隆 SVG —— 不在原 DOM 上改，避免影响用户看到的图谱
    const clone = svgEl.cloneNode(true) as SVGSVGElement

    // 1) 关键：补命名空间（这是很多浏览器把 SVG 当图片时"不渲染"的根本原因）
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

    // 2) 把相对尺寸替换成绝对像素值（避免 width="100%" 被解读为 0）
    clone.setAttribute('width', String(width))
    clone.setAttribute('height', String(h))
    clone.setAttribute('viewBox', `0 0 ${width} ${h}`)
    clone.removeAttribute('style')

    // 3) 注入通用 SVG 样式：确保 .style() 设置的 CSS 属性（cursor、filter 等）在脱离宿主 CSS 后依然可见
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    styleEl.textContent = `
      .links line { stroke: #B8B0A0; }
      .nodes circle { stroke: #ffffff; stroke-width: 2; cursor: pointer; }
      .nodes text { fill: #1A1A2E; pointer-events: none; }
      * { -webkit-user-select: none; user-select: none; }
    `
    clone.insertBefore(styleEl, clone.firstChild)

    // 4) 注入一个等效的 drop-shadow SVG filter（替代 CSS filter: drop-shadow(...)）
    //    并给每个 circle 添加 filter="url(#soft-shadow)"
    //    注意：如果节点已经是 SVG 属性形式的 fill/stroke，则不需要动
    try {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
      defs.innerHTML = `
        <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.2"/>
        </filter>
      `
      clone.insertBefore(defs, styleEl.nextSibling)

      // 把所有 circle 的 CSS filter 转成 SVG filter 引用（对导出可见）
      clone.querySelectorAll('circle').forEach((c) => {
        const el = c as SVGElement
        // 如果 circle 是用 CSS style 设置的 filter，清掉并加上 SVG filter
        if (el.style.filter) {
          el.setAttribute('filter', 'url(#soft-shadow)')
          el.style.filter = ''
        } else {
          // 否则也主动加一个软阴影（导出的图片看起来没那么平）
          el.setAttribute('filter', 'url(#soft-shadow)')
        }
      })
    } catch {
      // 加 filter 失败不影响整体导出
    }

    // 5) 通用样式内联：对所有子元素，把计算后的 CSS 关键属性写成内联 style
    //    （仅在元素本身未显式设置该 SVG 属性时做，避免覆盖 d3 的精确值）
    const walker = document.createTreeWalker(
      clone,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Node) => {
          const tag = (node as Element).tagName?.toLowerCase()
          if (
            tag === 'circle' ||
            tag === 'line' ||
            tag === 'rect' ||
            tag === 'path' ||
            tag === 'text' ||
            tag === 'g'
          ) {
            return NodeFilter.FILTER_ACCEPT
          }
          return NodeFilter.FILTER_SKIP
        },
      },
    )
    let node: Node | null = walker.nextNode()
    while (node) {
      const el = node as SVGElement
      const computed = window.getComputedStyle(el)

      const ensureAttr = (attr: string, styleProp: string) => {
        if (!el.getAttribute(attr)) {
          const v = (computed as CSSStyleDeclaration & Record<string, string>)[styleProp]
          if (v && v !== 'none' && v !== '' && v !== 'rgb(0, 0, 0)') {
            el.setAttribute(attr, v)
          }
        }
      }

      ensureAttr('fill', 'fill')
      ensureAttr('stroke', 'stroke')
      ensureAttr('stroke-width', 'strokeWidth')
      ensureAttr('stroke-opacity', 'strokeOpacity')
      ensureAttr('opacity', 'opacity')
      ensureAttr('font-size', 'fontSize')
      ensureAttr('font-weight', 'fontWeight')
      ensureAttr('font-family', 'fontFamily')

      node = walker.nextNode()
    }

    // 6) 序列化成 Blob + 加载为 Image
    const serializer = new XMLSerializer()
    let svgString = serializer.serializeToString(clone)
    // 保险：如果上面的 xmlns 没有被序列化出来（部分浏览器对已有元素会忽略 setAttribute 的命名空间），再手动拼
    if (!/xmlns=/.test(svgString.slice(0, 200))) {
      svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"')
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    // 超时兜底：有些浏览器即使失败也不会触发 onerror
    const timeoutId = window.setTimeout(() => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // 超时分支上这个 object URL 已经作废，revoke 失败没有可恢复的动作
      }
      toast.error('图谱导出超时，可能是浏览器安全策略限制')
    }, 8000)

    img.onload = () => {
      window.clearTimeout(timeoutId)
      try {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(h * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          toast.error('当前浏览器不支持 canvas')
          URL.revokeObjectURL(url)
          return
        }
        // 用浅色底让导出的图片在深色主题下也清晰
        ctx.fillStyle = '#fefbf6'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.drawImage(img, 0, 0, width, h)

        const pngUrl = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = `concept-graph-${discipline || 'home'}-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast.success('已导出概念图谱图片')
      } catch (err) {
        console.error('导出图片失败', err)
        toast.error('导出失败，请重试')
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    img.onerror = () => {
      window.clearTimeout(timeoutId)
      URL.revokeObjectURL(url)
      toast.error('图谱导出失败：浏览器渲染 SVG 为图片时出错')
    }

    img.src = url
  }, [discipline])

  // 切换学科筛选（仅主页多学科模式使用）
  const toggleDiscipline = useCallback((discId: string) => {
    setActiveDisciplines((prev) => {
      const next = new Set(prev)
      if (next.has(discId)) {
        next.delete(discId)
      } else {
        next.add(discId)
      }
      return next
    })
  }, [])

  const toggleAllDisciplines = useCallback(() => {
    setActiveDisciplines((prev) => {
      const allDiscs = Array.from(new Set(nodes.map((n) => n.discipline)))
      const isAllSelected = allDiscs.every((d) => prev.has(d))
      if (isAllSelected) {
        return new Set<string>()
      }
      return new Set(allDiscs)
    })
  }, [nodes])

  // 计算"可见"节点（基于搜索+学科筛选）
  const visibleNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return new Set(
      nodes
        .filter((n) => activeDisciplines.has(n.discipline))
        .filter(
          (n) =>
            !q ||
            n.name.toLowerCase().includes(q) ||
            (n.translation || '').toLowerCase().includes(q),
        )
        .map((n) => n.id),
    )
  }, [nodes, activeDisciplines, searchQuery])

  // 主渲染：D3 力导向图 + 缩放拖拽
  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || nodes.length === 0) return

    // 用 svg 容器实际可见尺寸做画布（避免被外层 border 截掉右侧）
    const svgClientWidth = svgRef.current.clientWidth || dimensions.width
    const svgClientHeight = svgRef.current.clientHeight || dimensions.height || 600
    const width = svgClientWidth
    const h = svgClientHeight
    const PAD = 40

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // 设置 viewBox：让 D3 的像素坐标精确映射到可见画布
    svg
      .attr('viewBox', `0 0 ${width} ${h}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('width', '100%')
      .attr('height', h)

    // 根 group：被 zoom 控制
    const gRoot = svg.append('g')
    gRootRef.current = gRoot as unknown as d3.Selection<SVGGElement, unknown, SVGSVGElement, unknown>

    // 缩放/平移行为：滚轮缩放、拖拽平移
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 5])
      // 限制 translate，不让图形被拖到画布外（越界时仍然可见）
      .translateExtent([
        [-width * 0.3, -h * 0.3],
        [width * 1.3, h * 1.3],
      ])
      .on('zoom', (event) => {
        gRoot.attr('transform', event.transform.toString())
      })
    svg.call(zoom)
    zoomBehaviorRef.current = zoom

    // 禁用默认双击放大（避免误触），但保留手动点击节点
    ;(svg as unknown as d3.Selection<SVGSVGElement, unknown, HTMLElement, unknown>).on('dblclick.zoom', null)

    // 复制节点数据（让 D3 可以写入 x/y/fx/fy）
    const nodesCopy: SimNode[] = nodes.map((n) => ({ ...(n as SimNode) }))
    // 构建关系数据
    const linksCopy: SimLink[] = links.map((l) => ({ ...l } as SimLink))

    // 根据布局模式选参数：
    // - spread（默认平铺）：自然聚散，排斥力强、连线松、让节点自由分布
    // - cluster（圆球聚团）：强聚拢、弱排斥、节点紧凑聚成团
    const isCluster = layoutMode === 'cluster'
    const chargeStrength = isCluster ? -80 : -220
    const linkDistance = isCluster ? 45 : 80
    const linkStrength = isCluster ? 0.7 : 0.35
    const xyStrength = isCluster ? 0.15 : 0.06
    const collisionPad = isCluster ? 3 : 6

    const simulation = d3
      .forceSimulation<SimNode>(nodesCopy)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimLink>(linksCopy)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(linkStrength),
      )
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(width / 2, h / 2))
      .force(
        'collision',
        d3.forceCollide<SimNode>().radius((d) => (d.radius || 8) + collisionPad),
      )
      .force('x', d3.forceX(width / 2).strength(xyStrength))
      .force('y', d3.forceY(h / 2).strength(xyStrength))

    simulationRef.current = simulation as unknown as d3.Simulation<GraphNodeData, GraphLinkData>

    // 箭头
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrow-marker-graph')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#B8B0A0')

    // 绘制连线
    const linkGroup = gRoot.append('g').attr('class', 'links').attr('stroke', '#B8B0A0')
    const linkElements = linkGroup
      .selectAll('line')
      .data(linksCopy)
      .enter()
      .append('line')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.5)

    // 节点组
    const nodeGroup = gRoot.append('g').attr('class', 'nodes')
    const nodeElements = nodeGroup
      .selectAll('g')
      .data(nodesCopy)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          }),
      )

    // 节点圆圈
    nodeElements
      .append('circle')
      .attr('r', (d) => d.radius || 8)
      .attr('fill', (d) => d.color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))')
      .on('click', (_event, d) => handleNodeClick(d))
      .on('mouseover', function (_event: MouseEvent, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', d.radius * 1.3)
      })
      .on('mouseout', function (_event: MouseEvent, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', d.radius)
      })

    // 标签：热门节点显示名称
    nodeElements
      .filter((d) => (d.radius || 0) > 10)
      .append('text')
      .text((d) => (d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name))
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => (d.radius || 8) + 14)
      .attr('font-size', '11px')
      .attr('fill', '#1A1A2E')
      .attr('font-weight', '500')
      .style('pointer-events', 'none')

    simulation.on('tick', () => {
      linkElements
        .attr('x1', (d) => clamp((d.source as SimNode)?.x ?? (d as unknown as { x1?: number }).x1 ?? 0, PAD, width - PAD))
        .attr('y1', (d) => clamp((d.source as SimNode)?.y ?? (d as unknown as { y1?: number }).y1 ?? 0, PAD, h - PAD))
        .attr('x2', (d) => clamp((d.target as SimNode)?.x ?? (d as unknown as { x2?: number }).x2 ?? 0, PAD, width - PAD))
        .attr('y2', (d) => clamp((d.target as SimNode)?.y ?? (d as unknown as { y2?: number }).y2 ?? 0, PAD, h - PAD))

      nodeElements.attr(
        'transform',
        (d) => `translate(${clamp(d.x ?? 0, PAD, width - PAD)},${clamp(d.y ?? 0, PAD, h - PAD)})`,
      )
    })

    return () => {
      simulation.stop()
    }
  }, [dimensions, nodes, links, handleNodeClick, layoutMode])

  // 搜索/筛选变化时：动态更新节点可见性与高亮
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svg = d3.select(svgRef.current)
    const q = searchQuery.trim().toLowerCase()

    svg
      .selectAll('.nodes > g')
      .each(function (_, i, nodes_arr) {
        const g = d3.select(nodes_arr[i] as SVGGElement)
        const datum = g.datum() as SimNode
        const isVisible = activeDisciplines.has(datum.discipline)
        const matchSearch =
          !q ||
          datum.name.toLowerCase().includes(q) ||
          (datum.translation || '').toLowerCase().includes(q)
        const isShown = isVisible && matchSearch

        g.style('opacity', isShown ? 1 : 0.08)
        g.style('pointer-events', isShown ? 'auto' : 'none')

        const circle = g.select('circle')
        if (q && matchSearch) {
          circle.attr('stroke', '#FFB84D').attr('stroke-width', 3)
        } else {
          circle.attr('stroke', '#fff').attr('stroke-width', 2)
        }
      })

    svg.selectAll('.links > line').each(function (_, i, lines_arr) {
      const l = d3.select(lines_arr[i] as SVGLineElement)
      const datum = l.datum() as SimLink
      const srcId =
        typeof datum.source === 'object' ? (datum.source as SimNode).id : datum.source
      const tgtId =
        typeof datum.target === 'object' ? (datum.target as SimNode).id : datum.target
      const bothVisible = visibleNodeIds.has(srcId) && visibleNodeIds.has(tgtId)
      l.style('opacity', bothVisible ? 0.55 : 0)
    })
  }, [searchQuery, activeDisciplines, nodes, visibleNodeIds])

  // 从数据中推导出的学科列表（保持稳定顺序）
  const legendItems = useMemo(() => {
    if (discipline) {
      // 学科专属模式：只显示当前学科
      const d = DISCIPLINES.find((x) => x.id === discipline)
      if (d) return [{ id: d.id, color: d.color, label: d.name }]
      return []
    }
    const seen = new Map<string, { color: string; label: string }>()
    nodes.forEach((n) => {
      if (!seen.has(n.discipline)) {
        const disc = DISCIPLINES.find((d) => d.id === n.discipline)
        seen.set(n.discipline, {
          color: disc?.color || n.color || '#8B7D6B',
          label: DISCIPLINE_NAMES[n.discipline] || disc?.name || n.discipline,
        })
      }
    })
    return Array.from(seen.entries()).map(([id, v]) => ({ id, ...v }))
  }, [nodes, discipline])

  if (loading) {
    return (
      <div className="relative w-full">
        <div className="bg-white dark:bg-warm-card rounded-xl border border-warm-border p-10 text-center">
          <p className="text-warm-text">加载图谱数据...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="relative w-full">
        <div className="bg-white dark:bg-warm-card rounded-xl border border-warm-border p-10 text-center">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 顶部工具栏：搜索 + 重置 + 导出 */}
      {showToolbar && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索节点名称（如 梯度）"
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-warm-card border border-warm-border rounded-lg focus:outline-none focus:border-warm-accent/60 text-warm-dark dark:text-warm-text"
          />
          <button
            onClick={handleReset}
            className="px-3 py-2 text-sm rounded-lg border border-warm-border bg-white dark:bg-warm-card hover:bg-warm-bg text-warm-dark dark:text-warm-text"
          >
            {layoutMode === 'cluster' ? '平铺布局' : '圆球聚团'}
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-2 text-sm rounded-lg bg-warm-accent text-white hover:bg-warm-accent/90"
          >
            导出图片
          </button>
        </div>
      )}

      {/* 学科图例/筛选（学科专属模式：只是展示，不可点击） */}
      {legendItems.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-warm-text mr-1">{subtitle || '学科：'}</span>
          {!discipline && (
            <button
              onClick={toggleAllDisciplines}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                activeDisciplines.size === legendItems.length
                  ? 'bg-warm-accent text-white border-warm-accent'
                  : 'bg-white dark:bg-warm-card text-warm-text border-warm-border hover:bg-warm-bg'
              }`}
            >
              {activeDisciplines.size === legendItems.length ? '全部显示' : '全选'}
            </button>
          )}
          {legendItems.map((item) => {
            const active = activeDisciplines.has(item.id)
            return (
              <button
                key={item.id}
                disabled={!!discipline}
                onClick={() => !discipline && toggleDiscipline(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
                  discipline
                    ? 'bg-white dark:bg-warm-card border-warm-border text-warm-dark dark:text-warm-text cursor-default'
                    : active
                      ? 'bg-white dark:bg-warm-card border-warm-border text-warm-dark dark:text-warm-text'
                      : 'bg-warm-bg/40 border-transparent text-warm-text/60'
                }`}
                title={discipline ? '当前为学科专属图谱' : '点击切换'}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: active ? item.color : '#D8D4CC' }}
                />
                <span>{item.label}</span>
              </button>
            )
          })}
          <span className="text-xs text-warm-text/60 ml-auto">
            滚轮缩放 · 拖拽平移 · 点击节点查看详情
          </span>
        </div>
      )}

      {/* SVG 图谱 */}
      <div className="relative bg-white dark:bg-warm-card rounded-xl border border-warm-border overflow-hidden select-none">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="block"
          style={{ width: '100%', height: dimensions.height || 600, display: 'block' }}
        />

        {/* 选中节点详情弹窗 */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md bg-white/98 dark:bg-warm-card/98 backdrop-blur-sm rounded-lg p-4 border border-warm-border shadow-xl">
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-2 right-2 text-warm-text hover:text-warm-dark text-lg leading-none"
              aria-label="关闭"
            >
              ×
            </button>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: selectedNode.color }}
              />
              <span className="text-xs text-warm-text">
                {DISCIPLINE_NAMES[selectedNode.discipline] || selectedNode.discipline}
              </span>
            </div>
            <h4 className="text-lg font-semibold text-warm-dark dark:text-warm-text font-display mb-1">
              {selectedNode.name}
            </h4>
            <p className="text-sm text-warm-text leading-relaxed">
              {selectedNode.translation || '暂无解释'}
            </p>
            {onNodeClick && (
              <button
                onClick={() => onNodeClick(selectedNode.id)}
                className="mt-3 text-xs text-warm-accent hover:text-warm-accent/80 underline underline-offset-2"
              >
                {discipline ? '查看完整词条 →' : '去该学科页继续探索 →'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
