import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import { MousePointer, Type, ImagePlus, Shapes, Wand2, Smile } from 'lucide-react'
import { useComposerStore } from '../../store/useComposerStore'

const TOOLS = [
  { id: 'move',    icon: MousePointer, tooltip: 'Move (V)'    },
  { id: 'text',    icon: Type,         tooltip: 'Text (T)'    },
  { id: 'image',   icon: ImagePlus,    tooltip: 'Image (I)'   },
  { id: 'shapes',  icon: Shapes,       tooltip: 'Shapes (S)'  },
  { id: 'effects', icon: Wand2,        tooltip: 'Effects (E)' },
  { id: 'stickers',icon: Smile,        tooltip: 'Stickers (K)'},
]

const BASE_COLORS = ['#ffffff','#000000','#ff2e63','#6e4bff','#4dd0ff','#2bf2c0','#facc15','#f97316']
const STICKERS = ['😂','🔥','💯','✨','🎉','👑','💜','🖤','⚡','🌈','🎭','🦋','🌸','🐉','🦁','💎','🏆','🚀','💫','🎯','🌊','🍀','⭐','🎪']
const FONT_SIZES = [12,14,16,18,20,24,28,32,36,48,64,72,96]

function Tooltip({ label, children }) {
  const [v, setV] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setV(true)} onMouseLeave={() => setV(false)}>
      {children}
      <AnimatePresence>
        {v && (
          <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.15 }} className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 pointer-events-none">
            <div className="px-2.5 py-1 rounded-lg text-xs font-medium text-white whitespace-nowrap"
              style={{ background: 'rgba(14,14,24,0.95)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(16px)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
              {label}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TextPanel({ onClose }) {
  const { addLayer } = useComposerStore()
  const [text, setText] = useState('Văn bản mới')
  const [fontSize, setFontSize] = useState(32)
  const [color, setColor] = useState('#ffffff')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)

  const handleAdd = () => {
    if (!text.trim()) return
    addLayer({ type: 'text', name: text.slice(0, 20), text, fontSize, fill: color, bold, italic, x: 120, y: 120, width: Math.max(120, fontSize * text.length * 0.6), height: fontSize * 1.5, opacity: 1 })
    onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-white/60 mb-1">Văn bản</p>
      <input className="w-full bg-white/[0.06] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/60 transition-all"
        placeholder="Nhập văn bản..." value={text} onChange={e => setText(e.target.value)} />
      <div>
        <p className="text-[10px] text-white/35 mb-1.5">Cỡ chữ: {fontSize}px</p>
        <div className="flex flex-wrap gap-1">
          {FONT_SIZES.map(s => (
            <button key={s} onClick={() => setFontSize(s)}
              className={clsx('px-2 py-0.5 rounded-lg text-[11px] font-medium transition-all',
                fontSize === s ? 'bg-brand-500/30 text-brand-300 border border-brand-500/50' : 'bg-white/[0.04] text-white/40 border border-white/[0.07] hover:bg-white/[0.08]')}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-white/35 mb-1.5">Màu chữ</p>
        <div className="flex items-center gap-2 flex-wrap">
          {BASE_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-7 h-7 rounded-lg transition-all hover:scale-110"
              style={{ background: c, border: color === c ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent', outline: color === c ? '2px solid rgba(110,75,255,0.6)' : 'none' }} />
          ))}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-7 h-7 rounded-lg cursor-pointer border-0 p-0" title="Chọn màu khác" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setBold(b => !b)} className={clsx('flex-1 py-1.5 rounded-xl text-sm font-bold transition-all', bold ? 'bg-brand-500/25 text-brand-300 border border-brand-500/45' : 'bg-white/[0.04] text-white/40 border border-white/[0.07] hover:bg-white/[0.08]')}>B</button>
        <button onClick={() => setItalic(i => !i)} className={clsx('flex-1 py-1.5 rounded-xl text-sm italic transition-all', italic ? 'bg-brand-500/25 text-brand-300 border border-brand-500/45' : 'bg-white/[0.04] text-white/40 border border-white/[0.07] hover:bg-white/[0.08]')}>I</button>
      </div>
      <div className="rounded-xl flex items-center justify-center min-h-12 px-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize: Math.min(fontSize, 36), color, fontWeight: bold ? 'bold' : 'normal', fontStyle: italic ? 'italic' : 'normal' }}>{text || 'Preview'}</span>
      </div>
      <button onClick={handleAdd} className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)', boxShadow: '0 4px 16px rgba(110,75,255,0.35)' }}>
        Thêm vào canvas
      </button>
    </div>
  )
}

function EffectsPanel() {
  const { effects, selectedLayerId, updateLayer } = useComposerStore()
  const activeEffects = effects.filter(e => e.active)

  const applyEffect = (fx) => {
    if (!selectedLayerId) return
    updateLayer(selectedLayerId, { cssFilter: fx.type === 'filter' ? fx.value : undefined, cssOverlay: fx.type === 'overlay' ? fx.value : undefined })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-white/60 mb-1">Áp dụng hiệu ứng</p>
      {!selectedLayerId && <p className="text-[11px] text-amber-400/80 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">Chọn một layer trước khi áp dụng hiệu ứng</p>}
      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-0.5">
        {activeEffects.map(fx => (
          <motion.button key={fx.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => applyEffect(fx)} disabled={!selectedLayerId}
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-full h-8 rounded-lg overflow-hidden" style={{ background: fx.type === 'overlay' ? fx.value : 'linear-gradient(90deg,#6e4bff,#4dd0ff)', filter: fx.type === 'filter' ? fx.value : 'none' }} />
            <span className="text-[10px] text-white/60 font-medium text-center leading-tight">{fx.icon} {fx.name}</span>
          </motion.button>
        ))}
        {activeEffects.length === 0 && <p className="col-span-2 text-xs text-white/25 text-center py-4">Chưa có effect nào được kích hoạt</p>}
      </div>
    </div>
  )
}

function StickersPanel({ onClose }) {
  const { addLayer } = useComposerStore()
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-white/60 mb-1">Stickers</p>
      <div className="grid grid-cols-6 gap-1.5 max-h-56 overflow-y-auto">
        {STICKERS.map((emoji, i) => (
          <motion.button key={i} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
            onClick={() => { addLayer({ type: 'sticker', name: emoji, text: emoji, fontSize: 64, x: 160, y: 160, width: 80, height: 80 }); onClose() }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xl transition-all hover:bg-white/[0.08]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {emoji}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function ImageUploadPanel({ onClose }) {
  const { addLayer } = useComposerStore()
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target.result
      const img = new window.Image()
      img.onload = () => { addLayer({ type: 'image', name: file.name.replace(/\.[^.]+$/, ''), url, width: Math.min(img.naturalWidth, 500), height: Math.min(img.naturalHeight, 500), x: 60, y: 60 }) }
      img.src = url
    }
    reader.readAsDataURL(file)
    onClose()
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-white/60 mb-1">Thêm ảnh</p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button onClick={() => fileRef.current?.click()}
        className="w-full py-3 rounded-xl flex flex-col items-center gap-2 transition-all hover:bg-white/[0.08]"
        style={{ background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.15)' }}>
        <ImagePlus size={22} className="text-brand-300" />
        <span className="text-xs text-white/50">Chọn file ảnh từ máy</span>
        <span className="text-[10px] text-white/25">PNG, JPG, GIF, WebP</span>
      </button>
    </div>
  )
}

function FloatingPanel({ toolId, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -12, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="absolute left-full top-0 ml-3 z-50 w-64"
      style={{ background: 'rgba(14,14,24,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '1rem', backdropFilter: 'blur(32px) saturate(180%)', boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)', padding: '1rem' }}>
      {toolId === 'text'     && <TextPanel onClose={onClose} />}
      {toolId === 'image'    && <ImageUploadPanel onClose={onClose} />}
      {toolId === 'effects'  && <EffectsPanel />}
      {toolId === 'stickers' && <StickersPanel onClose={onClose} />}
      {toolId === 'shapes'   && <div><p className="text-xs font-semibold text-white/60 mb-3">Hình dạng</p><p className="text-[11px] text-white/30">Tính năng shapes đang phát triển 🚧</p></div>}
    </motion.div>
  )
}

export default function ToolBar() {
  const [activeTool, setActiveTool] = useState('move')
  const [openPanel, setOpenPanel] = useState(null)

  const handleToolClick = (toolId) => {
    setActiveTool(toolId)
    if (toolId === 'move') { setOpenPanel(null); return }
    setOpenPanel(prev => prev === toolId ? null : toolId)
  }

  return (
    <div className="relative flex flex-col">
      <div className="flex flex-col gap-1 p-1.5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px) saturate(180%)', boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
        {TOOLS.map(tool => {
          const isActive = activeTool === tool.id
          const isPanelOpen = openPanel === tool.id
          return (
            <Tooltip key={tool.id} label={tool.tooltip}>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleToolClick(tool.id)}
                className={clsx('relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
                  isActive ? 'text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.06]')}
                style={isActive ? { background: 'linear-gradient(135deg, rgba(110,75,255,0.35), rgba(77,208,255,0.2))', border: '1px solid rgba(110,75,255,0.5)', boxShadow: '0 2px 12px rgba(110,75,255,0.35)' } : {}}>
                <tool.icon size={17} />
                {isPanelOpen && <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-brand-400 border border-dark-200" />}
              </motion.button>
            </Tooltip>
          )
        })}
      </div>

      <AnimatePresence>
        {openPanel && <FloatingPanel toolId={openPanel} onClose={() => { setOpenPanel(null); setActiveTool('move') }} />}
      </AnimatePresence>
    </div>
  )
}
