import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Coffee, Heart, Maximize2, MessageCircle, Shield } from 'lucide-react'
import { useState } from 'react'

export default function Footer() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  return (
    <footer className="bg-warm-deeper py-10 px-4 lg:px-6 border-t border-white/[0.08]">
      <div className="max-w-[1200px] mx-auto relative grid md:grid-cols-3 items-center gap-6">
        {/* 左侧 - logo(桌面左对齐,移动端居中) */}
        <div className="flex items-center gap-2 justify-center md:justify-start">
          <div className="relative">
            <MessageCircle
              className="w-4 h-4 text-warm-accent absolute -left-0.5 -top-0.5"
              strokeWidth={2.5}
            />
            <MessageCircle className="w-4 h-4 text-warm-bg" strokeWidth={2.5} />
          </div>
          <span className="text-base text-warm-bg font-display">同物异名</span>
        </div>

        {/* 中间 - 备案信息(政府网站标准样式) */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="text-center text-xs text-gray-500">让复杂变简单 · 2026</div>
          <div className="text-center text-xs text-gray-400">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-200 transition-colors"
            >
              浙ICP备2026048677号-2
            </a>
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
            <Shield className="w-3.5 h-3.5 text-gray-500" />
            <a
              href="https://beian.mps.gov.cn/#/query/webSearch?code=33011002020096"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-200 transition-colors"
            >
              浙公网安备33011002020096号
            </a>
          </div>
        </div>

        {/* 右侧 - 咖啡按钮(桌面右对齐,移动端居中) */}
        <div className="flex items-center justify-center md:justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <button className="group flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-orange-500/30 transition-all duration-300">
                <Coffee className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm text-amber-200">请作者喝杯咖啡</span>
                <Heart className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
              </button>
            </DialogTrigger>
            <DialogContent className="bg-warm-deeper border-white/10 text-warm-bg sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-center text-xl">☕ 感谢支持</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <p className="text-warm-text text-center text-sm">你的支持是我持续创作的动力!</p>
                <div className="flex gap-6">
                  {/* 微信收款码 */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => setSelectedImage('/wechat-pay.jpg')}
                      className="w-40 h-40 bg-white rounded-lg p-2 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-amber-400 transition-all group relative"
                    >
                      <img
                        src="/wechat-pay.jpg"
                        alt="微信收款码"
                        className="w-full h-full object-contain"
                      />
                      <Maximize2 className="absolute bottom-1 right-1 w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <span className="text-xs text-warm-text">微信</span>
                  </div>
                  {/* 支付宝收款码 */}
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => setSelectedImage('/alipay.jpg')}
                      className="w-40 h-40 bg-white rounded-lg p-2 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all group relative"
                    >
                      <img
                        src="/alipay.jpg"
                        alt="支付宝收款码"
                        className="w-full h-full object-contain"
                      />
                      <Maximize2 className="absolute bottom-1 right-1 w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <span className="text-xs text-warm-text">支付宝</span>
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                  <p className="text-amber-200 text-xs">
                    💡 提示:本地预览时手机无法扫码,部署到服务器后就能正常使用了
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* 图片放大弹窗(Dialog 是 portal 渲染,位置不受父容器影响) */}
        {selectedImage && (
          <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
            <DialogContent className="bg-black/95 border-white/10 sm:max-w-2xl p-2">
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-2 right-2 text-white/70 hover:text-white transition-colors"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <img
                src={selectedImage}
                alt="放大查看"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </footer>
  )
}
