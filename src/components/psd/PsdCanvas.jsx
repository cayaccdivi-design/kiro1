import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import {
  Stage, Layer, Group, Image as KonvaImage, Text as KonvaText, Rect, Transformer,
} from 'react-konva'

// ---------------------------------------------------------------------------
// useImage – cached HTMLImageElement loader for data URLs.
// ---------------------------------------------------------------------------
function useImage(dataUrl) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!dataUrl) { setImg(null); return }
    let cancelled = false
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => { if (!cancelled) setImg(i) }
    i.src = dataUrl
    return () => { cancelled = true }
  }, [dataUrl])
  return img
}

// ---------------------------------------------------------------------------
// LayerNode – decides how a single PSD layer is rendered.
//
//   - text + isEdited:   Konva.Text with effects re-applied
//   - image + isEdited:  Konva.Image with the replacement source
//   - otherwise:         baked composite from PS  (preserves stroke, shadow,
//                        gradient, blend mode, clipping mask, smart object,
//                        warp text, transform — pixel-perfect)
// ---------------------------------------------------------------------------
function LayerNode({ layer, isSelected, onSelect, transformerRef, onChange, allowDrag }) {
  const baked    = useImage(layer.bakedDataUrl)
  const replaced = useImage(layer.dataUrl !== layer.originalDataUrl ? layer.dataUrl : null)
  const nodeRef  = useRef(null)

  // Locked layers stay clickable (so the user can pick them in the panel)
  // but can't be moved/resized from the canvas.
  const draggable = allowDrag && !layer.locked

  useEffect(() => {
    if (!transformerRef?.current || !nodeRef.current) return
    const tr = transformerRef.current
    if (isSelected) {
      tr.nodes([nodeRef.current])
      tr.getLayer()?.batchDraw()
    } else if (tr.nodes().includes(nodeRef.current)) {
      tr.nodes(tr.nodes().filter(n => n !== nodeRef.current))
      tr.getLayer()?.batchDraw()
    }
  }, [isSelected, transformerRef, layer.id])

  const opacity = (layer.opacity ?? 1) * (layer.groupOpacity ?? 1)
  const blendMode = layer.blendMode && layer.blendMode !== 'source-over'
    ? layer.blendMode
    : 'source-over'

  const baseProps = {
    ref: nodeRef,
    x: layer.left,
    y: layer.top,
    opacity,
    globalCompositeOperation: blendMode,
    onClick: () => onSelect(layer.id),
    onTap: () => onSelect(layer.id),
    draggable,
    onDragEnd: e => onChange?.(layer.id, { left: e.target.x(), top: e.target.y() }),
    onTransformEnd: e => {
      if (layer.locked) return
      const node = e.target
      onChange?.(layer.id, {
        left: node.x(),
        top: node.y(),
        width:  Math.max(5, node.width()  * node.scaleX()),
        height: Math.max(5, node.height() * node.scaleY()),
        rotation: node.rotation(),
      })
      node.scaleX(1); node.scaleY(1)
    },
    rotation: layer.rotation || 0,
  }

  // ── TEXT branch ────────────────────────────────────────────────────────────
  if (layer.type === 'text') {
    if (layer.isEdited) {
      const fontStyle = [layer.bold ? 'bold' : '', layer.italic ? 'italic' : '']
        .filter(Boolean).join(' ') || 'normal'

      // Re-apply parsed PSD effects so changing the text doesn't lose them.
      const eff = layer.effects || {}
      const shadow = eff.dropShadow ? {
        shadowColor:   eff.dropShadow.color,
        shadowBlur:    eff.dropShadow.blur,
        shadowOffsetX: eff.dropShadow.offsetX,
        shadowOffsetY: eff.dropShadow.offsetY,
        shadowOpacity: eff.dropShadow.opacity,
      } : {}
      const stroke = eff.stroke ? {
        stroke: eff.stroke.color,
        strokeWidth: eff.stroke.size,
        fillAfterStrokeEnabled: true,
      } : {}

      // Gradient fill via fillLinearGradientColorStops if PS effect provided one.
      let gradientProps = {}
      if (eff.gradient && eff.gradient.colors?.length >= 2) {
        const stops = []
        eff.gradient.colors.forEach((c, i) => {
          stops.push(i / (eff.gradient.colors.length - 1), c)
        })
        gradientProps = {
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: 0, y: layer.height || 64 },
          fillLinearGradientColorStops: stops,
        }
      }

      return (
        <KonvaText
          {...baseProps}
          text={layer.textContent || ''}
          fontFamily={layer.fontFamily || 'Inter'}
          fontSize={layer.fontSize || 24}
          fill={layer.color || '#fff'}
          fontStyle={fontStyle}
          width={layer.width}
          align={layer.alignment || 'left'}
          {...stroke}
          {...shadow}
          {...gradientProps}
        />
      )
    }
    if (!baked) return null
    return (
      <KonvaImage
        {...baseProps}
        image={baked}
        width={layer.width}
        height={layer.height}
      />
    )
  }

  // ── IMAGE branch ───────────────────────────────────────────────────────────
  const img = replaced || baked
  if (!img) return null
  return (
    <KonvaImage
      {...baseProps}
      image={img}
      width={layer.width}
      height={layer.height}
    />
  )
}

// ---------------------------------------------------------------------------
// PsdCanvas – Konva Stage with smooth zoom-to-cursor + pan.
// ---------------------------------------------------------------------------
const PsdCanvas = forwardRef(function PsdCanvas(
  {
    psdMeta,
    layers,
    selectedLayerId,
    zoom,
    pan,
    onSelectLayer,
    onLayerChange,
    onZoomChange,
    onPanChange,
    showWatermark = true,
  },
  stageRef,
) {
  const transformerRef = useRef(null)
  const watermarkRef   = useRef(null)
  const [isPanning, setIsPanning] = useState(false)
  const lastPanPos = useRef(null)

  const stageWidth  = psdMeta ? psdMeta.width  * zoom : 0
  const stageHeight = psdMeta ? psdMeta.height * zoom : 0

  // Filter to render-visible layers: a layer is visible iff its own visibility
  // and its ancestor chain are all on. (Photoshop hides children when the
  // parent group is hidden.)
  const visibleLayers = useMemo(
    () => layers.filter(l => l.visible && l.inheritedVisible !== false),
    [layers],
  )

  // Apply clipping masks: in PSD a layer with clipping=1 is clipped to the
  // alpha of the FIRST non-clipping layer beneath it (the "base" layer).
  // We render each clipping group inside a Konva.Group whose clipFunc is
  // driven by the base layer's bounding box. That preserves the silhouette
  // visually for live-edited content as well.
  const groupedRender = useMemo(() => buildClippingGroups(visibleLayers), [visibleLayers])

  // Expose watermark ref to parent for export hide/show.
  useEffect(() => {
    if (!stageRef?.current) return
    stageRef.current._novaWatermarkRef = watermarkRef
  }, [stageRef])

  // ── Zoom-to-cursor with Ctrl/Cmd + wheel ────────────────────────────────────
  const handleWheel = (e) => {
    if (!(e.evt.ctrlKey || e.evt.metaKey)) return
    e.evt.preventDefault()
    const stage = e.target.getStage()
    const oldScale = zoom
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const mousePointTo = {
      x: (pointer.x - (pan?.x || 0)) / oldScale,
      y: (pointer.y - (pan?.y || 0)) / oldScale,
    }
    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = 1.08
    const newScale = Math.max(0.05, Math.min(8, direction > 0 ? oldScale * factor : oldScale / factor))
    onZoomChange?.(newScale)
    onPanChange?.({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    })
  }

  // ── Spacebar / middle-button pan ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !e.repeat) setIsPanning(true)
    }
    const onKeyUp = (e) => { if (e.code === 'Space') setIsPanning(false) }
    // Also handle global mouseup to stop panning even if cursor leaves the stage
    const onGlobalMouseUp = () => { lastPanPos.current = null }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mouseup', onGlobalMouseUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mouseup', onGlobalMouseUp)
    }
  }, [])

  if (!psdMeta) return null

  return (
    <div
      style={{
        width: stageWidth + Math.abs(pan?.x || 0) + 40,
        height: stageHeight + Math.abs(pan?.y || 0) + 40,
        flexShrink: 0,
        cursor: isPanning ? 'grab' : 'default',
      }}
    >
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={zoom}
        scaleY={zoom}
        x={pan?.x || 0}
        y={pan?.y || 0}
        onWheel={handleWheel}
        onMouseDown={e => {
          if (isPanning || e.evt.button === 1) {
            lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY }
            return
          }
          if (e.target === e.target.getStage()) onSelectLayer(null)
        }}
        onMouseMove={e => {
          if (!lastPanPos.current) return
          const dx = e.evt.clientX - lastPanPos.current.x
          const dy = e.evt.clientY - lastPanPos.current.y
          lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY }
          onPanChange?.({ x: (pan?.x || 0) + dx, y: (pan?.y || 0) + dy })
        }}
        onMouseUp={() => { lastPanPos.current = null }}
      >
        <Layer>
          {/* Document bounds + transparent backdrop */}
          <Rect x={0} y={0} width={psdMeta.width} height={psdMeta.height}
            fill="rgba(0,0,0,0)" listening={false} />

          {groupedRender.map(group => (
            <ClippedGroup
              key={group.key}
              group={group}
              selectedLayerId={selectedLayerId}
              onSelectLayer={onSelectLayer}
              onLayerChange={onLayerChange}
              transformerRef={transformerRef}
            />
          ))}

          {showWatermark && (
            <KonvaText
              ref={watermarkRef}
              text="NOVA AI STUDIO"
              x={psdMeta.width / 2}
              y={psdMeta.height / 2}
              rotation={-35}
              opacity={0.22}
              fill="rgba(255,255,255,0.55)"
              fontSize={Math.max(20, Math.min(psdMeta.width, psdMeta.height) * 0.08)}
              fontStyle="bold"
              offsetX={Math.max(20, Math.min(psdMeta.width, psdMeta.height) * 0.08) * 4}
              offsetY={Math.max(20, Math.min(psdMeta.width, psdMeta.height) * 0.08) / 2}
              listening={false}
            />
          )}

          <Transformer
            ref={transformerRef}
            anchorSize={9}
            borderStroke="rgba(167,139,250,0.95)"
            anchorStroke="rgba(167,139,250,0.95)"
            anchorFill="#0c0c14"
            anchorCornerRadius={2}
            // Hide handles when the selected layer is locked — visual cue
            // that resize/rotate is disabled. The selection rectangle
            // (border) is still visible so users still see what's picked.
            resizeEnabled={!visibleLayers.find(l => l.id === selectedLayerId)?.locked}
            rotateEnabled={!visibleLayers.find(l => l.id === selectedLayerId)?.locked}
          />
        </Layer>
      </Stage>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Clipping-mask grouping — Photoshop semantics:
//   stack of layers L0, L1 (clipping=1), L2 (clipping=1), L3 → L1 and L2
//   are clipped to L0.
//
// We turn each [base, ...clippers] run into one Konva.Group with clipFunc
// matching the base's bounding box. (More accurate: clip to baked alpha,
// but that's expensive; bbox is "good enough" for the live edit overlay
// because the unedited base layer ALREADY has its alpha baked in.)
// ---------------------------------------------------------------------------
function buildClippingGroups(layers) {
  const groups = []
  let current = null
  for (const layer of layers) {
    if (layer.isClippingMask && current) {
      current.children.push(layer)
    } else {
      if (current) groups.push(current)
      current = { key: layer.id, base: layer, children: [layer] }
    }
  }
  if (current) groups.push(current)
  return groups
}

function ClippedGroup({ group, selectedLayerId, onSelectLayer, onLayerChange, transformerRef }) {
  const { base, children } = group
  const clipped = children.length > 1
  const groupProps = clipped
    ? {
        clipFunc: ctx => {
          ctx.rect(base.left, base.top, base.width, base.height)
        },
      }
    : {}
  return (
    <Group {...groupProps}>
      {children.map(layer => (
        <LayerNode
          key={layer.id}
          layer={layer}
          isSelected={layer.id === selectedLayerId}
          onSelect={onSelectLayer}
          onChange={onLayerChange}
          transformerRef={transformerRef}
          allowDrag
        />
      ))}
    </Group>
  )
}

export default PsdCanvas
