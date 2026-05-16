// PsdCustomerPage — in-browser PSD editor for customers.
//
// Once a customer owns a PSD-template-backed product, this page
// loads the template (parsed bitmap layers + per-template policy)
// and lets them:
//   • edit text on layers named text_*, title_logo, text_logo
//   • swap images on layers named character_png, img_png, avt_png,
//     logo (and legacy aliases nvat_png / image_1 / logo_1)
//   • see a live composite canvas as they edit
//   • download a watermarked PNG for free (admin can disable)
//   • pay the admin-defined fee once to unlock clean PNG / JPG /
//     WebP downloads forever, on any device after re-login
//
// Locked layers (admin-set or named lock_*) never appear in the
// form. The renderer still draws their bitmap so the final image
// matches the original PSD.
//
// We do NOT use Photopea, an iframe, or any third-party host. The
// only trip outside the browser is the @webtoon/psd parser, which
// already ran on the admin side; the customer page only needs the
// rendered canvas and the parsed-layers JSON the admin published.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Loader, RotateCcw, Type, Upload, Lock,
  Image as ImageIcon, Star, AlertCircle, Eye, FileImage,
} from 'lucide-react'
import clsx from 'clsx'

import { renderTemplateToCanvas } from '../utils/psdRenderer'
import {
  detectLayerRole, isLockLayerName,
} from '../utils/layerNaming'
import { useFontStore } from '../utils/fontManager'
import { watermarkImageBuffer } from '../utils/watermark'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { useShopStore } from '../store/useShopStore'
import { usePsdStore } from '../store/usePsdStore'

// ── Supported export formats ──────────────────────────────────────────
// We always render to PNG via canvas, then optionally re-encode to
// the selected mime. JPG flattens onto white because it has no alpha.
const EXPORT_FORMATS = [
  { id: 'png',  label: 'PNG',  mime: 'image/png',  ext: 'png',  desc: 'Trong suốt, chất lượng cao' },
  { id: 'jpg',  label: 'JPG',  mime: 'image/jpeg', ext: 'jpg',  desc: 'Nhẹ, không hỗ trợ trong suốt' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', desc: 'Nhẹ nhất, hỗ trợ trong suốt' },
]

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function canvasToBlob(canvas, mime, quality = 0.92) {
  return new Promise((resolve, reject) => {
    // For JPG, pre-paint white so transparent areas don't go black.
    if (mime === 'image/jpeg') {
      const ctx = canvas.getContext('2d')
      const composed = document.createElement('canvas')
      composed.width = canvas.width
      composed.height = canvas.height
      const cctx = composed.getContext('2d')
      cctx.fillStyle = '#ffffff'
      cctx.fillRect(0, 0, composed.width, composed.height)
      cctx.drawImage(canvas, 0, 0)
      composed.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
        mime, quality,
      )
      return
    }
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
      mime, quality,
    )
  })
}

// localStorage helpers — survive reload, scoped per (user × product).
function valuesKey(userId, productId) {
  return `nova_psd_values:${userId || 'guest'}:${productId}`
}
function loadValues(userId, productId) {
  try { return JSON.parse(localStorage.getItem(valuesKey(userId, productId))) || {} }
  catch { return {} }
}
function saveValues(userId, productId, values) {
  try { localStorage.setItem(valuesKey(userId, productId), JSON.stringify(values)) }
  catch { /* quota — silently drop */ }
}

// ── Per-field input ────────────────────────────────────────────────────
function CustomField({ layer, role, value, onTextChange, onImageChange }) {
  const fileRef = useRef(null)

  if (role.type === 'text') {
    return (
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Type size={10} className="text-violet-300" /> {role.label}
        </label>
        <textarea
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none resize-none focus:border-brand-400/60"
          rows={2}
          value={value ?? ''}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={layer.text || ''}
        />
      </div>
    )
  }

  return (
    <div>
      <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
        <ImageIcon size={10} className="text-cyan-300" /> {role.label}
      </label>
      <div
        onClick={() => fileRef.current?.click()}
        className="px-3 py-3 rounded-xl flex items-center gap-2 cursor-pointer text-xs"
        style={{ background: 'rgba(77,208,255,0.04)', border: '1px dashed rgba(77,208,255,0.3)' }}>
        {value ? (
          <>
            <img
              src={value} alt={role.label}
              className={clsx('w-10 h-10 object-cover flex-shrink-0',
                role.shape === 'circle' ? 'rounded-full' : 'rounded-lg')}
              style={{ border: '1px solid rgba(77,208,255,0.3)' }}
            />
            <span className="text-white/60">Đã thay ảnh · click để đổi</span>
          </>
        ) : (
          <>
            <Upload size={14} className="text-cyan-400/60" />
            <span className="text-white/45">Click để tải ảnh lên</span>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const url = await readFileAsDataURL(f)
            onImageChange(url)
            e.target.value = ''
          }} />
      </div>
    </div>
  )
}

// ── Pay gate dialog ────────────────────────────────────────────────────
function PayGate({ open, fee, balance, onCancel, onConfirm, hasUser }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ background: 'rgba(14,14,24,0.98)', border: '1px solid rgba(110,75,255,0.3)' }}>
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'rgba(110,75,255,0.15)', border: '1px solid rgba(110,75,255,0.3)' }}>
            <Download size={24} className="text-brand-400" />
          </div>
          <h3 className="font-display text-lg font-bold text-white">Mở khoá tải về</h3>
          <p className="text-sm text-white/50 mt-1">
            Trả {fee} coins một lần — tải mọi định dạng (PNG, JPG, WebP) không watermark, không giới hạn lượt.
          </p>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>
          <span className="text-sm text-white/60">Phí mở khoá</span>
          <div className="flex items-center gap-1.5 font-bold text-yellow-400">
            <Star size={14} className="fill-yellow-400" /> {fee} coins
          </div>
        </div>
        {hasUser && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-white/35">Số dư của bạn</span>
            <span className={balance >= fee ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {balance.toLocaleString('vi-VN')} coins
            </span>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm text-white/55"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Hủy
          </button>
          <button
            disabled={!hasUser || balance < fee}
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)', color: '#fff' }}>
            Trả {fee} coins
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Format picker dropdown ─────────────────────────────────────────────
function FormatMenu({ open, onClose, onPick }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="absolute right-0 mt-2 w-56 rounded-xl p-1 z-50"
        style={{ background: 'rgba(14,14,24,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {EXPORT_FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => { onClose(); onPick(f) }}
            className="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left hover:bg-white/[0.06]"
          >
            <FileImage size={14} className="text-brand-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">{f.label}</p>
              <p className="text-[10px] text-white/40">{f.desc}</p>
            </div>
          </button>
        ))}
      </motion.div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function PsdCustomerPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const product = useShopStore((s) => s.getProduct(productId))
  const tplId = product?.psdTemplateId
  const template = usePsdStore((s) => tplId ? s.getTemplate(tplId) : null)
  const fontStore = useFontStore()

  const { toast, isOwned } = useAppStore()
  const { user, deductBalance, hasExportPaid, markExportPaid } = useAuthStore()
  const isAdmin = useAuthStore((s) => s.isAdmin())

  const previewCanvasRef = useRef(null)
  const offscreenCanvasRef = useRef(null) // full-resolution; for export

  const [values, setValues] = useState(() => loadValues(user?.id, productId))
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [activeRole, setActiveRole] = useState(null)

  const fee = template?.exportFee ?? 30
  const allowFreePreview = template?.allowFreePreview !== false
  const watermarkText = template?.watermarkText || 'NOVA · PREVIEW'
  const paid = isAdmin || fee === 0 || hasExportPaid(productId)

  const [showPayModal, setShowPayModal] = useState(false)
  const [pendingFormat, setPendingFormat] = useState(null)
  const [showFormatMenu, setShowFormatMenu] = useState(false)

  // Auto-save values to localStorage on every change so a reload
  // restores in-progress edits.
  useEffect(() => {
    if (!productId) return
    saveValues(user?.id, productId, values)
  }, [values, user?.id, productId])

  // Register the template's bundled fonts with the host browser, so
  // the renderer can call ctx.font = "<size>px <family>" and the
  // glyphs come out in the right typeface. Idempotent — re-running
  // the effect just re-adds the same FontFace, which document.fonts
  // de-dupes internally.
  useEffect(() => {
    if (!template?.fonts?.length) return
    template.fonts.forEach(async (f) => {
      try {
        const res = await fetch(f.dataUrl)
        const buf = await res.arrayBuffer()
        const face = new FontFace(f.family, buf)
        await face.load()
        document.fonts.add(face)
      } catch { /* ignore */ }
    })
  }, [template])

  // Editable layers = those with a known role and not locked.
  const editableLayers = useMemo(() => {
    if (!template?.layers) return []
    return template.layers.filter((L) => {
      if (isLockLayerName(L.name)) return false
      if (template.locks?.[L.name]) return false
      return !!detectLayerRole(L.name)
    })
  }, [template])

  // Resolve display label honouring admin overrides.
  const labelFor = useCallback((role) => {
    return template?.customLabels?.[role.role] || role.label
  }, [template])

  // Build the renderer's `overrides` object from the customer's
  // form values. We map by *layer name* so layers that share the
  // same role (e.g. duplicates in the PSD) all receive the same
  // override.
  const overrides = useMemo(() => {
    if (!template?.layers) return {}
    const out = {}
    for (const L of template.layers) {
      const role = detectLayerRole(L.name)
      if (!role) continue
      const v = values[role.role]
      if (v == null || v === '') continue
      if (role.type === 'text') {
        out[L.name] = { text: String(v) }
      } else if (typeof v === 'string' && v.startsWith('data:image')) {
        out[L.name] = { imageDataUrl: v }
      }
    }
    return out
  }, [template, values])

  // Keep the on-screen preview in sync with overrides.
  useEffect(() => {
    if (!template || !previewCanvasRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        await renderTemplateToCanvas(
          { width: template.width, height: template.height, layers: template.layers },
          overrides,
          { target: previewCanvasRef.current },
        )
      } catch (err) {
        if (!cancelled) console.warn('preview render failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [template, overrides])

  // ── Edit handlers ──────────────────────────────────────────────────
  const handleTextEdit = useCallback((roleId, text) => {
    setActiveRole(roleId)
    setValues((prev) => ({ ...prev, [roleId]: text }))
  }, [])

  const handleImageEdit = useCallback((roleId, dataUrl) => {
    setActiveRole(roleId)
    setValues((prev) => ({ ...prev, [roleId]: dataUrl }))
  }, [])

  // ── Reset ──────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setValues({})
    saveValues(user?.id, productId, {})
    toast('Đã reset về bản gốc', 'success')
  }, [toast, user?.id, productId])

  const baseFileName = useCallback(() => {
    return (product?.title || 'nova').toLowerCase().replace(/\s+/g, '-')
  }, [product])

  // Render to a fresh, full-resolution offscreen canvas. The on-screen
  // preview canvas is bound by CSS max-* rules; for export we always
  // need the doc-size pixel buffer.
  const renderForExport = useCallback(async () => {
    const canvas = offscreenCanvasRef.current || document.createElement('canvas')
    offscreenCanvasRef.current = canvas
    await renderTemplateToCanvas(
      { width: template.width, height: template.height, layers: template.layers },
      overrides,
      { target: canvas },
    )
    return canvas
  }, [template, overrides])

  // ── Free preview (watermarked PNG) ─────────────────────────────────
  const performPreviewExport = useCallback(async () => {
    if (!allowFreePreview) {
      toast('Admin đã tắt chế độ xem thử miễn phí', 'warn'); return
    }
    try {
      setBusy(true); setBusyMsg('Đang tạo bản xem thử có watermark…')
      const canvas = await renderForExport()
      const pngBlob = await canvasToBlob(canvas, 'image/png')
      const buf = await pngBlob.arrayBuffer()
      const wmBlob = await watermarkImageBuffer(buf, 'image/png', { text: watermarkText })
      downloadBlob(wmBlob, `${baseFileName()}-preview-${Date.now()}.png`)
      toast('Đã tải bản xem thử (có watermark)', 'success')
    } catch (e) {
      console.error(e); toast(e?.message || 'Lỗi khi xuất', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [allowFreePreview, renderForExport, watermarkText, baseFileName, toast])

  // ── Paid clean export ──────────────────────────────────────────────
  const performPaidExport = useCallback(async (format) => {
    try {
      setBusy(true); setBusyMsg(`Đang xuất ${format.label}…`)
      const canvas = await renderForExport()
      const blob = await canvasToBlob(canvas, format.mime)
      downloadBlob(blob, `${baseFileName()}-${Date.now()}.${format.ext}`)
      toast(`Đã tải ${format.label}`, 'success')
    } catch (e) {
      console.error(e); toast(e?.message || 'Lỗi khi xuất', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [renderForExport, baseFileName, toast])

  // Pay gate: clicking the download button picks a format then
  // either exports immediately (if already paid) or pops the modal.
  const handleDownloadClick = useCallback((format) => {
    if (paid) { performPaidExport(format); return }
    setPendingFormat(format)
    setShowPayModal(true)
  }, [paid, performPaidExport])

  const handlePayConfirm = useCallback(() => {
    if (!user) { toast('Vui lòng đăng nhập', 'warn'); return }
    const ok = deductBalance(fee)
    if (!ok) { toast('Số dư không đủ', 'error'); return }
    markExportPaid(productId)
    setShowPayModal(false)
    toast('Mở khoá thành công, đang xuất ảnh…', 'success')
    performPaidExport(pendingFormat || EXPORT_FORMATS[0])
    setPendingFormat(null)
  }, [user, deductBalance, markExportPaid, fee, productId, pendingFormat, performPaidExport, toast])

  // ── Guards ─────────────────────────────────────────────────────────
  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4"
        style={{ background: '#0a0a14' }}>
        <AlertCircle size={32} className="text-rose-400" />
        <h2 className="font-display text-xl font-bold text-white">Sản phẩm không tồn tại</h2>
        <button onClick={() => navigate('/shop')}
          className="px-4 py-2 rounded-xl text-sm bg-white/10 text-white">
          Về cửa hàng
        </button>
      </div>
    )
  }
  if (!isOwned(productId) && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4"
        style={{ background: '#0a0a14' }}>
        <Star size={32} className="text-brand-400" />
        <h2 className="font-display text-xl font-bold text-white">Bạn chưa sở hữu sản phẩm này</h2>
        <button onClick={() => navigate('/shop')}
          className="px-4 py-2 rounded-xl text-sm bg-white/10 text-white">
          Về cửa hàng
        </button>
      </div>
    )
  }
  if (!template || !template.layers?.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4"
        style={{ background: '#0a0a14' }}>
        <AlertCircle size={32} className="text-amber-400" />
        <h2 className="font-display text-xl font-bold text-white">Template không khả dụng</h2>
        <p className="text-sm text-white/50 max-w-sm">
          Admin chưa đăng PSD cho sản phẩm này, hoặc dữ liệu đã bị trình duyệt loại bỏ vì quá lớn để lưu trữ. Hãy nhờ admin đăng lại.
        </p>
        <button onClick={() => navigate('/shop')}
          className="px-4 py-2 rounded-xl text-sm bg-white/10 text-white">
          Về cửa hàng
        </button>
      </div>
    )
  }

  // Locked layers info — used to show a subtle list at the bottom of
  // the form so the customer understands what they can't change.
  const lockedNames = Array.from(new Set([
    ...Object.keys(template.locks || {}),
    ...template.layers.filter((L) => isLockLayerName(L.name)).map((L) => L.name),
  ]))

  return (
    <div className="flex flex-col" style={{ height: '100vh', background: '#0a0a14' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => navigate('/shop')}
          className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.06]">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-white/30 uppercase tracking-widest flex items-center gap-1.5">
            PSD editor
            {paid && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                style={{ background: 'rgba(43,242,192,0.15)', color: 'rgba(43,242,192,1)', border: '1px solid rgba(43,242,192,0.3)' }}>
                ĐÃ MỞ KHOÁ
              </span>
            )}
          </p>
          <h1 className="text-sm font-semibold text-white truncate">{product.title}</h1>
        </div>
        <button onClick={handleReset} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }}>
          <RotateCcw size={12} /> Reset
        </button>

        {!paid && allowFreePreview && (
          <button onClick={performPreviewExport} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
            <Eye size={12} /> Xem thử
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowFormatMenu((v) => !v)}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)', color: '#fff' }}>
            <Download size={13} />
            {paid ? 'Tải về' : `Tải về (${fee} ⭐)`}
          </button>
          <FormatMenu
            open={showFormatMenu}
            onClose={() => setShowFormatMenu(false)}
            onPick={handleDownloadClick}
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="flex flex-col flex-shrink-0 overflow-hidden"
          style={{ width: 320, background: 'rgba(255,255,255,0.025)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <h2 className="text-xs font-semibold text-white/60 uppercase tracking-wider">Tuỳ chỉnh</h2>
            <p className="text-[10px] text-white/30 mt-0.5">
              {editableLayers.length} layer có thể chỉnh · {lockedNames.length} layer đã khoá
            </p>
            {!paid && allowFreePreview && (
              <p className="text-[10px] mt-2 leading-relaxed"
                style={{ color: 'rgba(252,211,77,0.8)' }}>
                💡 Bấm "Xem thử" để tải bản preview có watermark miễn phí. Trả {fee} coins một lần để mở khoá tải sạch mọi định dạng.
              </p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {editableLayers.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-xs">
                Tất cả layer đều bị admin khoá. Bấm Reset để xem bản gốc.
              </div>
            ) : (
              editableLayers.map((layer) => {
                const role = detectLayerRole(layer.name)
                if (!role) return null
                const displayedRole = { ...role, label: labelFor(role) }
                return (
                  <div key={layer.id || layer.name}
                    className={clsx(
                      'rounded-xl transition-all',
                      activeRole === role.role && 'ring-1 ring-brand-400/40',
                    )}>
                    <CustomField
                      layer={layer}
                      role={displayedRole}
                      value={values[role.role]}
                      onTextChange={(t) => handleTextEdit(role.role, t)}
                      onImageChange={(u) => handleImageEdit(role.role, u)}
                    />
                  </div>
                )
              })
            )}
            {/* Locked-layer hint */}
            {lockedNames.length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Layer admin đã khoá</p>
                <div className="space-y-1">
                  {lockedNames.map((name) => {
                    const role = detectLayerRole(name)
                    return (
                      <div key={name}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px]"
                        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
                        <Lock size={10} className="text-rose-400 flex-shrink-0" />
                        <span className="text-rose-300/80 truncate">
                          {role ? labelFor(role) : name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Preview canvas */}
        <main className="flex-1 min-w-0 relative flex items-center justify-center p-6"
          style={{
            background:
              'repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 0 0 / 20px 20px, #0a0a14',
          }}>
          <canvas
            ref={previewCanvasRef}
            style={{
              maxWidth: '100%', maxHeight: '100%',
              width: 'auto', height: 'auto',
              boxShadow: '0 12px 36px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)',
              borderRadius: 8,
            }}
          />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
              <div className="flex flex-col items-center gap-3">
                <Loader size={28} className="text-violet-300 animate-spin" />
                <p className="text-xs text-white/70">{busyMsg}</p>
              </div>
            </div>
          )}
        </main>
      </div>

      <PayGate
        open={showPayModal}
        fee={fee}
        balance={user?.balance ?? 0}
        hasUser={!!user}
        onCancel={() => { setShowPayModal(false); setPendingFormat(null) }}
        onConfirm={handlePayConfirm}
      />
    </div>
  )
}
