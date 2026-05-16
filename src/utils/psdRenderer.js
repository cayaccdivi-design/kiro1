// psdRenderer.js — composite a flattened canvas from a parsed PSD
// model + customer overrides.
//
// Inputs:
//   template = {
//     width, height,
//     layers: ParsedLayer[]         // top-down (index 0 = top-most)
//     locks: { [layerName]: true }  // layers the customer can't touch
//   }
//
//   overrides = {
//     [layerName]: {
//        text?: string,              // for text layers
//        imageDataUrl?: string,      // for image layers (PNG / JPG / data URL)
//        fontFamily?: string,        // override sampled font
//     }
//   }
//
// Output: a Promise<HTMLCanvasElement> the size of the document.
// The caller can toDataURL/toBlob it for export, or copy into a
// preview canvas via drawImage.
//
// Why we keep bitmaps for unchanged layers:
//   We only re-rasterise the layers the customer explicitly edits.
//   Unedited layers ship pixel-for-pixel from the PSD, so the
//   final image looks identical to the original where the customer
//   didn't touch anything. This is the whole point of "PSD goes in,
//   PSD comes out" without Photopea.
//
// Why we draw new text on top of erased bounds:
//   PSD text rasters are baked. To replace the words, we wipe the
//   layer's bounds (clearRect) then drawText with the sampled
//   colour, alignment, and the customer's font choice. The result
//   matches roughly — not pixel-perfect — but is the right
//   trade-off for a no-iframe workflow.

const imageCache = new Map() // dataUrl -> HTMLImageElement

function loadImage(url) {
  if (!url) return Promise.reject(new Error('empty url'))
  const hit = imageCache.get(url)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { imageCache.set(url, img); resolve(img) }
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

// Public: render a fresh canvas at document size.
export async function renderTemplateToCanvas(template, overrides = {}, opts = {}) {
  const { width, height, layers } = template
  const canvas = opts.target || document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Reset for safety in case caller re-uses a canvas.
  ctx.clearRect(0, 0, width, height)

  // Draw bottom-up. layers[] is top-down (parser flips), so reverse
  // a shallow copy for iteration order.
  const drawList = layers.slice().reverse()

  for (const L of drawList) {
    if (L.hidden) continue
    const ovr = overrides[L.name] || {}
    const opacity = clamp(L.opacity ?? 1, 0, 1)
    ctx.globalAlpha = opacity

    if (L.kind === 'image') {
      await drawImageLayer(ctx, L, ovr)
    } else if (L.kind === 'text') {
      await drawTextLayer(ctx, L, ovr, opts)
    }
  }

  ctx.globalAlpha = 1
  return canvas
}

// Image layers: if the customer supplied a new image, fit it inside
// the original layer's bounds using "cover" semantics (so we never
// distort the aspect ratio). Otherwise blit the cached bitmap.
async function drawImageLayer(ctx, L, ovr) {
  const url = ovr.imageDataUrl || L.bitmapDataUrl
  if (!url) return
  try {
    const img = await loadImage(url)
    if (ovr.imageDataUrl) {
      // Fit the new image inside [left, top, width, height] using
      // "cover": fill the bounds, crop overflow on whichever axis.
      const dx = L.left, dy = L.top
      const dw = L.width, dh = L.height
      const sw = img.naturalWidth || img.width
      const sh = img.naturalHeight || img.height
      const sourceAspect = sw / sh
      const targetAspect = dw / dh
      let sx = 0, sy = 0, sCrop = sw, sCropH = sh
      if (sourceAspect > targetAspect) {
        // Source is wider than target — crop horizontally.
        sCrop = sh * targetAspect
        sx = (sw - sCrop) / 2
      } else {
        sCropH = sw / targetAspect
        sy = (sh - sCropH) / 2
      }
      ctx.drawImage(img, sx, sy, sCrop, sCropH, dx, dy, dw, dh)
    } else {
      ctx.drawImage(img, L.left, L.top, L.width, L.height)
    }
  } catch (err) {
    console.warn('[psdRenderer] image draw failed', L.name, err)
  }
}

// Text layers:
//   - If no override, just blit the original raster (perfect pixels).
//   - If override exists, blit the original first as a soft fallback
//     IF the override is whitespace, otherwise wipe & retype.
//
// Note: we don't try to match Photoshop's glyph metrics. The goal
// is "looks roughly the same as the original". Customers tend to
// replace short labels (titles, prices, names) where exact metrics
// don't matter; long-form layouts usually live in non-editable
// art-board layers.
async function drawTextLayer(ctx, L, ovr, opts) {
  const newText = (ovr.text ?? '').toString()
  const original = L.text ?? ''
  const finalText = newText.trim() ? newText : original

  if (!ovr.text || !ovr.text.trim()) {
    // No real override → use the rasterised glyphs from the PSD.
    try {
      const img = await loadImage(L.bitmapDataUrl)
      ctx.drawImage(img, L.left, L.top, L.width, L.height)
      return
    } catch { /* fall through to redraw */ }
  }

  // Re-typeset from scratch.
  const family = ovr.fontFamily || opts.defaultFontFamily || 'Inter, Arial, sans-serif'
  const color = L.textColor || '#111111'
  const align = L.textAlign || 'center'
  const baseSize = L.textFontSize || estimateFontSize(L.height, finalText)
  const fontSize = fitFontSize(ctx, finalText, family, baseSize, L.width, L.height)

  ctx.save()
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.font = `${fontSize}px ${family}`
  ctx.textAlign = align

  // X anchor depends on alignment so left/center/right look right
  // *inside the layer's bounds*.
  const cx = align === 'left'   ? L.left
           : align === 'right'  ? L.left + L.width
                                : L.left + L.width / 2
  const cy = L.top + L.height / 2

  // Multi-line wrap on \n if the customer typed any.
  const lines = wrapLines(ctx, finalText, L.width, fontSize)
  const lineHeight = fontSize * 1.2
  const totalHeight = lineHeight * lines.length
  let y = cy - totalHeight / 2 + lineHeight / 2
  for (const line of lines) {
    ctx.fillText(line, cx, y)
    y += lineHeight
  }
  ctx.restore()
}

// Pick the largest font size <= baseSize that still fits the bounds
// horizontally for any of the lines. If the original size already
// fits, return it untouched.
function fitFontSize(ctx, text, family, baseSize, maxWidth, maxHeight) {
  let size = baseSize
  ctx.font = `${size}px ${family}`
  // Multi-line: split on hard newlines first.
  const hardLines = String(text || '').split(/\r?\n/)
  for (let attempt = 0; attempt < 10; attempt++) {
    ctx.font = `${size}px ${family}`
    let widest = 0
    for (const line of hardLines) {
      widest = Math.max(widest, ctx.measureText(line).width)
    }
    const totalH = size * 1.2 * hardLines.length
    if (widest <= maxWidth && totalH <= maxHeight) return size
    size = Math.max(8, Math.floor(size * 0.9))
  }
  return size
}

function wrapLines(ctx, text, maxWidth, fontSize) {
  // Honour customer-typed hard breaks first.
  const hardLines = String(text || '').split(/\r?\n/)
  const out = []
  for (const hard of hardLines) {
    if (!hard) { out.push(''); continue }
    const words = hard.split(/\s+/)
    let line = ''
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word
      if (ctx.measureText(probe).width > maxWidth && line) {
        out.push(line)
        line = word
      } else {
        line = probe
      }
    }
    if (line) out.push(line)
  }
  return out.length ? out : ['']
}

function estimateFontSize(layerHeight, text) {
  // Defensive default for layers that didn't sample well.
  if (!layerHeight) return 24
  // ~80% of the bounds height is roughly the cap height for a
  // single-line label.
  const guess = Math.round(layerHeight * 0.7)
  return Math.max(12, Math.min(guess, 200))
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
