import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { Share2, Copy, Check, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface ShareButtonProps {
  /** 分享的网址,默认当前网站根地址 */
  url?: string
}

/**
 * 扫码分享按钮
 *
 * 右下角悬浮按钮,点击弹出对话框显示真实可扫的二维码.
 * 用户用微信扫一扫即可在手机打开网站.
 * 二维码由 qrcode 库实时生成,指向当前网站根地址.
 */
export default function ShareButton({ url }: ShareButtonProps) {
  // 分享地址:优先用传入的,否则取当前网站根地址(去掉路径和查询)
  const shareUrl = url ?? (typeof window !== 'undefined' ? window.location.origin : '')

  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  // 生成二维码 PNG data URL(对话框打开时才生成,省点性能)
  useEffect(() => {
    if (!open || !shareUrl || qrDataUrl) return
    QRCode.toDataURL(shareUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch((err: unknown) => {
        console.error('二维码生成失败:', err)
      })
  }, [open, shareUrl, qrDataUrl])

  // 复制链接到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  // 在新标签页打开(方便电脑用户)
  const handleOpen = () => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="扫码分享"
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg hover:scale-110 hover:shadow-amber-500/30 transition-all duration-300"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="bg-warm-deeper border-white/10 text-warm-bg sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">扫码访问本站</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {/* 二维码图片:白底居中,微信扫一扫可直接识别 */}
          <div className="w-64 h-64 bg-white rounded-xl p-3 flex items-center justify-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="网站二维码" className="w-full h-full object-contain" />
            ) : (
              <div className="text-warm-text text-sm">生成中...</div>
            )}
          </div>

          {/* 网址文字 */}
          <div className="text-center text-xs text-warm-text break-all">
            {shareUrl.replace(/^https?:\/\//, '')}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 w-full">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" /> 已复制
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> 复制链接
                </>
              )}
            </button>
            <button
              onClick={handleOpen}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" /> 新窗打开
            </button>
          </div>

          {/* 使用提示 */}
          <p className="text-xs text-warm-text/70 text-center leading-relaxed">
            微信扫一扫二维码即可在手机打开
            <br />
            也可复制链接发到微信聊天
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
