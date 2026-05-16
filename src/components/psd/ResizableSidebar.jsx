import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

/**
 * Drag-to-resize sidebar shell. Set `side="left"` or `side="right"` to
 * place the drag handle on the correct edge.
 */
export default function ResizableSidebar({
  side = 'left',
  initial = 280,
  min = 220,
  max = 480,
  storageKey,
  className,
  style,
  children,
}) {
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      const v = Number(localStorage.getItem(storageKey))
      if (Number.isFinite(v) && v >= min && v <= max) return v
    }
    return initial
  })
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWRef = useRef(width)

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return
      const dx = e.clientX - startXRef.current
      const delta = side === 'left' ? dx : -dx
      const next = Math.max(min, Math.min(max, startWRef.current + delta))
      setWidth(next)
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (storageKey) localStorage.setItem(storageKey, String(width))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [side, min, max, storageKey, width])

  const startDrag = (e) => {
    draggingRef.current = true
    startXRef.current = e.clientX
    startWRef.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const handle = (
    <div
      onMouseDown={startDrag}
      className={clsx(
        'absolute top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-violet-500/40 transition-colors',
        side === 'left' ? 'right-0' : 'left-0'
      )}
      style={{ background: 'transparent' }}
      title="Kéo để thay đổi kích thước"
    />
  )

  return (
    <div
      className={clsx('relative flex-shrink-0 h-full', className)}
      style={{ width, ...style }}
    >
      {children}
      {handle}
    </div>
  )
}
