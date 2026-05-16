import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Psd from '@webtoon/psd'
import {
  Upload, Layers, ZoomIn, ZoomOut, Maximize2,
  Lock, Unlock, Star, ChevronLeft, Loader, PanelLeft, PanelRight,
  Download, Store, ImagePlus, FileType, Image as ImageIcon,
  Undo2, Redo2, RotateCcw, Type,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

import { detectLayerRole } from '../utils/layerNaming'
import { walkPsdLayers, maskByOriginalAlpha } from '../utils/psdTree'
import { useAuthStore } from '../store/useAuthStore'
import { useShopStore } from '../store/useShopStore'
import { useAppStore } from '../store/useAppStore'
import Modal from '../components/ui/Modal'
import GuideSection from '../components/ui/GuideSection'

import LayerRow from '../components/psd/LayerRow'
import ResizableSidebar from '../components/psd/ResizableSidebar'
import PropertiesPanel from '../components/psd/PropertiesPanel'
import PsdCanvas from '../components/psd/PsdCanvas'
import useHistory from '../utils/useHistory'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function detectRatio(w, h) {
  if (!w || !h) return '16/9'
  const r = w / h
  const candidates = [
    { ratio: '16/9', val: 16 / 9 },
    { ratio: '1/1',  val: 1 },
    { ratio: '5/2',  val: 5 / 2 },
    { ratio: '3/1',  val: 3 },
  ]
  let best = candidates[0]
  let bestDiff = Math.abs(r - best.val)
  for (const c of candidates) {
    const diff = Math.abs(r - c.val)
    if (diff < bestDiff) { bestDiff = diff; best = c }
  }
  return best.ratio
}

function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(110,75,255,0.15)' }}>
        <Loader size={22} className="text-violet-300 animate-spin" />
      </div>
      {label && <p className="text-sm text-white/50 max-w-xs text-center">{label}</p>}
    </div>
  )
}

// Build a flat list for rendering the layer panel by walking the tree.
// Returns array of items: layer entries (from `flat`) interleaved with group
// rows. `expanded` controls which groups are open.
function buildPanelList(tree, flat, expandedById, groupVisibleById) {
  const byGroupId = new Map()
  for (const l of flat) {
    const arr = byGroupId.get(l.groupId) || []
    arr.push(l)
    byGroupId.set(l.groupId, arr)
  }
  const out = []
  function walk(node, depth) {
    if (!node.children) return
    // Photoshop renders top-to-bottom in the panel = reversed z-order.
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i]
      if (child.isGroup) {
        out.push({
          kind: 'group',
          id: child.id,
          name: child.name,
          depth,
          isGroup: true,
          visible: groupVisibleById.get(child.id) ?? child.visible ?? true,
          inheritedVisible: groupVisibleById.get(child.id) === false ? false : true,
          type: 'group',
        })
        if (expandedById[child.id] !== false) walk(child, depth + 1)
      } else {
        const layer = flat.find(l => l.id === child.id)
        if (layer) out.push({ ...layer, kind: 'layer', depth })
      }
    }
  }
  walk(tree, 0)
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar
// ─────────────────────────────────────────────────────────────────────────────

function Toolbar({
  psdFile, psdMeta, zoom, onZoomIn, onZoomOut, onZoomFit, onZoom100,
  showLeft, showRight, onToggleLeft, onToggleRight,
  userBalance, onExportClick, hasPaid, isAdmin, onPublishClick,
  onUndo, onRedo, canUndo, canRedo,
  autosaveTick,
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 flex-shrink-0 flex-wrap"
      style={{
        background: 'linear-gradient(180deg, #1a1a26 0%, #14141d 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <button onClick={onToggleLeft}
        className={clsx('p-1.5 rounded-lg transition-colors',
          showLeft ? 'text-violet-300 bg-violet-500/20' : 'text-white/40 hover:text-white hover:bg-white/[0.06]')}>
        <PanelLeft size={15} />
      </button>
      <button onClick={onToggleRight}
        className={clsx('p-1.5 rounded-lg transition-colors',
          showRight ? 'text-violet-300 bg-violet-500/20' : 'text-white/40 hover:text-white hover:bg-white/[0.06]')}>
        <PanelRight size={15} />
      </button>
      <div className="w-px h-4 bg-white/10" />

      <div className="flex items-center gap-2 min-w-0">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(110,75,255,0.2)' }}>
          <Layers size={12} className="text-violet-300" />
        </div>
        <span className="text-xs font-medium text-white/70 truncate max-w-[160px]">
          {psdFile ? psdFile.name : 'Chưa có file PSD'}
        </span>
        {psdMeta && (
          <span className="text-[10px] text-white/30 flex-shrink-0">
            {psdMeta.width} × {psdMeta.height}px
          </span>
        )}
        {psdMeta && autosaveTick && (
          <span
            className={clsx(
              'text-[10px] font-medium flex-shrink-0 px-1.5 py-0.5 rounded-full transition-colors',
              autosaveTick === 'saving'
                ? 'text-amber-300/80 bg-amber-500/10'
                : 'text-emerald-300/80 bg-emerald-500/10',
            )}
            title="Tự động lưu vào trình duyệt"
          >
            {autosaveTick === 'saving' ? 'Đang lưu…' : 'Đã lưu'}
          </span>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1 mr-1">
        <button onClick={onUndo} disabled={!canUndo}
          className={clsx('p-1.5 rounded-lg transition-colors',
            canUndo ? 'text-white/60 hover:text-white hover:bg-white/[0.06]' : 'text-white/20 cursor-not-allowed')}
          title="Hoàn tác (Ctrl+Z)">
          <Undo2 size={14} />
        </button>
        <button onClick={onRedo} disabled={!canRedo}
          className={clsx('p-1.5 rounded-lg transition-colors',
            canRedo ? 'text-white/60 hover:text-white hover:bg-white/[0.06]' : 'text-white/20 cursor-not-allowed')}
          title="Làm lại (Ctrl+Shift+Z)">
          <Redo2 size={14} />
        </button>
      </div>

      <div className="w-px h-4 bg-white/10" />

      <div className="flex items-center gap-1">
        <button onClick={onZoomOut} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ZoomOut size={14} />
        </button>
        <button onClick={onZoom100}
          className="text-xs text-white/60 hover:text-white min-w-[44px] text-center px-1.5 py-1 rounded-md hover:bg-white/[0.05]">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={onZoomIn} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ZoomIn size={14} />
        </button>
        <button onClick={onZoomFit} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors" title="Vừa khung">
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="w-px h-4 bg-white/10" />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Star size={11} className="text-yellow-400" />
          <span className="text-xs text-white/70 font-medium">{userBalance ?? 0}</span>
        </div>
        {!psdMeta ? (
          <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold opacity-40 cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Lock size={12} /> Export
          </button>
        ) : hasPaid ? (
          <button onClick={onExportClick} className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <Download size={12} /> Export
          </button>
        ) : (
          <button onClick={onExportClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            style={{
              background: 'rgba(110,75,255,0.15)',
              border: '1px solid rgba(110,75,255,0.3)',
              color: 'rgba(196,181,253,1)',
            }}>
            <Lock size={12} /> Export <span className="text-[10px] opacity-70">50 ⭐</span>
          </button>
        )}
        {isAdmin && psdMeta && (
          <>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={onPublishClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: 'rgba(43,242,192,0.12)',
                border: '1px solid rgba(43,242,192,0.3)',
                color: 'rgba(43,242,192,1)',
              }}>
              <Store size={12} /> Đăng lên cửa hàng
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish Modal (compatible with shop store)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'thumbnail',      label: 'Thumbnail' },
  { value: 'logo',           label: 'Logo' },
  { value: 'banner-shop',    label: 'Banner Shop' },
  { value: 'banner-youtube', label: 'Banner YouTube' },
  { value: 'banner-discord', label: 'Banner Discord' },
]

function PublishModal({ open, onClose, form, setForm, onSubmit, editableFieldCount }) {
  const inputStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 12,
    color: 'rgba(255,255,255,0.85)',
    padding: '8px 12px',
    width: '100%',
    outline: 'none',
    fontSize: 13,
  }
  const labelStyle = {
    fontSize: 11, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 6,
  }
  return (
    <Modal open={open} onClose={onClose} title="Đăng sản phẩm lên cửa hàng" size="md">
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        <div>
          <label style={labelStyle}>Tiêu đề *</label>
          <input style={inputStyle} value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Tên sản phẩm..." />
        </div>
        <div>
          <label style={labelStyle}>Mô tả</label>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            value={form.desc}
            onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
            placeholder="Mô tả ngắn..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Danh mục</label>
            <select style={inputStyle} value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tag (tối đa 12)</label>
            <input style={inputStyle} value={form.tag} maxLength={12}
              onChange={e => setForm(f => ({ ...f, tag: e.target.value }))} placeholder="Gaming" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Giá (coins)</label>
            <input style={inputStyle} type="number" min={0} value={form.price}
              onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
          </div>
          <div>
            <label style={labelStyle}>Badge</label>
            <select style={inputStyle} value={form.badge}
              onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}>
              <option value="">Không có</option>
              <option value="NEW">NEW</option>
              <option value="HOT">HOT</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Mã giảm giá</label>
            <input style={inputStyle} value={form.discountCode}
              onChange={e => setForm(f => ({ ...f, discountCode: e.target.value }))}
              placeholder="SALE20" />
          </div>
          <div>
            <label style={labelStyle}>% Giảm</label>
            <input style={inputStyle} type="number" min={0} max={100}
              value={form.discountPercent}
              onChange={e => setForm(f => ({ ...f, discountPercent: Number(e.target.value) }))} />
          </div>
        </div>

        {editableFieldCount === 0 && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', color: 'rgba(253,224,71,0.9)' }}>
            <span className="flex-shrink-0 mt-0.5">⚠️</span>
            <span>Không có layer chuẩn. Đặt tên: <code className="bg-black/30 px-1 rounded text-[10px]">text_1, text_title, text_price, avt_png, logo...</code></span>
          </div>
        )}

        <div>
          <label style={labelStyle}>Ảnh bổ sung (slideshow) — tùy chọn</label>
          <div className="space-y-2">
            {form.extraImages?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.extraImages.map((img, i) => (
                  <div key={i} className="relative group/img">
                    <img src={img} alt={`extra-${i}`} className="w-16 h-12 object-cover rounded-lg"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, extraImages: f.extraImages.filter((_, j) => j !== i) }))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center"
                      style={{ fontSize: 9 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-xs"
              style={{ background: 'rgba(110,75,255,0.1)', border: '1px dashed rgba(110,75,255,0.35)', color: 'rgba(167,139,250,0.9)' }}>
              <ImagePlus size={13} /> Thêm ảnh preview
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files)
                  Promise.all(files.map(f => new Promise(resolve => {
                    const reader = new FileReader()
                    reader.onload = ev => resolve(ev.target.result)
                    reader.readAsDataURL(f)
                  }))).then(newImgs => {
                    setForm(prev => ({ ...prev, extraImages: [...(prev.extraImages || []), ...newImgs] }))
                  })
                  e.target.value = ''
                }} />
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.6)' }}>
            Hủy
          </button>
          <button onClick={onSubmit} disabled={!form.title.trim()}
            className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Store size={14} /> Đăng lên cửa hàng
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function PsdEditorPage() {
  const { user, deductBalance } = useAuthStore()
  const isAdmin = useAuthStore(s => s.isAdmin())
  const { toast } = useAppStore()
  const addProduct = useShopStore(s => s.addProduct)

  // PSD state
  const [psdFile, setPsdFile] = useState(null)
  const [psdMeta, setPsdMeta] = useState(null)
  const [tree, setTree] = useState(null)
  const [layers, setLayers, history] = useHistory([])
  const [groupVisible, setGroupVisible] = useState({})    // { [groupId]: bool }
  const [groupExpanded, setGroupExpanded] = useState({})  // { [groupId]: bool } (default open)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [dragging, setDragging] = useState(false)

  // Editor state
  const [selectedLayerId, setSelectedLayerId] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan]   = useState({ x: 0, y: 0 })
  const [fitZoom, setFitZoom] = useState(1)

  // Drag-and-drop reorder state
  const [draggedLayerId, setDraggedLayerId] = useState(null)
  const [dragOverLayerId, setDragOverLayerId] = useState(null)

  // Publish state
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [publishForm, setPublishForm] = useState({
    title: '', desc: '', category: 'thumbnail', tag: '',
    price: 0, badge: '', discountCode: '', discountPercent: 0, extraImages: [],
  })

  // Payment / export state
  const [hasPaid, setHasPaid] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFormat, setExportFormat] = useState('png')
  const [exportQuality, setExportQuality] = useState(0.95)
  const [exportScale, setExportScale] = useState(2)

  // Panel visibility
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)

  // Autosave wiring — keyed by file fingerprint so revisiting the same PSD
  // restores the user's draft without colliding with other files.
  const [saveKey, setSaveKey] = useState(null)
  const [savedDraft, setSavedDraft] = useState(null) // pending offer to restore
  const [autosaveTick, setAutosaveTick] = useState(null) // 'saving' | 'saved' | null

  // Refs
  const containerRef = useRef(null)
  const stageRef = useRef(null)
  const fileInputRef = useRef(null)

  // ── Fit to container after PSD loads (or window resize) ────────────────────
  useEffect(() => {
    if (!containerRef.current || !psdMeta) return
    const refit = () => {
      if (!containerRef.current || !psdMeta) return
      const rect = containerRef.current.getBoundingClientRect()
      const scaleX = (rect.width  - 80) / psdMeta.width
      const scaleY = (rect.height - 80) / psdMeta.height
      const newFit = Math.min(scaleX, scaleY, 1)
      setFitZoom(newFit)
      setZoom(newFit)
      setPan({
        x: Math.max(0, (rect.width  - psdMeta.width  * newFit) / 2),
        y: Math.max(0, (rect.height - psdMeta.height * newFit) / 2),
      })
    }
    refit()
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [psdMeta, showLeft, showRight])

  // ── PSD parsing ────────────────────────────────────────────────────────────
  const parsePsd = useCallback(async (file) => {
    if (!file) return
    if (file.size > 80 * 1024 * 1024) {
      toast('File quá lớn. Tối đa 80MB.', 'error', 'Lỗi')
      return
    }
    setPsdFile(file)
    setLoading(true)
    setLoadingMsg('Đang đọc file...')
    setLayers([], { commit: false })
    setPsdMeta(null)
    setTree(null)
    setSelectedLayerId(null)
    setHasPaid(false)
    setSavedDraft(null)
    history.reset([])

    // Stable key for this exact file (name + size). Good enough for a
    // single browser; not cryptographic.
    const key = `nova_psd_draft:${file.name}:${file.size}`
    setSaveKey(key)

    try {
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })
      setLoadingMsg('Đang phân tích PSD...')
      const psd = Psd.parse(arrayBuffer)
      setPsdMeta({ width: psd.width, height: psd.height })

      // Yield to the browser so the spinner repaints before composite work.
      await new Promise(r => setTimeout(r, 0))

      const { flat, tree: parsedTree } = await walkPsdLayers(psd, msg => setLoadingMsg(msg))
      setTree(parsedTree)
      history.reset(flat)

      // Default group visibility = follow the file. Default expanded = open.
      const gv = {}, ge = {}
      function walk(node) {
        for (const c of node.children || []) {
          if (c.isGroup) {
            gv[c.id] = c.visible !== false
            ge[c.id] = true
            walk(c)
          }
        }
      }
      walk(parsedTree)
      setGroupVisible(gv)
      setGroupExpanded(ge)

      // Look for a previous draft. We compare layer ids to make sure the
      // saved snapshot is structurally compatible with the current parse.
      try {
        const raw = localStorage.getItem(key)
        if (raw) {
          const draft = JSON.parse(raw)
          const sameShape =
            Array.isArray(draft?.layers) &&
            draft.layers.length === flat.length &&
            draft.layers.every((d, i) => d.id === flat[i].id)
          if (sameShape && (draft.layers.some(l => l.isEdited)
                            || JSON.stringify(draft.groupVisible) !== JSON.stringify(gv))) {
            setSavedDraft({ ...draft, parsedFlat: flat })
          }
        }
      } catch { /* corrupted draft – ignore */ }

      setLoadingMsg('')
      toast(`Đã nạp ${flat.length} layer`, 'success', `${psd.width} × ${psd.height}`)
    } catch (err) {
      console.error(err)
      toast('Không phân tích được file PSD', 'error', 'Lỗi')
      setPsdFile(null)
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }, [toast, history, setLayers])

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.psd')) {
      toast('Chỉ hỗ trợ file .psd', 'error', 'File không hợp lệ')
      return
    }
    parsePsd(f)
  }, [parsePsd, toast])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  // ── Layer ops ──────────────────────────────────────────────────────────────

  const toggleLayerVisible = useCallback((id) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  }, [setLayers])

  const toggleGroupVisible = useCallback((id) => {
    setGroupVisible(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? true) }
      // Cascade down: every layer whose ancestor chain includes `id` flips its
      // inheritedVisible flag accordingly.
      setLayers(curr => curr.map(l => {
        const inChain = ancestorIds(tree, l.groupId).includes(id)
        if (!inChain) return l
        return { ...l, inheritedVisible: ancestorChainVisible(tree, l.groupId, next) }
      }), { commit: false })
      return next
    })
  }, [tree, setLayers])

  const toggleGroupExpand = useCallback((id) => {
    setGroupExpanded(prev => ({ ...prev, [id]: !(prev[id] ?? true) }))
  }, [])

  const selectLayer = useCallback((id) => {
    setSelectedLayerId(prev => prev === id ? null : id)
  }, [])

  // Apply changes to a specific layer (used by canvas drag/transform AND props panel).
  const applyLayerChanges = useCallback(async (id, changes) => {
    const target = layers.find(l => l.id === id)
    if (!target) return

    // Lock guard — for both text AND image layers. Position / size /
    // rotation / opacity / blend / visibility still flow through (PS-style
    // "lock pixels" semantics) so drag/transform on canvas keeps working.
    if (target.locked) {
      const safe = { ...changes }
      if (target.type === 'text') {
        delete safe.textContent; delete safe.fontFamily; delete safe.fontSize
        delete safe.color; delete safe.bold; delete safe.italic; delete safe.alignment
      } else {
        delete safe.dataUrl
      }
      setLayers(prev => prev.map(l => l.id === target.id ? { ...l, ...safe } : l))
      return
    }

    // Image swap on clipping/SO → preserve silhouette via alpha mask.
    let next = { ...changes }
    if (target.type === 'image' && changes.dataUrl
        && (target.isClippingMask || target.isSmartObject)
        && target.originalDataUrl) {
      try {
        const masked = await maskByOriginalAlpha(
          changes.dataUrl, target.originalDataUrl, target.width, target.height,
        )
        next.dataUrl = masked
      } catch (err) {
        console.warn('[PSD] mask preservation failed', err)
      }
    }

    setLayers(prev => prev.map(l => l.id === target.id ? { ...l, ...next } : l))
  }, [layers, setLayers])

  const updateSelectedLayer = useCallback(async (changes) => {
    if (!selectedLayerId) return
    return applyLayerChanges(selectedLayerId, changes)
  }, [selectedLayerId, applyLayerChanges])

  const resetSelectedLayer = useCallback(() => {
    if (!selectedLayerId) return
    setLayers(prev => prev.map(l => {
      if (l.id !== selectedLayerId) return l
      return {
        ...l,
        isEdited: false,
        textContent: l.originalTextContent ?? l.textContent,
        dataUrl: l.originalDataUrl ?? l.dataUrl,
      }
    }))
  }, [selectedLayerId, setLayers])

  // Toggle lock on a single layer (text only). Lock prevents text edits;
  // position / size / opacity / blend stay editable so users can keep
  // arranging locked layers like Photoshop's lock-image-pixels.
  const toggleLayerLock = useCallback((id) => {
    setLayers(prev => prev.map(l =>
      l.id === id ? { ...l, locked: !l.locked } : l,
    ))
  }, [setLayers])

  // Lock ALL layers at once (bulk action from toolbar).
  const lockAllLayers = useCallback(() => {
    setLayers(prev => prev.map(l => ({ ...l, locked: true })))
    toast('Đã khóa toàn bộ layer', 'success', 'Lock All')
  }, [setLayers, toast])

  // Unlock ALL layers at once (bulk action from toolbar).
  const unlockAllLayers = useCallback(() => {
    setLayers(prev => prev.map(l => ({ ...l, locked: false })))
    toast('Đã mở khóa toàn bộ layer', 'success', 'Unlock All')
  }, [setLayers, toast])

  // Reset ALL layers to original state (undo all edits).
  const resetAllLayers = useCallback(() => {
    setLayers(prev => prev.map(l => ({
      ...l,
      isEdited: false,
      textContent: l.originalTextContent ?? l.textContent,
      dataUrl: l.originalDataUrl ?? l.dataUrl,
      left: l.left, top: l.top, // keep position (already baked from PSD)
    })))
    toast('Đã reset toàn bộ layer về bản gốc', 'success', 'Reset All')
  }, [setLayers, toast])

  // Inline rename from the layer panel.
  const renameLayer = useCallback((id, name) => {
    setLayers(prev => prev.map(l =>
      l.id === id ? { ...l, name } : l,
    ))
  }, [setLayers])

  // Move helpers — adjust z-order in the flat array. NB: visually the panel
  // shows layers reversed (top of panel = top of canvas), so "move up in
  // panel" = move LATER in the flat array.
  const moveLayer = useCallback((id, where) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id)
      if (idx === -1) return prev
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      let target = idx
      if (where === 'top')         target = next.length
      else if (where === 'bottom') target = 0
      else if (where === 'up')     target = Math.min(next.length, idx + 1)
      else if (where === 'down')   target = Math.max(0, idx - 1)
      next.splice(target, 0, moved)
      return next
    })
  }, [setLayers])

  const moveSelected = useCallback((where) => {
    if (!selectedLayerId) return
    moveLayer(selectedLayerId, where)
  }, [moveLayer, selectedLayerId])

  // Drag-to-reorder in the layer panel.
  const handleLayerDragStart = useCallback((e, layer) => {
    if (layer.isGroup) { e.preventDefault(); return }
    setDraggedLayerId(layer.id)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleLayerDragOver = useCallback((e, layer) => {
    setDragOverLayerId(layer.id)
  }, [])

  const handleLayerDrop = useCallback((e, layer) => {
    e.preventDefault()
    const sourceId = draggedLayerId
    setDraggedLayerId(null)
    setDragOverLayerId(null)
    if (!sourceId || sourceId === layer.id || layer.isGroup) return
    setLayers(prev => {
      const fromIdx = prev.findIndex(l => l.id === sourceId)
      const toIdx   = prev.findIndex(l => l.id === layer.id)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = prev.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [draggedLayerId, setLayers])

  // ── Autosave ──────────────────────────────────────────────────────────────
  // Debounced snapshot to localStorage. We strip the heavy `bakedDataUrl` /
  // `originalDataUrl` from the saved blob (those are deterministic from the
  // source PSD); we only persist the user's diffs (text, replaced dataUrl,
  // position, locked flag, visibility) so the storage stays small.
  useEffect(() => {
    if (!saveKey || layers.length === 0) return
    setAutosaveTick('saving')
    const t = setTimeout(() => {
      try {
        const slim = layers.map(l => ({
          id: l.id, name: l.name, type: l.type,
          visible: l.visible, locked: l.locked, isEdited: l.isEdited,
          left: l.left, top: l.top, width: l.width, height: l.height,
          rotation: l.rotation, opacity: l.opacity, blendMode: l.blendMode,
          textContent: l.textContent, fontFamily: l.fontFamily,
          fontSize: l.fontSize, color: l.color, alignment: l.alignment,
          bold: l.bold, italic: l.italic,
          // For images we only persist the swap if it differs from the
          // original (saves a LOT of bytes for unedited layers).
          dataUrl: l.type === 'image' && l.dataUrl !== l.originalDataUrl
            ? l.dataUrl : undefined,
        }))
        localStorage.setItem(saveKey, JSON.stringify({
          savedAt: Date.now(),
          groupVisible,
          layers: slim,
        }))
        setAutosaveTick('saved')
      } catch (err) {
        // Quota errors are common with very large PSDs; fail silently.
        console.warn('[autosave] failed', err)
        setAutosaveTick(null)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [saveKey, layers, groupVisible])

  // Restore handler — merge the slim diff onto the freshly-parsed full layers
  // so we don't lose `bakedDataUrl` etc.
  const restoreDraft = useCallback(() => {
    if (!savedDraft) return
    const fresh = savedDraft.parsedFlat
    const byId = new Map(savedDraft.layers.map(l => [l.id, l]))
    const merged = fresh.map(l => {
      const diff = byId.get(l.id)
      if (!diff) return l
      // Defensive: never let the diff erase baked composites.
      const { dataUrl, ...rest } = diff
      return {
        ...l,
        ...rest,
        dataUrl: dataUrl !== undefined ? dataUrl : l.dataUrl,
      }
    })
    history.reset(merged)
    if (savedDraft.groupVisible) setGroupVisible(savedDraft.groupVisible)
    setSavedDraft(null)
    toast('Đã khôi phục bản nháp', 'success', 'Autosave')
  }, [savedDraft, history, toast])

  const dismissDraft = useCallback(() => {
    setSavedDraft(null)
    if (saveKey) localStorage.removeItem(saveKey)
  }, [saveKey])

  // ── Zoom controls ──────────────────────────────────────────────────────────
  const handleZoomIn  = () => setZoom(z => Math.min(z * 1.2, 8))
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.05))
  const handleZoomFit = () => {
    setZoom(fitZoom)
    if (containerRef.current && psdMeta) {
      const rect = containerRef.current.getBoundingClientRect()
      setPan({
        x: Math.max(0, (rect.width  - psdMeta.width  * fitZoom) / 2),
        y: Math.max(0, (rect.height - psdMeta.height * fitZoom) / 2),
      })
    }
  }
  const handleZoom100 = () => setZoom(1)

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      // ignore typing inside form fields
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) history.redo(); else history.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); history.redo()
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn()
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut()
      } else if (e.key === '0') {
        handleZoomFit()
      } else if (e.key === '1') {
        handleZoom100()
      } else if ((e.ctrlKey || e.metaKey) && e.key === ']') {
        e.preventDefault()
        if (selectedLayerId) moveLayer(selectedLayerId, e.shiftKey ? 'top' : 'up')
      } else if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault()
        if (selectedLayerId) moveLayer(selectedLayerId, e.shiftKey ? 'bottom' : 'down')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, fitZoom, psdMeta, selectedLayerId, moveLayer])

  // ── Publish ────────────────────────────────────────────────────────────────
  const handlePublish = () => {
    if (!stageRef.current || !psdMeta) return
    const previewDataUrl = stageRef.current.toDataURL({ pixelRatio: 1 })
    const ratio = detectRatio(psdMeta.width, psdMeta.height)
    const editableFields = layers
      .map(l => {
        const role = detectLayerRole(l.name)
        if (!role) return null
        return {
          role: role.role, label: role.label, type: role.type,
          shape: role.shape || 'rect',
          defaultValue: l.type === 'text' ? (l.textContent || '') : null,
          x: l.left, y: l.top, width: l.width, height: l.height,
          fontSize: l.fontSize || 16,
          fontFamily: l.fontFamily || 'Inter',
          color: l.color || '#ffffff',
          bold: l.bold || false,
          italic: l.italic || false,
        }
      })
      .filter(Boolean)
    const totalImgSize = [previewDataUrl, ...(publishForm.extraImages || [])]
      .reduce((acc, img) => acc + (img?.length || 0) * 0.75, 0)
    if (totalImgSize > 2 * 1024 * 1024) {
      toast('Tổng ảnh quá lớn (>2MB).', 'error', 'Quá dung lượng')
      return
    }
    addProduct({
      ...publishForm,
      previewDataUrl, ratio,
      width: psdMeta.width, height: psdMeta.height,
      psdFileName: psdFile?.name || '',
      sold: 0,
      createdAt: new Date().toISOString(),
      editableFields,
      images: [previewDataUrl, ...(publishForm.extraImages || [])],
    })
    toast('Đã đăng lên cửa hàng!', 'success', 'Publish')
    setShowPublishModal(false)
    setPublishForm({
      title: '', desc: '', category: 'thumbnail', tag: '',
      price: 0, badge: '', discountCode: '', discountPercent: 0, extraImages: [],
    })
  }

  // ── Payment ───────────────────────────────────────────────────────────────
  const handlePayment = () => {
    if (!user) {
      toast('Vui lòng đăng nhập', 'error', 'Chưa đăng nhập')
      return
    }
    if (user.email === 'finnlive246@gmail.com') {
      setHasPaid(true); setShowPaymentModal(false); setShowExportModal(true)
      toast('Admin: xuất ảnh miễn phí!', 'success', 'Admin')
      return
    }
    const success = deductBalance(50)
    if (!success) {
      toast('Số dư không đủ!', 'error', 'Thanh toán thất bại'); return
    }
    setHasPaid(true); setShowPaymentModal(false); setShowExportModal(true)
    toast('Thanh toán thành công!', 'success', 'Đã thanh toán')
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!stageRef.current || !psdMeta) return
    const watermarkRef = stageRef.current._novaWatermarkRef
    try {
      if (watermarkRef?.current) { watermarkRef.current.hide(); stageRef.current.batchDraw() }
      const mimeType = exportFormat === 'jpg' ? 'image/jpeg'
        : exportFormat === 'webp' ? 'image/webp' : 'image/png'
      const dataUrl = stageRef.current.toDataURL({
        mimeType,
        quality: exportQuality,
        pixelRatio: exportScale,
      })
      if (watermarkRef?.current) { watermarkRef.current.show(); stageRef.current.batchDraw() }
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `nova-psd-${Date.now()}.${exportFormat}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setShowExportModal(false)
      toast('Xuất ảnh thành công!', 'success', 'Export')
    } catch (err) {
      console.error(err)
      if (watermarkRef?.current) { watermarkRef.current.show(); stageRef.current?.batchDraw() }
      toast('Lỗi khi xuất ảnh', 'error', 'Export lỗi')
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const selectedLayer = layers.find(l => l.id === selectedLayerId) || null
  const editableFieldCount = useMemo(
    () => layers.filter(l => !!detectLayerRole(l.name)).length,
    [layers],
  )
  const panelList = useMemo(
    () => tree ? buildPanelList(tree, layers, groupExpanded, new Map(Object.entries(groupVisible))) : [],
    [tree, layers, groupExpanded, groupVisible],
  )

  // ── Admin gate ────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6 text-center px-4">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <Lock size={32} className="text-rose-400" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-white mb-2">Chỉ dành cho Admin</h2>
          <p className="text-sm text-white/40">Bạn không có quyền truy cập trang này.</p>
        </div>
        <Link to="/" className="btn-primary px-6 py-2.5 text-sm flex items-center gap-2">
          <ChevronLeft size={16} /> Quay lại trang chủ
        </Link>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col -mx-4 sm:-mx-6 -my-6" style={{ height: 'calc(100vh - 4rem)', background: '#0a0a10' }}>
      <Toolbar
        psdFile={psdFile}
        psdMeta={psdMeta}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
        onZoom100={handleZoom100}
        showLeft={showLeft}
        showRight={showRight}
        onToggleLeft={() => setShowLeft(v => !v)}
        onToggleRight={() => setShowRight(v => !v)}
        userBalance={user?.balance}
        onExportClick={() => hasPaid ? setShowExportModal(true) : setShowPaymentModal(true)}
        hasPaid={hasPaid}
        isAdmin={isAdmin}
        onPublishClick={() => setShowPublishModal(true)}
        onUndo={history.undo}
        onRedo={history.redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        autosaveTick={autosaveTick}
      />

      {savedDraft && psdMeta && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs"
          style={{ background: 'rgba(110,75,255,0.08)', borderBottom: '1px solid rgba(110,75,255,0.18)' }}>
          <span className="text-violet-200">
            Tìm thấy bản nháp đã lưu cho file này
            {savedDraft.savedAt
              ? ` (${new Date(savedDraft.savedAt).toLocaleString('vi-VN')})`
              : ''}.
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={restoreDraft}
              className="text-violet-300 underline font-medium hover:text-violet-200">
              Khôi phục
            </button>
            <button onClick={dismissDraft} className="text-white/40 hover:text-white/70">
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      {hasPaid && psdMeta && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs"
          style={{ background: 'rgba(43,242,192,0.08)', borderBottom: '1px solid rgba(43,242,192,0.15)' }}>
          <Download size={12} className="text-teal-400" />
          <span className="text-teal-300">Phiên export đang mở.</span>
          <button onClick={() => setShowExportModal(true)} className="ml-auto text-teal-400 underline font-medium">
            Export ngay
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">
        {/* LEFT: layer panel */}
        <AnimatePresence initial={false}>
          {showLeft && (
            <motion.div
              key="left"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <ResizableSidebar
                side="left"
                initial={300}
                min={240}
                max={460}
                storageKey="nova_psd_left_w"
                style={{
                  background: 'linear-gradient(180deg, #14141d 0%, #10101a 100%)',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex flex-col h-full">
                  <div className="px-3 py-3 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Layers</span>
                    <span className="text-[10px] text-white/30">{layers.length}</span>
                  </div>
                  {/* Bulk actions bar */}
                  {layers.length > 0 && (
                    <div className="px-2 py-1.5 flex items-center gap-1 flex-wrap"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <button
                        onClick={lockAllLayers}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all text-amber-300/70 hover:text-amber-300 hover:bg-amber-500/10"
                        title="Khóa toàn bộ layer"
                      >
                        <Lock size={10} /> Khóa hết
                      </button>
                      <button
                        onClick={unlockAllLayers}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all text-emerald-300/70 hover:text-emerald-300 hover:bg-emerald-500/10"
                        title="Mở khóa toàn bộ layer"
                      >
                        <Unlock size={10} /> Mở hết
                      </button>
                      <div className="w-px h-3 bg-white/10" />
                      <button
                        onClick={resetAllLayers}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all text-rose-300/70 hover:text-rose-300 hover:bg-rose-500/10"
                        title="Reset tất cả layer về bản gốc"
                      >
                        <RotateCcw size={10} /> Reset hết
                      </button>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                    {layers.length === 0 && (
                      <p className="text-[11px] text-white/30 px-3 py-6 text-center">Chưa có layer.</p>
                    )}
                    {panelList.map(item => (
                      <LayerRow
                        key={item.id}
                        layer={item}
                        depth={item.depth || 0}
                        selected={!item.isGroup && item.id === selectedLayerId}
                        expanded={item.isGroup ? (groupExpanded[item.id] ?? true) : undefined}
                        onSelect={item.isGroup ? undefined : selectLayer}
                        onToggleVisible={item.isGroup ? toggleGroupVisible : toggleLayerVisible}
                        onToggleExpand={item.isGroup ? toggleGroupExpand : undefined}
                        onToggleLock={item.isGroup ? undefined : toggleLayerLock}
                        onRename={item.isGroup ? undefined : renameLayer}
                        onMoveUp={item.isGroup ? undefined : (id => moveLayer(id, 'up'))}
                        onMoveDown={item.isGroup ? undefined : (id => moveLayer(id, 'down'))}
                        onDragStart={handleLayerDragStart}
                        onDragOver={handleLayerDragOver}
                        onDrop={handleLayerDrop}
                        isDragOver={dragOverLayerId === item.id}
                        isBeingDragged={draggedLayerId === item.id}
                      />
                    ))}
                  </div>
                </div>
              </ResizableSidebar>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CENTER: canvas */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 flex items-center justify-center overflow-auto relative"
          style={{
            background:
              'repeating-conic-gradient(rgba(255,255,255,0.025) 0% 25%, transparent 0% 50%) 50% / 24px 24px, #0a0a10',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedLayerId(null) }}
        >
          {loading && <Spinner label={loadingMsg} />}

          {!loading && !psdMeta && (
            <div className="flex flex-col items-center justify-center gap-5 w-full p-6 max-w-2xl mx-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  'relative rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-300 w-full',
                  dragging
                    ? 'border-violet-400 bg-violet-500/10 scale-[1.01]'
                    : 'border-white/[0.1] hover:border-violet-400/50 hover:bg-white/[0.02]',
                )}
                style={{ minHeight: 280 }}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <motion.div
                    animate={dragging ? { scale: 1.2, rotate: 10 } : { scale: 1, rotate: 0 }}
                    className={clsx(
                      'w-20 h-20 rounded-2xl mb-5 flex items-center justify-center border transition-all',
                      dragging ? 'bg-violet-500/30 border-violet-400/50' : 'bg-white/[0.04] border-white/[0.08]',
                    )}
                  >
                    <Upload size={32} className={dragging ? 'text-violet-300' : 'text-white/30'} />
                  </motion.div>
                  <p className="text-lg font-semibold text-white/80 mb-2">
                    {dragging ? 'Thả file PSD vào đây!' : 'Kéo thả file PSD'}
                  </p>
                  <p className="text-sm text-white/40 mb-4">hoặc click để chọn</p>
                  <p className="text-xs text-white/25">Chỉ .psd – tối đa 80MB</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".psd" className="hidden"
                  onChange={e => handleFile(e.target.files[0])} />
              </motion.div>
              <p className="text-[11px] text-white/30 flex items-center gap-1.5">
                💡 Bấm nút <kbd className="px-1 py-0.5 rounded font-mono text-violet-300"
                  style={{ background: 'rgba(110,75,255,0.12)', border: '1px solid rgba(110,75,255,0.25)' }}>?</kbd>
                ở góc dưới phải để xem hướng dẫn nhanh
              </p>
            </div>
          )}

          {!loading && psdMeta && (
            <PsdCanvas
              ref={stageRef}
              psdMeta={psdMeta}
              layers={layers}
              selectedLayerId={selectedLayerId}
              zoom={zoom}
              pan={pan}
              onSelectLayer={selectLayer}
              onLayerChange={applyLayerChanges}
              onZoomChange={setZoom}
              onPanChange={setPan}
              showWatermark={!hasPaid}
            />
          )}
        </div>

        {/* RIGHT: properties */}
        <AnimatePresence initial={false}>
          {showRight && (
            <motion.div
              key="right"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <ResizableSidebar
                side="right"
                initial={320}
                min={260}
                max={500}
                storageKey="nova_psd_right_w"
                style={{
                  background: 'linear-gradient(180deg, #14141d 0%, #10101a 100%)',
                  borderLeft: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div className="flex flex-col h-full">
                  <div className="px-3 py-3 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Properties</span>
                    {selectedLayer && (
                      <span className="text-[10px] text-white/30 capitalize">{selectedLayer.type}</span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <PropertiesPanel
                      layer={selectedLayer}
                      onChange={updateSelectedLayer}
                      onReset={resetSelectedLayer}
                      onToggleLock={toggleLayerLock}
                      onMove={moveSelected}
                    />
                  </div>
                </div>
              </ResizableSidebar>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Payment Modal */}
      <Modal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Xuất ảnh chất lượng cao" size="sm">
        <div className="p-6 space-y-5">
          <div className="flex gap-3 p-4 rounded-2xl"
            style={{ background: 'rgba(110,75,255,0.1)', border: '1px solid rgba(110,75,255,0.2)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(110,75,255,0.2)' }}>
              <Download size={18} className="text-violet-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">Export không watermark</p>
              <p className="text-xs text-white/50 leading-relaxed">PNG / JPG / WebP HD, không watermark.</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <p className="text-xs text-white/40 mb-1">Giá xuất ảnh</p>
              <div className="flex items-center gap-2">
                <Star size={16} className="text-yellow-400" />
                <span className="text-xl font-bold text-white font-display">50 coins</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40 mb-1">Số dư</p>
              <div className="flex items-center gap-1 justify-end">
                <Star size={13} className="text-yellow-400" />
                <span className={clsx('text-base font-bold font-display',
                  (user?.balance ?? 0) >= 50 ? 'text-emerald-400' : 'text-rose-400')}>
                  {user?.balance ?? 0} coins
                </span>
              </div>
            </div>
          </div>

          {(user?.balance ?? 0) < 50 && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(252,165,165,1)' }}>
              <span>Số dư không đủ.</span>
              <Link to="/topup" onClick={() => setShowPaymentModal(false)} className="underline font-semibold hover:text-rose-300">
                Nạp thêm coins →
              </Link>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setShowPaymentModal(false)} className="btn-ghost flex-1 py-2.5 text-sm">Hủy</button>
            <button onClick={handlePayment} disabled={(user?.balance ?? 0) < 50}
              className={clsx('btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2',
                (user?.balance ?? 0) < 50 && 'opacity-50 cursor-not-allowed')}>
              <Star size={14} /> Thanh toán 50 coins
            </button>
          </div>
        </div>
      </Modal>

      {/* Publish Modal */}
      <PublishModal
        open={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        form={publishForm}
        setForm={setPublishForm}
        onSubmit={handlePublish}
        editableFieldCount={editableFieldCount}
      />

      {/* Export Format Modal */}
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Chọn định dạng xuất" size="sm">
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { format: 'png',  label: 'PNG',  desc: 'Lossless · trong suốt', icon: <FileType size={18} /> },
              { format: 'jpg',  label: 'JPG',  desc: 'File nhỏ · chất lượng cao', icon: <ImageIcon size={18} /> },
              { format: 'webp', label: 'WebP', desc: 'Hiện đại · siêu nhỏ', icon: <ImageIcon size={18} /> },
            ].map(({ format, label, desc, icon }) => (
              <button
                key={format}
                onClick={() => setExportFormat(format)}
                className={clsx('p-4 rounded-2xl text-left transition-all')}
                style={{
                  border: exportFormat === format
                    ? '1px solid rgba(110,75,255,0.5)'
                    : '1px solid rgba(255,255,255,0.07)',
                  background: exportFormat === format
                    ? 'rgba(110,75,255,0.15)'
                    : 'rgba(255,255,255,0.03)',
                }}
              >
                <div className="text-violet-300 mb-2">{icon}</div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-[10px] text-white/40 mt-0.5 leading-tight">{desc}</p>
                {exportFormat === format && (
                  <div className="mt-2 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(110,75,255,0.8)' }}>
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {(exportFormat === 'jpg' || exportFormat === 'webp') && (
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-white/40 uppercase tracking-wider">Chất lượng</label>
                <span className="text-xs font-semibold text-white">{Math.round(exportQuality * 100)}%</span>
              </div>
              <input type="range" min={0.6} max={1} step={0.05}
                value={exportQuality}
                onChange={e => setExportQuality(Number(e.target.value))}
                className="w-full accent-violet-500" />
            </div>
          )}

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-white/40 uppercase tracking-wider">Độ phân giải</label>
              <span className="text-xs font-semibold text-white">
                {exportScale}× ({psdMeta ? psdMeta.width * exportScale : 0}×{psdMeta ? psdMeta.height * exportScale : 0})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(s => (
                <button key={s} onClick={() => setExportScale(s)}
                  className={clsx('py-2 rounded-lg text-xs font-medium transition-all')}
                  style={{
                    background: exportScale === s ? 'rgba(110,75,255,0.2)' : 'rgba(255,255,255,0.04)',
                    border: exportScale === s
                      ? '1px solid rgba(110,75,255,0.4)'
                      : '1px solid rgba(255,255,255,0.08)',
                    color: exportScale === s ? 'rgba(196,181,253,1)' : 'rgba(255,255,255,0.6)',
                  }}>
                  {s}× {s === 2 ? '(Retina)' : s === 3 ? '(HD)' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/30 p-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.025)' }}>
            <Download size={12} className="flex-shrink-0" />
            <span>Xuất {exportScale}× không watermark · {psdMeta?.width ?? 0}×{psdMeta?.height ?? 0}px</span>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowExportModal(false)} className="btn-ghost flex-1 py-2.5 text-sm">Hủy</button>
            <button onClick={handleExport} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
              <Download size={14} /> Xuất ngay
            </button>
          </div>
        </div>
      </Modal>

      {/* Floating help — never covers the canvas, always one click away. */}
      <GuideSection
        floating
        floatPosition="br"
        title="Hướng dẫn PSD Editor"
        subtitle="Chỉnh sửa file Photoshop trực tiếp trên trình duyệt"
        accent="brand"
        icon={Layers}
        steps={[
          { icon: Upload,   title: 'Tải PSD',       desc: 'Kéo & thả file .psd hoặc click chọn từ máy. Tối đa 80MB.', tip: 'File càng nhẹ, mở càng nhanh.' },
          { icon: Layers,   title: 'Quản lý layer', desc: 'Panel trái hiển thị toàn bộ layer — khóa, ẩn, đổi tên, kéo-thả thứ tự.', tip: 'Bấm icon khóa/mắt để bật/tắt nhanh.' },
          { icon: Type,     title: 'Chỉnh sửa',     desc: 'Click layer → bảng Properties bên phải để đổi text, màu, opacity, vị trí.', tip: 'Ctrl+Z / Ctrl+Y để undo/redo.' },
          { icon: Download, title: 'Xuất ảnh',      desc: 'Bấm Export → chọn PNG / JPG / WebP HD không watermark (50 coins).', tip: 'Bản nháp tự động lưu trong trình duyệt.' },
        ]}
        tips={[
          'Toàn bộ xử lý chạy trên trình duyệt — file PSD không bị upload đi đâu.',
          'Bấm phím "?" bất cứ lúc nào để mở/đóng hướng dẫn này.',
        ]}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree helpers (group cascade)
// ─────────────────────────────────────────────────────────────────────────────

function ancestorIds(tree, fromId) {
  if (!tree || !fromId || fromId === 'root') return []
  const path = []
  function walk(node) {
    if (!node.children) return false
    if (node.id === fromId) return true
    for (const c of node.children) {
      if (c.isGroup && walk(c)) {
        path.push(c.id)
        return true
      }
    }
    return false
  }
  walk(tree)
  return path
}

function ancestorChainVisible(tree, fromGroupId, groupVisible) {
  if (!fromGroupId || fromGroupId === 'root') return true
  const ids = ancestorIds(tree, fromGroupId).concat(fromGroupId)
  return ids.every(id => groupVisible[id] !== false)
}
