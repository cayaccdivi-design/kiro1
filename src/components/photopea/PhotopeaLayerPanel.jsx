// PhotopeaLayerPanel — shared list of layers parsed from a Photopea PSD.
// Renders each layer with its detected role, lock toggle and (for the
// customer view) a quick edit affordance. The admin uses it to toggle
// per-layer locks before publishing; the customer uses it as a read-
// only navigation aid that hides locked layers from interactive edits.

import { Lock, Unlock, Type, Image as ImageIcon, Layers } from 'lucide-react'
import clsx from 'clsx'
import { detectLayerRole, isLockLayerName, lockTargetRole } from '../../utils/layerNaming'

function LayerIcon({ kind }) {
  if (kind === 'text') return <Type size={13} className="text-violet-300" />
  if (kind === 'group') return <Layers size={13} className="text-amber-300" />
  return <ImageIcon size={13} className="text-cyan-300" />
}

export default function PhotopeaLayerPanel({
  layers = [],
  locks = {},
  onToggleLock,
  selectedName,
  onSelect,
  readOnly = false,
  hint,
}) {
  if (!layers.length) {
    return (
      <div className="text-center py-10 text-white/30 text-xs">
        Đang đọc layer từ Photopea…
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {hint && (
        <p className="text-[10px] text-white/35 mb-2 leading-relaxed">{hint}</p>
      )}
      {layers.map((layer) => {
        const role = detectLayerRole(layer.name)
        const isLockMarker = isLockLayerName(layer.name)
        // Effective lock state: explicit per-layer lock OR the layer name
        // itself follows the lock_* convention (which is always locked).
        const isLocked = !!locks[layer.name] || isLockMarker
        const isSelected = selectedName === layer.name
        return (
          <div
            key={layer.id || layer.name}
            onClick={() => onSelect?.(layer)}
            className={clsx(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all',
              isSelected
                ? 'bg-brand-500/20 border border-brand-500/40'
                : 'border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06]',
            )}
          >
            <LayerIcon kind={layer.kind} />
            <div className="flex-1 min-w-0">
              <p className={clsx(
                'truncate font-medium',
                isLocked ? 'text-white/45' : 'text-white/85',
              )}>
                {layer.name || '(unnamed)'}
              </p>
              {role && (
                <p className="text-[9px] text-white/35 truncate">{role.label}</p>
              )}
              {isLockMarker && (
                <p className="text-[9px] text-amber-300/80 truncate">
                  Lock layer → {lockTargetRole(layer.name) || 'protected'}
                </p>
              )}
            </div>
            {!readOnly && !isLockMarker && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleLock?.(layer.name) }}
                className={clsx(
                  'p-1 rounded-md transition-all flex-shrink-0',
                  isLocked
                    ? 'text-rose-300 bg-rose-500/10'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.06]',
                )}
                title={isLocked ? 'Mở khoá layer' : 'Khoá layer'}
              >
                {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
              </button>
            )}
            {(isLockMarker || (readOnly && isLocked)) && (
              <span
                className="p-1 rounded-md flex-shrink-0 text-rose-300/70"
                title="Layer này đã được admin khoá"
              >
                <Lock size={11} />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
