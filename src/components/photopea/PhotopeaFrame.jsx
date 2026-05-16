// PhotopeaFrame — embeds the real Photopea web app inside an iframe and
// exposes a thin imperative API for parents.
//
// Photopea documents itself at https://www.photopea.com/api/. The host
// page communicates via window.postMessage. Two flavours of messages
// flow IN to Photopea:
//   • String  → executed as ExtendScript inside the editor.
//   • Binary (ArrayBuffer) → opened as a file (the canonical way to
//     load a PSD; far more reliable than embedding a multi-megabyte
//     data URL into the iframe URL hash, which we used to do and
//     which silently broke for any non-trivial PSD).
//
// Two flavours of messages flow OUT from Photopea:
//   • Strings  — return values from `app.echoToOE(...)` plus a final
//     `"done"` after each script (and after each file open).
//   • ArrayBuffers — produced by `app.activeDocument.saveToOE("png")`
//     and friends.
//
// We process operations serially via an internal queue. Each queue
// entry is either a script string or a binary buffer; both end with
// the same `"done"` signal so the bridge can attribute responses
// uniformly.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react'

// Plain Photopea URL — no big payload in the hash. We deliberately
// avoid passing a `script` config because Photopea on first boot
// can swallow long hashes (URL length limits + URI parsing) which
// caused the "iframe loads but nothing happens" bug.
const PHOTOPEA_URL = 'https://www.photopea.com#%7B%22environment%22%3A%7B%7D%7D'

// Per-operation timeout. Photopea normally responds in tens of
// milliseconds; 30s is generous for very large PSDs.
const OP_TIMEOUT_MS = 30000

/** Coerce any "PSD-ish" input into a transferable ArrayBuffer. */
async function coerceToArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input
  if (input && input.buffer instanceof ArrayBuffer) return input.buffer // TypedArray
  if (typeof input === 'string') {
    // Works for both data: URLs and same-origin http(s) URLs.
    const r = await fetch(input)
    return r.arrayBuffer()
  }
  throw new Error('PhotopeaFrame.loadPsd: unsupported input type')
}

const PhotopeaFrame = forwardRef(function PhotopeaFrame(
  { className, style, onReady, onError },
  ref,
) {
  const iframeRef = useRef(null)
  // Queue entry shape:
  //   { payload: string | ArrayBuffer, resolve, reject,
  //     echoes: string[], buffers: ArrayBuffer[], timeoutId? }
  const queueRef = useRef([])
  const inFlightRef = useRef(null)
  // Mirror of `ready` for use inside the message handler (avoids stale
  // closures when the listener re-runs).
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)

  // ── Drain: pop one queue entry and post it to Photopea. ────────────
  const drain = useCallback(() => {
    if (inFlightRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    inFlightRef.current = next
    // Safety net — if Photopea never replies (it always should), let
    // the caller's promise reject instead of hanging forever.
    next.timeoutId = setTimeout(() => {
      if (inFlightRef.current === next) {
        inFlightRef.current = null
        next.reject?.(new Error('Photopea timed out'))
        drain()
      }
    }, OP_TIMEOUT_MS)
    try {
      iframeRef.current?.contentWindow?.postMessage(next.payload, '*')
    } catch (e) {
      clearTimeout(next.timeoutId)
      next.reject?.(e)
      inFlightRef.current = null
      drain()
    }
  }, [])

  // ── run(script) — execute ExtendScript and resolve with echoes. ───
  const run = useCallback((script) => new Promise((resolve, reject) => {
    queueRef.current.push({
      payload: script, resolve, reject, echoes: [], buffers: [],
    })
    drain()
  }), [drain])

  // ── loadPsd(input) — open a PSD inside Photopea. ──────────────────
  // Steps, all enqueued serially so they run in order:
  //   1. Close any existing documents (avoids stacking tabs when the
  //      admin uploads a second PSD on top of the first).
  //   2. Post the raw bytes — Photopea opens any binary message as a
  //      file and emits `"done"` when the open completes.
  //   3. A heartbeat `app.echoToOE("PSD_LOADED:N")` whose reply is what
  //      the outer caller actually awaits, so we can distinguish a
  //      successful open (N>=1) from a malformed file (N=0).
  const loadPsd = useCallback(async (input) => {
    const buf = await coerceToArrayBuffer(input)
    return new Promise((resolve, reject) => {
      // 1) Close existing docs.
      queueRef.current.push({
        payload: 'while (app.documents.length > 0) { try { app.documents[0].close(SaveOptions.DONOTSAVECHANGES); } catch(e) { break; } } app.echoToOE("CLEARED");',
        resolve: () => {}, reject: () => {}, // don't fail the outer promise on this
        echoes: [], buffers: [],
      })
      // 2) Post the PSD bytes as a binary message. Photopea opens it.
      queueRef.current.push({
        payload: buf,
        resolve: () => {}, reject: () => {},
        echoes: [], buffers: [],
      })
      // 3) Verify a document is now open.
      queueRef.current.push({
        payload: 'app.echoToOE("PSD_LOADED:" + app.documents.length);',
        resolve: (data) => {
          const ok = data.echoes.some(e => /^PSD_LOADED:[1-9]/.test(e))
          if (ok) resolve(data)
          else reject(new Error('Photopea opened the file but no document is active. PSD may be corrupt or unsupported.'))
        },
        reject,
        echoes: [], buffers: [],
      })
      drain()
    })
  }, [drain])

  // ── postMessage handler ───────────────────────────────────────────
  useEffect(() => {
    function onMessage(e) {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return
      const data = e.data

      if (typeof data === 'string') {
        // The very first "done" after the iframe finishes booting is
        // Photopea's "I'm ready" signal. We don't have an in-flight
        // entry at that point, so it's distinguishable.
        if (!readyRef.current && data === 'done') {
          readyRef.current = true
          setReady(true)
          onReady?.()
          return
        }
        if (data === 'done') {
          const item = inFlightRef.current
          if (item) {
            clearTimeout(item.timeoutId)
            inFlightRef.current = null
            item.resolve({ echoes: item.echoes, buffers: item.buffers })
          }
          drain()
          return
        }
        // Echo from app.echoToOE.
        if (inFlightRef.current) inFlightRef.current.echoes.push(data)
        return
      }
      // Binary payload (export bytes).
      if (data instanceof ArrayBuffer) {
        if (inFlightRef.current) inFlightRef.current.buffers.push(data)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [drain, onReady])

  useImperativeHandle(ref, () => ({
    isReady: () => ready,
    run,
    loadPsd,
  }), [run, loadPsd, ready])

  return (
    <iframe
      ref={iframeRef}
      src={PHOTOPEA_URL}
      title="Photopea Editor"
      className={className}
      style={{ border: 0, width: '100%', height: '100%', background: '#1a1a1a', ...(style || {}) }}
    />
  )
})

export default PhotopeaFrame
