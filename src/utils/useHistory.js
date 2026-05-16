import { useCallback, useRef, useState } from 'react'

// Lightweight history hook with a capped stack.
// Designed for React state objects (we keep references; consumer is
// responsible for using immutable updates).
//
// Returns: [state, set, { undo, redo, canUndo, canRedo, reset }]
export default function useHistory(initial, { limit = 50 } = {}) {
  const [state, setState] = useState(initial)
  const past   = useRef([])
  const future = useRef([])
  // A counter state that forces re-render whenever undo/redo stacks change,
  // so that `canUndo` / `canRedo` stay reactive.
  const [, setTick] = useState(0)
  const bump = () => setTick(t => t + 1)

  const set = useCallback((next, { commit = true } = {}) => {
    setState(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      if (commit && value !== prev) {
        past.current.push(prev)
        if (past.current.length > limit) past.current.shift()
        future.current.length = 0
      }
      return value
    })
    if (commit) bump()
  }, [limit])

  const undo = useCallback(() => {
    setState(prev => {
      const last = past.current.pop()
      if (last === undefined) return prev
      future.current.push(prev)
      return last
    })
    bump()
  }, [])

  const redo = useCallback(() => {
    setState(prev => {
      const next = future.current.pop()
      if (next === undefined) return prev
      past.current.push(prev)
      return next
    })
    bump()
  }, [])

  const reset = useCallback((value) => {
    past.current.length = 0
    future.current.length = 0
    setState(value)
    bump()
  }, [])

  return [state, set, {
    undo, redo, reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }]
}
