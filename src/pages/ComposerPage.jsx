import { useRef, useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Undo2, Redo2, Download, RotateCcw, Upload, Sliders,
  Layers, Wand2,
} from 'lucide-react'
import clsx from 'clsx'
import { useComposerStore } from '../store/useComposerStore'
import { useAuthStore } from '../store/useAuthStore'
import { useAppStore } from '../store/useAppStore'
import ComposerCanvas from '../components/composer/ComposerCanvas'
import LayerPanel from '../components/composer/LayerPanel'
import CommandBar from '../components/composer/CommandBar'
import ToolBar from '../components/composer/ToolBar'
import GuideSection from '../components/ui/GuideSection'

/* ─── Upload zone (no-image state) ─────────────────────────────────────── */
function UploadZone({ onUpload }) {
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => {
      const url = e.target.result
      const img = new window.Image()
      img.onload = () => onUpload({ url, width: img.naturalWidth, height: img.naturalHeight })
      img.src = url
    }
    reader.readAsDataURL(file)
  }, [onUpload])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        handleFile(e.dataTransfer.files[0])
      }}
      onClick={() => fileInputRef.current?.click()}
      className={clsx(
        'flex flex-col items-center justify-center gap-4 rounded-2xl cursor-pointer transition-all select-none',
        dragging ? 'bg-brand-500/10 scale-[1.01]' : 'bg-white/[0.025] hover:bg-white/[0.04]',
      )}
      style={{
        border: `2px dashed ${dragging ? 'rgba(110,75,255,0.6)' : 'rgba(255,255,255,0.09)'}`,
        width: 480, height: 300, maxWidth: '90%',
      }}
    >
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(110,75,255,0.12)', border: '1px solid rgba(110,75,255,0.22)' }}>
        <Upload size={28} className="text-brand-400" />
      </div>
      <div className="text-center px-6">
        <p className="text-white/60 font-medium text-sm mb-1">
          {dragging ? 'Thả ảnh vào đây…' : 'Kéo & thả ảnh nền'}
        </p>
        <p className="text-white/25 text-xs">hoặc click để chọn file — JPG, PNG, WEBP</p>
      </div>
      <input
        ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }}
      />
    </div>
  )
}

/* ─── Top bar button ───────────────────────────────────────────────────── */
function TopBarBtn({ icon: Icon, label, onClick, disabled, highlight, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
        disabled && 'opacity-30 cursor-not-allowed',
        !disabled && highlight && 'text-brand-200 hover:text-white',
        !disabled && danger && 'text-white/40 hover:text-rose-400 hover:bg-rose-500/10',
        !disabled && !highlight && !danger && 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]',
      )}
      style={!disabled && highlight
        ? { background: 'rgba(110,75,255,0.18)', border: '1px solid rgba(110,75,255,0.3)' }
        : {}}>
      <Icon size={13} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

/* ─── Page ─────────────────────────────────────────────────────────────── */
export default function ComposerPage() {
  const { user } = useAuthStore()
  const { toast } = useAppStore()

  const background = useComposerStore(s => s.background)
  const canvasSize = useComposerStore(s => s.canvasSize)
  const setBackground = useComposerStore(s => s.setBackground)
  const setCanvasSize = useComposerStore(s => s.setCanvasSize)
  const undo = useComposerStore(s => s.undo)
  const redo = useComposerStore(s => s.redo)
  const canUndo = useComposerStore(s => s.canUndo())
  const canRedo = useComposerStore(s => s.canRedo())
  const resetCanvas = useComposerStore(s => s.resetCanvas)

  const canvasContainerRef = useRef(null)
  const stageRef = useRef(null)

  if (!user) return <Navigate to="/auth" replace />

  /* ── Background upload ── */
  const handleBackgroundUpload = useCallback(({ url, width, height }) => {
    const maxW = 1200, maxH = 800
    let w = width, h = height
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
    if (h > maxH) { w = Math.round(w * maxH / h); h = maxH }
    setCanvasSize({ width: w, height: h })
    setBackground({ url, width: w, height: h })
    toast('Đã tải ảnh nền', 'success')
  }, [setCanvasSize, setBackground, toast])

  /* ── Export PNG ──
     We hold the Stage ref directly, so we can call .toDataURL() reliably
     without poking into window.Konva or the DOM. */
  const handleDownload = useCallback(() => {
    const stage = stageRef.current
    if (!stage) { toast('Chưa có canvas để xuất', 'error'); return }
    try {
      const dataURL = stage.toDataURL({ mimeType: 'image/png', pixelRatio: 2 })
      const a = document.createElement('a')
      a.download = `ai-composer-${Date.now()}.png`
      a.href = dataURL
      document.body.appendChild(a); a.click(); a.remove()
      toast('Đã xuất ảnh PNG', 'success')
    } catch (err) {
      console.error(err)
      toast('Xuất ảnh thất bại', 'error')
    }
  }, [toast])

  const handleReset = useCallback(() => {
    if (!window.confirm('Reset toàn bộ canvas? Thao tác này không thể hoàn tác.')) return
    resetCanvas()
    toast('Đã reset canvas', 'info')
  }, [resetCanvas, toast])

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handleKey = e => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const cmd = e.ctrlKey || e.metaKey
      if (cmd && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (cmd && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [undo, redo])

  /* ── Glass styles ── */
  const glassTop    = { background: 'rgba(14,11,24,0.92)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }
  const glassLeft   = { background: 'rgba(18,14,30,0.82)', borderRight:  '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)' }
  const glassRight  = { background: 'rgba(18,14,30,0.82)', borderLeft:   '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)' }
  const glassBottom = { background: 'rgba(14,11,24,0.92)', borderTop:    '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }

  return (
    <>
      <div className="flex flex-col"
        style={{ height: 'calc(100vh - 64px)', margin: '-24px -16px -24px -16px', overflow: 'hidden' }}>

        {/* ── Top Bar ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={glassTop}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(110,75,255,0.22)' }}>
              <Sparkles size={14} className="text-brand-300" />
            </div>
            <span className="text-sm font-bold text-white/90 tracking-tight">AI Composer</span>
          </div>
          {background && (
            <span className="text-[11px] text-white/25 font-mono">
              {canvasSize.width} × {canvasSize.height}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <TopBarBtn icon={Undo2} label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
            <TopBarBtn icon={Redo2} label="Redo (Ctrl+Y)" onClick={redo} disabled={!canRedo} />
            <div className="w-px h-4 bg-white/10 mx-1" />
            <TopBarBtn icon={Download} label="Tải PNG" onClick={handleDownload} disabled={!background} highlight />
            <TopBarBtn icon={RotateCcw} label="Reset" onClick={handleReset} danger />
          </div>
        </div>

        {/* ── Editor body ── */}
        <div className="flex flex-1 min-h-0">
          {/* Left toolbar */}
          <div className="flex flex-col items-center gap-2 p-2 flex-shrink-0"
            style={{ ...glassLeft, width: 58 }}>
            <ToolBar />
          </div>

          {/* Canvas */}
          <div ref={canvasContainerRef}
            className="flex-1 flex items-center justify-center overflow-auto min-w-0 p-4"
            style={{ background: 'rgba(10,8,18,0.6)' }}>
            <AnimatePresence mode="wait">
              {!background ? (
                <motion.div key="upload"
                  initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-md flex flex-col items-center gap-3 py-4">
                  <UploadZone onUpload={handleBackgroundUpload} />
                  <p className="text-[11px] text-white/30 flex items-center gap-1.5">
                    💡 Bấm <kbd className="px-1 py-0.5 rounded font-mono text-brand-300"
                      style={{ background: 'rgba(110,75,255,0.12)', border: '1px solid rgba(110,75,255,0.25)' }}>?</kbd>
                    ở góc dưới phải để xem hướng dẫn
                  </p>
                </motion.div>
              ) : (
                <motion.div key="canvas"
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden rounded-lg" style={{ lineHeight: 0 }}>
                  <ComposerCanvas ref={stageRef} containerRef={canvasContainerRef} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right LayerPanel */}
          <div className="flex flex-col gap-3 p-3 flex-shrink-0 overflow-y-auto"
            style={{ ...glassRight, width: 272 }}>
            <LayerPanel />
          </div>
        </div>

        {/* ── Bottom CommandBar ── */}
        <div className="flex-shrink-0 p-3" style={glassBottom}>
          <CommandBar />
        </div>
      </div>

      {/* Floating help */}
      <GuideSection
        floating floatPosition="br"
        title="Hướng dẫn AI Composer"
        subtitle="Ghép nhiều ảnh, thêm text & hiệu ứng"
        accent="brand"
        icon={Wand2}
        steps={[
          { icon: Upload,   title: 'Tải nền',     desc: 'Kéo ảnh nền vào khung — đây sẽ là canvas chính.', tip: 'Kích thước ảnh nền = kích thước canvas.' },
          { icon: Layers,   title: 'Thêm layer',  desc: 'Dùng ToolBar bên trái để thêm ảnh, text, sticker.', tip: 'Mỗi layer di chuyển, scale, xoay tự do.' },
          { icon: Sliders,  title: 'Tinh chỉnh',  desc: 'Chọn layer → đổi vị trí, độ mờ, blend mode trong Layers panel.', tip: 'Ctrl+Z / Ctrl+Y để undo/redo.' },
          { icon: Download, title: 'Xuất ảnh',    desc: 'Bấm nút "Tải PNG" trên thanh trên cùng để xuất file.', tip: 'Pixel ratio 2× cho ảnh sắc nét.' },
        ]}
        tips={[
          'Mọi xử lý đều chạy trên trình duyệt — file của bạn an toàn.',
          'Bấm phím "?" để mở/đóng hướng dẫn này.',
        ]}
      />
    </>
  )
}
