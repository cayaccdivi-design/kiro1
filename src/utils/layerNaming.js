// Layer naming convention for Nova AI Studio PSD editor
// ---------------------------------------------------------------
// Three concerns share this file:
//   1. EDITABLE_LAYER_NAMES – strict whitelist used by the legacy
//      in-browser PSD editor (PsdEditorPage). Kept for back-compat.
//   2. LAYER_ROLES – broader role catalogue used by the *publish to
//      shop* and *customer editor* flows.
//   3. LOCK_PREFIX / lock_* – names that, when present in a PSD, mark
//      the layer as locked-by-default (admin can't unlock without
//      explicit action). This is what powers the Photopea-based admin
//      flow: the admin authors PSDs with `lock_background`, `lock_avt`,
//      `lock_nvat`, … and the customer editor refuses to mutate them.
// ---------------------------------------------------------------

// 1) Strict whitelist for in-editor edits (legacy webtoon/psd path).
//    Names are matched case-insensitively, trimmed of whitespace.
export const EDITABLE_TEXT_NAMES  = ['text_1', 'text_title', 'text_price', 'text_name']
export const EDITABLE_IMAGE_NAMES = ['image_1', 'logo_1', 'avt_png', 'nvat_png']
export const EDITABLE_LAYER_NAMES = [...EDITABLE_TEXT_NAMES, ...EDITABLE_IMAGE_NAMES]

function clean(name) {
  return name ? String(name).trim().toLowerCase() : ''
}

export function isEditableTextLayer(name) {
  return EDITABLE_TEXT_NAMES.includes(clean(name))
}

export function isEditableImageLayer(name) {
  return EDITABLE_IMAGE_NAMES.includes(clean(name))
}

export function isEditableLayer(name) {
  return EDITABLE_LAYER_NAMES.includes(clean(name))
}

export function editableTextHint()  { return EDITABLE_TEXT_NAMES.join(', ') }
export function editableImageHint() { return EDITABLE_IMAGE_NAMES.join(', ') }

// ---------------------------------------------------------------
// 2) Role catalogue. Used by the customer-side editor to decide
//    which form fields to render and how to render the overlay.
//    Keys are layer names (lower-case); values describe the field.
// ---------------------------------------------------------------
export const LAYER_ROLES = {
  // ── Text roles ────────────────────────────────────────────────
  text_title: { role: 'text_title', label: 'Tiêu đề',        type: 'text', icon: 'Type' },
  text_price: { role: 'text_price', label: 'Giá',            type: 'text', icon: 'Type' },
  text_name:  { role: 'text_name',  label: 'Tên',            type: 'text', icon: 'Type' },
  text_1:     { role: 'text_1',     label: 'Nội dung chính', type: 'text', icon: 'Type' },
  text_2:     { role: 'text_2',     label: 'Nội dung phụ',   type: 'text', icon: 'Type' },
  text_3:     { role: 'text_3',     label: 'Nội dung 3',     type: 'text', icon: 'Type' },
  title_logo: { role: 'title_logo', label: 'Tiêu đề logo',   type: 'text', icon: 'Type' },
  text_logo:  { role: 'text_logo',  label: 'Text logo phụ',  type: 'text', icon: 'Type' },
  // ── Image roles ───────────────────────────────────────────────
  image_1:    { role: 'image_1',    label: 'Ảnh chính',      type: 'image', icon: 'Image',      shape: 'rect'   },
  logo_1:     { role: 'logo_1',     label: 'Logo',           type: 'image', icon: 'Star',       shape: 'rect'   },
  avt_png:    { role: 'avt_png',    label: 'Avatar (tròn)',  type: 'image', icon: 'UserCircle', shape: 'circle' },
  nvat_png:   { role: 'nvat_png',   label: 'Nhân vật PNG',   type: 'image', icon: 'User',       shape: 'rect'   },
  logo:       { role: 'logo',       label: 'Logo chính',     type: 'image', icon: 'Star',       shape: 'rect'   },
}

export function detectLayerRole(layerName) {
  return LAYER_ROLES[clean(layerName)] || null
}

export function groupLayersByRole(layers) {
  const result = { text: [], image: [], other: [] }
  for (const layer of layers) {
    const role = detectLayerRole(layer.name)
    if (role) {
      if (role.type === 'text') result.text.push({ ...layer, role })
      else result.image.push({ ...layer, role })
    } else {
      result.other.push(layer)
    }
  }
  return result
}

// ---------------------------------------------------------------
// 3) Lock convention. Layers whose name starts with `lock_` (or is
//    one of the canonical lock_* names below) are LOCKED BY DEFAULT
//    when a PSD is published to the shop. The customer cannot edit
//    them unless the admin explicitly unlocks them in the admin UI.
// ---------------------------------------------------------------
export const LOCK_PREFIX = 'lock_'

// Canonical lock targets. The admin can author PSDs with these names
// to express intent ("never let customers swap the background") even
// if the matching role layer (e.g. `avt_png`) also exists.
export const CANONICAL_LOCK_NAMES = [
  'lock_background', // protects the background plate
  'lock_avt',        // protects the round avatar
  'lock_nvat',       // protects the character cut-out
  'lock_logo',       // protects the brand logo
  'lock_title',      // protects the headline
  'lock_price',      // protects the price text
]

// Returns true if the layer name implies "locked by default".
// Two patterns count: explicit `lock_*` prefix, OR the canonical
// names above (matched case-insensitively).
export function isLockLayerName(name) {
  const n = clean(name)
  if (!n) return false
  if (n.startsWith(LOCK_PREFIX)) return true
  return CANONICAL_LOCK_NAMES.includes(n)
}

// Given an arbitrary layer name, derive the *target* role it locks.
// `lock_avt` -> 'avt_png', `lock_background` -> 'background', etc.
// Returns null if the name isn't a lock layer.
export function lockTargetRole(name) {
  const n = clean(name)
  if (!isLockLayerName(n)) return null
  if (n === 'lock_avt')        return 'avt_png'
  if (n === 'lock_nvat')       return 'nvat_png'
  if (n === 'lock_background') return 'background'
  if (n === 'lock_logo')       return 'logo'
  if (n === 'lock_title')      return 'text_title'
  if (n === 'lock_price')      return 'text_price'
  // Generic `lock_<role>` → that role.
  if (n.startsWith(LOCK_PREFIX)) return n.slice(LOCK_PREFIX.length)
  return null
}
