// usePhotopeaStore — admin-authored Photopea templates.
//
// A "template" is an immutable PSD authored by the admin plus a
// per-layer policy (locked / unlocked / pay-fee), plus optional
// custom fonts the PSD depends on. The customer-side editor loads a
// template by id, opens the PSD inside a real Photopea iframe, and
// only allows editing layers the admin marked as unlocked.
//
// PSD bytes can be large (megabytes). To stay within reasonable
// localStorage limits we store the metadata persistently and keep the
// raw PSD ArrayBuffer in an in-memory map keyed by template id. If
// the page is reloaded, the map is empty and the customer page falls
// back to the data-URL stored on the template (so for small PSDs we
// still survive a refresh).

import { create } from 'zustand'

const TEMPLATES_KEY = 'nova_photopea_templates_v1'
const PSD_BYTES_LIMIT = 4 * 1024 * 1024 // 4MB → keep persistence; bigger goes memory-only

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || [] } catch { return [] }
}

// In-memory cache for big PSDs that don't survive a page reload.
export const photopeaPsdMap = new Map() // id -> ArrayBuffer

function persist(list) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[photopea] localStorage quota exceeded', e)
  }
}

export const usePhotopeaStore = create((set, get) => ({
  templates: loadTemplates(),

  /**
   * createTemplate — register a new admin template.
   * @param {Object} t
   * @param {string} t.name             Display name.
   * @param {string} t.psdDataUrl       data:application/* URL of the PSD.
   * @param {ArrayBuffer} [t.psdBuffer] Raw PSD bytes (kept in memory for big files).
   * @param {Array}  t.layers           Layer descriptors from Photopea.
   * @param {Object} t.locks            { [layerName]: true } — locked layers.
   * @param {number} t.exportFee        Coins required to export (0 = free).
   * @param {Array}  t.fonts            [{ family, dataUrl }]
   * @param {string} [t.thumbnail]      data: URL of a PNG preview.
   */
  createTemplate: (t) => {
    const id = Math.random().toString(36).slice(2, 10)
    // Decide whether to persist the heavy PSD payload. If the data URL is
    // small enough we store it; otherwise we drop it from the saved blob
    // and rely on the in-memory map for the current session.
    const persistedDataUrl = (t.psdDataUrl && t.psdDataUrl.length <= PSD_BYTES_LIMIT * 1.34)
      ? t.psdDataUrl
      : null
    const record = {
      id,
      name: t.name || 'Untitled template',
      psdDataUrl: persistedDataUrl,
      layers: t.layers || [],
      locks: t.locks || {},
      exportFee: typeof t.exportFee === 'number' ? t.exportFee : 30,
      fonts: t.fonts || [],
      thumbnail: t.thumbnail || null,
      createdAt: new Date().toISOString(),
    }
    if (t.psdBuffer) photopeaPsdMap.set(id, t.psdBuffer)
    const next = [...get().templates, record]
    persist(next)
    set({ templates: next })
    return record
  },

  updateTemplate: (id, changes) => {
    const next = get().templates.map(t => t.id === id ? { ...t, ...changes } : t)
    persist(next)
    set({ templates: next })
  },

  deleteTemplate: (id) => {
    photopeaPsdMap.delete(id)
    const next = get().templates.filter(t => t.id !== id)
    persist(next)
    set({ templates: next })
  },

  getTemplate: (id) => get().templates.find(t => t.id === id) || null,

  // Convenience: lookup an in-memory PSD ArrayBuffer for a template id.
  getTemplateBuffer: (id) => photopeaPsdMap.get(id) || null,
}))
