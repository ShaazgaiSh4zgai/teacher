/* ===== app.js — state, layers, utilities, page style, reference image, UI ===== */

const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const svg = $('#paper'), G = $('#ghost'), GU = $('#guides'), INK = $('#ink'), PEN = $('#pen'), body = document.body;
const INACT_G = document.getElementById('inactive');
const ASC = 'bdfhijkltбъйёф';
const DESC = 'gjpqyуүцщдрф';

/* ---------- active-layer state (globals swapped on layer switch) ---------- */
let strokes = [], redo = [], kind = 'upper', showClean = false, cur = null, raf = 0, P = null, page = 'slant', sm = 75, fl = null, lastRaw = null;
let tool = 'free', sel = -1, selNode = -1, penOpen = false, drag = null, rdrag = null, speed = 1;
const CFG0 = { hs: 300, ds: 560, th: 1, mx: 870, px: 0 }, cfg = { ...CFG0 };
const ref = { href: null, x: 0, y: 0, w: 0, h: 0, ar: 1, base: 1, op: .5, vis: true, adj: false };
const PAL = [[240, 138, 36], [167, 139, 219], [63, 174, 106]].map(c => 'rgb(' + c.join(',') + ')');
let zoom = 1;

/* Per-layer settings stored in globals, swapped on switch */
const dotCfg = { size: 7, spacing: 17 };
const arrowCfg = { size: 1, spacing: 200 };
let numPositions = [];

/* ---------- layer system ---------- */
let layers = [];
let activeLayerIdx = 0;
let nextLayerId = 1;

function createLayer(opts) {
  opts = opts || {};
  const id = nextLayerId++;
  return {
    id, name: opts.name || 'Letter ' + id, visible: true,
    strokes: opts.strokes || [], redo: opts.redo || [],
    kind: opts.kind || 'upper', label: opts.label || 'A',
    dotCfg: { ...(opts.dotCfg || { size: 7, spacing: 17 }) },
    arrowCfg: { ...(opts.arrowCfg || { size: 1, spacing: 200 }) },
    numPositions: opts.numPositions ? opts.numPositions.slice() : [],
    cfgPx: opts.cfgPx || 0
  };
}

function saveActiveToLayer() {
  const L = layers[activeLayerIdx]; if (!L) return;
  L.strokes = strokes; L.redo = redo; L.kind = kind;
  L.label = $('#lab').value;
  L.dotCfg = { ...dotCfg }; L.arrowCfg = { ...arrowCfg };
  L.numPositions = numPositions; L.cfgPx = cfg.px;
}

function loadLayerToActive(idx) {
  const L = layers[idx]; if (!L) return;
  activeLayerIdx = idx;
  strokes = L.strokes; redo = L.redo; kind = L.kind;
  $('#lab').value = L.label;
  Object.assign(dotCfg, L.dotCfg); Object.assign(arrowCfg, L.arrowCfg);
  numPositions = L.numPositions; cfg.px = L.cfgPx;
  /* sync UI controls */
  setKind(kind);
  $('#c-px').value = cfg.px;
  $('#dot-size').value = dotCfg.size; $('#dot-size-v').textContent = dotCfg.size;
  $('#dot-spacing').value = dotCfg.spacing; $('#dot-spacing-v').textContent = dotCfg.spacing;
  $('#arrow-size').value = arrowCfg.size; $('#arrow-size-v').textContent = arrowCfg.size.toFixed(1);
  $('#arrow-spacing').value = arrowCfg.spacing; $('#arrow-spacing-v').textContent = arrowCfg.spacing;
}

function switchLayer(idx) {
  if (idx === activeLayerIdx && layers.length > 0) return;
  if (body.dataset.mode === 'play') exitPlayMode();
  saveActiveToLayer();
  loadLayerToActive(idx);
  sel = -1; selNode = -1; penOpen = false; showClean = false;
  $('#prev').textContent = 'Preview'; $('#prev').classList.remove('on');
  paint(); btns(); renderLayerPanel();
}

function addLayer() {
  saveActiveToLayer();
  const L = createLayer();
  layers.push(L);
  loadLayerToActive(layers.length - 1);
  sel = -1; selNode = -1; penOpen = false; showClean = false;
  if (body.dataset.mode === 'play') exitPlayMode();
  paint(); btns(); renderLayerPanel(); scheduleSave();
}

function deleteLayer(idx) {
  if (layers.length <= 1) return;
  saveActiveToLayer();
  layers.splice(idx, 1);
  if (activeLayerIdx >= layers.length) activeLayerIdx = layers.length - 1;
  else if (idx < activeLayerIdx) activeLayerIdx--;
  else if (idx === activeLayerIdx) activeLayerIdx = Math.min(idx, layers.length - 1);
  loadLayerToActive(activeLayerIdx);
  sel = -1; selNode = -1; penOpen = false;
  if (body.dataset.mode === 'play') exitPlayMode();
  paint(); btns(); renderLayerPanel(); scheduleSave();
}

function duplicateLayer(idx) {
  saveActiveToLayer();
  const src = layers[idx];
  const dup = createLayer({
    name: src.name + ' copy',
    strokes: JSON.parse(JSON.stringify(src.strokes)),
    redo: [], kind: src.kind, label: src.label,
    dotCfg: { ...src.dotCfg }, arrowCfg: { ...src.arrowCfg },
    numPositions: src.numPositions.map(p => p ? { ...p } : null),
    cfgPx: src.cfgPx
  });
  layers.splice(idx + 1, 0, dup);
  loadLayerToActive(idx + 1);
  paint(); btns(); renderLayerPanel(); scheduleSave();
}

function moveLayer(idx, dir) {
  const ni = idx + dir; if (ni < 0 || ni >= layers.length) return;
  saveActiveToLayer();
  [layers[idx], layers[ni]] = [layers[ni], layers[idx]];
  if (activeLayerIdx === idx) activeLayerIdx = ni;
  else if (activeLayerIdx === ni) activeLayerIdx = idx;
  renderLayerPanel(); paint(); scheduleSave();
}

function toggleLayerVis(idx) {
  layers[idx].visible = !layers[idx].visible;
  renderLayerPanel(); paint();
}

function renameLayer(idx, name) {
  if (name && name.trim()) layers[idx].name = name.trim();
  renderLayerPanel(); scheduleSave();
}

function exitPlayMode() {
  cancelAnimationFrame(raf); P = null; GU.innerHTML = ''; INK.innerHTML = ''; PEN.style.display = 'none';
  body.classList.remove('hideui'); body.dataset.mode = 'draw';
  if (document.fullscreenElement) document.exitFullscreen();
}

/* ---------- layer panel rendering ---------- */
function renderLayerPanel() {
  const list = $('#layer-list');
  list.innerHTML = layers.map((L, i) => {
    const act = i === activeLayerIdx ? ' active' : '';
    const vis = L.visible ? '' : ' off';
    const lbl = L.label ? ` <span class="layer-label">(${L.label})</span>` : '';
    return `<div class="layer-item${act}" data-idx="${i}">
      <span class="layer-vis${vis}" data-idx="${i}">${L.visible ? '👁' : '◻'}</span>
      <span class="layer-name" data-idx="${i}">${L.name}${lbl}</span>
      <span class="layer-actions">
        <button class="layer-up" data-idx="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button class="layer-down" data-idx="${i}" ${i === layers.length - 1 ? 'disabled' : ''}>▼</button>
        <button class="layer-dup" data-idx="${i}">⊕</button>
        <button class="layer-del" data-idx="${i}" ${layers.length <= 1 ? 'disabled' : ''}>×</button>
      </span></div>`;
  }).join('');
}

/* Event delegation for layer panel (wired once in initApp) */
function wireLayerPanel() {
  const list = $('#layer-list');
  list.addEventListener('click', e => {
    const btn = e.target.closest('button');
    const item = e.target.closest('.layer-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx);
    if (btn) {
      if (btn.classList.contains('layer-up')) moveLayer(idx, -1);
      else if (btn.classList.contains('layer-down')) moveLayer(idx, 1);
      else if (btn.classList.contains('layer-dup')) duplicateLayer(idx);
      else if (btn.classList.contains('layer-del')) deleteLayer(idx);
    } else if (e.target.classList.contains('layer-vis')) {
      toggleLayerVis(idx);
    } else {
      switchLayer(idx);
    }
  });
  list.addEventListener('dblclick', e => {
    if (!e.target.classList.contains('layer-name')) return;
    const idx = parseInt(e.target.closest('.layer-item').dataset.idx);
    const name = prompt('Rename layer:', layers[idx].name);
    if (name) renameLayer(idx, name);
  });
}

/* ---------- save / load ---------- */
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(autoSave, 1500) }

function autoSave() {
  saveActiveToLayer();
  try {
    const data = { v: 1, layers, activeLayerIdx, page, nextLayerId, cfg: { hs: cfg.hs, ds: cfg.ds, th: cfg.th, mx: cfg.mx } };
    localStorage.setItem('hw-animator', JSON.stringify(data));
  } catch (e) { /* quota etc */ }
}

function autoLoad() {
  try {
    const raw = localStorage.getItem('hw-animator');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.layers || !data.layers.length) return false;
    layers = data.layers;
    activeLayerIdx = Math.min(data.activeLayerIdx || 0, layers.length - 1);
    if (data.page) page = data.page;
    if (data.cfg) Object.assign(cfg, { ...CFG0, ...data.cfg });
    nextLayerId = data.nextLayerId || (Math.max(...layers.map(l => l.id)) + 1);
    /* ensure each layer has all expected fields (backward compat) */
    layers.forEach(L => {
      if (!L.dotCfg) L.dotCfg = { size: 7, spacing: 17 };
      if (!L.arrowCfg) L.arrowCfg = { size: 1, spacing: 200 };
      if (!L.numPositions) L.numPositions = [];
      if (L.cfgPx === undefined) L.cfgPx = 0;
      if (!L.redo) L.redo = [];
    });
    loadLayerToActive(activeLayerIdx);
    return true;
  } catch (e) { return false }
}

function exportProject() {
  saveActiveToLayer();
  const data = { v: 1, layers, activeLayerIdx, page, nextLayerId, cfg: { hs: cfg.hs, ds: cfg.ds, th: cfg.th, mx: cfg.mx } };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'handwriting-project.json'; a.click();
  URL.revokeObjectURL(url);
  msg('Project exported.');
}

function importProject(json) {
  try {
    const data = JSON.parse(json);
    if (!data.layers || !data.layers.length) throw new Error('No layers found');
    if (body.dataset.mode === 'play') exitPlayMode();
    layers = data.layers;
    activeLayerIdx = Math.min(data.activeLayerIdx || 0, layers.length - 1);
    if (data.page) page = data.page;
    if (data.cfg) Object.assign(cfg, { ...CFG0, ...data.cfg });
    nextLayerId = data.nextLayerId || (Math.max(...layers.map(l => l.id)) + 1);
    layers.forEach(L => {
      if (!L.dotCfg) L.dotCfg = { size: 7, spacing: 17 };
      if (!L.arrowCfg) L.arrowCfg = { size: 1, spacing: 200 };
      if (!L.numPositions) L.numPositions = [];
      if (L.cfgPx === undefined) L.cfgPx = 0;
      if (!L.redo) L.redo = [];
    });
    loadLayerToActive(activeLayerIdx);
    sel = -1; selNode = -1; penOpen = false; showClean = false;
    drawRule(); paint(); btns(); renderLayerPanel();
    msg('Project loaded (' + layers.length + ' layer' + (layers.length > 1 ? 's' : '') + ').');
    scheduleSave();
  } catch (e) { msg('Import failed: ' + e.message) }
}

/* ---------- utilities ---------- */
const msg = t => $('#msg').textContent = t || '';
const isV = s => !Array.isArray(s);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ease = u => .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
const E = (n, a, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e };
function pt(e) { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y] }

/* ---------- page style ---------- */
function slantSVG() {
  const { hs, ds, th, mx } = cfg, B = 360, b = hs / 3, s = .4; let d = '', h = '', z = '';
  for (let n = -16; n <= 16; n++) { const x = 330 + ds * n; d += `M${(x - 840 * s).toFixed(1)} 1200L${(x + 1560 * s).toFixed(1)} -1200` }
  for (let k = -14; k <= 14; k++) { const t = B - b + hs * k; h += `M-2000 ${t}H3000M-2000 ${t + b}H3000`; z += `M-2000 ${t + 2 * b}H3000` }
  return `<path d="${d}" fill="none" stroke="#a3a8d8" stroke-width="${1.8 * th}"/><path d="${h}" fill="none" stroke="#6a70b5" stroke-width="${2 * th}"/><path d="${z}" fill="none" stroke="#8c91c8" stroke-width="${1.8 * th}" stroke-dasharray="10 9"/><line x1="${mx}" x2="${mx}" y1="-2000" y2="2600" stroke="#d32f2f" stroke-width="${3.2 * th}"/>`;
}
function drawRule() {
  const pc = '#fff', g = 200; $('#sheet').setAttribute('fill', pc); document.documentElement.style.setProperty('--paper', pc);
  $('#rule').innerHTML = page === 'slant' ? slantSVG()
    : `<defs><pattern id="gp" x="400" y="160" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0H0V${g}" fill="none" stroke="#9cc3ea" stroke-width="${1.6 * cfg.th}"/></pattern></defs><rect x="-2000" y="-2000" width="5000" height="4600" fill="url(#gp)"/>`;
}

/* ---------- zoom ---------- */
function applyZoom() { const w = 1000 / zoom, h = 600 / zoom; svg.setAttribute('viewBox', `${500 - w / 2} ${300 - h / 2} ${w} ${h}`); $('#zr').textContent = Math.round(zoom * 100) + '%' }

/* ---------- reference image ---------- */
function drawRef() {
  const on = !!ref.href, im = $('#refimg');
  $('#ref').style.display = on && ref.vis ? '' : 'none';
  if (on) { im.setAttribute('href', ref.href); im.setAttribute('x', ref.x); im.setAttribute('y', ref.y); im.setAttribute('width', ref.w); im.setAttribute('height', ref.h); im.setAttribute('opacity', ref.op) }
  $('#refui').innerHTML = on && ref.vis && ref.adj ? `<rect class="rb" x="${ref.x}" y="${ref.y}" width="${ref.w}" height="${ref.h}"/><rect class="rh" x="${ref.x + ref.w - 10}" y="${ref.y + ref.h - 10}" width="20" height="20" rx="4"/>` : '';
  for (const id of ['r-vis', 'r-op', 'r-sz', 'r-adj', 'r-del']) $('#' + id).disabled = !on;
  $('#r-vis').textContent = ref.vis ? 'Hide' : 'Show'; $('#r-adj').classList.toggle('on', ref.adj);
}

/* ---------- UI bindings ---------- */
document.querySelectorAll('#pages button').forEach(b => b.onclick = () => { page = b.dataset.p; document.querySelectorAll('#pages button').forEach(x => x.classList.toggle('on', x === b)); drawRule(); paint() });
$('#sm').oninput = e => { sm = +e.target.value; if (showClean) paint() };
$('#sw').oninput = e => { svg.style.setProperty('--sw', e.target.value); $('#swv').textContent = e.target.value };
$('#zi').onclick = () => { zoom = Math.min(3, zoom * 1.25); applyZoom() };
$('#zo').onclick = () => { zoom = Math.max(.5, zoom / 1.25); applyZoom() };
$('#zr').onclick = () => { zoom = 1; applyZoom() };
$('#lab').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur() });

function setKind(k) { kind = k; document.querySelectorAll('#kinds button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); if (body.dataset.mode === 'draw') paint() }
document.querySelectorAll('#kinds button').forEach(b => b.onclick = () => setKind(b.dataset.k));
$('#lab').addEventListener('input', () => {
  const l = [...$('#lab').value.trim()], c = l[0] || '';
  if (l.length > 1) setKind('word'); else if (/\d/.test(c)) setKind('num');
  else if (c && c !== c.toLowerCase()) setKind('upper'); else if (c && c !== c.toUpperCase()) setKind('lower');
  if (body.dataset.mode === 'draw') paint();
  scheduleSave();
});

const afterCfg = () => { if (body.dataset.mode === 'play') generate(); else paint() };
$('#c-px').oninput = e => { cfg.px = +e.target.value; afterCfg() };
$('#c-ctr').onclick = () => { cfg.px = 0; $('#c-px').value = 0; afterCfg() };
$('#cfgb').onclick = () => { const p = $('#panel'); p.hidden = !p.hidden; $('#cfgb').classList.toggle('on', !p.hidden) };

/* Sidebar toggle */
$('#sidebar-toggle').onclick = () => { $('#sidebar').classList.toggle('collapsed') };

/* Add layer */
$('#add-layer').onclick = addLayer;

/* Export/import */
$('#export-btn').onclick = exportProject;
$('#import-btn').onclick = () => $('#import-file').click();
$('#import-file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const fr = new FileReader();
  fr.onload = () => importProject(fr.result);
  fr.readAsText(f); e.target.value = '';
};

/* Reference image handlers */
$('#r-imp').onclick = () => $('#r-file').click();
$('#r-file').onchange = e => {
  const f = e.target.files[0]; if (!f) return; const fr = new FileReader();
  fr.onload = () => {
    const im = new Image(); im.onload = () => {
      ref.ar = im.naturalWidth / im.naturalHeight || 1; ref.w = Math.min(600, 420 * ref.ar); ref.h = ref.w / ref.ar; ref.base = ref.w;
      ref.x = cfg.mx / 2 - ref.w / 2; ref.y = 300 - ref.h / 2; ref.href = fr.result; ref.vis = true; ref.adj = false;
      $('#r-sz').value = 100; ref.op = $('#r-op').value / 100; drawRef(); msg('Reference image added.');
    };
    im.onerror = () => msg('Could not read image.'); im.src = fr.result;
  };
  fr.readAsDataURL(f); e.target.value = '';
};
$('#r-vis').onclick = () => { ref.vis = !ref.vis; if (!ref.vis) ref.adj = false; drawRef() };
$('#r-op').oninput = e => { ref.op = e.target.value / 100; drawRef() };
$('#r-sz').oninput = e => { const cx = ref.x + ref.w / 2, cy = ref.y + ref.h / 2; ref.w = ref.base * e.target.value / 100; ref.h = ref.w / ref.ar; ref.x = cx - ref.w / 2; ref.y = cy - ref.h / 2; drawRef() };
$('#r-adj').onclick = () => { ref.adj = !ref.adj; if (ref.adj && body.dataset.mode === 'draw' && penOpen) finish(); drawRef(); msg(ref.adj ? 'Drag image to move, drag corner to resize.' : '') };
$('#r-del').onclick = () => { ref.href = null; ref.adj = false; drawRef(); msg('Reference image removed.') };

/* Dot & arrow controls */
$('#dot-size').oninput = e => { dotCfg.size = +e.target.value; $('#dot-size-v').textContent = e.target.value; if (body.dataset.mode === 'play') generate(); scheduleSave() };
$('#dot-spacing').oninput = e => { dotCfg.spacing = +e.target.value; $('#dot-spacing-v').textContent = e.target.value; if (body.dataset.mode === 'play') generate(); scheduleSave() };
$('#arrow-size').oninput = e => { arrowCfg.size = +e.target.value; $('#arrow-size-v').textContent = parseFloat(e.target.value).toFixed(1); if (body.dataset.mode === 'play') generate(); scheduleSave() };
$('#arrow-spacing').oninput = e => { arrowCfg.spacing = +e.target.value; $('#arrow-spacing-v').textContent = e.target.value; if (body.dataset.mode === 'play') generate(); scheduleSave() };
