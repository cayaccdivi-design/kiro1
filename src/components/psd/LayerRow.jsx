import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Eye, EyeOff, Type, Image as ImageIcon, Folder, FolderOpen,
  Scissors, Box, Lock, Unlock, ChevronRight, ChevronDown, GripVertical,
  ChevronUp,
} from 'lucide-react'
import clsx from 'clsx'
import { detectLayerRole } from '../../utils/layerNaming'

// ---------------------------------------------------------------------------
// Icon picker reflects auto-detected Photoshop semantics.
// ---------------------------------------------------------------------------
function LayerIcon({ layer, expanded, size = 13 }) {
  if (layer.isGroup) {
    return expanded
      ? <FolderOpen size={size} className="text-amber-300" />
      : <Folder size={size} className="text-amber-300/85" />
  }
  if (layer.isClippingMask) return <Scissors size={size} className="text-pink-300" />
  if (layer.isSmartObject)  return <Box size={size} className="text-cyan-300" />
  if (layer.type === 'text') return <Type size={size} className="text-violet-300" />
  return <ImageIcon size={size} className="text-white/60" />
}

// ---------------------------------------------------------------------------
// Tag pills shown on the right side of a layer row.
// ---------------------------------------------------------------------------
function MetaPills({ layer }) {
  const pills = []
  if (layer.isClippingMask) pills.push({ label: 'Clip', color: 'pink' })
  if (layer.isSmartObject)  pills.push({ label: 'SO',   color: 'cyan' })
  const role = detectLayerRole(layer.name)
  if (role) pills.push({ label: role.label, color: role.type === 'text' ? 'violet' : 'teal' })
  if (layer.blendMode && layer.blendMode !== 'source-over') {
    pills.push({ label: layer.blendMode, color: 'slate' })
  }
  if (!pills.length) return null
  return pills.map((p, i) => (
    <span
      key={i}
      className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
      style={{
        background: `rgba(var(--c-${p.color},255,255,255),0.18)`,
        border: `1px solid rgba(var(--c-${p.color},255,255,255),0.35)`,
        color: `rgba(var(--c-${p.color},255,255,255),1)`,
        '--c-pink':   '236,72,153',
        '--c-cyan':   '34,211,238',
        '--c-violet': '167,139,250',
        '--c-teal':   '45,212,191',
        '--c-amber':  '251,191,36',
        '--c-slate':  '148,163,184',
        maxWidth: 86,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {p.label}
    </span>
  ))
}

// ---------------------------------------------------------------------------
// LayerRow – Photoshop-style row.
// Supports: indent for nesting, group expand/collapse, visibility toggle,
//           thumbnail, drag-to-reorder, lock/unlock, double-click rename,
//           move up / move down, role badges.
// ---------------------------------------------------------------------------
export default function LayerRow({
  layer,
  selected,
  expanded,
  onSelect,
  onToggleVisible,
  onToggleExpand,
  onToggleLock,
  onRename,
  onMoveUp,
  onMoveDown,
  depth = 0,
  // drag-and-drop wiring
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  isBeingDragged,
}) {
  const inheritedHidden = layer.inheritedVisible === false
  const indent = 8 + depth * 12
  const inputRef = useRef(null)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(layer.name)

  useEffect(() => { setDraftName(layer.name) }, [layer.name])
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.select(), 0) }, [editing])

  const commitRename = () => {
    setEditing(false)
    const trimmed = (draftName || '').trim()
    if (trimmed && trimmed !== layer.name) onRename?.(layer.id, trimmed)
    else setDraftName(layer.name)
  }

  return (
    <motion.div
      layout
      onClick={() => !editing && onSelect?.(layer.id)}
      onDoubleClick={e => {
        e.stopPropagation()
        if (layer.isGroup || !onRename) return
        setEditing(true)
      }}
      draggable={Boolean(onDragStart) && !editing}
      onDragStart={e => onDragStart?.(e, layer)}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e, layer) }}
      onDrop={e => onDrop?.(e, layer)}
      className={clsx(
        'group flex items-center gap-1.5 pr-1.5 py-1.5 rounded-md cursor-pointer text-sm select-none transition-colors',
        selected
          ? 'bg-violet-500/25 ring-1 ring-violet-500/50 text-white'
          : 'text-white/75 hover:bg-white/[0.05] ring-1 ring-transparent',
        isDragOver && !selected && 'bg-violet-500/10 ring-1 ring-violet-400/40',
        isBeingDragged && 'opacity-40',
      )}
      style={{ paddingLeft: indent }}
    >
      {/* drag handle */}
      <span
        className="flex-shrink-0 text-white/20 group-hover:text-white/50 cursor-grab active:cursor-grabbing"
        title="Kéo để sắp xếp lại"
      >
        <GripVertical size={11} />
      </span>

      {/* group expand chevron */}
      {layer.isGroup ? (
        <button
          onClick={e => { e.stopPropagation(); onToggleExpand?.(layer.id) }}
          className="flex-shrink-0 text-white/50 hover:text-white"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
      ) : (
        <span className="w-[11px] flex-shrink-0" />
      )}

      {/* visibility toggle */}
      <button
        onClick={e => { e.stopPropagation(); onToggleVisible?.(layer.id) }}
        className={clsx(
          'flex-shrink-0 transition-colors',
          inheritedHidden
            ? 'text-white/15'
            : layer.visible
              ? 'text-white/60 hover:text-white'
              : 'text-white/20 hover:text-white/60',
        )}
        title={
          inheritedHidden
            ? 'Bị ẩn do group cha'
            : layer.visible
              ? 'Ẩn layer'
              : 'Hiện layer'
        }
      >
        {layer.visible && !inheritedHidden ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>

      <LayerIcon layer={layer} expanded={expanded} />

      {/* thumbnail for image layers */}
      {!layer.isGroup && layer.type === 'image' && layer.bakedDataUrl && (
        <img
          src={layer.bakedDataUrl}
          alt=""
          className="w-6 h-6 object-cover rounded flex-shrink-0"
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            background:
              'repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 50% / 6px 6px',
          }}
        />
      )}

      {/* Name (rename inline on double-click) */}
      {editing ? (
        <input
          ref={inputRef}
          value={draftName}
          onChange={e => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            else if (e.key === 'Escape') { e.preventDefault(); setDraftName(layer.name); setEditing(false) }
            e.stopPropagation()
          }}
          onClick={e => e.stopPropagation()}
          className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded outline-none"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(167,139,250,0.6)',
            color: 'white',
          }}
        />
      ) : (
        <span
          className={clsx(
            'truncate flex-1 text-xs',
            inheritedHidden && 'opacity-50',
          )}
          title={layer.isGroup ? layer.name : `${layer.name} (double-click để đổi tên)`}
        >
          {layer.name}
        </span>
      )}

      {/* Action buttons (visible on hover) */}
      {!editing && !layer.isGroup && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onMoveUp?.(layer.id) }}
            disabled={!onMoveUp}
            className="text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
            title="Đưa lên trên"
          >
            <ChevronUp size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onMoveDown?.(layer.id) }}
            disabled={!onMoveDown}
            className="text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
            title="Đưa xuống dưới"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        <MetaPills layer={layer} />

        {/* Lock toggle (text + image layers) */}
        {!layer.isGroup && (layer.type === 'text' || layer.type === 'image') && (
          <button
            onClick={e => { e.stopPropagation(); onToggleLock?.(layer.id) }}
            className={clsx(
              'flex-shrink-0 transition-colors p-0.5 rounded',
              layer.locked
                ? 'text-amber-300 hover:text-amber-200'
                : 'text-emerald-300/80 hover:text-emerald-300',
            )}
            title={layer.locked ? 'Mở khoá để sửa' : 'Đang mở khoá – click để khoá lại'}
          >
            {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
          </button>
        )}
      </div>
    </motion.div>
  )
}
