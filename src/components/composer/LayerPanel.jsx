import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import clsx from 'clsx'
import {
  GripVertical, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown,
  Copy, Trash2, Layers,
} from 'lucide-react'
import { useComposerStore } from '../../store/useComposerStore'

const TYPE_STYLE = {
  image:   { bg: 'rgba(77,208,255,0.12)', color: '#4dd0ff', label: 'IMG'  },
  text:    { bg: 'rgba(110,75,255,0.12)', color: '#a893ff', label: 'TXT'  },
  sticker: { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d', label: 'STKR' },
}

function LayerRow({ layer, isSelected, onSelect }) {
  const { updateLayer, removeLayer, moveLayerUp, moveLayerDown, duplicateLayer } = useComposerStore()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(layer.name)
  const inputRef = useRef()

  const t = TYPE_STYLE[layer.type] || TYPE_STYLE.image

  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== layer.name) updateLayer(layer.id, { name: trimmed })
    else setName(layer.name)
    setEditingName(false)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, scale: 0.97 }}
      onClick={() => onSelect(layer.id)}
      className={clsx(
        'group relative flex flex-col rounded-xl transition-all duration-200 cursor-pointer select-none',
        isSelected ? 'bg-brand-500/[0.08]' : 'hover:bg-white/[0.03]',
      )}
      style={{ border: isSelected ? '1px solid rgba(110,75,255,0.45)' : '1px solid transparent' }}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <GripVertical size={14} className="text-white/20 flex-shrink-0" />

        {/* Thumbnail */}
        <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-base"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {layer.url
            ? <img src={layer.url} alt={layer.name} className="w-full h-full object-cover" />
            : layer.type === 'text' || layer.type === 'sticker'
              ? <span className="text-base">{layer.type === 'sticker' ? layer.text : 'T'}</span>
              : <span className="text-lg">🖼</span>}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') { setName(layer.name); setEditingName(false) }
              }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-white/[0.08] border border-brand-500/50 rounded-lg px-2 py-0.5 text-xs text-white outline-none"
              autoFocus
            />
          ) : (
            <p
              onDoubleClick={e => {
                e.stopPropagation(); setEditingName(true); setName(layer.name)
                setTimeout(() => inputRef.current?.select(), 40)
              }}
              className="text-xs font-medium text-white/80 truncate"
              title="Double-click để đổi tên"
            >
              {layer.name}
            </p>
          )}
          <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase mt-0.5"
            style={{ background: t.bg, color: t.color }}>
            {t.label}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={e => { e.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }) }}
            title={layer.visible ? 'Ẩn layer' : 'Hiện layer'}
            className={clsx('p-1.5 rounded-lg transition-all',
              layer.visible ? 'text-white/50 hover:text-white' : 'text-white/20 hover:text-white/50')}>
            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button onClick={e => { e.stopPropagation(); updateLayer(layer.id, { locked: !layer.locked }) }}
            title={layer.locked ? 'Mở khóa' : 'Khóa layer'}
            className={clsx('p-1.5 rounded-lg transition-all',
              layer.locked ? 'text-amber-400' : 'text-white/30 hover:text-white/60')}>
            {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <button onClick={e => { e.stopPropagation(); moveLayerUp(layer.id) }}
            title="Đưa lên trên" className="p-1.5 rounded-lg text-white/25 hover:text-white/70">
            <ChevronUp size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); moveLayerDown(layer.id) }}
            title="Đưa xuống dưới" className="p-1.5 rounded-lg text-white/25 hover:text-white/70">
            <ChevronDown size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); duplicateLayer(layer.id) }}
            title="Nhân bản" className="p-1.5 rounded-lg text-white/25 hover:text-cyan-400">
            <Copy size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); removeLayer(layer.id) }}
            title="Xóa" className="p-1.5 rounded-lg text-white/25 hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Opacity slider when selected */}
      <AnimatePresence>
        {isSelected && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-3 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/35 w-14 flex-shrink-0">Opacity</span>
              <input type="range" min={0} max={1} step={0.01} value={layer.opacity ?? 1}
                onClick={e => e.stopPropagation()}
                onChange={e => { e.stopPropagation(); updateLayer(layer.id, { opacity: +e.target.value }) }}
                className="flex-1 accent-brand-500 h-1.5" />
              <span className="text-[10px] text-white/50 w-8 text-right flex-shrink-0">
                {Math.round((layer.opacity ?? 1) * 100)}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function LayerPanel() {
  const layers = useComposerStore(s => s.layers)
  const selectedLayerId = useComposerStore(s => s.selectedLayerId)
  const selectLayer = useComposerStore(s => s.selectLayer)

  // Display order: top of canvas (last in array) = top of panel.
  const displayed = [...layers].reverse()

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
      <div className="flex items-center justify-between px-3 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(110,75,255,0.18)', border: '1px solid rgba(110,75,255,0.3)' }}>
            <Layers size={12} className="text-brand-300" />
          </div>
          <span className="text-xs font-semibold text-white/70">Layers</span>
          {layers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-brand-300"
              style={{ background: 'rgba(110,75,255,0.15)', border: '1px solid rgba(110,75,255,0.25)' }}>
              {layers.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0 max-h-[420px]">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(110,75,255,0.1)', border: '1px solid rgba(110,75,255,0.2)' }}>
              <Layers size={28} className="text-brand-400 opacity-60" />
            </div>
            <p className="text-sm font-medium text-white/40 mb-1">Chưa có layer nào</p>
            <p className="text-xs text-white/20 leading-relaxed">
              Dùng toolbar bên trái hoặc nhập lệnh AI để tạo layer tự động.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {displayed.map(layer => (
              <LayerRow key={layer.id} layer={layer}
                isSelected={selectedLayerId === layer.id}
                onSelect={selectLayer} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
