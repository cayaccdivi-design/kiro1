// PSD tree walker for @webtoon/psd 0.4.x
// -----------------------------------------------------------------------------
// Produces a flat layer array PLUS a group tree, with all the metadata we
// need for Photoshop-faithful rendering and editing:
//
//   * groupPath          – ancestor group names (auto-detect Group)
//   * groupId            – id of the immediate parent group ('' = root)
//   * isClippingMask     – clipped to the layer beneath (auto-detect)
//   * isSmartObject      – detected from additional properties
//   * isText             – node has a `text` payload
//   * effects            – parsed dropShadow / stroke / gradient / glow
//   * blendMode          – PS blend-mode 4cc, mapped to a Konva-friendly name
//   * opacity            – normalized 0..1 (PSD stores 0..255)
//   * inheritedVisible   – combined ancestor visibility (PS hides children
//                          when a group is hidden)
// -----------------------------------------------------------------------------

import { parseEffectDescriptor } from './psdEffects'
import { isEditableLayer } from './layerNaming'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

// Convert PSD raw RGBA into a PNG data URL (transparent background).
async function rgbaToDataUrl(rgba, width, height) {
  if (!width || !height || !rgba) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imgData = ctx.createImageData(width, height)
  imgData.data.set(rgba)
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

// Normalise the 4-character PSD blend code to something Konva /
// canvas globalCompositeOperation understands.
function normalizeBlendMode(code) {
  if (!code) return 'source-over'
  // psd codes are 4-char ASCII, sometimes with trailing space e.g. "norm"
  const k = String(code).trim().toLowerCase()
  const map = {
    norm: 'source-over', pass: 'source-over',
    mul:  'multiply',    multiply: 'multiply',
    scrn: 'screen',      screen:   'screen',
    over: 'overlay',     overlay:  'overlay',
    dark: 'darken',
    lite: 'lighten',
    div:  'color-dodge', cdiv: 'color-dodge',
    cdge: 'color-dodge',
    cbrn: 'color-burn',
    hLit: 'hard-light',  hlit: 'hard-light',
    sLit: 'soft-light',  slit: 'soft-light',
    diff: 'difference',
    smud: 'exclusion',
    hue:  'hue',
    sat:  'saturation',
    colr: 'color',
    lum:  'luminosity',
  }
  return map[k] || 'source-over'
}

// Detect if a layer is acting as a clipping mask for the layer below.
// PSD spec: Clipping flag in LayerRecord (1 = base, 0 = non-base).
// @webtoon/psd surfaces it via `layerProperties.clippingMask`.
function detectClipping(node) {
  try {
    const props = node?.layerFrame?.layerProperties
    if (props && typeof props.clippingMask === 'number') return props.clippingMask === 1
  } catch { /* private API – tolerate */ }
  return Boolean(node?.isClippingMask)
}

// Detect smart objects via additional layer info keys.
function detectSmartObject(node) {
  try {
    const meta = node?.additionalProperties
    if (meta?.SoLd || meta?.SoLE || meta?.PlLd) return true
  } catch { /* tolerate */ }
  return false
}

// Read low-level blendMode / hidden / clipping from layerFrame.
function readPrivateProps(node) {
  try {
    const p = node?.layerFrame?.layerProperties
    return {
      blendModeRaw: p?.blendMode,
      clippingRaw:  p?.clippingMask,
      hidden:       p?.hidden,
    }
  } catch {
    return {}
  }
}

// Best-effort effect parser (shadow, stroke, gradient, glow).
function parseEffects(node) {
  const fx = { dropShadow: null, stroke: null, gradient: null, glow: null }
  try {
    const meta = node?.additionalProperties
    const block = meta?.lfx2 || meta?.lmfx || null
    if (!block?.descriptor) return fx
    return parseEffectDescriptor(block.descriptor) || fx
  } catch {
    return fx
  }
}

// Extract a few text styling hints from EngineData.
// EngineData is a complex undocumented structure – we parse defensively.
function parseTextStyling(node) {
  const out = { fontFamily: 'Inter', fontSize: 24, color: '#ffffff', alignment: 'left' }
  try {
    const ed = node?.textProperties
    if (!ed) return out

    // Font set – list of font records keyed by index.
    const fontSet = ed.ResourceDict?.FontSet || []
    const styleRun = ed.EngineDict?.StyleRun
    const firstRun = styleRun?.RunArray?.[0]?.StyleSheet?.StyleSheetData
    if (firstRun) {
      const fontIndex = firstRun.Font ?? 0
      const fontRec = fontSet[fontIndex]
      if (fontRec?.Name) out.fontFamily = fontRec.Name
      if (typeof firstRun.FontSize === 'number') out.fontSize = firstRun.FontSize
      const fill = firstRun.FillColor?.Values
      if (Array.isArray(fill) && fill.length === 4) {
        // PSD stores [a, r, g, b] in 0..1 floats
        const [, r, g, b] = fill
        const to255 = v => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)))
        out.color = `rgb(${to255(r)},${to255(g)},${to255(b)})`
      }
    }
    const para = ed.EngineDict?.ParagraphRun?.RunArray?.[0]?.ParagraphSheet?.Properties?.Justification
    if (typeof para === 'number') {
      out.alignment = ['left','right','center','justify-left','justify-right','justify-center','justify'][para] || 'left'
    }
  } catch { /* tolerate – fall back to defaults */ }
  return out
}

/**
 * Walk a parsed PSD tree and return both:
 *   - flat: editor-ready descriptors in z-order (background → foreground)
 *   - tree: a parallel tree of group nodes for the layer panel
 */
export async function walkPsdLayers(psd, onProgress) {
  const flat = []
  const tree = { id: 'root', name: 'root', isGroup: true, children: [], depth: 0 }
  const groupOpacityById = new Map()
  const groupVisibleById = new Map()
  groupOpacityById.set(tree.id, 1)
  groupVisibleById.set(tree.id, true)

  // First pass: build the tree skeleton + collect leaf nodes in render order.
  const tasks = []
  function walk(nodes, parentTreeNode, depth) {
    for (const node of nodes || []) {
      const nodeId = uid()
      if (node.type === 'Group') {
        const groupVisible = !readPrivateProps(node).hidden
        const groupOpacity = (node.opacity ?? 255) / 255
        const treeNode = {
          id: nodeId, name: node.name || 'Group', isGroup: true,
          depth, children: [], visible: groupVisible,
          opacity: groupOpacity,
        }
        parentTreeNode.children.push(treeNode)
        groupOpacityById.set(nodeId,
          (groupOpacityById.get(parentTreeNode.id) ?? 1) * groupOpacity)
        groupVisibleById.set(nodeId,
          (groupVisibleById.get(parentTreeNode.id) ?? true) && groupVisible)
        walk(node.children, treeNode, depth + 1)
      } else if (node.type === 'Layer') {
        const groupPath = []
        let p = parentTreeNode
        while (p && p.id !== 'root') { groupPath.unshift(p.name); p = p._parent || null }
        tasks.push({ node, parentTreeNodeId: parentTreeNode.id, depth, nodeId })
        parentTreeNode.children.push({
          id: nodeId, name: node.name || 'Layer', isGroup: false, depth,
        })
      }
      // Re-link parent so groupPath reconstruction works.
      if (node.type === 'Group') {
        parentTreeNode.children.at(-1)._parent = parentTreeNode
      }
    }
  }
  walk(psd.children || [], tree, 0)

  // Second pass: composite each leaf layer (this is the slow part).
  for (let i = 0; i < tasks.length; i++) {
    const { node, parentTreeNodeId, depth, nodeId } = tasks[i]
    onProgress?.(`Layer ${i + 1}/${tasks.length}: ${node.name || 'Unnamed'}`)

    const width = node.width || 0
    const height = node.height || 0
    const isText = node.text != null && node.text !== ''
    const isClippingMask = detectClipping(node)
    const isSmartObject = detectSmartObject(node)
    const priv = readPrivateProps(node)
    const effects = parseEffects(node)
    const textMeta = isText ? parseTextStyling(node) : null

    // Reconstruct ancestor names by walking the tree we just built.
    const groupPath = []
    function findPath(treeNode, target, acc) {
      if (treeNode.id === target) return acc.slice()
      if (!treeNode.children) return null
      for (const c of treeNode.children) {
        const found = findPath(c, target, c.isGroup ? [...acc, c.name] : acc)
        if (found) return found
      }
      return null
    }
    const path = findPath(tree, parentTreeNodeId, [])
    if (path) groupPath.push(...path)

    // Composite: returns the layer with PS effects baked into pixels but
    // WITHOUT the layer's own opacity baked in (we apply opacity at render
    // time so the editor's opacity slider stays meaningful).
    let bakedDataUrl = null
    if (width > 0 && height > 0) {
      try {
        // composite(applyOpacity=false, composedOpacity=false): bake fx
        // (stroke / shadow / gradient / glow) but keep alpha 1.0 so the
        // renderer's `opacity` prop won't double-multiply.
        const rgba = await node.composite(false, false)
        bakedDataUrl = await rgbaToDataUrl(rgba, width, height)
      } catch (err) {
        console.warn('[psd] composite failed for layer', node.name, err)
      }
    }

    const ownVisible = !priv.hidden
    const inheritedVisible = (groupVisibleById.get(parentTreeNodeId) ?? true) && ownVisible
    const opacity = (node.opacity ?? 255) / 255
    // Combined ancestor group opacity. PS multiplies group opacity through
    // descendants, e.g. group(50%) > layer(50%) renders at 25%.
    const groupOpacity = groupOpacityById.get(parentTreeNodeId) ?? 1

    flat.push({
      id: nodeId,
      name: node.name || `Layer ${i + 1}`,
      groupPath,
      groupId: parentTreeNodeId,
      type: isText ? 'text' : 'image',
      depth,

      // Visibility – we keep both own + inherited so toggling a group folder
      // hides every descendant immediately.
      visible: ownVisible,
      inheritedVisible,

      left: node.left || 0,
      top: node.top || 0,
      width,
      height,

      // Photoshop semantics
      isClippingMask,
      isSmartObject,
      blendMode: normalizeBlendMode(priv.blendModeRaw),
      blendModeRaw: priv.blendModeRaw,
      opacity,
      groupOpacity,         // multiplied into render-time opacity
      effects,

      // Lock state — by default a layer is unlocked iff its name is in the
      // editable whitelist (text_1, text_title, image_1, logo_1). Every
      // other layer (including unnamed ones) starts LOCKED so users can't
      // accidentally mutate them. They can flip `locked` from the layer
      // panel ("Mở khoá") if they really want to.
      locked: !isEditableLayer(node.name || ''),

      // Text
      textContent: isText
        ? (typeof node.text === 'string' ? node.text : (node.text?.content ?? ''))
        : undefined,
      originalTextContent: isText
        ? (typeof node.text === 'string' ? node.text : (node.text?.content ?? ''))
        : undefined,
      fontFamily: isText ? (textMeta?.fontFamily || 'Inter') : undefined,
      fontSize:   isText ? (textMeta?.fontSize   || 24)      : undefined,
      color:      isText ? (textMeta?.color      || '#fff')  : undefined,
      alignment:  isText ? (textMeta?.alignment  || 'left')  : undefined,
      bold: false,
      italic: false,

      // Image
      dataUrl: !isText ? bakedDataUrl : undefined,
      originalDataUrl: !isText ? bakedDataUrl : undefined,
      bakedDataUrl,
      isEdited: false,
    })
  }

  return { flat, tree }
}

// ---------------------------------------------------------------------------
// Mask helpers
// ---------------------------------------------------------------------------

/**
 * Returns a PNG data URL with `newImageDataUrl` cover-fitted into the layer
 * box and masked to the original layer's alpha channel.
 *
 * Used to preserve clipping-mask / smart-object silhouette when the user
 * uploads a replacement image.
 */
export async function maskByOriginalAlpha(newImageDataUrl, originalDataUrl, width, height) {
  if (!newImageDataUrl || !originalDataUrl || !width || !height) return newImageDataUrl
  return new Promise((resolve, reject) => {
    const orig = new Image()
    const next = new Image()
    let loaded = 0
    const tryFinish = () => {
      if (++loaded < 2) return
      try {
        const c = document.createElement('canvas')
        c.width = width
        c.height = height
        const ctx = c.getContext('2d')
        // Cover-fit replacement into the layer box
        const ar = next.width / next.height
        const boxAr = width / height
        let dw, dh
        if (ar > boxAr) { dh = height; dw = dh * ar } else { dw = width; dh = dw / ar }
        const dx = (width - dw) / 2
        const dy = (height - dh) / 2
        ctx.drawImage(next, dx, dy, dw, dh)
        // Apply alpha mask from the original layer.
        ctx.globalCompositeOperation = 'destination-in'
        ctx.drawImage(orig, 0, 0, width, height)
        ctx.globalCompositeOperation = 'source-over'
        resolve(c.toDataURL('image/png'))
      } catch (err) { reject(err) }
    }
    orig.onload = tryFinish; next.onload = tryFinish
    orig.onerror = reject;   next.onerror = reject
    orig.src = originalDataUrl
    next.src = newImageDataUrl
  })
}

export { rgbaToDataUrl, normalizeBlendMode }
