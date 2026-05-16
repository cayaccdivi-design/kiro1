// Parse a Photoshop effect descriptor (`lfx2` / `lmfx`) into something
// Konva (and our text renderer) can consume directly.
//
// PSD descriptors are nested key/value structures. We walk a few well-known
// paths and gracefully degrade — anything missing is left as `null`.

function rgbDescToCss(d) {
  if (!d?.descriptor) return null
  const items = d.descriptor.items
  if (!items) return null
  const r = items.get('Rd  ')?.value ?? items.get('Rd')?.value
  const g = items.get('Grn ')?.value ?? items.get('Grn')?.value
  const b = items.get('Bl  ')?.value ?? items.get('Bl')?.value
  if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') return null
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

function unitOrNumber(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v === 'object' && 'value' in v) return v.value
  return null
}

function readDesc(desc) {
  // Both `Descriptor` and `VersionedDescriptor` may appear here.
  if (!desc) return null
  if (desc.descriptor) return desc.descriptor
  if (desc.items) return desc
  return null
}

function readChild(parent, key) {
  if (!parent?.items) return null
  const v = parent.items.get(key)
  if (!v) return null
  if (v.descriptor) return v.descriptor
  if (v.items) return v
  if (typeof v === 'object' && 'value' in v) {
    if (v.value && typeof v.value === 'object' && v.value.items) return v.value
    return v
  }
  return v
}

function readNumber(parent, key) {
  const v = readChild(parent, key)
  return unitOrNumber(v)
}

function readBool(parent, key) {
  const v = parent?.items?.get(key)
  if (v == null) return null
  if (typeof v === 'boolean') return v
  if (typeof v === 'object' && 'value' in v) return Boolean(v.value)
  return Boolean(v)
}

/**
 * @param {Descriptor} descriptor – the value of additionalProperties.lfx2.descriptor
 * @returns {{ dropShadow, stroke, gradient, glow }}
 */
export function parseEffectDescriptor(descriptor) {
  const d = readDesc(descriptor)
  if (!d) return { dropShadow: null, stroke: null, gradient: null, glow: null }

  const dropShadow = readDropShadow(readChild(d, 'DrSh'))
  const stroke     = readStroke(readChild(d, 'FrFX'))
  const gradient   = readGradient(readChild(d, 'GrFl'))
  const glow       = readGlow(readChild(d, 'OrGl') || readChild(d, 'IrGl'))

  return { dropShadow, stroke, gradient, glow }
}

function readDropShadow(d) {
  if (!d) return null
  if (readBool(d, 'enab') === false) return null
  const angle = readNumber(d, 'lagl') ?? 135
  const distance = readNumber(d, 'Dstn') ?? 5
  const blur = readNumber(d, 'blur') ?? 5
  const opacity = (readNumber(d, 'Opct') ?? 75) / 100
  const color = rgbDescToCss(readChild(d, 'Clr ')) || 'rgba(0,0,0,0.6)'
  // Convert (angle, distance) → (offsetX, offsetY).
  const rad = (angle * Math.PI) / 180
  const offX =  Math.cos(rad) * distance
  const offY = -Math.sin(rad) * distance
  return { offsetX: offX, offsetY: offY, blur, opacity, color }
}

function readStroke(d) {
  if (!d) return null
  if (readBool(d, 'enab') === false) return null
  const size = readNumber(d, 'Sz  ') ?? readNumber(d, 'Sz') ?? 2
  const opacity = (readNumber(d, 'Opct') ?? 100) / 100
  const color = rgbDescToCss(readChild(d, 'Clr ')) || '#000'
  return { size, opacity, color }
}

function readGradient(d) {
  if (!d) return null
  if (readBool(d, 'enab') === false) return null
  // Best-effort: extract first/last colour stops.
  const grad = readChild(d, 'Grad')
  const colors = []
  try {
    const stops = readChild(grad, 'Clrs')?.items
    if (stops) {
      for (const v of stops.values()) {
        const c = rgbDescToCss(readChild(v.descriptor || v, 'Clr '))
        if (c) colors.push(c)
      }
    }
  } catch { /* ignore */ }
  return { colors }
}

function readGlow(d) {
  if (!d) return null
  if (readBool(d, 'enab') === false) return null
  const blur = readNumber(d, 'blur') ?? 5
  const opacity = (readNumber(d, 'Opct') ?? 75) / 100
  const color = rgbDescToCss(readChild(d, 'Clr ')) || 'rgba(255,255,255,0.6)'
  return { blur, opacity, color }
}
