// PhotopeaAdminPage — admin-side authoring UI for Photopea-backed
// templates.
//
// Flow:
//   1. Admin uploads a .psd. The bytes are read as a data URL and fed
//      into the embedded Photopea iframe via PhotopeaFrame.
//   2. Once the iframe signals ready, we run the SCRIPT_LIST_LAYERS
//      script to inventory the layer tree.
//   3. Admin toggles per-layer locks, optionally uploads custom fonts
//      that the PSD references, and may run the "AI auto placement"
//      script to align canonical roles to a clean grid.
//   4. Admin clicks "Đăng lên cửa hàng": we export a PNG thumbnail,
//      persist the template via usePhotopeaStore.createTemplate, also
//      register a matching shop product so customers can discover it,
//      then redirect to the shop page.
//
// The page is intentionally self-contained — it does not modify the
// legacy AdminComposerPage; instead it lives at /admin/photopea so the
// new flow can grow in parallel without breaking existing behaviour.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, Upload, FileType, Layers, Sparkles, Lock, RotateCcw,
  Store, Loader, Save, Download, AlertCircle, Type,
} from 'lucide-react'
import clsx from 'clsx'

import PhotopeaFrame from '../components/photopea/PhotopeaFrame'
import PhotopeaLayerPanel from '../components/photopea/PhotopeaLayerPanel'
import {
  SCRIPT_LIST_LAYERS, SCRIPT_AUTO_PLACEMENT, scriptExport,
} from '../utils/photopeaScripts'
import { useAuthStore } from '../store/useAuthStore'
import { useAppStore } from '../store/useAppStore'
import { usePhotopeaStore } from '../store/usePhotopeaStore'
import { useShopStore } from '../store/useShopStore'
import { useFontStore } from '../utils/fontManager'
import {
  isLockLayerName, lockTargetRole, detectLayerRole,
} from '../utils/layerNaming'

// ── Shared design tokens (matches existing admin pages) ────────────────
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

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.onerror = reject
    r.readAsArrayBuffer(file)
  })
}

// Convert ArrayBuffer payload from Photopea (PSD/PNG export) to a Blob.
function bufferToBlob(buf, mime) {
  return new Blob([buf], { type: mime })
}

// Trigger a browser download for a Blob.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export default function PhotopeaAdminPage() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const { toast } = useAppStore()
  const createTemplate = usePhotopeaStore((s) => s.createTemplate)
  const addProduct = useShopStore((s) => s.addProduct)
  const fontStore = useFontStore()

  const frameRef = useRef(null)
  const psdInputRef = useRef(null)
  const fontInputRef = useRef(null)

  // Source PSD state — once a PSD is uploaded we keep the data URL so
  // we can both (a) initialise the iframe and (b) embed it into the
  // saved template payload.
  const [psdName, setPsdName] = useState('')
  const [psdDataUrl, setPsdDataUrl] = useState(null)
  const [psdBuffer, setPsdBuffer] = useState(null)

  const [photopeaReady, setPhotopeaReady] = useState(false)
  const [layers, setLayers] = useState([])
  const [locks, setLocks] = useState({})           // { [layerName]: true }
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [selectedName, setSelectedName] = useState(null)

  // Template metadata for publish
  const [templateName, setTemplateName] = useState('')
  const [exportFee, setExportFee] = useState(30)
  const [productPrice, setProductPrice] = useState(0)
  const [productDesc, setProductDesc] = useState('')
  const [productCategory, setProductCategory] = useState('thumbnail')

  // Custom fonts uploaded for this template
  const [customFonts, setCustomFonts] = useState([]) // [{ family, dataUrl }]

  // Guard the page — only admin may enter.
  useEffect(() => {
    if (!isAdmin) navigate('/')
  }, [isAdmin, navigate])

  // Helper: parse layer list from Photopea echoes and hydrate state.
  const ingestLayerList = useCallback((list) => {
    setLayers(list)
    // Pre-fill locks for any layer whose NAME implies it (lock_* pattern).
    const initialLocks = {}
    for (const l of list) {
      if (isLockLayerName(l.name)) {
        const target = lockTargetRole(l.name)
        if (target) {
          const match = list.find((x) => detectLayerRole(x.name)?.role === target)
          if (match) initialLocks[match.name] = true
        }
      }
    }
    setLocks((prev) => ({ ...initialLocks, ...prev }))
  }, [])

  // Load the current PSD into the (already-ready) Photopea iframe and
  // immediately list layers. Centralises the open-then-inventory flow
  // so it's identical whether triggered by the initial upload or by
  // the iframe finishing its boot sequence.
  const openPsdAndListLayers = useCallback(async (buffer) => {
    if (!frameRef.current || !buffer) return
    try {
      setBusy(true); setBusyMsg('Đang mở PSD trong Photopea…')
      await frameRef.current.loadPsd(buffer)
      setBusyMsg('Đang đọc layer từ Photopea…')
      const { echoes } = await frameRef.current.run(SCRIPT_LIST_LAYERS)
      const echo = echoes.find((s) => typeof s === 'string' && s.startsWith('LAYERS:'))
      if (!echo) {
        toast('Photopea đã mở PSD nhưng không trả về layer.', 'error')
        return
      }
      ingestLayerList(JSON.parse(echo.slice('LAYERS:'.length)))
      toast('Đã đọc xong layer', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Không mở được PSD trong Photopea', 'error')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }, [ingestLayerList, toast])

  // ── PSD upload ──────────────────────────────────────────────────────
  const handlePsdUpload = useCallback(async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.psd')) {
      toast('Chỉ hỗ trợ file .psd', 'error')
      return
    }
    if (file.size > 80 * 1024 * 1024) {
      toast('File quá lớn (tối đa 80MB)', 'error')
      return
    }
    try {
      setBusy(true); setBusyMsg('Đang đọc file…')
      const [dataUrl, buf] = await Promise.all([
        readFileAsDataURL(file),
        readFileAsArrayBuffer(file),
      ])
      setPsdName(file.name)
      setPsdDataUrl(dataUrl)
      setPsdBuffer(buf)
      setTemplateName((prev) => prev || file.name.replace(/\.psd$/i, ''))
      setLayers([]); setLocks({}); setSelectedName(null)
      // If this is the first PSD, mounting <PhotopeaFrame> below will
      // trigger handleFrameReady which then calls openPsdAndListLayers.
      // If the iframe is already ready (admin uploaded a 2nd PSD), we
      // need to open it ourselves.
      if (photopeaReady) {
        // Use a microtask so React commits psdBuffer before we read it.
        queueMicrotask(() => openPsdAndListLayers(buf))
      }
    } catch (e) {
      console.error(e)
      toast('Không đọc được file PSD', 'error')
    } finally {
      // Keep busy until openPsdAndListLayers takes over.
      if (!photopeaReady) { setBusy(false); setBusyMsg('') }
    }
  }, [toast, photopeaReady, openPsdAndListLayers])

  // ── Photopea ready → open the PSD that's been waiting ─────────────
  const handleFrameReady = useCallback(() => {
    setPhotopeaReady(true)
    if (psdBuffer) openPsdAndListLayers(psdBuffer)
  }, [psdBuffer, openPsdAndListLayers])

  // ── Lock toggle ────────────────────────────────────────────────────
  const toggleLock = useCallback((layerName) => {
    setLocks((prev) => {
      const next = { ...prev }
      if (next[layerName]) delete next[layerName]
      else next[layerName] = true
      return next
    })
  }, [])

  // ── AI auto placement ──────────────────────────────────────────────
  const runAutoPlacement = useCallback(async () => {
    if (!frameRef.current) return
    try {
      setBusy(true); setBusyMsg('Đang chạy AI auto placement…')
      const { echoes } = await frameRef.current.run(SCRIPT_AUTO_PLACEMENT)
      const ok = echoes.find((s) => s.startsWith('AUTO_OK:'))
      if (ok) {
        const moved = JSON.parse(ok.slice('AUTO_OK:'.length))
        toast(`Đã căn chỉnh ${moved.length} layer`, 'success')
        // Refresh layer list bounds.
        const { echoes: e2 } = await frameRef.current.run(SCRIPT_LIST_LAYERS)
        const echo = e2.find((s) => s.startsWith('LAYERS:'))
        if (echo) setLayers(JSON.parse(echo.slice('LAYERS:'.length)))
      } else {
        toast('Auto placement không phản hồi', 'error')
      }
    } catch (e) {
      console.error(e)
      toast('Lỗi khi chạy auto placement', 'error')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }, [toast])

  // ── Custom font upload ─────────────────────────────────────────────
  const handleFontUpload = useCallback(async (file) => {
    if (!file) return
    try {
      const family = await fontStore.uploadFont(file)
      if (!family) {
        toast(fontStore.error || 'Không nạp được font', 'error')
        return
      }
      // Encode to data URL so we can persist and re-register on the
      // customer side later.
      const dataUrl = await readFileAsDataURL(file)
      setCustomFonts((prev) => [...prev, { family, dataUrl }])
      toast(`Đã thêm font: ${family}`, 'success')
    } catch (e) {
      console.error(e)
      toast('Không nạp được font', 'error')
    }
  }, [fontStore, toast])

  // ── Publish to shop ────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!psdDataUrl) { toast('Cần upload PSD trước', 'error'); return }
    if (!frameRef.current) return
    if (!templateName.trim()) { toast('Cần nhập tên template', 'error'); return }
    try {
      setBusy(true); setBusyMsg('Đang xuất PNG preview…')
      // Generate a PNG preview for the shop card.
      const { buffers } = await frameRef.current.run(scriptExport('png'))
      const png = buffers[0]
      let thumbnail = null
      if (png) {
        const blob = bufferToBlob(png, 'image/png')
        thumbnail = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.readAsDataURL(blob)
        })
      }

      // Persist the template.
      const tpl = createTemplate({
        name: templateName.trim(),
        psdDataUrl,
        psdBuffer,
        layers,
        locks,
        exportFee: Math.max(0, Number(exportFee) || 0),
        fonts: customFonts,
        thumbnail,
      })

      // Register a matching shop product so customers can buy / browse.
      addProduct({
        title: templateName.trim(),
        desc: productDesc || 'Photopea template — chỉnh sửa trực tiếp trong trình duyệt.',
        category: productCategory,
        type: 'static',
        price: Math.max(0, Number(productPrice) || 0),
        ratio: '16/9',
        gradient: 'linear-gradient(135deg,#6e4bff,#4dd0ff)',
        icon: '✦',
        tag: 'PSD',
        rating: 5,
        sold: 0,
        previewDataUrl: thumbnail,
        images: thumbnail ? [thumbnail] : [],
        photopeaTemplateId: tpl.id,
        editableFields: layers
          .filter((l) => detectLayerRole(l.name) && !locks[l.name] && !isLockLayerName(l.name))
          .map((l) => {
            const r = detectLayerRole(l.name)
            return {
              role: r.role,
              label: r.label,
              type: r.type,
              defaultValue: l.text || '',
            }
          }),
      })
      toast('Đã đăng template lên cửa hàng', 'success')
      navigate('/shop')
    } catch (e) {
      console.error(e)
      toast('Không xuất được preview', 'error')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }, [
    psdDataUrl, psdBuffer, layers, locks, customFonts, templateName, exportFee,
    productPrice, productDesc, productCategory,
    createTemplate, addProduct, navigate, toast,
  ])

  // ── Quick export handlers (test before publishing) ─────────────────
  const handleExport = useCallback(async (format) => {
    if (!frameRef.current) return
    try {
      setBusy(true); setBusyMsg(`Đang xuất ${format.toUpperCase()}…`)
      const { buffers } = await frameRef.current.run(scriptExport(format))
      const buf = buffers[0]
      if (!buf) { toast('Photopea không trả về dữ liệu', 'error'); return }
      const mime = format === 'png' ? 'image/png'
        : format === 'jpg' ? 'image/jpeg'
        : 'application/octet-stream'
      const blob = bufferToBlob(buf, mime)
      downloadBlob(blob, `${templateName || 'template'}.${format}`)
      toast(`Đã xuất ${format.toUpperCase()}`, 'success')
    } catch (e) {
      console.error(e)
      toast('Lỗi khi xuất file', 'error')
    } finally {
      setBusy(false); setBusyMsg('')
    }
  }, [templateName, toast])

  if (!isAdmin) return null

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl p-6"
        style={{
          background: 'linear-gradient(135deg, rgba(110,75,255,0.2) 0%, rgba(77,208,255,0.1) 60%, rgba(43,242,192,0.06) 100%)',
          border: '1px solid rgba(110,75,255,0.3)',
          backdropFilter: 'blur(32px) saturate(200%)',
        }}>
        <div className="absolute -right-12 -top-12 w-60 h-60 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(110,75,255,0.3) 0%, transparent 70%)' }} />
        <div className="relative z-10 flex items-center gap-4 flex-wrap">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(110,75,255,0.25)', border: '1px solid rgba(110,75,255,0.4)' }}>
            <Shield size={22} className="text-brand-300" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-brand-300 uppercase tracking-widest">Admin Panel</span>
            <h1 className="font-display text-2xl font-bold text-white">Photopea Template Editor</h1>
            <p className="text-white/45 text-sm mt-0.5">Upload PSD, khoá layer, thêm font, AI auto-placement, đăng lên cửa hàng</p>
          </div>
        </div>
      </motion.div>

      {/* ── Upload row ─────────────────────────────────────────────── */}
      {!psdDataUrl && (
        <div className="rounded-2xl p-8 text-center" style={CARD}>
          <FileType size={36} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/70 mb-4">Bắt đầu bằng cách tải lên một file PSD</p>
          <input
            ref={psdInputRef} type="file" accept=".psd" className="hidden"
            onChange={(e) => handlePsdUpload(e.target.files?.[0])}
          />
          <button
            onClick={() => psdInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#6e4bff,#4dd0ff)' }}>
            <Upload size={14} /> Chọn file .psd
          </button>
          <p className="text-[11px] text-white/30 mt-4">
            Mẹo đặt tên layer trong PSD:&nbsp;
            <code className="text-cyan-300">text_title, text_price, text_name, avt_png, nvat_png</code>
            &nbsp;cho layer có thể chỉnh sửa.&nbsp;
            <code className="text-amber-300">lock_background, lock_avt, lock_nvat</code>
            &nbsp;cho layer luôn khoá.
          </p>
        </div>
      )}

      {/* ── Main editor (after upload) ─────────────────────────────── */}
      {psdDataUrl && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          {/* Left: Photopea iframe + toolbar */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ ...CARD, minHeight: 640 }}>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs text-white/60 truncate max-w-[200px]">{psdName}</span>
              <div className="flex-1" />
              <button
                disabled={!photopeaReady || busy}
                onClick={runAutoPlacement}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{ background: 'rgba(110,75,255,0.15)', border: '1px solid rgba(110,75,255,0.3)', color: '#a893ff' }}>
                <Sparkles size={12} /> AI Auto Placement
              </button>
              <button
                disabled={!photopeaReady || busy}
                onClick={() => handleExport('png')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                <Download size={12} /> PNG
              </button>
              <button
                disabled={!photopeaReady || busy}
                onClick={() => handleExport('psd')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}>
                <Download size={12} /> PSD
              </button>
            </div>

            {/* Frame */}
            <div className="relative flex-1 min-h-[600px]" style={{ background: '#1a1a1a' }}>
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
            </div>
          </div>

          {/* Right sidebar: layers, fonts, publish */}
          <div className="space-y-4">
            {/* Layers */}
            <div className="rounded-2xl p-4" style={CARD}>
              <div className="flex items-center gap-2 mb-3">
                <Layers size={14} className="text-brand-300" />
                <h3 className="text-sm font-semibold text-white">Layers</h3>
                <span className="text-[10px] text-white/40 ml-auto">
                  {layers.length} layer · {Object.keys(locks).length} đã khoá
                </span>
              </div>
              <div className="max-h-[320px] overflow-y-auto pr-1">
                <PhotopeaLayerPanel
                  layers={layers}
                  locks={locks}
                  onToggleLock={toggleLock}
                  selectedName={selectedName}
                  onSelect={(l) => setSelectedName(l.name)}
                  hint="Bấm khoá để chặn khách chỉnh sửa layer. Layer tên lock_* luôn khoá."
                />
              </div>
            </div>

            {/* Fonts */}
            <div className="rounded-2xl p-4" style={CARD}>
              <div className="flex items-center gap-2 mb-3">
                <Type size={14} className="text-cyan-300" />
                <h3 className="text-sm font-semibold text-white">Custom Fonts</h3>
              </div>
              <input
                ref={fontInputRef} type="file" accept=".ttf,.otf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFontUpload(f); e.target.value = '' }}
              />
              <button
                onClick={() => fontInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs"
                style={{ background: 'rgba(77,208,255,0.1)', border: '1px dashed rgba(77,208,255,0.3)', color: '#4dd0ff' }}>
                <Upload size={12} /> Tải font (.ttf / .otf)
              </button>
              {customFonts.length > 0 && (
                <div className="mt-3 space-y-1">
                  {customFonts.map((f) => (
                    <div key={f.family}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] flex items-center gap-2"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <Type size={11} className="text-cyan-300 flex-shrink-0" />
                      <span style={{ fontFamily: f.family }} className="text-white/85 truncate">
                        {f.family}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-white/30 mt-3 leading-relaxed">
                Font được nạp vào trình duyệt qua FontFace API. Đảm bảo PSD dùng đúng tên font đã upload để render khớp.
              </p>
            </div>

            {/* Publish */}
            <div className="rounded-2xl p-4" style={CARD}>
              <div className="flex items-center gap-2 mb-3">
                <Store size={14} className="text-emerald-300" />
                <h3 className="text-sm font-semibold text-white">Đăng cửa hàng</h3>
              </div>
              <div className="space-y-2.5">
                <input
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none"
                  placeholder="Tên template *"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <textarea
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white outline-none resize-none"
                  rows={2}
                  placeholder="Mô tả ngắn"
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white outline-none"
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}>
                    <option value="thumbnail">Thumbnail</option>
                    <option value="logo">Logo</option>
                    <option value="banner-shop">Banner Shop</option>
                    <option value="banner-youtube">Banner YT</option>
                    <option value="banner-discord">Banner Discord</option>
                  </select>
                  <input
                    type="number" min={0}
                    className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white outline-none"
                    placeholder="Giá mua (coins)"
                    value={productPrice}
                    onChange={(e) => setProductPrice(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider block mb-1">
                    Phí xuất ảnh (coins)
                  </label>
                  <input
                    type="number" min={0}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white outline-none"
                    value={exportFee}
                    onChange={(e) => setExportFee(Number(e.target.value))}
                  />
                </div>
                <button
                  onClick={handlePublish}
                  disabled={busy || !photopeaReady || !templateName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(135deg,#2bf2c0,#4dd0ff)', color: '#0a0a14' }}>
                  <Save size={14} /> Đăng lên cửa hàng
                </button>
                <div className="flex items-start gap-2 px-2 py-2 rounded-lg text-[10px]"
                  style={{ background: 'rgba(110,75,255,0.08)', border: '1px solid rgba(110,75,255,0.2)' }}>
                  <AlertCircle size={12} className="text-brand-300 flex-shrink-0 mt-0.5" />
                  <span className="text-white/55 leading-relaxed">
                    Sau khi đăng, khách sẽ mở template trong Photopea, chỉ chỉnh được những layer chưa khoá, và phải trả phí xuất nếu &gt; 0.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
