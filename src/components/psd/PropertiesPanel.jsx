import { useRef, useMemo } from 'react'
import {
  Type, Image as ImageIcon, RotateCcw, Lock, Unlock,
  UploadCloud, Sparkles, Scissors, Box,
  Move, AlignLeft, AlignCenter, AlignRight,
  ArrowUp, ArrowDown, ArrowUpToLine, ArrowDownToLine,
} from 'lucide-react'
import clsx from 'clsx'
import {
  isEditableTextLayer, isEditableImageLayer,
  editableTextHint,    editableImageHint,
} from '../../utils/layerNaming'
import { useFontStore } from '../../utils/fontManager'

const BLEND_MODES = [
  { id: 'source-over', label: 'Normal'      },
  { id: 'multiply',    label: 'Multiply'    },
  { id: 'screen',      label: 'Screen'      },
  { id: 'overlay',     label: 'Overlay'     },
  { id: 'darken',      label: 'Darken'      },
  { id: 'lighten',     label: 'Lighten'     },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'color-burn',  label: 'Color Burn'  },
  { id: 'hard-light',  label: 'Hard Light'  },
  { id: 'soft-light',  label: 'Soft Light'  },
  { id: 'difference',  label: 'Difference'  },
  { id: 'exclusion',   label: 'Exclusion'   },
  { id: 'hue',         label: 'Hue'         },
  { id: 'saturation',  label: 'Saturation'  },
  { id: 'color',       label: 'Color'       },
  { id: 'luminosity',  label: 'Luminosity'  },
]

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-white/30 mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lock banner — shown above text/image controls when the layer is locked.
// User can click "Mở khoá" to flip locked = false; controls then become live.
// ---------------------------------------------------------------------------
function LockBanner({ layer, onToggleLock }) {
  if (!layer.locked) return null
  const isText = layer.type === 'text'
  const recommended = isText
    ? isEditableTextLayer(layer.name)
    : isEditableImageLayer(layer.name)
  const hint = isText ? editableTextHint() : editableImageHint()
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-xl text-xs"
      style={{
        background: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.3)',
        color: 'rgba(254,215,170,0.95)',
      }}
    >
      <Lock size={14} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold mb-1">Layer này đang bị khoá</p>
        <p className="text-white/45 mb-2 leading-snug">
          {recommended
            ? 'Layer có tên chuẩn nhưng đã bị khoá thủ công.'
            : <>Tên layer không có trong danh sách mặc định
                (<code className="px-1 py-0.5 rounded bg-black/40 text-amber-200">{hint}</code>).
                Layer không có tên hoặc tên khác đều bị khoá để giữ nguyên bố cục PSD. Bạn vẫn có thể mở khoá để sửa.</>}
        </p>
        <button
          onClick={() => onToggleLock?.(layer.id)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
          style={{
            background: 'rgba(43,242,192,0.15)',
            border: '1px solid rgba(43,242,192,0.4)',
            color: 'rgba(110,231,183,1)',
          }}
        >
          <Unlock size={11} /> Mở khoá để sửa
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FontUploader – upload .ttf/.otf and show the loaded family list.
// ---------------------------------------------------------------------------
function FontUploader() {
  const ref     = useRef(null)
  const status  = useFontStore(s => s.status)
  const error   = useFontStore(s => s.error)
  const upload  = useFontStore(s => s.uploadFont)
  const custom  = useFontStore(s => s.custom)
  return (
    <div className="space-y-2">
      <button
        onClick={() => ref.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
        style={{
          background: 'rgba(110,75,255,0.12)',
          border: '1px dashed rgba(110,75,255,0.4)',
          color: 'rgba(196,181,253,1)',
        }}
      >
        <UploadCloud size={12} />
        {status === 'loading' ? 'Đang nạp font...' : 'Upload font (.ttf / .otf)'}
        <input
          ref={ref}
          type="file"
          accept=".ttf,.otf"
          className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0]
            if (f) await upload(f)
            e.target.value = ''
          }}
        />
      </button>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
      {custom.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {custom.map(f => (
            <span
              key={f.family}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: 'rgba(43,242,192,0.1)',
                border: '1px solid rgba(43,242,192,0.25)',
                color: 'rgba(110,231,183,1)',
                fontFamily: f.family,
              }}
            >
              {f.family}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TextControls — always visible. Disabled while `layer.locked` is true.
// ---------------------------------------------------------------------------
function TextControls({ layer, onChange, onReset, onToggleLock }) {
  const customFonts = useFontStore(s => s.custom)
  const disabled = layer.locked

  // Build font list from system + custom fonts
  const fonts = useMemo(() => {
    const SYSTEM_FONTS = [
      'Inter', 'Arial', 'Georgia', 'Times New Roman',
      'Courier', 'Verdana', 'Impact', 'Tahoma', 'Helvetica',
    ]
    const c = customFonts.map(f => f.family)
    const seen = new Set()
    return [...SYSTEM_FONTS, ...c].filter(f => {
      const k = f.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k); return true
    })
  }, [customFonts])

  // wraps onChange so locked layers can't be mutated by mistake
  const safeChange = (changes) => {
    if (disabled) return
    onChange({ ...changes, isEdited: true })
  }
  const inputBase = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'white',
    opacity: disabled ? 0.5 : 1,
  }

  return (
    <div className="space-y-3">
      <LockBanner layer={layer} onToggleLock={onToggleLock} />

      <Field
        label="Nội dung text (realtime)"
        hint={disabled
          ? 'Mở khoá ở banner phía trên để sửa text.'
          : 'Đổi chữ giữ nguyên stroke, shadow, gradient, blend, opacity và clipping mask.'}
      >
        <textarea
          value={layer.textContent || ''}
          disabled={disabled}
          onChange={e => safeChange({ textContent: e.target.value })}
          rows={3}
          placeholder='Nhập text mới (vd: "BIG SALE" thay "SALE OFF")'
          className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
          style={{
            ...inputBase,
            minHeight: 78,
            fontFamily: layer.fontFamily || 'Inter',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Font">
          <select
            value={layer.fontFamily || 'Inter'}
            disabled={disabled}
            onChange={e => safeChange({ fontFamily: e.target.value })}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none"
            style={inputBase}
          >
            {fonts.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <input
            type="number"
            min={6}
            max={500}
            disabled={disabled}
            value={layer.fontSize || 16}
            onChange={e => safeChange({ fontSize: Number(e.target.value) })}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none"
            style={inputBase}
          />
        </Field>
      </div>

      <FontUploader />

      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Color">
          <input
            type="color"
            disabled={disabled}
            value={cssColorToHex(layer.color || '#ffffff')}
            onChange={e => safeChange({ color: e.target.value })}
            className="w-12 h-9 rounded-lg cursor-pointer"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              opacity: disabled ? 0.5 : 1,
            }}
          />
        </Field>
        <div className="flex gap-1.5">
          <button
            onClick={() => safeChange({ bold: !layer.bold })}
            disabled={disabled}
            className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-all disabled:opacity-50',
              layer.bold
                ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/40'
                : 'bg-white/[0.04] text-white/60 hover:text-white',
            )}
          >B</button>
          <button
            onClick={() => safeChange({ italic: !layer.italic })}
            disabled={disabled}
            className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center text-sm italic transition-all disabled:opacity-50',
              layer.italic
                ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/40'
                : 'bg-white/[0.04] text-white/60 hover:text-white',
            )}
          >I</button>
        </div>
        <Field label="Align">
          <div className="flex gap-1">
            {[
              { id: 'left', icon: AlignLeft },
              { id: 'center', icon: AlignCenter },
              { id: 'right', icon: AlignRight },
            ].map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => safeChange({ alignment: id })}
                disabled={disabled}
                className={clsx(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-50',
                  layer.alignment === id
                    ? 'bg-violet-500/30 text-violet-200 ring-1 ring-violet-500/40'
                    : 'bg-white/[0.04] text-white/60 hover:text-white',
                )}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>
        </Field>
      </div>

      <EffectsBadge layer={layer} />

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg text-white/60 hover:text-white transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <RotateCcw size={11} /> Reset về bản gốc (giữ effect)
      </button>
    </div>
  )
}

// PSD parsed text colour can be either #rgb / #rrggbb / rgb(...).
// <input type="color"> only accepts #rrggbb, so map common cases here.
function cssColorToHex(c) {
  if (!c) return '#ffffff'
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + [c[1], c[2], c[3]].map(x => x + x).join('')
    return c
  }
  const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c)
  if (m) {
    const hex = (n) => Number(n).toString(16).padStart(2, '0')
    return '#' + hex(m[1]) + hex(m[2]) + hex(m[3])
  }
  return '#ffffff'
}

function EffectsBadge({ layer }) {
  const eff = layer.effects || {}
  const list = []
  if (eff.dropShadow) list.push('Shadow')
  if (eff.stroke)     list.push('Stroke')
  if (eff.gradient)   list.push('Gradient')
  if (eff.glow)       list.push('Glow')
  if (!list.length) return null
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg text-[10px]"
      style={{
        background: 'rgba(43,242,192,0.08)',
        border: '1px solid rgba(43,242,192,0.2)',
        color: 'rgba(110,231,183,1)',
      }}>
      <Sparkles size={10} />
      <span>Đã giữ: {list.join(' · ')}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ImageControls — disabled while locked, banner explains how to unlock.
// ---------------------------------------------------------------------------
function ImageControls({ layer, onChange, onReset, onToggleLock }) {
  const fileRef = useRef(null)
  const disabled = layer.locked
  const handleReplace = (e) => {
    if (disabled) return
    const f = e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = ev => onChange({ dataUrl: ev.target.result, isEdited: true })
    reader.readAsDataURL(f)
    e.target.value = ''
  }
  return (
    <div className="space-y-3">
      <LockBanner layer={layer} onToggleLock={onToggleLock} />

      {layer.dataUrl && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            background:
              'repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 50% / 16px 16px',
          }}
        >
          <img src={layer.dataUrl} alt={layer.name} className="w-full object-contain max-h-40" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {layer.isClippingMask && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(236,72,153,0.1)', border: '1px solid rgba(236,72,153,0.3)', color: 'rgba(244,114,182,1)' }}>
            <Scissors size={11} /> Clipping
          </div>
        )}
        {layer.isSmartObject && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
            style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.3)', color: 'rgba(103,232,249,1)' }}>
            <Box size={11} /> Smart Object
          </div>
        )}
      </div>

      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 text-xs py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'rgba(110,75,255,0.12)',
          border: '1px solid rgba(110,75,255,0.3)',
          color: 'rgba(196,181,253,1)',
        }}
      >
        <ImageIcon size={12} /> Thay ảnh PNG / JPG / WebP (giữ mask & SO)
        <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={handleReplace} />
      </button>

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg text-white/60 hover:text-white transition-colors"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <RotateCcw size={11} /> Reset về bản gốc
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OrderControls — Photoshop-style "bring to front / forward / back" buttons.
// ---------------------------------------------------------------------------
function OrderControls({ onMove }) {
  if (!onMove) return null
  return (
    <Field label="Thứ tự layer">
      <div className="grid grid-cols-4 gap-1">
        {[
          { id: 'top',    icon: ArrowUpToLine,  title: 'Đưa lên trên cùng (Ctrl+Shift+])' },
          { id: 'up',     icon: ArrowUp,        title: 'Đưa lên trên (Ctrl+])'           },
          { id: 'down',   icon: ArrowDown,      title: 'Đưa xuống dưới (Ctrl+[)'         },
          { id: 'bottom', icon: ArrowDownToLine, title: 'Đưa xuống dưới cùng (Ctrl+Shift+[)' },
        ].map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            onClick={() => onMove(id)}
            title={title}
            className="h-8 rounded-lg flex items-center justify-center transition-all bg-white/[0.04] text-white/65 hover:text-white hover:bg-white/[0.08]"
          >
            <Icon size={12} />
          </button>
        ))}
      </div>
    </Field>
  )
}

// ---------------------------------------------------------------------------
// CommonControls — position, size, opacity, blend mode, order.
// ---------------------------------------------------------------------------
function CommonControls({ layer, onChange, onMove }) {
  const num = (e, key) => onChange({ [key]: Number(e.target.value), isEdited: true })
  const inputStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'white',
  }
  return (
    <div className="space-y-3 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="grid grid-cols-4 gap-1.5">
        <Field label="X">
          <input type="number" value={Math.round(layer.left ?? 0)}
            onChange={e => num(e, 'left')}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none" style={inputStyle} />
        </Field>
        <Field label="Y">
          <input type="number" value={Math.round(layer.top ?? 0)}
            onChange={e => num(e, 'top')}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none" style={inputStyle} />
        </Field>
        <Field label="W">
          <input type="number" value={Math.round(layer.width ?? 0)}
            onChange={e => num(e, 'width')}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none" style={inputStyle} />
        </Field>
        <Field label="H">
          <input type="number" value={Math.round(layer.height ?? 0)}
            onChange={e => num(e, 'height')}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none" style={inputStyle} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Opacity">
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={layer.opacity ?? 1}
            onChange={e => onChange({ opacity: Number(e.target.value), isEdited: true })}
            className="w-full accent-violet-500"
          />
          <p className="text-[10px] text-white/30 text-right">{Math.round((layer.opacity ?? 1) * 100)}%</p>
        </Field>
        <Field label="Blend Mode">
          <select
            value={layer.blendMode || 'source-over'}
            onChange={e => onChange({ blendMode: e.target.value, isEdited: true })}
            className="w-full text-xs py-1.5 px-2 rounded-lg outline-none"
            style={inputStyle}
          >
            {BLEND_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Field>
      </div>

      <OrderControls onMove={onMove} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------
export default function PropertiesPanel({ layer, onChange, onReset, onToggleLock, onMove }) {
  if (!layer) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl mb-3 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Move size={18} className="text-white/20" />
        </div>
        <p className="text-xs text-white/30">Chọn một layer để chỉnh sửa</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-2 p-3 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {layer.type === 'text'
          ? <Type size={14} className="text-violet-300" />
          : <ImageIcon size={14} className="text-cyan-300" />}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{layer.name}</p>
          <p className="text-[10px] text-white/30 capitalize">
            {layer.type} layer
            {layer.isClippingMask ? ' · clipping' : ''}
            {layer.isSmartObject ? ' · smart object' : ''}
          </p>
        </div>
        {(layer.type === 'text' || layer.type === 'image') && (
          <button
            onClick={() => onToggleLock?.(layer.id)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors',
              layer.locked
                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
            )}
            title={layer.locked ? 'Mở khoá' : 'Khoá'}
          >
            {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
            {layer.locked ? 'Đang khoá' : 'Đã mở'}
          </button>
        )}
      </div>

      {layer.type === 'text'
        ? <TextControls
            layer={layer}
            onChange={onChange}
            onReset={onReset}
            onToggleLock={onToggleLock}
          />
        : <ImageControls
            layer={layer}
            onChange={onChange}
            onReset={onReset}
            onToggleLock={onToggleLock}
          />}

      <CommonControls layer={layer} onChange={onChange} onMove={onMove} />
    </div>
  )
}
