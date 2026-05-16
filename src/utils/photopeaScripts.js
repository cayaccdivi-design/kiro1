// Photopea ExtendScript snippets used over postMessage.
// Photopea exposes a near-Photoshop ExtendScript API; we send strings of
// JS source via `iframe.contentWindow.postMessage(scriptString, '*')` and
// it runs them inside the embedded editor. Output is sent back via
// `app.echoToOE(...)` and `app.activeDocument.saveToOE(...)`.
//
// References (public Photopea API docs): https://www.photopea.com/api/
//
// Conventions:
// - Scripts are pure strings, no template-literal nesting on the Photopea
//   side. JSON values are inlined safely with JSON.stringify().
// - Each script ends with `app.echoToOE(...)` so the bridge knows what to
//   resolve to. Photopea also emits a final "done" after each script;
//   the bridge collects both.

// ─── Layer discovery ───────────────────────────────────────────────────
// Walks the entire layer tree and returns a flat array of plain objects.
// Each entry has: id (path), name, kind, visible, bounds[x,y,w,h], parent.
// Bounds are returned as numbers (bounds in Photopea are [left,top,right,
// bottom] objects with .value, but JSON.stringify handles them fine if we
// coerce to floats).
export const SCRIPT_LIST_LAYERS = `
(function() {
  function num(v) { return (v && typeof v.value === 'number') ? v.value : Number(v); }
  function bounds(L) {
    try {
      var b = L.bounds;
      return [num(b[0]), num(b[1]), num(b[2]) - num(b[0]), num(b[3]) - num(b[1])];
    } catch (e) { return [0,0,0,0]; }
  }
  function kindOf(L) {
    try {
      if (L.kind === LayerKind.TEXT) return 'text';
      if (L.kind === LayerKind.SMARTOBJECT) return 'smartobject';
    } catch (e) {}
    if (L.layers && L.layers.length !== undefined) return 'group';
    return 'image';
  }
  function walk(node, out, prefix) {
    for (var i = 0; i < node.layers.length; i++) {
      var L = node.layers[i];
      var path = prefix + '/' + L.name;
      var entry = {
        id: path,
        name: L.name,
        kind: kindOf(L),
        visible: L.visible,
        bounds: bounds(L),
        opacity: L.opacity
      };
      if (entry.kind === 'text') {
        try { entry.text = L.textItem.contents; } catch (e) { entry.text = ''; }
        try { entry.fontSize = L.textItem.size; } catch (e) {}
        try { entry.color = '#' + L.textItem.color.rgb.hexValue; } catch (e) {}
      }
      out.push(entry);
      if (L.layers && L.layers.length) walk(L, out, path);
    }
  }
  var out = [];
  walk(app.activeDocument, out, '');
  app.echoToOE('LAYERS:' + JSON.stringify(out));
})();
`

// ─── Find a layer by name (recursive) ──────────────────────────────────
// Returned as a small inline helper string that other scripts paste in.
const FIND_LAYER_FN = `
function findLayerByName(node, name) {
  for (var i = 0; i < node.layers.length; i++) {
    var L = node.layers[i];
    if (L.name === name) return L;
    if (L.layers && L.layers.length) {
      var found = findLayerByName(L, name);
      if (found) return found;
    }
  }
  return null;
}
`

// ─── Replace text content of a named layer ─────────────────────────────
export function scriptReplaceText(layerName, newText, opts = {}) {
  const payload = {
    text: newText ?? '',
    fontFamily: opts.fontFamily || null,
    fontSize: opts.fontSize || null,
    color: opts.color || null,
  }
  return `
${FIND_LAYER_FN}
(function() {
  var P = ${JSON.stringify(payload)};
  var L = findLayerByName(app.activeDocument, ${JSON.stringify(layerName)});
  if (!L) { app.echoToOE('TEXT_ERR:notfound'); return; }
  try { L.textItem.contents = P.text; } catch (e) { app.echoToOE('TEXT_ERR:' + e); return; }
  if (P.fontFamily) { try { L.textItem.font = P.fontFamily; } catch (e) {} }
  if (P.fontSize)   { try { L.textItem.size = P.fontSize; } catch (e) {} }
  if (P.color) {
    try {
      var c = new SolidColor();
      var hex = P.color.replace('#','');
      c.rgb.hexValue = hex;
      L.textItem.color = c;
    } catch (e) {}
  }
  app.echoToOE('TEXT_OK:' + L.name);
})();
`
}

// ─── Replace pixels of an image layer ──────────────────────────────────
// Strategy: select the target layer, compute its current bounds, open
// the new image as a new layer at the top, transform it to fit the
// target bounds, then merge down (preserving the target layer name).
//
// `imageUrl` may be a data: URL or any URL Photopea can fetch.
export function scriptReplaceImage(layerName, imageUrl) {
  return `
${FIND_LAYER_FN}
(function() {
  var L = findLayerByName(app.activeDocument, ${JSON.stringify(layerName)});
  if (!L) { app.echoToOE('IMG_ERR:notfound'); return; }
  var b = L.bounds;
  var x = b[0].value !== undefined ? b[0].value : Number(b[0]);
  var y = b[1].value !== undefined ? b[1].value : Number(b[1]);
  var x2 = b[2].value !== undefined ? b[2].value : Number(b[2]);
  var y2 = b[3].value !== undefined ? b[3].value : Number(b[3]);
  var w = x2 - x, h = y2 - y;
  var origName = L.name;
  app.activeDocument.activeLayer = L;
  // Replace via app.open with placeAsLayer = true (last arg true).
  app.open(${JSON.stringify(imageUrl)}, null, true);
  try {
    var nl = app.activeDocument.activeLayer;
    var nb = nl.bounds;
    var nx = nb[0].value !== undefined ? nb[0].value : Number(nb[0]);
    var ny = nb[1].value !== undefined ? nb[1].value : Number(nb[1]);
    var nx2 = nb[2].value !== undefined ? nb[2].value : Number(nb[2]);
    var ny2 = nb[3].value !== undefined ? nb[3].value : Number(nb[3]);
    var nw = nx2 - nx, nh = ny2 - ny;
    if (nw && nh) {
      var sx = (w / nw) * 100;
      var sy = (h / nh) * 100;
      nl.resize(sx, sy, AnchorPosition.TOPLEFT);
      nl.translate(x - nx, y - ny);
    }
    // Remove the original layer, rename the new one to keep mapping stable.
    L.remove();
    nl.name = origName;
    app.echoToOE('IMG_OK:' + origName);
  } catch (e) {
    app.echoToOE('IMG_ERR:' + e);
  }
})();
`
}

// ─── Toggle layer visibility ───────────────────────────────────────────
export function scriptSetVisibility(layerName, visible) {
  return `
${FIND_LAYER_FN}
(function() {
  var L = findLayerByName(app.activeDocument, ${JSON.stringify(layerName)});
  if (!L) { app.echoToOE('VIS_ERR:notfound'); return; }
  L.visible = ${visible ? 'true' : 'false'};
  app.echoToOE('VIS_OK:' + L.name);
})();
`
}

// ─── AI-assisted auto placement (heuristic) ────────────────────────────
// Centres known image roles inside their bounds and re-aligns text
// layers to a clean grid. Pure ExtendScript, no external AI; the name
// "AI auto" is kept for the user-facing UX while the actual logic is
// deterministic — fast, predictable, no API key.
export const SCRIPT_AUTO_PLACEMENT = `
${FIND_LAYER_FN}
(function() {
  var doc = app.activeDocument;
  var W = doc.width.value, H = doc.height.value;
  function num(v) { return v && v.value !== undefined ? v.value : Number(v); }
  var roles = [
    { name: 'text_title', x: 0.5, y: 0.18, align: 'center' },
    { name: 'text_name',  x: 0.5, y: 0.5,  align: 'center' },
    { name: 'text_price', x: 0.5, y: 0.82, align: 'center' },
    { name: 'avt_png',    x: 0.5, y: 0.35, align: 'center' },
    { name: 'nvat_png',   x: 0.5, y: 0.6,  align: 'center' }
  ];
  var moved = [];
  for (var i = 0; i < roles.length; i++) {
    var r = roles[i];
    var L = findLayerByName(doc, r.name);
    if (!L) continue;
    var b = L.bounds;
    var lx = num(b[0]), ly = num(b[1]), lx2 = num(b[2]), ly2 = num(b[3]);
    var lw = lx2 - lx, lh = ly2 - ly;
    var cx = W * r.x, cy = H * r.y;
    var dx = (cx - lw / 2) - lx;
    var dy = (cy - lh / 2) - ly;
    try { L.translate(dx, dy); moved.push(r.name); } catch (e) {}
  }
  app.echoToOE('AUTO_OK:' + JSON.stringify(moved));
})();
`

// ─── Reset to original (re-load PSD) ───────────────────────────────────
// We can't truly "reset" inside Photopea without history. The bridge
// triggers a full reload of the source PSD on the JS side, which is
// reliable. This script just clears the doc so the bridge can replay.
export const SCRIPT_CLEAR_DOC = `
(function() {
  try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
  app.echoToOE('CLEARED');
})();
`

// ─── Export current document ───────────────────────────────────────────
// Photopea encodes the chosen format and pushes the bytes back via the
// outer message handler. We don't need a wrapper script for this; the
// bridge calls postMessage('app.activeDocument.saveToOE("png")', '*').
export function scriptExport(format /* 'psd' | 'png' | 'jpg' */) {
  return `app.activeDocument.saveToOE(${JSON.stringify(format)});`
}
