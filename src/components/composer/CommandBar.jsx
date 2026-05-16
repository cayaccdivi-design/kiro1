import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, X, CheckCircle, XCircle, AlertTriangle, Clock,
  Loader2, Trash2, Zap, StopCircle,
} from 'lucide-react'
import { useComposerStore } from '../../store/useComposerStore'
import { matchPrompt } from '../../store/useComposerStore'

const STATUS_ICON = {
  success:    <CheckCircle    size={13} className="text-emerald-400 flex-shrink-0" />,
  error:      <XCircle        size={13} className="text-rose-400    flex-shrink-0" />,
  warn:       <AlertTriangle  size={13} className="text-amber-400   flex-shrink-0" />,
  processing: <Loader2        size={13} className="text-brand-300   flex-shrink-0 animate-spin" />,
}

const STATUS_BG = {
  success:    'rgba(16,185,129,0.08)',
  error:      'rgba(239,68,68,0.08)',
  warn:       'rgba(245,158,11,0.08)',
  processing: 'rgba(110,75,255,0.08)',
}

const MODE_BADGE = {
  overlay:    { label: 'OVERLAY', color: '#a893ff' },
  background: { label: 'BG',      color: '#5eead4' },
  replace:    { label: 'REPLACE', color: '#fbbf24' },
}

function LogRow({ entry }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-start gap-2 px-3 py-2 rounded-xl"
      style={{
        background: STATUS_BG[entry.status] || 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {STATUS_ICON[entry.status] || STATUS_ICON.processing}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/70 leading-snug truncate">
          <span className="font-medium text-white/90">"{entry.text}"</span>
        </p>
        <p className="text-[10px] text-white/35 mt-0.5 leading-snug">{entry.message}</p>
      </div>
      <span className="text-[9px] text-white/25 flex-shrink-0 flex items-center gap-0.5 pt-0.5">
        <Clock size={8} />{entry.time}
      </span>
    </motion.div>
  )
}

// Live preview chip — shows which prompt the engine WILL match for the
// current input. Helps users debug "why isn't my command firing?".
function MatchPreview({ matched, input }) {
  if (!input.trim() || !matched) return null
  const mode = MODE_BADGE[matched.mode] || MODE_BADGE.overlay
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px]"
      style={{
        background: 'rgba(110,75,255,0.08)',
        border: '1px solid rgba(110,75,255,0.2)',
      }}
    >
      <Zap size={11} className="text-brand-300 flex-shrink-0" />
      <span className="text-white/55">Sẽ chạy:</span>
      <span className="font-semibold text-white">{matched.icon} {matched.name}</span>
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
        style={{ background: `${mode.color}20`, color: mode.color }}>
        {mode.label}
      </span>
      <span className="text-white/30 font-mono">·{matched.model}</span>
    </motion.div>
  )
}

// Tiny hook: debounce a value to avoid recomputing match preview on every
// keystroke. 150ms is invisible to humans but stops re-renders during fast
// typing.
function useDebounced(value, ms = 150) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export default function CommandBar() {
  const prompts        = useComposerStore(s => s.prompts)
  const isProcessing   = useComposerStore(s => s.isProcessing)
  const aiLog          = useComposerStore(s => s.aiLog)
  const processCommand = useComposerStore(s => s.processCommand)
  const clearLog       = useComposerStore(s => s.clearLog)
  const cancelProcessing = useComposerStore(s => s.cancelProcessing)

  const [input, setInput] = useState('')
  const inputRef = useRef()

  const activePrompts = useMemo(
    () => prompts.filter(p => p.active).slice(0, 8),
    [prompts],
  )

  // Live match preview — debounced so we don't thrash on every keystroke.
  const debouncedInput = useDebounced(input, 150)
  const previewMatch = useMemo(
    () => debouncedInput.trim() ? matchPrompt(debouncedInput, prompts) : null,
    [debouncedInput, prompts],
  )

  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text || isProcessing) return
    setInput('')
    await processCommand(text)
    inputRef.current?.focus()
  }, [input, isProcessing, processCommand])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); handleSubmit()
    } else if (e.key === 'Escape' && isProcessing) {
      e.preventDefault(); cancelProcessing()
    }
  }

  const recentLog = aiLog.slice(0, 5)

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col gap-0"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px) saturate(180%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="p-3 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(110,75,255,0.2)', border: '1px solid rgba(110,75,255,0.35)' }}>
            <Sparkles size={14} className="text-brand-300" />
          </div>
          <span className="text-xs font-semibold text-white/70">AI Command</span>
          <AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="ml-auto flex items-center gap-1.5"
              >
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] text-brand-300"
                  style={{ background: 'rgba(110,75,255,0.15)', border: '1px solid rgba(110,75,255,0.3)' }}>
                  <Loader2 size={10} className="animate-spin" /> AI đang sinh ảnh...
                </span>
                <button onClick={cancelProcessing}
                  title="Huỷ (Esc)"
                  className="p-1 rounded-full text-rose-300 hover:bg-rose-500/15 transition-colors">
                  <StopCircle size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Match preview — only when not processing & input has content */}
        <AnimatePresence>
          {!isProcessing && previewMatch && (
            <MatchPreview matched={previewMatch} input={debouncedInput} />
          )}
        </AnimatePresence>

        {/* Input + submit */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            placeholder='Nhập lệnh AI... vd: "thêm xe vào background"'
            className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/60 focus:bg-white/[0.07] transition-all disabled:opacity-50"
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleSubmit}
            disabled={!input.trim() || isProcessing}
            className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #6e4bff 0%, #4dd0ff 100%)',
              boxShadow: '0 4px 16px rgba(110,75,255,0.4)',
            }}
            title="Gửi (Enter)"
          >
            {isProcessing
              ? <Loader2 size={16} className="text-white animate-spin" />
              : <Sparkles size={16} className="text-white" />}
          </motion.button>
        </div>

        {/* Suggestion chips */}
        {activePrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activePrompts.map(p => (
              <motion.button
                key={p.id}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => { setInput(p.keyword); inputRef.current?.focus() }}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all hover:bg-white/[0.1] disabled:opacity-40"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.65)',
                }}
                title={p.prompt}
              >
                <span>{p.icon || '✨'}</span><span>{p.keyword}</span>
              </motion.button>
            ))}
            {activePrompts.length === 0 && (
              <span className="text-[10px] text-amber-400/70 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                ⚠️ Chưa có prompt nào active. Admin cần tạo prompt trong Admin Panel.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Activity log */}
      <AnimatePresence>
        {recentLog.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 flex flex-col gap-1.5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between pt-2.5 pb-0.5">
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wide">
                  Activity Log
                </span>
                <button onClick={clearLog}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] text-white/25 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                  <Trash2 size={9} /> Clear
                </button>
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                {recentLog.map(entry => <LogRow key={entry.id} entry={entry} />)}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
