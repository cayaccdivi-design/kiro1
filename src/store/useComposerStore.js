import { create } from 'zustand'

// ─── localStorage keys ──────────────────────────────────────────────
const ADMIN_RESOURCES_KEY  = 'nova_composer_resources_v1'
const ADMIN_PROMPTS_KEY    = 'nova_composer_prompts_v2'   // bumped: new schema
const ADMIN_CATEGORIES_KEY = 'nova_composer_categories_v1'
const ADMIN_EFFECTS_KEY    = 'nova_composer_effects_v1'
const ADMIN_AI_SETTINGS_KEY = 'nova_composer_ai_settings_v1'
const CANVAS_STATE_KEY     = 'nova_composer_canvas_v1'
const LEGACY_COMMANDS_KEY  = 'nova_composer_commands_v1'  // migrate from this

// ─── Pure JSON helpers ──────────────────────────────────────────────
const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch { return fallback }
}
const saveJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch (err) { console.warn(`[composer] save ${key} failed`, err) }
}

// Restore canvas (background + layers + canvasSize). Capped at ~4MB.
const loadCanvasState = () => {
  const fallback = { background: null, layers: [], canvasSize: { width: 900, height: 600 } }
  try {
    const saved = JSON.parse(localStorage.getItem(CANVAS_STATE_KEY))
    if (!saved || typeof saved !== 'object') return fallback
    return {
      background: saved.background ?? null,
      layers:     Array.isArray(saved.layers) ? saved.layers : [],
      canvasSize: saved.canvasSize ?? fallback.canvasSize,
    }
  } catch { return fallback }
}
const saveCanvasState = (snapshot) => {
  try {
    const json = JSON.stringify(snapshot)
    if (json.length > 4_000_000) return
    localStorage.setItem(CANVAS_STATE_KEY, json)
  } catch { /* quota / private mode — ignore */ }
}

// ─── Admin defaults ─────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: 'vehicles',   name: 'Xe cộ',        icon: '🚗',    color: '#6e4bff' },
  { id: 'characters', name: 'Nhân vật',     icon: '🧑‍🎨', color: '#ec4899' },
  { id: 'nature',     name: 'Thiên nhiên',  icon: '🌿',    color: '#10b981' },
  { id: 'effects',    name: 'Hiệu ứng',     icon: '✨',    color: '#f59e0b' },
  { id: 'logos',      name: 'Logo & Brand', icon: '🏷️',   color: '#0ea5e9' },
  { id: 'stickers',   name: 'Sticker',      icon: '🎭',    color: '#8b5cf6' },
  { id: 'background', name: 'Background',   icon: '🌆',    color: '#14b8a6' },
]

// New prompt schema (v2). Fields:
// - id: stable id
// - name: human label                (vd: "Add Sport Car")
// - keyword: phrase user types       (vd: "thêm xe")
// - prompt: actual AI prompt text
// - model: 'flux' | 'turbo' | 'sdxl' (passed to image API)
// - strength: 0..1 (how much the AI ignores the canvas — used as guidance)
// - mode: 'overlay' | 'background' | 'replace'
//     overlay    = generate transparent PNG cutout, place over background
//     background = generate full-frame image, swap as new canvas background
//     replace    = generate full-frame image of selected layer's bounds
// - categoryId, icon, active
const DEFAULT_PROMPTS = [
  { id: 'p_car',     name: 'Add Sport Car',  keyword: 'thêm xe',         prompt: 'realistic sports car blended naturally into background, cinematic lighting, perspective correct, no background',                                                  model: 'flux',  strength: 0.8, mode: 'overlay',    categoryId: 'vehicles',   icon: '🏎️',  active: true },
  { id: 'p_anime',   name: 'Anime Character', keyword: 'thêm nhân vật anime', prompt: 'detailed anime character, vibrant colors, transparent background, full body, dynamic pose, japanese style',                                                  model: 'flux',  strength: 0.85, mode: 'overlay',    categoryId: 'characters', icon: '🧑‍🎨', active: true },
  { id: 'p_fire',    name: 'Fire Effect',     keyword: 'hiệu ứng lửa',       prompt: 'realistic fire flames effect, transparent background, dramatic orange and red, particle sparks',                                                                model: 'flux',  strength: 0.9, mode: 'overlay',    categoryId: 'effects',    icon: '🔥',   active: true },
  { id: 'p_cyber',   name: 'Cyberpunk BG',    keyword: 'đổi nền cyberpunk',  prompt: 'cyberpunk city at night, neon lights, futuristic skyline, rain reflections, cinematic wide angle, photorealistic',                                              model: 'flux',  strength: 0.75, mode: 'background', categoryId: 'background', icon: '🌆',   active: true },
  { id: 'p_sakura',  name: 'Sakura Petals',   keyword: 'hoa anh đào',         prompt: 'falling cherry blossom petals, soft pink, transparent background, depth of field, romantic atmosphere',                                                       model: 'flux',  strength: 0.7,  mode: 'overlay',    categoryId: 'nature',     icon: '🌸',   active: true },
  { id: 'p_dragon',  name: 'Fire Dragon',     keyword: 'rồng lửa',            prompt: 'majestic fire breathing dragon, transparent background, scales detailed, cinematic lighting, fantasy creature',                                              model: 'flux',  strength: 0.85, mode: 'overlay',    categoryId: 'characters', icon: '🐉',   active: true },
  { id: 'p_logo',    name: 'Brand Logo',      keyword: 'logo góc phải',       prompt: 'minimal modern logo design, clean lines, transparent background, professional brand identity',                                                              model: 'turbo', strength: 0.6,  mode: 'overlay',    categoryId: 'logos',      icon: '🏷️',  active: true },
  { id: 'p_snow',    name: 'Snow Falling',    keyword: 'tuyết rơi',           prompt: 'gentle snow falling, white flakes, transparent background, winter atmosphere, soft bokeh',                                                                  model: 'turbo', strength: 0.7,  mode: 'overlay',    categoryId: 'effects',    icon: '❄️',   active: true },
]

const DEFAULT_EFFECTS = [
  { id: 'fx_blur',       name: 'Blur nền',    icon: '🌫️', type: 'filter',  value: 'blur(3px)',                         active: true },
  { id: 'fx_brightness', name: 'Sáng hơn',    icon: '☀️',  type: 'filter',  value: 'brightness(1.3)',                   active: true },
  { id: 'fx_contrast',   name: 'Tương phản',  icon: '⚫',  type: 'filter',  value: 'contrast(1.4)',                     active: true },
  { id: 'fx_grayscale',  name: 'Đen trắng',   icon: '🎞️', type: 'filter',  value: 'grayscale(1)',                      active: true },
  { id: 'fx_sepia',      name: 'Sepia',       icon: '🟤',  type: 'filter',  value: 'sepia(0.8)',                        active: true },
  { id: 'fx_saturate',   name: 'Sặc sỡ',      icon: '🌈',  type: 'filter',  value: 'saturate(2)',                       active: true },
  { id: 'fx_vignette',   name: 'Vignette',    icon: '🔲',  type: 'overlay', value: 'radial-gradient(ellipse, transparent 60%, rgba(0,0,0,0.7) 100%)', active: true },
  { id: 'fx_neon',       name: 'Neon Glow',   icon: '💜',  type: 'overlay', value: 'radial-gradient(ellipse at 50% 50%, rgba(110,75,255,0.3) 0%, transparent 70%)', active: true },
  { id: 'fx_sunset',     name: 'Sunset',      icon: '🌅',  type: 'overlay', value: 'linear-gradient(to bottom, rgba(255,100,0,0.2) 0%, rgba(255,200,0,0.15) 100%)', active: true },
  { id: 'fx_dark',       name: 'Dark Mode',   icon: '🌑',  type: 'overlay', value: 'rgba(0,0,0,0.45)',                  active: true },
]

const DEFAULT_AI_SETTINGS = {
  // Provider selection. 'pollinations' is free, no API key, browser-friendly.
  // 'mock' falls back to admin-uploaded resources (legacy behavior).
  provider: 'pollinations',
  // Endpoint. Allow self-hosted Stable Diffusion or another image API by
  // overriding this in the admin panel.
  endpoint: 'https://image.pollinations.ai/prompt/',
  // Default model when prompt doesn't specify one.
  defaultModel: 'flux',
  // Max time to wait for generation (ms) before giving up.
  timeoutMs: 45_000,
  // Suffix added to every prompt (style hints).
  promptSuffix: '',
  // Negative prompt (what to avoid).
  negativePrompt: 'low quality, blurry, watermark, text, signature',
}

// Migrate v1 commands → v2 prompts the first time the user runs the new build.
function migrateLegacyCommands() {
  if (localStorage.getItem(ADMIN_PROMPTS_KEY)) return null
  const legacy = loadJSON(LEGACY_COMMANDS_KEY, null)
  if (!Array.isArray(legacy) || legacy.length === 0) return null
  return legacy.map(c => ({
    id: c.id,
    name: c.keyword || 'Migrated',
    keyword: c.keyword || '',
    prompt: c.prompt || '',
    model: 'flux',
    strength: 0.8,
    mode: 'overlay',
    categoryId: c.categoryId || '',
    icon: c.icon || '✨',
    active: c.active !== false,
    resourceId: c.resourceId || null, // keep optional fallback resource
  }))
}

// ─── AI helpers ─────────────────────────────────────────────────────
// Pick a position for an overlay layer based on Vietnamese / English
// keywords in the user's input. Returns rounded x/y/scale.
export function getAIPosition(keyword, canvasW, canvasH, imgW, imgH) {
  const kw = (keyword || '').toLowerCase()
  let x = (canvasW - imgW) / 2
  let y = (canvasH - imgH) / 2
  let scale = 0.6

  if (kw.includes('góc phải') || kw.includes('bottom-right')) {
    x = canvasW - imgW * 0.35 - 20; y = canvasH - imgH * 0.35 - 20; scale = 0.35
  } else if (kw.includes('góc trái') || kw.includes('bottom-left')) {
    x = 20; y = canvasH - imgH * 0.35 - 20; scale = 0.35
  } else if (kw.includes('logo') || kw.includes('watermark')) {
    x = canvasW - imgW * 0.25 - 16; y = canvasH - imgH * 0.25 - 16; scale = 0.25
  } else if (kw.includes('trái') || kw === 'left') {
    x = 20; scale = 0.6
  } else if (kw.includes('phải') || kw === 'right') {
    x = canvasW - imgW * 0.6 - 20; scale = 0.6
  } else if (kw.includes('trên') || kw.includes('top')) {
    y = 20; scale = 0.55
  } else if (kw.includes('dưới') || kw.includes('bottom')) {
    y = canvasH - imgH * 0.55 - 20; scale = 0.55
  } else if (kw.includes('xe') || kw.includes('car')) {
    y = canvasH - imgH * 0.65 - 30; scale = 0.65
  } else if (kw.includes('nhân vật') || kw.includes('anime')) {
    x = canvasW * 0.55; y = canvasH * 0.05; scale = 0.7
  } else if (kw.includes('hiệu ứng') || kw.includes('lửa') || kw.includes('tuyết')) {
    x = 0; y = 0; scale = 1
  } else {
    scale = 0.5
  }

  const w = imgW * scale, h = imgH * scale
  x = Math.max(0, Math.min(x, canvasW - w))
  y = Math.max(0, Math.min(y, canvasH - h))
  return { x: Math.round(x), y: Math.round(y), scale }
}

// Find the best-matching active prompt for an input string. Picks the
// LONGEST keyword match — more specific keywords win (e.g. "thêm xe thể thao"
// beats "thêm xe").
export function matchPrompt(input, prompts) {
  const lower = (input || '').toLowerCase().trim()
  if (!lower) return null
  let best = null
  let bestLen = 0
  for (const p of prompts) {
    if (!p.active) continue
    const kw = (p.keyword || '').toLowerCase().trim()
    if (!kw) continue
    if (lower.includes(kw) && kw.length > bestLen) {
      best = p
      bestLen = kw.length
    }
  }
  return best
}

// Build the final prompt sent to the image API. We merge the admin-saved
// prompt template with the user's input (so user can add their own details)
// and the global suffix.
export function buildFinalPrompt(promptDef, userInput, settings) {
  const userExtra = (userInput || '').replace(new RegExp(promptDef.keyword, 'i'), '').trim()
  const parts = [promptDef.prompt]
  if (userExtra) parts.push(userExtra)
  if (settings.promptSuffix) parts.push(settings.promptSuffix)
  return parts.filter(Boolean).join(', ')
}

// Call Pollinations API for image generation. Returns a data URL (so it
// keeps working offline, can be embedded in autosave, exported via
// canvas.toDataURL with crossOrigin already handled).
async function pollinationsGenerate({ prompt, model, width, height, seed, negativePrompt, endpoint, timeoutMs, signal }) {
  const params = new URLSearchParams({
    model: model || 'flux',
    width: String(width),
    height: String(height),
    seed: String(seed),
    nologo: 'true',
    enhance: 'true',
    referrer: 'nova-composer',
  })
  if (negativePrompt) params.set('negative_prompt', negativePrompt)
  const url = `${endpoint}${encodeURIComponent(prompt)}?${params.toString()}`

  // We don't go through fetch+blob because Pollinations returns the binary
  // directly and supports hot-linking. But to convert to a data URL (so the
  // result survives autosave / export) we fetch as blob.
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs)
  if (signal) signal.addEventListener('abort', () => ctrl.abort())

  try {
    const resp = await fetch(url, { signal: ctrl.signal, mode: 'cors' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('FileReader failed'))
      r.readAsDataURL(blob)
    })
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Layer factory ──────────────────────────────────────────────────
let layerCounter = 0
const newLayerId = () => `layer_${Date.now()}_${++layerCounter}`

const makeLayer = (overrides = {}) => ({
  id: newLayerId(),
  type: 'image',
  name: 'Layer',
  url: null,
  text: '',
  x: 100, y: 100,
  width: 200, height: 200,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  blendMode: 'normal',
  ...overrides,
})

// ─── Initial state load ─────────────────────────────────────────────
const _initialCanvas = loadCanvasState()
const _migrated = migrateLegacyCommands()
const _initialPrompts = _migrated || loadJSON(ADMIN_PROMPTS_KEY, DEFAULT_PROMPTS)
if (_migrated) saveJSON(ADMIN_PROMPTS_KEY, _migrated)

// ─── Store ──────────────────────────────────────────────────────────
export const useComposerStore = create((set, get) => ({
  // ── Canvas state ──────────────────────────────────────────────────
  background: _initialCanvas.background,
  layers:     _initialCanvas.layers,
  selectedLayerId: null,
  canvasSize: _initialCanvas.canvasSize,

  // ── Undo/redo ─────────────────────────────────────────────────────
  history: [],
  historyIndex: -1,

  // ── AI runtime ────────────────────────────────────────────────────
  isProcessing: false,
  aiLog: [],
  abortController: null, // used to cancel in-flight generation

  // ── Admin (persisted) ─────────────────────────────────────────────
  resources:  loadJSON(ADMIN_RESOURCES_KEY,  []),
  prompts:    _initialPrompts,
  categories: loadJSON(ADMIN_CATEGORIES_KEY, DEFAULT_CATEGORIES),
  effects:    loadJSON(ADMIN_EFFECTS_KEY,    DEFAULT_EFFECTS),
  aiSettings: { ...DEFAULT_AI_SETTINGS, ...loadJSON(ADMIN_AI_SETTINGS_KEY, {}) },

  // Backward-compat alias so existing CommandBar / ToolBar code that reads
  // `commands` doesn't crash mid-deploy.
  get commands() { return get().prompts },

  // ── Persistence helper ────────────────────────────────────────────
  _persist: () => {
    const { background, layers, canvasSize } = get()
    saveCanvasState({ background, layers, canvasSize })
  },

  // ── Canvas actions ────────────────────────────────────────────────
  setBackground: (bg) => {
    set({ background: bg }); get()._pushHistory(); get()._persist()
  },
  setCanvasSize: (size) => { set({ canvasSize: size }); get()._persist() },

  // ── Layer actions ─────────────────────────────────────────────────
  addLayer: (props = {}) => {
    const layer = makeLayer(props)
    set(s => ({ layers: [...s.layers, layer], selectedLayerId: layer.id }))
    get()._pushHistory(); get()._persist()
    return layer.id
  },

  updateLayer: (id, patch) => {
    set(s => ({ layers: s.layers.map(l => l.id === id ? { ...l, ...patch } : l) }))
    get()._persist()
  },

  removeLayer: (id) => {
    set(s => ({
      layers: s.layers.filter(l => l.id !== id),
      selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
    }))
    get()._pushHistory(); get()._persist()
  },

  selectLayer: (id) => set({ selectedLayerId: id }),

  moveLayerUp: (id) => {
    const { layers } = get()
    const i = layers.findIndex(l => l.id === id)
    if (i < 0 || i === layers.length - 1) return
    const next = layers.slice(); [next[i], next[i + 1]] = [next[i + 1], next[i]]
    set({ layers: next }); get()._pushHistory(); get()._persist()
  },

  moveLayerDown: (id) => {
    const { layers } = get()
    const i = layers.findIndex(l => l.id === id)
    if (i <= 0) return
    const next = layers.slice(); [next[i], next[i - 1]] = [next[i - 1], next[i]]
    set({ layers: next }); get()._pushHistory(); get()._persist()
  },

  duplicateLayer: (id) => {
    const layer = get().layers.find(l => l.id === id)
    if (!layer) return
    return get().addLayer({
      ...layer,
      name: layer.name + ' (copy)',
      x: layer.x + 20, y: layer.y + 20,
    })
  },

  // ── AI processing ─────────────────────────────────────────────────
  // Find a matching prompt → call the AI image API → drop the result onto
  // the canvas. Falls back to a pre-uploaded resource if the API is
  // unreachable (graceful offline mode).
  processCommand: async (input) => {
    const text = (input || '').trim()
    if (!text) return { success: false, message: 'Empty input' }

    const logId = Date.now() + Math.random()
    set(s => ({
      isProcessing: true,
      aiLog: [{ id: logId, text, time: new Date().toLocaleTimeString('vi-VN'),
                status: 'processing', message: 'AI đang xử lý...' }, ...s.aiLog].slice(0, 25),
    }))

    const updateLog = (status, message) => set(s => ({
      aiLog: s.aiLog.map(l => l.id === logId ? { ...l, status, message } : l),
    }))

    const finish = (status, message) => {
      updateLog(status, message)
      set({ isProcessing: false, abortController: null })
    }

    // 1. Match
    const { prompts, resources, canvasSize, aiSettings, background } = get()
    const matched = matchPrompt(text, prompts)
    if (!matched) {
      finish('error', '❌ Không khớp với prompt nào. Admin cần thêm prompt cho từ khoá này.')
      return { success: false, message: 'Không khớp prompt' }
    }

    // 2. Build final prompt
    const finalPrompt = buildFinalPrompt(matched, text, aiSettings)
    updateLog('processing', `🤖 ${matched.name} • ${matched.model} • mode=${matched.mode}`)

    // 3. Decide target dimensions based on mode
    let targetW = 768, targetH = 768
    if (matched.mode === 'background') {
      targetW = canvasSize.width
      targetH = canvasSize.height
    } else if (matched.mode === 'overlay') {
      targetW = 768; targetH = 768
    }

    // 4. Generate
    const ctrl = new AbortController()
    set({ abortController: ctrl })
    let dataUrl = null
    let usedFallback = false

    if (aiSettings.provider !== 'mock') {
      try {
        const seed = Math.floor(Math.random() * 1_000_000)
        dataUrl = await pollinationsGenerate({
          prompt: finalPrompt,
          model: matched.model || aiSettings.defaultModel,
          width: targetW, height: targetH,
          seed,
          negativePrompt: aiSettings.negativePrompt,
          endpoint: aiSettings.endpoint,
          timeoutMs: aiSettings.timeoutMs,
          signal: ctrl.signal,
        })
      } catch (err) {
        console.warn('[ai] generation failed', err)
        // Fall through to resource fallback below.
      }
    }

    // 5. Fallback: use a pre-uploaded resource matching the category.
    if (!dataUrl) {
      const pool = resources.filter(r => r.categoryId === matched.categoryId && r.active !== false)
      const fallback =
        (matched.resourceId && resources.find(r => r.id === matched.resourceId)) ||
        (pool.length ? pool[Math.floor(Math.random() * pool.length)] : null)
      if (fallback) {
        dataUrl = fallback.url
        targetW = fallback.width || targetW
        targetH = fallback.height || targetH
        usedFallback = true
      }
    }

    if (!dataUrl) {
      finish('error', `❌ AI không phản hồi và không có resource fallback cho "${matched.name}".`)
      return { success: false, message: 'No image' }
    }

    // 6. Apply to canvas based on mode
    if (matched.mode === 'background') {
      get().setBackground({ url: dataUrl, width: canvasSize.width, height: canvasSize.height })
      finish('success', usedFallback
        ? `📦 Đã đặt nền (fallback) • ${matched.name}`
        : `🎨 Đã sinh nền AI • ${matched.name}`)
      return { success: true, mode: 'background', prompt: matched }
    }

    // overlay (default)
    const pos = getAIPosition(text, canvasSize.width, canvasSize.height, targetW, targetH)
    const layerId = get().addLayer({
      type: 'image',
      name: matched.name,
      url: dataUrl,
      x: pos.x, y: pos.y,
      width: Math.round(targetW * pos.scale),
      height: Math.round(targetH * pos.scale),
      opacity: 1,
      blendMode: matched.mode === 'overlay' ? 'normal' : 'normal',
      _aiPromptId: matched.id,
    })

    finish('success', usedFallback
      ? `📦 Đã thêm "${matched.name}" (fallback)`
      : `✨ Đã sinh layer AI • ${matched.name}`)
    return { success: true, layerId, prompt: matched, mode: matched.mode }
  },

  cancelProcessing: () => {
    const ctrl = get().abortController
    if (ctrl) ctrl.abort()
    set({ isProcessing: false, abortController: null })
  },

  clearLog: () => set({ aiLog: [] }),

  // ── History ───────────────────────────────────────────────────────
  _pushHistory: () => {
    const { layers, background, history, historyIndex } = get()
    const snap = JSON.stringify({ layers, background })
    const next = history.slice(0, historyIndex + 1)
    next.push(snap)
    const trimmed = next.slice(-30)
    set({ history: trimmed, historyIndex: trimmed.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const snap = JSON.parse(history[historyIndex - 1])
    set({ ...snap, historyIndex: historyIndex - 1, selectedLayerId: null })
    get()._persist()
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const snap = JSON.parse(history[historyIndex + 1])
    set({ ...snap, historyIndex: historyIndex + 1, selectedLayerId: null })
    get()._persist()
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // ── Admin CRUD ────────────────────────────────────────────────────
  // Generic helper. Persists to localStorage and updates store state.
  _crud: (key, storageKey, defaults = {}) => ({
    add: (item) => {
      const list = [...get()[key], {
        id: `${key}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        ...defaults, ...item,
      }]
      saveJSON(storageKey, list); set({ [key]: list })
      return list[list.length - 1].id
    },
    update: (id, patch) => {
      const list = get()[key].map(x => x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)
      saveJSON(storageKey, list); set({ [key]: list })
    },
    remove: (id) => {
      const list = get()[key].filter(x => x.id !== id)
      saveJSON(storageKey, list); set({ [key]: list })
    },
  }),

  // Resources (admin uploads — used as fallback / explicit images)
  addResource:    (r)     => get()._crud('resources', ADMIN_RESOURCES_KEY, { active: true, blendMode: 'normal', defaultOpacity: 1 }).add(r),
  updateResource: (id, p) => get()._crud('resources', ADMIN_RESOURCES_KEY).update(id, p),
  removeResource: (id)    => get()._crud('resources', ADMIN_RESOURCES_KEY).remove(id),

  // Prompts (the new AI Prompt Manager)
  addPrompt:    (p)     => get()._crud('prompts', ADMIN_PROMPTS_KEY, {
    active: true, model: 'flux', strength: 0.8, mode: 'overlay', icon: '✨',
  }).add(p),
  updatePrompt: (id, p) => get()._crud('prompts', ADMIN_PROMPTS_KEY).update(id, p),
  removePrompt: (id)    => get()._crud('prompts', ADMIN_PROMPTS_KEY).remove(id),
  togglePrompt: (id)    => {
    const cur = get().prompts.find(p => p.id === id)
    if (cur) get().updatePrompt(id, { active: !cur.active })
  },

  // Legacy aliases — older code calls these. Keep them so we don't break
  // anything mid-refactor.
  addCommand:    (c)     => get().addPrompt(c),
  updateCommand: (id, p) => get().updatePrompt(id, p),
  removeCommand: (id)    => get().removePrompt(id),

  // Categories
  addCategory:    (c)     => get()._crud('categories', ADMIN_CATEGORIES_KEY, { icon: '📁', color: '#6e4bff' }).add(c),
  updateCategory: (id, p) => get()._crud('categories', ADMIN_CATEGORIES_KEY).update(id, p),
  removeCategory: (id)    => get()._crud('categories', ADMIN_CATEGORIES_KEY).remove(id),

  // Effects
  addEffect:      (e)     => get()._crud('effects', ADMIN_EFFECTS_KEY, { active: true, icon: '✨', type: 'filter' }).add(e),
  updateEffect:   (id, p) => get()._crud('effects', ADMIN_EFFECTS_KEY).update(id, p),
  removeEffect:   (id)    => get()._crud('effects', ADMIN_EFFECTS_KEY).remove(id),

  // AI Settings
  updateAISettings: (patch) => {
    const next = { ...get().aiSettings, ...patch }
    saveJSON(ADMIN_AI_SETTINGS_KEY, next)
    set({ aiSettings: next })
  },
  resetAISettings: () => {
    saveJSON(ADMIN_AI_SETTINGS_KEY, DEFAULT_AI_SETTINGS)
    set({ aiSettings: { ...DEFAULT_AI_SETTINGS } })
  },

  // ── Cross-tab + manual reload of admin data ───────────────────────
  // Re-read all admin data from localStorage. This is what makes save→use
  // work without reloading the page when the same tab edits, AND keeps two
  // tabs in sync via the `storage` event.
  reloadAdminData: () => {
    set({
      resources:  loadJSON(ADMIN_RESOURCES_KEY,  []),
      prompts:    loadJSON(ADMIN_PROMPTS_KEY,    DEFAULT_PROMPTS),
      categories: loadJSON(ADMIN_CATEGORIES_KEY, DEFAULT_CATEGORIES),
      effects:    loadJSON(ADMIN_EFFECTS_KEY,    DEFAULT_EFFECTS),
      aiSettings: { ...DEFAULT_AI_SETTINGS, ...loadJSON(ADMIN_AI_SETTINGS_KEY, {}) },
    })
  },

  // ── Reset ─────────────────────────────────────────────────────────
  resetCanvas: () => {
    set({
      background: null, layers: [], selectedLayerId: null,
      history: [], historyIndex: -1, aiLog: [],
    })
    saveCanvasState({ background: null, layers: [], canvasSize: get().canvasSize })
  },
}))

// ── Cross-tab realtime sync ───────────────────────────────────────────
// When the admin saves a prompt in tab A, tab B (the user editor) hears the
// `storage` event and refreshes its prompt list — no reload needed.
if (typeof window !== 'undefined') {
  const ADMIN_KEYS = new Set([
    ADMIN_RESOURCES_KEY, ADMIN_PROMPTS_KEY, ADMIN_CATEGORIES_KEY,
    ADMIN_EFFECTS_KEY, ADMIN_AI_SETTINGS_KEY,
  ])
  window.addEventListener('storage', (e) => {
    if (e.key && ADMIN_KEYS.has(e.key)) {
      useComposerStore.getState().reloadAdminData()
    }
  })
}
