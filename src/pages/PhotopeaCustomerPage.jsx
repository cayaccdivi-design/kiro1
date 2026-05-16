// PhotopeaCustomerPage — read-only-on-locked-layers Photopea editor
// for customers who own a template-backed shop product.
//
// Flow:
//   1. Resolve template id from product.photopeaTemplateId.
//   2. Load PSD into Photopea iframe (data URL from the saved template).
//   3. Render input form for every UNLOCKED layer that has a known
//      role (text_title, text_price, text_name, avt_png, ...).
//   4. As the user types / picks images, push the change into Photopea
//      via scriptReplaceText / scriptReplaceImage.
//   5. Reset reverts the iframe to the original PSD by reloading it.
//   6. Export gates behind the admin-defined fee (defaults to 30 coins).
//      Admin always exports for free. Pay status is held in
//      sessionStorage so a single payment unlocks the session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Download, Loader, RotateCcw, Type, Upload, Lock,
  Image as ImageIcon, Star, AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'

import PhotopeaFrame from '../components/photopea/PhotopeaFrame'
import PhotopeaLayerPanel from '../components/photopea/PhotopeaLayerPanel'
import {
  scriptReplaceText, scriptReplaceImage, scriptExport, SCRIPT_LIST_LAYERS,
} from '../utils/photopeaScripts'
import { useAppStore } from '../store/useAppStore'
import { useAuthStore } from '../store/useAuthStore'
import { useShopStore } from '../store/useShopStore'
import { usePhotopeaStore } from '../store/usePhotopeaStore'
import { useFontStore } from '../utils/fontManager'
import { detectLayerRole, isLockLayerName } from '../utils/layerNaming'

const CARD = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(24px) saturate(180%)',
}

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

// ── Field renderer ─────────────────────────────────────────────────────
function CustomField({ layer, role, value, onTextChange, onImageChange, locked }) {
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
      <div>
        <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1 flex items-center gap-1">
          <Type size={10} className="text-violet-300" /> {role.label}
        </label>
        <textarea
          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none resize-none"
          rows={2}
          value={value ?? ''}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={layer.text || ''}
        />
      </div>
    )
  }

  // Image
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
          <h3 className="font-display text-lg font-bold text-white">Tải xuống có phí</h3>
          <p className="text-sm text-white/50">Trả {fee} coins để xuất ảnh không watermark</p>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl"
          style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>
          <span className="text-sm text-white/60">Phí xuất</span>
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

// ── Main page ─────────────────────────────────────────────────────────
export default function PhotopeaCustomerPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const product = useShopStore((s) => s.getProduct(productId))
  const tplId = product?.photopeaTemplateId
  const template = usePhotopeaStore((s) => tplId ? s.getTemplate(tplId) : null)
  const fontStore = useFontStore()

  const { toast, isOwned } = useAppStore()
  const { user, deductBalance } = useAuthStore()
  const isAdmin = useAuthStore((s) => s.isAdmin())

  const frameRef = useRef(null)
  const [photopeaReady, setPhotopeaReady] = useState(false)
  const [layers, setLayers] = useState(template?.layers || [])
  const [values, setValues] = useState({}) // role → string|dataUrl
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')

  const fee = template?.exportFee ?? 30
  const [hasPaid, setHasPaid] = useState(() => {
    try { return sessionStorage.getItem(`nova_paid_${productId}`) === '1' } catch { return false }
  })
  const [showPayModal, setShowPayModal] = useState(false)

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

  // Editable fields = layers with a known role and not locked.
  const editableLayers = useMemo(() => {
    return (layers || []).filter((l) => {
      if (isLockLayerName(l.name)) return false
      if (template?.locks?.[l.name]) return false
      return !!detectLayerRole(l.name)
    })
  }, [layers, template])

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
      toast('Đã reset về bản gốc', 'success')
    } catch (e) {
      console.error(e); toast('Không reset được', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [template, refreshLayers, toast])

  // ── Export with pay gate ───────────────────────────────────────────
  const performExport = useCallback(async () => {
    if (!frameRef.current) return
    try {
      setBusy(true); setBusyMsg('Đang xuất PNG…')
      const { buffers } = await frameRef.current.run(scriptExport('png'))
      const buf = buffers[0]
      if (!buf) { toast('Photopea không trả về dữ liệu', 'error'); return }
      const blob = bufferToBlob(buf, 'image/png')
      const baseName = (product?.title || 'nova').toLowerCase().replace(/\s+/g, '-')
      downloadBlob(blob, `${baseName}-${Date.now()}.png`)
      toast('Đã xuất ảnh thành công', 'success')
    } catch (e) {
      console.error(e); toast('Lỗi khi xuất', 'error')
    } finally { setBusy(false); setBusyMsg('') }
  }, [product, toast])

  const handleExportClick = useCallback(() => {
    if (isAdmin || hasPaid || fee === 0) { performExport(); return }
    setShowPayModal(true)
  }, [isAdmin, hasPaid, fee, performExport])

  const handlePayConfirm = useCallback(() => {
    if (!user) { toast('Vui lòng đăng nhập', 'warn'); return }
    const ok = deductBalance(fee)
    if (!ok) { toast('Số dư không đủ', 'error'); return }
    try { sessionStorage.setItem(`nova_paid_${productId}`, '1') } catch { /* ignore */ }
    setHasPaid(true)
    setShowPayModal(false)
    toast('Thanh toán thành công, đang xuất ảnh…', 'success')
    performExport()
  }, [user, deductBalance, fee, productId, performExport, toast])

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
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Photopea editor</p>
          <h1 className="text-sm font-semibold text-white truncate">{product.title}</h1>
        </div>
        <button onClick={handleReset} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white' }}>
          <RotateCcw size={12} /> Reset
        </button>
        <button onClick={handleExportClick} disabled={busy || !photopeaReady}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)', color: '#fff' }}>
          <Download size={13} /> {isAdmin || hasPaid || fee === 0 ? 'Tải về' : `Tải về (${fee} ⭐)`}
        </button>
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
                return (
                  <CustomField
                    key={layer.id || layer.name}
                    layer={layer}
                    role={role}
                    value={values[role.role]}
                    locked={false}
                    onTextChange={(t) => handleTextEdit(layer.name, role.role, t)}
                    onImageChange={(u) => handleImageEdit(layer.name, role.role, u)}
                  />
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
                        <span className="text-rose-300/80 truncate">{role?.label || name}</span>
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
        onCancel={() => setShowPayModal(false)}
        onConfirm={handlePayConfirm}
      />
    </div>
  )
}
