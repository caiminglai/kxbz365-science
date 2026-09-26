import { useRef, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Share2 } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

interface ShareCardProps {
  term: {
    name: string
    translation: string
    essence: string
    discipline: string
    disciplineName?: string
  }
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 1000

// Canvas 需要的字体列表 —— 用 document.fonts.load 主动触发加载，确保绘制前字体就绪
const PRELOAD_FONTS = [
  '700 56px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif',
  '700 34px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif',
  '600 22px "PingFang SC", "Microsoft YaHei", sans-serif',
  '600 20px "PingFang SC", "Microsoft YaHei", sans-serif',
  '500 18px "PingFang SC", "Microsoft YaHei", sans-serif',
  '500 16px "PingFang SC", "Microsoft YaHei", sans-serif',
]

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  const chars = Array.from(text ?? '') // Array.from 可正确处理 emoji 和非 BMP 字符
  let current = ''
  for (const ch of chars) {
    const test = current + ch
    const metrics = ctx.measureText(test)
    if (metrics.width > maxWidth && current.length > 0) {
      lines.push(current)
      current = ch
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// 等待浏览器字体全部加载完毕，确保 Canvas 用的是正确字体而不是回退字体
async function waitForFonts(timeoutMs = 3000) {
  const fontsApi = (document as Document & { fonts?: { ready: Promise<void> } })?.fonts
  if (!fontsApi) return
  try {
    // 1) 等待 CSS 中已声明的字体全部就绪
    if (typeof fontsApi.ready?.then === 'function') {
      await Promise.race([
        fontsApi.ready,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
      ])
    }
    // 2) 显式请求绘制需要的字重 / 字号 —— 让浏览器知道"这个字体/字重确实被用到了"
    for (const spec of PRELOAD_FONTS) {
      try {
        await fontsApi.load?.(spec, '字')
      } catch {
        // 单个字体请求失败不阻断后续
      }
    }
  } catch {
    // 失败时静默降级：使用系统默认字体继续绘制，避免完全空白
  }
}

export default function ShareCard({ term }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const { isDark } = useTheme()
  const [open, setOpen] = useState(false)

  // 真正的绘制函数：字体加载 → 绘制 → 设置预览 URL
  const drawCard = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      toast.error('当前浏览器不支持生成预览图片')
      return
    }

    setIsGenerating(true)
    setPreviewUrl('')

    // 等待字体就绪，再绘制（否则 "LXGW WenKai" 会变成系统默认字体）
    await waitForFonts()

    const bgColor = isDark ? '#1C1B1A' : '#F7F5F0'
    const accentColor = '#D4853B'
    const textColor = isDark ? '#F5F3EE' : '#2A2826'
    const subTextColor = isDark ? '#9B958B' : '#7A7368'
    const cardBg = isDark ? '#26241F' : '#FFFBF3'
    const borderColor = isDark ? '#3A3630' : '#E5E2DA'

    // 用高 DPI 尺度让图片在移动端也清晰
    const dpr = Math.min(window.devicePixelRatio || 2, 3)
    canvas.width = CANVAS_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    canvas.style.width = CANVAS_WIDTH + 'px'
    canvas.style.height = CANVAS_HEIGHT + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    const paddingX = 60
    const contentWidth = CANVAS_WIDTH - paddingX * 2

    // 右上角：学科名胶囊
    if (term.disciplineName) {
      ctx.font = '500 16px "PingFang SC", "Microsoft YaHei", sans-serif'
      const deptText = term.disciplineName
      const deptWidth = ctx.measureText(deptText).width
      ctx.fillStyle = isDark ? 'rgba(212,133,59,0.18)' : 'rgba(212,133,59,0.12)'
      roundRect(ctx, CANVAS_WIDTH - paddingX - deptWidth - 24, 88, deptWidth + 24, 34, 10)
      ctx.fill()
      ctx.fillStyle = accentColor
      ctx.fillText(deptText, CANVAS_WIDTH - paddingX - deptWidth - 12, 110)
    }

    // 词条主名称
    ctx.font = '700 64px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = textColor
    ctx.fillText(term.name, paddingX, 160)

    // 翻译部分（放大字号，与本质文本保持一致风格）
    const arrowY = 220
    ctx.fillStyle = accentColor
    ctx.font = '600 32px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText('→', paddingX, arrowY + 12)

    ctx.font = '700 32px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = accentColor
    ctx.fillText(term.translation, paddingX + 50, arrowY + 12)

    // 分割线
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(paddingX, 290)
    ctx.lineTo(CANVAS_WIDTH - paddingX, 290)
    ctx.stroke()

    // "其实就是" 标签
    ctx.font = '500 18px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = subTextColor
    ctx.fillText('其实就是', paddingX, 330)

    // 本质卡片
    const cardY = 360
    const cardHeight = 420
    ctx.fillStyle = cardBg
    roundRect(ctx, paddingX, cardY, contentWidth, cardHeight, 16)
    ctx.fill()

    ctx.strokeStyle = isDark ? 'rgba(212,133,59,0.35)' : 'rgba(212,133,59,0.25)'
    ctx.lineWidth = 2
    roundRect(ctx, paddingX, cardY, contentWidth, cardHeight, 16)
    ctx.stroke()

    // 本质文本（多行）
    ctx.font = '700 34px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = textColor
    const essenceLines = wrapText(ctx, term.essence ?? '', contentWidth - 60)
    const lineHeight = 52
    const totalTextHeight = essenceLines.length * lineHeight
    const startY = cardY + (cardHeight - totalTextHeight) / 2 + 20
    essenceLines.forEach((line, i) => {
      ctx.fillText(line, paddingX + 30, startY + i * lineHeight)
    })

    // 页脚：品牌名 + 域名 两行，居中对齐
    const footerY = CANVAS_HEIGHT - 95
    ctx.textAlign = 'center'

    // 第一行：品牌名（较大字号）
    ctx.font = '700 24px "LXGW WenKai", "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = accentColor
    ctx.fillText('科学不装', CANVAS_WIDTH / 2, footerY)

    // 第二行：域名（比上面小一点点）
    ctx.font = '600 20px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillStyle = subTextColor
    ctx.fillText('kxbz365.cn', CANVAS_WIDTH / 2, footerY + 28)

    ctx.textAlign = 'left'

    // 生成预览
    try {
      const url = canvas.toDataURL('image/png')
      setPreviewUrl(url)
    } catch (err) {
      console.error('生成预览图失败', err)
      toast.error('预览图生成失败，请重试')
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    if (!open) return
    // 打开对话框后再绘制（确保 canvas 已挂载到 DOM）
    const timer = setTimeout(() => drawCard(), 30)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 主题切换时：如果对话框打开，重绘一次
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => drawCard(), 30)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark])

  const handleDownload = () => {
    if (!previewUrl) return
    const link = document.createElement('a')
    link.download = `${term.name}-同物异名.png`
    link.href = previewUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-warm-text hover:text-warm-accent hover:bg-warm-accent/10 transition-colors"
          title="分享"
        >
          <Share2 width={14} height={14} />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-warm-card dark:bg-warm-card border border-warm-border sm:max-w-[520px]">
        <div className="flex flex-col items-center gap-4 pt-2">
          <h3 className="text-lg font-semibold text-warm-dark dark:text-warm-text font-display">
            分享这个词条
          </h3>

          <div className="w-full rounded-lg overflow-hidden border border-warm-border shadow-lg bg-white dark:bg-warm-card">
            {previewUrl ? (
              <img src={previewUrl} alt="分享预览" className="w-full h-auto" />
            ) : (
              <div className="w-full aspect-[4/5] flex items-center justify-center text-warm-text text-sm bg-warm-bg/30">
                {isGenerating ? '正在生成预览，请稍候...' : '正在生成预览...'}
              </div>
            )}
          </div>

          {/* 把 canvas 放在屏幕外 —— 不能用 display:none（会导致 Safari 无法绘制），也不能用 visibility:hidden（Firefox 有问题） */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              left: '-9999px',
              top: '-9999px',
              width: CANVAS_WIDTH + 'px',
              height: CANVAS_HEIGHT + 'px',
              pointerEvents: 'none',
            }}
          />

          <button
            onClick={handleDownload}
            disabled={!previewUrl}
            className="w-full py-2.5 rounded-lg bg-warm-accent hover:bg-warm-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下载为图片
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// 工具：绘制带圆角的矩形路径（便于填充/描边复用）
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
