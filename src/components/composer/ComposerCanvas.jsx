import { forwardRef, useRef, useEffect, useState, useCallback } from 'react'
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Transformer, Rect } from 'react-konva'
import { useComposerStore } from '../../store/useComposerStore'

/* ─── Image cache hook ────────────────────────────────────────────── */
function useImage(src) {
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!src) { setImg(null); return }
    let cancelled = false
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => { if (!cancelled) setImg(image) }
    image.onerror = () => { if (!cancelled) setImg(null) }
    image.src = src
    return () => { cancelled = true }
  }, [src])
  return img
}

/* ─── Background ──────────────────────────────────────────────────── */
function BackgroundLayer({ background, canvasSize }) {
  const img = useImage(background?.url)
  if (!img) return null
  return <KonvaImage image={img} x={0} y={0} width={canvasSize.width} height={canvasSize.height} listening={false} />
}

/* ─── Image layer ─────────────────────────────────────────────────── */
function ImageLayer({ layer, isSelected, onSelect, onDragEnd, onTransformEnd, nodeRef }) {
  const img = useImage(layer.url)
  if (!img) return null
  return (
    <KonvaImage
      ref={nodeRef} image={img}
      x={layer.x} y={layer.y}
      width={layer.width} height={layer.height}
      rotation={layer.rotation || 0}
      opacity={layer.opacity ?? 1}
      visible={layer.visible !== false}
      draggable={!layer.locked}
      onClick={e => { e.cancelBubble = true; onSelect(layer.id) }}
      onTap={e => { e.cancelBubble = true; onSelect(layer.id) }}
      onDragEnd={e => onDragEnd(layer.id, e)}
      onTransformEnd={e => onTransformEnd(layer.id, e)}
      shadowEnabled={isSelected}
      shadowColor="rgba(110,75,255,0.6)"
      shadowBlur={isSelected ? 12 : 0}
    />
  )
}

/* ─── Text / sticker layer ────────────────────────────────────────── */
function TextLayer({ layer, isSelected, onSelect, onDragEnd, onTransformEnd, nodeRef, onDblClick }) {
  const fontStyle = [layer.bold ? 'bold' : '', layer.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal'
  return (
    <KonvaText
      ref={nodeRef}
      text={layer.text || 'Text'}
      x={layer.x} y={layer.y}
      width={layer.width || undefined}
      rotation={layer.rotation || 0}
      opacity={layer.opacity ?? 1}
      visible={layer.visible !== false}
      fontSize={layer.fontSize || 32}
      fontFamily={layer.fontFamily || 'Arial'}
      fontStyle={fontStyle}
      fill={layer.fill || '#ffffff'}
      align={layer.align || 'left'}
      draggable={!layer.locked}
      onClick={e => { e.cancelBubble = true; onSelect(layer.id) }}
      onTap={e => { e.cancelBubble = true; onSelect(layer.id) }}
      onDblClick={e => { e.cancelBubble = true; onDblClick(layer.id) }}
      onDblTap={e => { e.cancelBubble = true; onDblClick(layer.id) }}
      onDragEnd={e => onDragEnd(layer.id, e)}
      onTransformEnd={e => onTransformEnd(layer.id, e)}
      shadowEnabled={isSelected}
      shadowColor="rgba(110,75,255,0.6)"
      shadowBlur={isSelected ? 10 : 0}
    />
  )
}

/* ─── Inline text editor overlay ──────────────────────────────────── */
function TextEditorOverlay({ layer, stageRef, containerRef, onCommit, onCancel }) {
  const [value, setValue] = useState(layer.text || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [])

  const stage = stageRef.current
  const scale = stage ? stage.scaleX() : 1
  const stagePos = stage?.container().getBoundingClientRect()
  const containerPos = containerRef?.current?.getBoundingClientRect()
  const left = stagePos && containerPos ? Math.round(layer.x * scale + (stagePos.left - containerPos.left)) : 0
  const top  = stagePos && containerPos ? Math.round(layer.y * scale + (stagePos.top  - containerPos.top))  : 0

  return (
    <div style={{
      position: 'absolute', left, top, zIndex: 50,
      transformOrigin: '0 0',
      transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    }}>
      <textarea
        ref={inputRef} value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(value) }
        }}
        rows={Math.max(1, value.split('\n').length)}
        style={{
          background: 'rgba(15,12,26,0.85)',
          border: '1.5px solid rgba(110,75,255,0.7)',
          borderRadius: 6,
          color: layer.fill || '#ffffff',
          fontSize: (layer.fontSize || 32) * scale,
          fontFamily: layer.fontFamily || 'Arial',
          fontWeight: layer.bold ? 'bold' : 'normal',
          fontStyle: layer.italic ? 'italic' : 'normal',
          lineHeight: 1.3, padding: '2px 6px',
          resize: 'none', outline: 'none', minWidth: 60,
          width: layer.width ? layer.width * scale : 'auto',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 0 3px rgba(110,75,255,0.25)',
        }}
      />
    </div>
  )
}

/* ─── Main component (forwardRef so the parent can call stageRef.toDataURL) ─ */
const ComposerCanvas = forwardRef(function ComposerCanvas({ containerRef }, externalStageRef) {
  const internalStageRef = useRef(null)
  const stageRef = externalStageRef || internalStageRef
  const transformerRef = useRef(null)
  const nodeRefs = useRef({})

  const background = useComposerStore(s => s.background)
  const layers = useComposerStore(s => s.layers)
  const selectedLayerId = useComposerStore(s => s.selectedLayerId)
  const canvasSize = useComposerStore(s => s.canvasSize)
  const selectLayer = useComposerStore(s => s.selectLayer)
  const updateLayer = useComposerStore(s => s.updateLayer)

  const [editingTextId, setEditingTextId] = useState(null)

  // Bind transformer to selected layer's node.
  useEffect(() => {
    if (!transformerRef.current) return
    if (!selectedLayerId || editingTextId) {
      transformerRef.current.nodes([])
      transformerRef.current.getLayer()?.batchDraw()
      return
    }
    const node = nodeRefs.current[selectedLayerId]?.current
    if (node) {
      transformerRef.current.nodes([node])
      transformerRef.current.getLayer()?.batchDraw()
    } else {
      transformerRef.current.nodes([])
    }
  }, [selectedLayerId, layers, editingTextId])

  const handleStageClick = useCallback(e => {
    if (e.target === e.target.getStage()) selectLayer(null)
  }, [selectLayer])

  const handleDragEnd = useCallback((id, e) => {
    updateLayer(id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
  }, [updateLayer])

  const handleTransformEnd = useCallback((id, e) => {
    const node = e.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scaleX(1); node.scaleY(1)
    updateLayer(id, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width:  Math.round(Math.abs(node.width()  * scaleX)),
      height: Math.round(Math.abs(node.height() * scaleY)),
      rotation: Math.round(node.rotation()),
    })
  }, [updateLayer])

  // Layer order = array order (first = bottom-most, last = on top).
  // No zIndex sort — keeps the data simple.
  const editingLayer = editingTextId ? layers.find(l => l.id === editingTextId) : null

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Stage
        ref={stageRef}
        width={canvasSize.width} height={canvasSize.height}
        onClick={handleStageClick} onTap={handleStageClick}
        style={{
          display: 'block', borderRadius: 8,
          boxShadow: '0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        <Layer listening={false}>
          <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill="#1a1a2e" listening={false} />
          {background && <BackgroundLayer background={background} canvasSize={canvasSize} />}
        </Layer>

        <Layer>
          {layers.filter(l => l.visible !== false).map(layer => {
            if (!nodeRefs.current[layer.id]) nodeRefs.current[layer.id] = { current: null }
            const isSelected = selectedLayerId === layer.id && !editingTextId
            const refSetter = node => { nodeRefs.current[layer.id] = { current: node } }

            if (layer.type === 'text' || layer.type === 'sticker') {
              return (
                <TextLayer key={layer.id} layer={layer} isSelected={isSelected}
                  onSelect={selectLayer} onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd}
                  onDblClick={id => { setEditingTextId(id); selectLayer(id) }}
                  nodeRef={refSetter} />
              )
            }
            return (
              <ImageLayer key={layer.id} layer={layer} isSelected={isSelected}
                onSelect={selectLayer} onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd}
                nodeRef={refSetter} />
            )
          })}

          <Transformer
            ref={transformerRef}
            rotateEnabled
            enabledAnchors={['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']}
            borderStroke="rgba(110,75,255,0.9)" borderStrokeWidth={1.5}
            anchorStroke="rgba(110,75,255,0.9)" anchorFill="#fff" anchorSize={9} anchorCornerRadius={2}
            rotateAnchorOffset={28} padding={4} keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10) ? oldBox : newBox}
          />
        </Layer>
      </Stage>

      {editingLayer && (
        <TextEditorOverlay
          layer={editingLayer} stageRef={stageRef} containerRef={containerRef}
          onCommit={value => { updateLayer(editingTextId, { text: value }); setEditingTextId(null) }}
          onCancel={() => setEditingTextId(null)} />
      )}
    </div>
  )
})

export default ComposerCanvas
