/* ===== drawing.js — vector helpers, cleanup, tools, pointer input, paint/btns ===== */

/* ---------- vector helpers ---------- */
function vecD(n, tr, k) {
  tr = tr || (p => p); k = k || 1;
  const f = v => v.toFixed(2), q = p => f(p[0]) + ' ' + f(p[1]), a = tr(n[0].p);
  if (n.length === 1) return `M${q(a)}L${f(a[0] + .01)} ${f(a[1])}`;
  let d = 'M' + q(a);
  for (let i = 0; i < n.length - 1; i++) {
    const A = n[i], B = n[i + 1], pa = tr(A.p), pb = tr(B.p);
    if (!A.o[0] && !A.o[1] && !B.i[0] && !B.i[1]) d += 'L' + q(pb);
    else d += 'C' + q([pa[0] + A.o[0] * k, pa[1] + A.o[1] * k]) + ' ' + q([pb[0] + B.i[0] * k, pb[1] + B.i[1] * k]) + ' ' + q(pb);
  }
  return d;
}
function vecPts(n) {
  if (n.length === 1) return [n[0].p]; const o = [];
  for (let i = 0; i < n.length - 1; i++) {
    const A = n[i], B = n[i + 1], p0 = A.p, p1 = [A.p[0] + A.o[0], A.p[1] + A.o[1]], p2 = [B.p[0] + B.i[0], B.p[1] + B.i[1]], p3 = B.p;
    for (let k = 0; k <= 24; k++) { const t = k / 24, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; o.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]) }
  }
  return o;
}
function dseg(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) }
function pick(p) {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i], q = isV(s) ? vecPts(s.nodes) : s;
    const R = 14 / zoom; if (q.length === 1 ? dist(p, q[0]) < R : q.some((a, j) => j && dseg(p, q[j - 1], a) < R)) return i;
  } return -1;
}
function toggleSmooth(ns, i) {
  const n = ns[i];
  if (n.o[0] || n.o[1] || n.i[0] || n.i[1]) { n.o = [0, 0]; n.i = [0, 0]; n.s = false; return }
  const pr = ns[i - 1], nx = ns[i + 1]; if (!pr && !nx) return;
  const a = pr ? pr.p : n.p, b = nx ? nx.p : n.p, m = dist(a, b) || 1, L = Math.min(pr ? dist(pr.p, n.p) : 1e9, nx ? dist(n.p, nx.p) : 1e9) / 3;
  const dx = (b[0] - a[0]) / m * L, dy = (b[1] - a[1]) / m * L; n.o = [dx, dy]; n.i = [-dx, -dy]; n.s = true;
}
function hit(p) {
  const s = strokes[sel]; if (sel < 0 || !s || !isV(s)) return null; const ns = s.nodes, R = 11 / zoom;
  for (let i = ns.length - 1; i >= 0; i--) for (const k of ['o', 'i']) { const q = ns[i][k]; if ((q[0] || q[1]) && Math.hypot(ns[i].p[0] + q[0] - p[0], ns[i].p[1] + q[1] - p[1]) < R) return { t: k, n: i } }
  for (let i = ns.length - 1; i >= 0; i--) if (dist(ns[i].p, p) < R) return { t: 'n', n: i, off: [ns[i].p[0] - p[0], ns[i].p[1] - p[1]] };
  return null;
}

/* ---------- tools ---------- */
function finish() { penOpen = false; if (tool === 'pen') sel = -1; selNode = -1; paint(); btns(); scheduleSave() }
function setTool(t) {
  if (penOpen) penOpen = false; tool = t; if (t !== 'select') sel = -1; selNode = -1;
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  svg.classList.toggle('sel', t === 'select'); paint(); btns();
  msg(t === 'pen' ? 'Pen: click for corner points, click and drag for smooth curves. Enter or double-click the last point to finish a path.' : t === 'select' ? 'Select: click a path, drag its points and handles. Double-click a point to switch smooth / corner. Hold Alt to bend one handle.' : '');
}
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => setTool(b.dataset.t));
$('#finish').onclick = finish;
function delPoint() { const s = strokes[sel]; if (!s || !isV(s) || selNode < 0) return; s.nodes.splice(selNode, 1); selNode = -1; if (!s.nodes.length) { strokes.splice(sel, 1); sel = -1; penOpen = false } paint(); btns(); scheduleSave() }
function delPath() { if (sel < 0) return; strokes.splice(sel, 1); sel = -1; selNode = -1; penOpen = false; paint(); btns(); scheduleSave() }
$('#delpt').onclick = delPoint; $('#delpath').onclick = delPath;

/* ---------- pointer input ---------- */
svg.addEventListener('pointerdown', e => {
  if (body.dataset.mode !== 'draw' || (e.button && e.button !== 0)) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const p = pt(e);
  if (ref.adj) {
    if (!ref.href) return; svg.setPointerCapture(e.pointerId); e.preventDefault();
    if (Math.hypot(p[0] - ref.x - ref.w, p[1] - ref.y - ref.h) < 26) rdrag = { t: 's' };
    else if (p[0] >= ref.x && p[0] <= ref.x + ref.w && p[1] >= ref.y && p[1] <= ref.y + ref.h) rdrag = { t: 'm', off: [ref.x - p[0], ref.y - p[1]] };
    return;
  }
  if (showClean) return;
  svg.setPointerCapture(e.pointerId); e.preventDefault();
  if (tool === 'free') { fl = lastRaw = p; cur = [fl]; redo = []; msg(); paint(); return }
  const h = hit(p);
  if (h) { selNode = h.n; drag = h; if (h.t !== 'n') drag.alt = e.altKey; paint(); btns(); return }
  if (tool === 'pen') {
    if (!penOpen || !strokes.length || !isV(strokes[strokes.length - 1])) { strokes.push({ nodes: [] }); redo = []; penOpen = true }
    sel = strokes.length - 1; const s = strokes[sel]; s.nodes.push({ p, i: [0, 0], o: [0, 0], s: false }); selNode = s.nodes.length - 1;
    drag = { t: 'new', n: selNode, st: p }; msg(); paint(); btns();
  }
  else { sel = pick(p); selNode = -1; paint(); btns() }
});
svg.addEventListener('pointermove', e => {
  if (rdrag) {
    const p = pt(e);
    if (rdrag.t === 'm') { ref.x = p[0] + rdrag.off[0]; ref.y = p[1] + rdrag.off[1] }
    else { ref.w = Math.max(40, p[0] - ref.x); ref.h = ref.w / ref.ar; $('#r-sz').value = Math.min(300, Math.max(20, Math.round(ref.w / ref.base * 100))) }
    drawRef(); return;
  }
  if (drag) {
    const p = pt(e), s = strokes[sel]; if (!s || !isV(s)) return; const n = s.nodes[drag.n];
    if (drag.t === 'n') n.p = [p[0] + drag.off[0], p[1] + drag.off[1]];
    else if (drag.t === 'new') { const v = [p[0] - drag.st[0], p[1] - drag.st[1]]; if (Math.hypot(v[0], v[1]) > 6) { n.o = v; n.i = [-v[0], -v[1]]; n.s = true } }
    else { const o = [p[0] - n.p[0], p[1] - n.p[1]], q = drag.t === 'o' ? 'i' : 'o'; n[drag.t] = o; if (drag.alt || e.altKey) n.s = false; else if (n.s) n[q] = [-o[0], -o[1]] }
    paint(); return;
  }
  if (!cur) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const a = 1 - .55 * sm / 100; for (const ev of (evs.length ? evs : [e])) { const p = pt(ev), l = cur[cur.length - 1]; lastRaw = p; fl = [fl[0] + (p[0] - fl[0]) * a, fl[1] + (p[1] - fl[1]) * a]; if (Math.hypot(fl[0] - l[0], fl[1] - l[1]) > 1.5) cur.push(fl) } paint();
});
const end = () => {
  if (rdrag) { rdrag = null; return } if (drag) { drag = null; paint(); btns(); scheduleSave(); return }
  if (!cur) return; const l = cur[cur.length - 1]; if (lastRaw && cur.length > 1 && Math.hypot(lastRaw[0] - l[0], lastRaw[1] - l[1]) > 1.5) cur.push(lastRaw);
  if (cur.length === 1) cur.push([cur[0][0], cur[0][1]]); strokes.push(cur); cur = null; paint(); btns(); scheduleSave();
};
svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
svg.addEventListener('dblclick', e => {
  if (body.dataset.mode !== 'draw' || showClean || ref.adj || tool === 'free') return;
  const h = hit(pt(e)); if (!h || h.t !== 'n') return; const s = strokes[sel];
  if (tool === 'pen' && penOpen && h.n === s.nodes.length - 1) { finish(); return }
  toggleSmooth(s.nodes, h.n); paint();
});

/* ---------- cleanup / smoothing ---------- */
function resample(p, step) {
  const o = [p[0].slice()]; let acc = 0, prev = p[0];
  for (let i = 1; i < p.length; i++) {
    let a = prev, b = p[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= step) { const t = (step - acc) / d; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; o.push(a); d = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0 }
    acc += d; prev = p[i];
  }
  const l = p[p.length - 1], q = o[o.length - 1];
  if (Math.hypot(l[0] - q[0], l[1] - q[1]) > step * .35) o.push(l.slice()); else o[o.length - 1] = l.slice();
  return o;
}
function smooth(s, n) {
  const step = l => { const c = s.map(p => p.slice()); for (let i = 1; i < s.length - 1; i++) for (let j = 0; j < 2; j++) s[i][j] = c[i][j] + l * ((c[i - 1][j] + c[i + 1][j]) / 2 - c[i][j]) };
  for (let k = 0; k < n; k++) { step(.5); step(-.53) }
  return s;
}
function isStraight(s) {
  const a = s[0], b = s[s.length - 1], c = Math.hypot(b[0] - a[0], b[1] - a[1]); if (c < 25) return false;
  let m = 0; for (const p of s) m = Math.max(m, Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / c);
  return m <= Math.max(5, .035 * c);
}
function cleanStroke(st) {
  let len = 0; for (let i = 1; i < st.length; i++) len += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  if (len < 12) { const c = st.reduce((a, p) => [a[0] + p[0] / st.length, a[1] + p[1] / st.length], [0, 0]); return [[c, [c[0] + .01, c[1]]]] }
  const r = smooth(resample(st, 5), 10), n = r.length, K = 4, ang = new Array(n).fill(0);
  for (let i = K; i < n - K; i++) { const a = [r[i][0] - r[i - K][0], r[i][1] - r[i - K][1]], b = [r[i + K][0] - r[i][0], r[i + K][1] - r[i][1]]; const m = Math.hypot(...a) * Math.hypot(...b); ang[i] = m ? Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / m))) : 0 }
  const cuts = [0];
  for (let i = K + 1; i < n - K - 1; i++) { if (ang[i] < 1.25) continue; let mx = true; for (let j = i - K; j <= i + K; j++) if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) mx = false; if (mx && i - cuts[cuts.length - 1] > K + 1) cuts.push(i) }
  cuts.push(n - 1);
  const segs = [];
  for (let c = 0; c < cuts.length - 1; c++) {
    let s = smooth(r.slice(cuts[c], cuts[c + 1] + 1).map(p => p.slice()), 8 + Math.round(sm * .6));
    if (s.length < 2) continue;
    if (isStraight(s)) { segs.push([s[0], s[s.length - 1]]); continue }
    const sp = sm > 85 ? 5 : 4, d = [s[0]]; for (let i = sp; i < s.length - 2; i += sp) d.push(s[i]); d.push(s[s.length - 1]); segs.push(d);
  }
  return segs;
}

/**
 * target() — compute positioning rectangle for a layer's strokes.
 * @param {object} [layerData] — optional layer object to compute target for
 */
function target(layerData) {
  const lbl = layerData ? layerData.label : $('#lab').value.trim();
  const lKind = layerData ? layerData.kind : kind;
  const lab = [...lbl], ch = lab[0] || '', w = lKind === 'word' || (lKind === 'lower' && lab.length > 1),
    lo = lKind === 'lower' && !w, a = lo && ASC.includes(ch), d = w ? lab.some(c => DESC.includes(c)) : lo && DESC.includes(ch);
  const L = 40, R = page === 'slant' ? cfg.mx - 40 : 960, px = layerData ? (layerData.cfgPx || 0) : cfg.px, cx = (L + R) / 2 + px; let y0, y1;
  { const B = page === 'slant' ? 360 : 345, b = page === 'slant' ? cfg.hs / 3 : 85; y0 = lo && !a ? B - b : B - 2 * b; y1 = d ? B + b : B }
  const mw = w ? R - L : Math.min(R - L, 500);
  return { x0: cx - mw / 2, x1: cx + mw / 2, cx, y0, y1, al: w && d ? 'c' : d ? 't' : 'b' };
}

function bez(pts, first) {
  let d = first ? `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2, f = v => v.toFixed(2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * buildClean() — build cleaned SVG path strings for a layer's strokes.
 * @param {object} [layerData] — optional layer object; uses active globals if omitted
 */
function buildClean(layerData) {
  const src = layerData ? layerData.strokes : strokes;
  const pre = src.map(s => isV(s) ? { v: s.nodes } : { g: cleanStroke(s) }), flat = [];
  for (const q of pre) flat.push(...(q.v ? vecPts(q.v) : q.g.flat()));
  if (!flat.length) return [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of flat) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1), T = target(layerData), s = Math.min((T.x1 - T.x0) / w, (T.y1 - T.y0) / h);
  const ox = T.cx - (x0 + x1) / 2 * s;
  const oy = T.al === 'b' ? T.y1 - y1 * s : T.al === 't' ? T.y0 - y0 * s : (T.y0 + T.y1) / 2 - (y0 + y1) / 2 * s;
  const tr = p => [p[0] * s + ox, p[1] * s + oy];
  return pre.map(q => q.v ? vecD(q.v, tr, s) : q.g.map(sg => sg.map(tr)).map((sg, i) => bez(sg, i === 0)).join(''));
}

/* ---------- inactive layers rendering ---------- */
function paintInactiveLayers() {
  let ih = '';
  layers.forEach((L, i) => {
    if (i === activeLayerIdx || !L.visible || !L.strokes.length) return;
    /* Render raw strokes dimmed */
    L.strokes.forEach(s => {
      if (isV(s)) {
        if (!s.nodes.length) return;
        ih += `<path class="orig inactive" d="${vecD(s.nodes)}"/>`;
      } else {
        ih += `<polyline class="orig inactive" points="${s.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
      }
    });
  });
  INACT_G.innerHTML = ih;
}

/* ---------- edit rendering ---------- */
function paint() {
  /* Render inactive layers first */
  paintInactiveLayers();

  let h = ''; const list = cur ? [...strokes, cur] : strokes, gh = showClean ? ' ghosted' : '';
  list.forEach((s, i) => {
    const on = i === sel && !showClean ? ' sel' : ''; let f;
    if (isV(s)) { if (!s.nodes.length) return; h += `<path class="orig${gh}${on}" d="${vecD(s.nodes)}"/>`; f = s.nodes[0].p }
    else { h += `<polyline class="orig${gh}${on}" points="${s.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`; f = s[0] }
    if (!showClean) h += `<circle class="bn" cx="${f[0] - 24}" cy="${f[1] - 24}" r="13"/><text class="bt" x="${f[0] - 24}" y="${f[1] - 24}">${i + 1}</text>`;
  });
  if (showClean && strokes.length) h += buildClean().map(d => `<path class="cp" d="${d}"/>`).join('');
  if (!showClean && sel >= 0 && strokes[sel] && isV(strokes[sel])) {
    const z = 1 / zoom, nr = (7.5 * z).toFixed(2), ns2 = (14 * z).toFixed(2), noff = (7 * z).toFixed(2), hr = (6 * z).toFixed(2), hlw = (1.6 * z).toFixed(2), hdw = (2.5 * z).toFixed(2), ndw = (2.8 * z).toFixed(2);
    strokes[sel].nodes.forEach((n, i) => {
      for (const k of ['i', 'o']) { const q = n[k]; if (q[0] || q[1]) { const x = n.p[0] + q[0], y = n.p[1] + q[1]; h += `<line class="hl" x1="${n.p[0]}" y1="${n.p[1]}" x2="${x}" y2="${y}" stroke-width="${hlw}"/><circle class="hd" cx="${x}" cy="${y}" r="${hr}" stroke-width="${hdw}"/>` } }
      const c = i === selNode ? ' on' : '';
      h += n.s ? `<circle class="nd${c}" cx="${n.p[0]}" cy="${n.p[1]}" r="${nr}" stroke-width="${ndw}"/>` : `<rect class="nd${c}" x="${n.p[0] - 7 * z}" y="${n.p[1] - 7 * z}" width="${ns2}" height="${ns2}" stroke-width="${ndw}"/>`;
    });
  }
  G.innerHTML = h;
}
function btns() {
  const v = strokes[sel] && isV(strokes[sel]);
  $('#undo').disabled = !strokes.length || showClean; $('#redo').disabled = !redo.length || showClean; $('#clear').disabled = !strokes.length || showClean;
  $('#finish').hidden = !(tool === 'pen' && penOpen);
  $('#delpt').hidden = !(tool === 'select' && v && selNode >= 0); $('#delpath').hidden = !(tool === 'select' && sel >= 0);
}
$('#undo').onclick = () => {
  const l = strokes[strokes.length - 1];
  if (penOpen && l && isV(l) && l.nodes.length > 1) { l.nodes.pop(); selNode = l.nodes.length - 1; paint(); scheduleSave(); return }
  if (strokes.length) { redo.push(strokes.pop()); penOpen = false; sel = -1; selNode = -1; paint(); btns(); scheduleSave() }
};
$('#redo').onclick = () => { if (redo.length) { strokes.push(redo.pop()); paint(); btns(); scheduleSave() } };
$('#clear').onclick = () => { strokes = []; redo = []; sel = -1; selNode = -1; penOpen = false; paint(); btns(); msg(); scheduleSave() };
$('#prev').onclick = () => {
  if (!strokes.length) return msg('Draw at least one stroke first.');
  if (penOpen) finish(); showClean = !showClean;
  $('#prev').textContent = showClean ? 'Back to drawing' : 'Preview'; $('#prev').classList.toggle('on', showClean);
  msg(showClean ? 'Cleaned version (solid) over your original (dotted red). Your drawing is unchanged.' : ''); paint(); btns();
};
