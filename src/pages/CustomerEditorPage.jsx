import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Stage, Layer, Image as KonvaImage, Text as KonvaText } from 'react-konva'
import { Download, ArrowLeft, Type, Image as ImageIcon, Upload, User, Star, AlertCircle, RotateCcw, Trash2 } from 'lucide-react'
import { useShopStore } from '../store/useShopStore'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'

// ── useKonvaImage hook ─────────────────────────────────────────────────────────
function useKonvaImage(dataUrl) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!dataUrl) { setImg(null); return }
    const image = new window.Image()
    // Set crossOrigin before src to avoid canvas taint from non-data-URL sources
    if (!dataUrl.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.src = dataUrl
    image.onload = () => setImg(image)
  }, [dataUrl])
  return img
}

// ── FieldInput component ───────────────────────────────────────────────────────
const FONT_FAMILIES = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Impact']
const EXPORT_COST = 30

function FieldInput({ field, value, onChange, textStyle, onTextStyleChange }) {
  const fileRef = useRef(null)
  const [showStyle, setShowStyle] = useState(false)

  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12,
    color: 'rgba(255,255,255,0.85)',
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
    fontSize: 13,
    resize: 'vertical',
  }

  const handleImageUpload = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => onChange(ev.target.result)
    reader.readAsDataURL(f)
  }

  if (field.type === 'text') {
    const ts = textStyle || {}
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <Type size={11} className="text-brand-400" /> {field.label}
          </label>
          <button
            onClick={() => setShowStyle(v => !v)}
            className="text-[10px] px-2 py-0.5 rounded-lg transition-colors"
            style={{ background: showStyle ? 'rgba(110,75,255,0.2)' : 'rgba(255,255,255,0.05)', color: showStyle ? 'rgba(167,139,250,1)' : 'rgba(255,255,255,0.3)' }}>
            {showStyle ? 'Ẩn style' : 'Style ↓'}
          </button>
        </div>
        <textarea
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          rows={2}
          style={inputStyle}
          onFocus={e => e.target.style.borderColor = 'rgba(110,75,255,0.55)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'}
        />
        {showStyle && onTextStyleChange && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-white/30 mb-1">Font</p>
                <select
                  value={ts.fontFamily || 'Inter'}
                  onChange={e => onTextStyleChange({ fontFamily: e.target.value })}
                  className="w-full text-[11px] rounded-lg px-2 py-1.5 text-white/70 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-1">Cỡ chữ</p>
                <input
                  type="number" min={8} max={200}
                  value={ts.fontSize || 16}
                  onChange={e => onTextStyleChange({ fontSize: Number(e.target.value) })}
                  className="w-full text-[11px] rounded-lg px-2 py-1.5 text-white/70 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-white/30 mb-1">Màu chữ</p>
                <input
                  type="color"
                  value={ts.color || '#ffffff'}
                  onChange={e => onTextStyleChange({ color: e.target.value })}
                  className="w-full h-8 rounded-lg cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}
                />
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-1">Style</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => onTextStyleChange({ bold: !ts.bold })}
                    className="w-8 h-8 rounded-lg text-xs font-bold transition-all"
                    style={{ background: ts.bold ? 'rgba(110,75,255,0.3)' : 'rgba(255,255,255,0.06)', color: ts.bold ? 'rgba(167,139,250,1)' : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    B
                  </button>
                  <button
                    onClick={() => onTextStyleChange({ italic: !ts.italic })}
                    className="w-8 h-8 rounded-lg text-xs italic transition-all"
                    style={{ background: ts.italic ? 'rgba(110,75,255,0.3)' : 'rgba(255,255,255,0.06)', color: ts.italic ? 'rgba(167,139,250,1)' : 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    I
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Image field
  const isCircle = field.role === 'avt_png'
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-white/40 uppercase tracking-wider flex items-center gap-1.5 block">
        {isCircle ? <User size={11} className="text-cyan-400" /> : <ImageIcon size={11} className="text-cyan-400" />}
        {field.label}
        {isCircle && <span className="text-[9px] text-cyan-500 ml-1">• Crop tron</span>}
      </label>
      <div
        onClick={() => fileRef.current?.click()}
        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all"
        style={{
          border: '1px dashed rgba(77,208,255,0.3)',
          background: 'rgba(77,208,255,0.04)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(77,208,255,0.6)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(77,208,255,0.3)'}
      >
        {value ? (
          <div className="flex items-center gap-3 w-full">
            <img
              src={value}
              alt={field.label}
              className="object-cover flex-shrink-0"
              style={{
                width: 56,
                height: 56,
                borderRadius: isCircle ? '50%' : 8,
                border: '2px solid rgba(77,208,255,0.3)',
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/60">Ảnh đã tải lên</p>
              <p className="text-[10px] text-white/30 mt-0.5">Click để thay đổi</p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="p-1.5 rounded-lg text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all flex-shrink-0"
              title="Xóa ảnh đã tải"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={18} className="text-cyan-400/60" />
            <p className="text-xs text-white/40">Click để tải ảnh lên</p>
            <p className="text-[10px] text-white/25">PNG, JPG, WebP</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>
    </div>
  )
}

// ── KonvaOverlayText ───────────────────────────────────────────────────────────
function KonvaOverlayText({ field, value, scale, isSelected, onSelect, onDragEnd, textStyle }) {
  const nodeRef = useRef(null)
  const fontStyle = [
    (textStyle?.bold ?? field.bold) ? 'bold' : '',
    (textStyle?.italic ?? field.italic) ? 'italic' : ''
  ].filter(Boolean).join(' ') || 'normal'
  if (!value) return null
  return (
    <KonvaText
      ref={nodeRef}
      text={value}
      x={(field.x || 0) * scale}
      y={(field.y || 0) * scale}
      width={(field.width || 200) * scale}
      fontFamily={textStyle?.fontFamily || field.fontFamily || 'Inter'}
      fontSize={((textStyle?.fontSize) || field.fontSize || 16) * scale}
      fill={textStyle?.color || field.color || '#ffffff'}
      fontStyle={fontStyle}
      onClick={() => onSelect && onSelect(field.role)}
      onTap={() => onSelect && onSelect(field.role)}
      draggable
      onDragEnd={e => onDragEnd && onDragEnd(field.role, e.target.x() / scale, e.target.y() / scale)}
    />
  )
}

// ── KonvaOverlayImage ──────────────────────────────────────────────────────────
function KonvaOverlayImage({ field, value, scale, isSelected, onSelect, onDragEnd }) {
  const img = useKonvaImage(value)
  if (!img) return null
  const isCircle = field.shape === 'circle'
  const x = (field.x || 0) * scale
  const y = (field.y || 0) * scale
  const w = (field.width || 100) * scale
  const h = (field.height || 100) * scale
  return (
    <KonvaImage
      image={img}
      x={x}
      y={y}
      width={w}
      height={h}
      onClick={() => onSelect && onSelect(field.role)}
      onTap={() => onSelect && onSelect(field.role)}
      draggable
      onDragEnd={e => onDragEnd && onDragEnd(field.role, e.target.x() / scale, e.target.y() / scale)}
      clipFunc={isCircle ? (ctx) => {
        const cx = w / 2
        const cy = h / 2
        const r = Math.min(w, h) / 2
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
      } : undefined}
    />
  )
}

// ── NotFoundView ───────────────────────────────────────────────────────────────
function NotFoundView({ onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4"
      style={{ background: '#0a0a14' }}>
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <AlertCircle size={32} className="text-rose-400" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-white mb-2">San pham khong ton tai</h2>
        <p className="text-sm text-white/40">San pham nay khong duoc tim thay trong cua hang.</p>
      </div>
      <button onClick={onBack} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2">
        <ArrowLeft size={16} /> Quay lai cua hang
      </button>
    </div>
  )
}

// ── NotOwnedView ───────────────────────────────────────────────────────────────
function NotOwnedView({ onBuy }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4"
      style={{ background: '#0a0a14' }}>
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(110,75,255,0.1)', border: '1px solid rgba(110,75,255,0.2)' }}>
        <Star size={32} className="text-brand-400" />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-white mb-2">Ban chua so huu san pham nay</h2>
        <p className="text-sm text-white/40">Hay mua san pham de su dung trinh chinh sua.</p>
      </div>
      <button onClick={onBuy} className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2">
        <ArrowLeft size={16} /> Xem cua hang
      </button>
    </div>
  )
}

// ── Main CustomerEditorPage ────────────────────────────────────────────────────
export default function CustomerEditorPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const product = useShopStore(s => s.getProduct(productId))
  const { isOwned, toast } = useAppStore()
  const { user, deductBalance } = useAuthStore()
  const isAdmin = useAuthStore(s => s.isAdmin())
  const [hasPaid, setHasPaid] = useState(() => {
    try { return sessionStorage.getItem(`nova_paid_${productId}`) === '1' } catch { return false }
  })
  const [showPayModal, setShowPayModal] = useState(false)

  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 })
  const [selectedRole, setSelectedRole] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [textStyles, setTextStyles] = useState({}) // { [role]: { fontFamily, fontSize, color, bold, italic } }
  const [showLayerGuide, setShowLayerGuide] = useState(false)
  const handleTextStyleChange = useCallback((role, changes) => {
    setTextStyles(prev => ({ ...prev, [role]: { ...(prev[role] || {}), ...changes } }))
  }, [])

  const [customValues, setCustomValues] = useState(() => {
    if (!product?.editableFields) return {}
    const init = {}
    for (const f of product.editableFields) {
      init[f.role] = f.defaultValue || ''
    }
    return init
  })

  // Backfill customValues when product loads (in case store hydrates after mount)
  useEffect(() => {
    if (!product?.editableFields) return
    setCustomValues(prev => {
      const init = { ...prev }
      let changed = false
      for (const f of product.editableFields) {
        if (!(f.role in init)) {
          init[f.role] = f.defaultValue || ''
          changed = true
        }
      }
      return changed ? init : prev
    })
  }, [product])

  const bgImg = useKonvaImage(product?.previewDataUrl || null)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const handleFieldChange = useCallback((role, value) => {
    setCustomValues(prev => ({ ...prev, [role]: value }))
  }, [])

  const handleOverrideDragEnd = useCallback((role, x, y) => {
    setOverrides(prev => ({ ...prev, [role]: { x, y } }))
  }, [])

  // Reset ALL fields to default values
  const resetAllFields = useCallback(() => {
    if (!product?.editableFields) return
    const init = {}
    for (const f of product.editableFields) {
      init[f.role] = f.defaultValue || ''
    }
    setCustomValues(init)
    setOverrides({})
    setTextStyles({})
    setSelectedRole(null)
  }, [product])

  const handleDownload = useCallback((force = false) => {
    // Payment gate — admin always free, regular users must pay
    if (!force && !isAdmin && !hasPaid) {
      setShowPayModal(true)
      return
    }

    const filename = `nova-custom-${product?.title?.replace(/\s+/g, '-') || 'design'}-${Date.now()}`

    const downloadDataUrl = (dataUrl, ext = 'png') => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${filename}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }

    const downloadOriginal = () => {
      const srcUrl = (product?.images?.length > 0 ? product.images[0] : null) || product?.previewDataUrl
      if (srcUrl) {
        downloadDataUrl(srcUrl, 'png')
        toast('Đã tải ảnh gốc thành công!', 'success', 'Download')
      } else {
        toast('Không có ảnh để tải', 'error', 'Lỗi')
      }
    }

    const hasCustomFields = (product?.editableFields?.length ?? 0) > 0
    const hasCustomValues = Object.values(customValues).some(v => v && v !== '')

    if (!hasCustomFields || !hasCustomValues) {
      downloadOriginal()
      return
    }

    if (!stageRef.current) {
      downloadOriginal()
      return
    }

    try {
      const dataUrl = stageRef.current.toDataURL({ mimeType: 'image/png', pixelRatio: 2 })
      downloadDataUrl(dataUrl, 'png')
      toast('Đã tải về thành công!', 'success', 'Download')
    } catch (err) {
      console.warn('[CustomerEditor] canvas export failed, downloading original', err)
      downloadOriginal()
    }
  }, [product, customValues, toast, isAdmin, hasPaid])

  if (!product) return <NotFoundView onBack={() => navigate('/shop')} />
  if (!isOwned(productId)) return <NotOwnedView onBuy={() => navigate('/shop')} />

  const editableFields = product.editableFields || []

  const prodW = product.width || 1920
  const prodH = product.height || 1080
  const scale = Math.min(containerSize.w / prodW, containerSize.h / prodH, 1)
  const stageW = prodW * scale
  const stageH = prodH * scale

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#0a0a14' }}>
      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{
          background: 'rgba(255,255,255,0.025)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <button
          onClick={() => navigate('/shop')}
          className="p-1.5 rounded-xl transition-colors text-white/40 hover:text-white hover:bg-white/[0.06]"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Trinh chinh sua</p>
          <h1 className="text-sm font-semibold text-white truncate">{product.title}</h1>
        </div>
        <button
          onClick={handleDownload}
          className="btn-primary flex items-center gap-1.5 px-4 py-2 text-sm"
        >
          <Download size={14} /> {isAdmin || hasPaid ? 'Tải về' : `Tải về (${EXPORT_COST} ⭐)`}
        </button>
      </motion.div>

      {/* Body: 2-column */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="flex flex-col overflow-hidden flex-shrink-0"
          style={{
            width: 300,
            background: 'rgba(255,255,255,0.025)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Tuy chinh noi dung</h2>
              {editableFields.length > 0 && Object.values(customValues).some(v => v && v !== '') && (
                <button
                  onClick={resetAllFields}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all text-rose-300/70 hover:text-rose-300 hover:bg-rose-500/10"
                  title="Reset tất cả về mặc định"
                >
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
            {editableFields.length > 0 && (
              <p className="text-[10px] text-white/25 mt-0.5">{editableFields.length} truong co the chinh sua</p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {editableFields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl mb-3 flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Type size={18} className="text-white/20" />
                </div>
                <p className="text-xs text-white/30 leading-relaxed">
                  San pham nay chua co truong chinh sua.<br />
                  Admin can publish lai voi layer chuan.
                </p>
              </div>
            ) : (
              editableFields.map(field => (
                <motion.div
                  key={field.role}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <FieldInput
                    field={field}
                    value={customValues[field.role] ?? field.defaultValue ?? ''}
                    onChange={val => handleFieldChange(field.role, val)}
                    textStyle={textStyles[field.role]}
                    onTextStyleChange={field.type === 'text' ? (changes) => handleTextStyleChange(field.role, changes) : undefined}
                  />
                </motion.div>
              ))
            )}
          </div>

          {/* Layer naming guide — PSD authoring reference (intentionally static, not tied to product.editableFields) */}
          <div className="px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setShowLayerGuide(v => !v)}
              className="w-full flex items-center justify-between text-[10px] text-white/30 hover:text-white/50 transition-colors py-1">
              <span className="flex items-center gap-1.5">
                <span>📋</span> Quy chuẩn tên layer PSD
              </span>
              <span>{showLayerGuide ? '▲' : '▼'}</span>
            </button>
            {showLayerGuide && (
              <div className="mt-2 space-y-1 text-[10px]">
                {[
                  { name: 'text_1', label: 'Nội dung chính', type: 'text' },
                  { name: 'text_2', label: 'Nội dung phụ', type: 'text' },
                  { name: 'text_3', label: 'Nội dung 3', type: 'text' },
                  { name: 'title_logo', label: 'Tên / Tiêu đề Logo', type: 'text' },
                  { name: 'text_logo', label: 'Text logo phụ', type: 'text' },
                  { name: 'nvat_png', label: 'Nhân vật PNG', type: 'image' },
                  { name: 'avt_png', label: 'Avatar (tròn)', type: 'image' },
                  { name: 'logo', label: 'Logo chính', type: 'image' },
                ].map(r => (
                  <div key={r.name} className="flex items-center gap-2 py-0.5">
                    <code className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                      style={{ background: r.type === 'text' ? 'rgba(110,75,255,0.2)' : 'rgba(77,208,255,0.15)', color: r.type === 'text' ? 'rgba(167,139,250,1)' : 'rgba(77,208,255,1)' }}>
                      {r.name}
                    </code>
                    <span className="text-white/40">{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Right panel - Canvas */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 flex items-center justify-center overflow-hidden"
          style={{ background: '#0a0a10' }}
        >
          {stageW > 0 && stageH > 0 && (
            <Stage
              ref={stageRef}
              width={stageW}
              height={stageH}
            >
              <Layer>
                {bgImg && (
                  <KonvaImage
                    image={bgImg}
                    width={stageW}
                    height={stageH}
                    x={0}
                    y={0}
                  />
                )}

                {editableFields.map(field => {
                  const override = overrides[field.role]
                  const fieldWithOverride = override
                    ? { ...field, x: override.x, y: override.y }
                    : field

                  if (field.type === 'text') {
                    return (
                      <KonvaOverlayText
                        key={field.role}
                        field={fieldWithOverride}
                        value={customValues[field.role] ?? field.defaultValue ?? ''}
                        scale={scale}
                        isSelected={selectedRole === field.role}
                        onSelect={setSelectedRole}
                        onDragEnd={handleOverrideDragEnd}
                        textStyle={textStyles[field.role]}
                      />
                    )
                  }
                  if (field.type === 'image' && customValues[field.role]) {
                    return (
                      <KonvaOverlayImage
                        key={field.role}
                        field={fieldWithOverride}
                        value={customValues[field.role]}
                        scale={scale}
                        isSelected={selectedRole === field.role}
                        onSelect={setSelectedRole}
                        onDragEnd={handleOverrideDragEnd}
                      />
                    )
                  }
                  return null
                })}
              </Layer>
            </Stage>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowPayModal(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'rgba(14,14,24,0.98)', border: '1px solid rgba(110,75,255,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(110,75,255,0.15)', border: '1px solid rgba(110,75,255,0.3)' }}>
                <Download size={24} className="text-brand-400" />
              </div>
              <h3 className="font-display text-lg font-bold text-white mb-1">Tải xuống có phí</h3>
              <p className="text-sm text-white/50">Trả {EXPORT_COST} coins để tải ảnh không watermark</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>
              <span className="text-sm text-white/60">Chi phí tải xuống</span>
              <div className="flex items-center gap-1.5 font-bold text-yellow-400">
                <Star size={14} className="fill-yellow-400" /> {EXPORT_COST} coins
              </div>
            </div>
            {user && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="text-white/35">Số dư của bạn</span>
                <span className={user.balance >= EXPORT_COST ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {user?.balance?.toLocaleString('vi-VN') ?? 0} coins
                </span>
              </div>
            )}
            {!user && (
              <p className="text-xs text-center text-white/40">Vui lòng đăng nhập để thanh toán</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowPayModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm text-white/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Hủy
              </button>
              <button
                disabled={!user || (user?.balance ?? 0) < EXPORT_COST}
                onClick={() => {
                  if (!user || user.balance < EXPORT_COST) return
                  const ok = deductBalance(EXPORT_COST)
                  if (!ok) { toast('Số dư không đủ!', 'error', 'Lỗi'); return }
                  try { sessionStorage.setItem(`nova_paid_${productId}`, '1') } catch {}
                  setHasPaid(true)
                  setShowPayModal(false)
                  toast('Thanh toán thành công! Đang tải...', 'success', 'OK')
                  // Capture canvas synchronously while stageRef is still mounted,
                  // then trigger the shared download path with force=true.
                  handleDownload(true)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)', color: '#fff' }}>
                Trả {EXPORT_COST} coins
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
