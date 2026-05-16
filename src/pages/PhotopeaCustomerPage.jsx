// PhotopeaCustomerPage — read-only-on-locked-layers Photopea editor
// for customers who own a template-backed shop product.
//
// Flow:
//   1. Resolve template id from product.photopeaTemplateId.
//   2. Load PSD into Photopea iframe (data URL from the saved template).
//   3. Render input form for every UNLOCKED layer that has a known
//      role (text_title, text_price, text_name, avt_png, ...). Labels
//      respect admin overrides (template.customLabels).
//   4. As the user types / picks images, push the change into Photopea
//      via scriptReplaceText / scriptReplaceImage. Clicking a field
//      also focuses the matching layer inside Photopea.
//   5. Reset reverts the iframe to the original PSD by reloading it.
//   6. Two export buttons:
//        • "Xem thử" — free, watermarked PNG (admin can disable).
//        • "Tải về" — gated by template.exportFee. Once paid, the
//          unlock is permanent for THAT product (any format, any
//          session) via useAuthStore.paidExports.
//   7. Customer-typed values are auto-saved per (user × product) so a
//      reload doesn't lose work.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Loader, RotateCcw, Type, Upload, Lock,
  Image as ImageIcon, Star, AlertCircle, Eye, FileImage,
} from 'lucide-react'
import clsx from 'clsx'

import PhotopeaFrame from '../components/photopea/PhotopeaFrame'
import {
  scriptReplaceText, scriptReplaceImage, scriptExport, scriptSelectLayer,
  SCRIPT_LIST_LAYERS,
} from '../utils/photopeaScripts'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { useShopStore } from '../store/useShopStore'
import { usePhotopeaStore } from '../store/usePhotopeaStore'
import { detectLayerRole, isLockLayerName } from '../utils/layerNaming'
import { watermarkImageBuffer } from '../utils/watermark'

const CARD = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(24px) saturate(180%)',
}

// ── Supported export formats ──────────────────────────────────────────
const EXPORT_FORMATS = [
  { id: 'png', label: 'PNG', mime: 'image/png',  ext: 'png',  desc: 'Trong suốt, chất lượng cao' },
  { id: 'jpg', label: 'JPG', mime: 'image/jpeg', ext: 'jpg',  desc: 'Nhẹ, không hỗ trợ trong suốt' },
  { id: 'png', label: 'WebP', mime: 'image/webp', ext: 'webp', desc: 'Nhẹ nhất, hỗ trợ trong suốt', reencode: 'webp' },
]

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function bufferToBlob(buf, mime) { return new Blob([buf], { type: mime }) }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// Re-encode a PNG ArrayBuffer to a different mime (jpg / webp).
async function reencodeToMime(buffer, srcMime, targetMime, quality = 0.92) {
  const blob = new Blob([buffer], { type: srcMime })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    // For JPG, fill white first since JPG has no alpha.
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0)
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob null'))),
        targetMime,
        quality,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

// localStorage helpers for per-(user × product) value persistence.
function valuesKey(userId, productId) {
  return `nova_photopea_values:${userId || 'guest'}:${productId}`
}
function loadValues(userId, productId) {
  try { return JSON.parse(localStorage.getItem(valuesKey(userId, productId))) || {} }
  catch { return {} }
}
function saveValues(userId, productId, values) {
  try { localStorage.setItem(valuesKey(userId, productId), JSON.stringify(values)) }
  catch { /* quota — silently drop */ }
}

// ── Field renderer ─────────────────────────────────────────────────────
function CustomField({ layer, role, value, onTextChange, onImageChange, onFocus, locked }) {
  const fileRef = useRef(null)

  if (locked) {
    return (
      <div className="px-3 py-2.5 rounded-xl text-xs flex items-center gap-2"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}>
        <Lock size={11} className="text-rose-400 flex-shrink-0" />
        <span className="text-rose-300/80">{role.label} · admin đã khoá</span>
      </div>
    )
  }

  if (role.type === 'text') {
    return (
      <div onClick={onFocus}>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Type size={10} className="text-violet-300" /> {role.label}
        </label>
        <textarea
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none resize-none focus:border-brand-400/60"
          rows={2}
          value={value ?? ''}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={onFocus}
          placeholder={layer.text || ''}
        />
      </div>
    )
  }

  // Image
  return (
    <div onClick={onFocus}>
      <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
        <ImageIcon size={10} className="text-cyan-300" /> {role.label}
      </label>
      <div
        onClick={() => fileRef.current?.click()}
        className="px-3 py-3 rounded-xl flex items-center gap-2 cursor-pointer text-xs"
        style={{ background: 'rgba(77,208,255,0.04)', border: '1px dashed rgba(77,208,255,0.3)' }}>
        {value ? (
          <>
            <img src={value} alt={role.label}
              className={clsx('w-10 h-10 object-cover flex-shrink-0',
                role.shape === 'circle' ? 'rounded-full' : 'rounded-lg')}
              style={{ border: '1px solid rgba(77,208,255,0.3)' }} />
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

// ── Format picker dropdown (for paid downloads) ───────────────────────
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
        {EXPORT_FORMATS.map((f, i) => (
          <button
            key={i}
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
export default function PhotopeaCustomerPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const product = useShopStore((s) => s.getProduct(productId))
  const tplId = product?.photopeaTemplateId
  const template = usePhotopeaStore((s) => tplId ? s.getTemplate(tplId) : null)

  const { toast, isOwned } = useAppStore()
  const { user, deductBalance, hasExportPaid, markExportPaid } = useAuthStore()
  const isAdmin = useAuthStore((s) => s.isAdmin())

  const frameRef = useRef(null)
  const [photopeaReady, setPhotopeaReady] = useState(false)
  const [layers, setLayers] = useState(template?.layers || [])
  // values are seeded from localStorage on first render so a reload
  // restores the customer's in-progress edits.
  const [values, setValues] = useState(() => loadValues(user?.id, productId))
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [activeRole, setActiveRole] = useState(null)

  const fee = template?.exportFee ?? 30
  const allowFreePreview = template?.allowFreePreview !== false
  const watermarkText = template?.watermarkText || 'NOVA · PREVIEW'
  const paid = isAdmin || fee === 0 || hasExportPaid(productId)

  const [showPayModal, setShowPayModal] = useState(false)
  const [pendingFormat, setPendingFormat] = useState(null) // format requested before pay gate
  const [showFormatMenu, setShowFormatMenu] = useState(false)

  // Auto-save customer values whenever they change.
  useEffect(() => {
    if (!productId) return
    saveValues(user?.id, productId, values)
  }, [values, user?.id, productId])

  // Re-apply persisted values to Photopea once the iframe is ready and
  // the layer list has loaded. This makes a reload feel seamless.
  const replayedRef = useRef(false)
  useEffect(() => {
    if (replayedRef.current) return
    if (!photopeaReady || !layers?.length) return
    if (!values || Object.keys(values).length === 0) {
      replayedRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      replayedRef.current = true
      for (const layer of layers) {
        const role = detectLayerRole(layer.name)
        if (!role) continue
        if (template?.locks?.[layer.name]) continue
        const v = values[role.role]
        if (v == null || v === '') continue
        try {
          if (role.type === 'text') {
            await frameRef.current?.run(scriptReplaceText(layer.name, v))
          } else if (typeof v === 'string' && v.startsWith('data:image')) {
            await frameRef.current?.run(scriptReplaceImage(layer.name, v))
          }
          if (cancelled) return
        } catch (e) { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [photopeaReady, layers, values, template])

  // Pre-register custom fonts shipped with the template — registers them
  // with the host browser so the iframe (and any export) sees them.
  useEffect(() => {
    if (!template?.fonts?.length) return
    template.fonts.forEach(async (f) => {
      try {
        const res = await fetch(f.dataUrl)
        const buf = await res.arrayBuffer()
        const face = new FontFace(f.family, buf)
        await face.load()
        document.fonts.add(face)
      } catch (e) { /* ignore */ }
    })
  }, [template])

  // Editable fields = layers with a known role and not locked. Memo so
  // re-renders don't churn — derived from layers + template.locks.
  const editableLayers = useMemo(() => {
    return (layers || []).filter((l) => {
      if (isLockLayerName(l.name)) return false
      if (template?.locks?.[l.name]) return false
      return !!detectLayerRole(l.name)
    })
  }, [layers, template])

  // Resolve display label honouring admin overrides.
  const labelFor = useCallback((role) => {
    return template?.customLabels?.[role.role] || role.label
  }, [template])

  // ── Photopea ready handler ─────────────────────────────────────────
  // Convert the persisted data URL back into an ArrayBuffer and post
  // it to the iframe. This works for any PSD size, unlike the old
  // approach which embedded the data URL into the iframe URL hash.
  const refreshLayers = useCallback(async () => {
    if (!frameRef.current) return
    const { echoes } = await frameRef.current.run(SCRIPT_LIST_LAYERS)
    const echo = echoes.find((s) => s.startsWith('LAYERS:'))
    if (echo) setLayers(JSON.parse(echo.slice('LAYERS:'.length)))
  }, [])

  const openTemplatePsd = useCallback(async () => {
    if (!frameRef.current || !template?.psdDataUrl) return
    try {
      setBusy(true); setBusyMsg('Đang mở PSD trong Photopea…')
      await frameRef.current.loadPsd(template.psdDataUrl)
      await refreshLayers()
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Không mở được PSD', 'error')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }, [template, refreshLayers, toast])

  const handleFrameReady = useCallback(() => {
    setPhotopeaReady(true)
    openTemplatePsd()
  }, [openTemplatePsd])

  // ── Layer focus ────────────────────────────────────────────────────
  // Click a field → the matching layer becomes activeLayer in Photopea
  // (so the user can see exactly what they're editing).
  const focusLayer = useCallback(async (layerName, role) => {
    setActiveRole(role)
    if (!frameRef.current || !photopeaReady) return
    try { await frameRef.current.run(scriptSelectLayer(layerName)) }
    catch (e) { /* harmless */ }
  }, [photopeaReady])

  // ── Edit handlers ──────────────────────────────────────────────────
  const handleTextEdit = useCallback(async (layerName, role, text) => {
    setValues((prev) => ({ ...prev, [role]: text }))
    if (!frameRef.current || !photopeaReady) return
    try {
      await frameRef.current.run(scriptReplaceText(layerName, text))
    } catch (e) { console.warn('text edit failed', e) }
  }, [photopeaReady])

  const handleImageEdit = useCallback(async (layerName, role, dataUrl) => {
    setValues((prev) => ({ ...prev, [role]: dataUrl }))
    if (!frameRef.current || !photopeaReady) return
    try {
      setBusy(true); setBusyMsg('Đang thay ảnh trong Photopea…')
      await frameRef.current.run(scriptReplaceImage(layerName, dataUrl))
      await refreshLayers()
    } catch (e) { console.warn('image edit failed', e) }
    finally { setBusy(false); setBusyMsg('') }
  }, [photopeaReady, refreshLayers])

  // ── Reset ──────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!frameRef.current || !template?.psdDataUrl) return
    try {
      setBusy(true); setBusyMsg('Đang reset về bản gốc…')
      // loadPsd handles closing existing docs internally.
      await frameRef.current.loadPsd(template.psdDataUrl)
      await refreshLayers()
      setValues({})
      saveValues(user?.id, productId, {})
      replayedRef.current = true // already at the original — no replay needed
      toast('Đã reset về bản gốc', 'success')
    } catch (e) {
      console.error(e); toast('Không reset được', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [template, refreshLayers, toast, user?.id, productId])

  // ── Export internals ───────────────────────────────────────────────
  // Photopea's saveToOE only knows png/jpg/psd. WebP is post-processed
  // by re-encoding the PNG buffer through canvas.
  const exportFromPhotopea = useCallback(async (format) => {
    if (!frameRef.current) throw new Error('Photopea chưa sẵn sàng')
    // For WebP we ask Photopea for PNG, then re-encode.
    const ppFormat = format.id === 'png' && format.reencode === 'webp' ? 'png'
      : format.id
    const { buffers } = await frameRef.current.run(scriptExport(ppFormat))
    const buf = buffers[0]
    if (!buf) throw new Error('Photopea không trả về dữ liệu')
    return { buffer: buf, mime: ppFormat === 'jpg' ? 'image/jpeg' : 'image/png' }
  }, [])

  const baseFileName = useCallback(() => {
    return (product?.title || 'nova').toLowerCase().replace(/\s+/g, '-')
  }, [product])

  // ── Free preview (watermarked) ─────────────────────────────────────
  const performPreviewExport = useCallback(async () => {
    if (!allowFreePreview) {
      toast('Admin đã tắt chế độ xem thử miễn phí', 'warn')
      return
    }
    try {
      setBusy(true); setBusyMsg('Đang tạo bản xem thử có watermark…')
      const fmt = EXPORT_FORMATS[0] // PNG
      const { buffer, mime } = await exportFromPhotopea(fmt)
      const wmBlob = await watermarkImageBuffer(buffer, mime, { text: watermarkText })
      downloadBlob(wmBlob, `${baseFileName()}-preview-${Date.now()}.png`)
      toast('Đã tải bản xem thử (có watermark)', 'success')
    } catch (e) {
      console.error(e); toast(e?.message || 'Lỗi khi xuất', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [allowFreePreview, exportFromPhotopea, watermarkText, baseFileName, toast])

  // ── Paid clean export (any format) ─────────────────────────────────
  const performPaidExport = useCallback(async (format) => {
    try {
      setBusy(true); setBusyMsg(`Đang xuất ${format.label}…`)
      const { buffer, mime } = await exportFromPhotopea(format)
      let outBlob
      if (format.label === 'WebP') {
        outBlob = await reencodeToMime(buffer, mime, 'image/webp')
      } else {
        outBlob = bufferToBlob(buffer, format.mime)
      }
      downloadBlob(outBlob, `${baseFileName()}-${Date.now()}.${format.ext}`)
      toast(`Đã tải ${format.label}`, 'success')
    } catch (e) {
      console.error(e); toast(e?.message || 'Lỗi khi xuất', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [exportFromPhotopea, baseFileName, toast])

  // ── Click handlers ─────────────────────────────────────────────────
  const handleDownloadClick = useCallback((format) => {
    if (paid) {
      performPaidExport(format)
      return
    }
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
  if (!template?.psdDataUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center px-4"
        style={{ background: '#0a0a14' }}>
        <AlertCircle size={32} className="text-amber-400" />
        <h2 className="font-display text-xl font-bold text-white">Template không khả dụng</h2>
        <p className="text-sm text-white/50 max-w-sm">
          Admin chưa đăng PSD cho sản phẩm này, hoặc dung lượng quá lớn để khôi phục sau khi reload trình duyệt.
        </p>
        <button onClick={() => navigate('/shop')}
          className="px-4 py-2 rounded-xl text-sm bg-white/10 text-white">
          Về cửa hàng
        </button>
      </div>
    )
  }

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
            Photopea editor
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

        {/* Free preview button (only if allowed and not yet paid) */}
        {!paid && allowFreePreview && (
          <button onClick={performPreviewExport} disabled={busy || !photopeaReady}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}>
            <Eye size={12} /> Xem thử
          </button>
        )}

        {/* Download button — opens format menu */}
        <div className="relative">
          <button
            onClick={() => setShowFormatMenu((v) => !v)}
            disabled={busy || !photopeaReady}
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
              {editableLayers.length} layer có thể chỉnh · {Object.keys(template.locks || {}).length} layer đã khoá
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
                // Apply admin label override.
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
                      locked={false}
                      onTextChange={(t) => handleTextEdit(layer.name, role.role, t)}
                      onImageChange={(u) => handleImageEdit(layer.name, role.role, u)}
                      onFocus={() => focusLayer(layer.name, role.role)}
                    />
                  </div>
                )
              })
            )}
            {/* Locked-layer hint list */}
            {Object.keys(template.locks || {}).length > 0 && (
              <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Layer admin đã khoá</p>
                <div className="space-y-1">
                  {Object.keys(template.locks || {}).map((name) => {
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

        {/* Photopea iframe */}
        <main className="flex-1 min-w-0 relative">
          <PhotopeaFrame
            ref={frameRef}
            onReady={handleFrameReady}
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
