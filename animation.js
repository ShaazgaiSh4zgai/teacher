/* ===== animation.js — generation, rendering, playback, step-number dragging, keyboard ===== */

/* ---------- step-number dragging state ---------- */
let numDrag = null; // { idx, off:[dx,dy], el, tel }

function defaultNumPos(startPt, tangent) {
  return { x: startPt[0] - tangent[0] * 38 - tangent[1] * 10, y: startPt[1] - tangent[1] * 38 + tangent[0] * 10 };
}

/* ---------- animation generation ---------- */
function generate() {
  if (!strokes.length) return msg('Draw at least one stroke first.');
  if (penOpen) { penOpen = false; sel = -1 } ref.adj = false; drawRef();
  showClean = false; $('#prev').textContent = 'Preview'; $('#prev').classList.remove('on');
  const ds = buildClean().filter(d => d && d.length > 0);
  if (!ds.length) return msg('No valid strokes to animate.');
  G.innerHTML = ''; GU.innerHTML = ''; INK.innerHTML = ''; msg();

  /* Render inactive visible layers as static background strokes */
  let bgHtml = '';
  layers.forEach((L, i) => {
    if (i === activeLayerIdx || !L.visible || !L.strokes.length) return;
    const cds = buildClean(L);
    cds.forEach(d => { if (d && d.length) bgHtml += `<path class="bg-stroke" d="${d}"/>` });
  });
  INACT_G.innerHTML = bgHtml;

  // Ensure numPositions array matches stroke count
  while (numPositions.length < ds.length) numPositions.push(null);
  if (numPositions.length > ds.length) numPositions.length = ds.length;

  const items = ds.map((d, i) => {
    // Guide path with configurable dots
    const g = E('path', { d, class: 'gd' });
    g.style.strokeWidth = dotCfg.size;
    g.style.strokeDasharray = `0.1 ${dotCfg.spacing}`;
    GU.appendChild(g);

    const len = g.getTotalLength();
    const at = l => { const p = g.getPointAtLength(Math.max(0, Math.min(len, l))); return [p.x, p.y] };
    const a = at(0), b = at(Math.min(len, 6)), tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = len > 1 ? [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl] : [1, 0];

    // Ink path
    const ln = E('path', { d, class: 'ink' }); ln.style.strokeDasharray = `${len} ${len + 4}`; INK.appendChild(ln);

    // Start dot
    GU.appendChild(E('circle', { class: 'sd', cx: a[0], cy: a[1], r: dotCfg.size * 1.3 }));

    // Step number (draggable)
    const defPos = defaultNumPos(a, t);
    const pos = numPositions[i] || defPos;
    const circle = E('circle', { class: 'bn bn-drag', cx: pos.x, cy: pos.y, r: 14, 'data-idx': i });
    const text = E('text', { class: 'bt bt-drag', x: pos.x, y: pos.y, 'data-idx': i }, i + 1);
    GU.appendChild(circle);
    GU.appendChild(text);

    // Arrows along the path
    const arScale = arrowCfg.size;
    const arSpace = arrowCfg.spacing;
    if (len > 30 && arSpace > 0) {
      const firstOffset = Math.min(arSpace * 0.5, len * 0.3);
      for (let pos = firstOffset; pos < len - 10; pos += arSpace) {
        const m = at(pos), m2 = at(Math.min(len, pos + 4)), m1 = at(Math.max(0, pos - 4));
        const an = Math.atan2(m2[1] - m1[1], m2[0] - m1[0]) * 180 / Math.PI;
        GU.appendChild(E('path', { class: 'ar', d: `M${-8 * arScale} ${-8 * arScale}L${4 * arScale} 0L${-8 * arScale} ${8 * arScale}`, transform: `translate(${m[0]} ${m[1]}) rotate(${an})` }));
      }
    }

    return { ink: ln, col: PAL[i % 3], len, at, dur: Math.max(.8, len / 230), startPt: a, tangent: t };
  });

  // Wire up step-number dragging
  setupNumDrag();

  let t = 0; const ev = []; const first = items[0].at(0);
  ev.push({ t0: 0, t1: .8, fn: () => [first[0], first[1], 0] }); t = .8;
  items.forEach((it, i) => {
    it.t0 = t; it.t1 = t + it.dur;
    ev.push({ t0: it.t0, t1: it.t1, fn: u => { const p = it.at(it.len * ease(u)); return [p[0], p[1], 0] } }); t = it.t1;
    const nx = items[i + 1];
    if (nx) {
      const e = it.at(it.len), s = nx.at(0), d = Math.hypot(s[0] - e[0], s[1] - e[1]), md = .45 + d / 1100;
      ev.push({ t0: t, t1: t + .2, fn: () => [e[0], e[1], 0] }); t += .2;
      ev.push({ t0: t, t1: t + md, fn: u => { const k = ease(u); return [e[0] + (s[0] - e[0]) * k, e[1] + (s[1] - e[1]) * k, 26 * Math.sin(Math.PI * u)] } }); t += md;
      ev.push({ t0: t, t1: t + .2, fn: () => [s[0], s[1], 0] }); t += .2;
    }
  });
  const l = items[items.length - 1].at(items[items.length - 1].len);
  ev.push({ t0: t, t1: t + 1.2, fn: () => [l[0], l[1], 0] }); t += 1.2;
  P = { items, ev, end: t };

  body.dataset.mode = 'play'; PEN.style.display = ''; btns(); play();
}

function render(t) {
  for (const it of P.items) { const u = ease((t - it.t0) / it.dur); it.ink.style.stroke = it.col; it.ink.style.display = u <= 0 ? 'none' : ''; it.ink.style.strokeDashoffset = it.len * (1 - u) }
  let e = P.ev[P.ev.length - 1], u = 1; for (const x of P.ev) if (t < x.t1) { e = x; u = (t - x.t0) / (x.t1 - x.t0); break }
  const p = e.fn(Math.min(1, Math.max(0, u))); PEN.setAttribute('transform', `translate(${p[0].toFixed(2)} ${(p[1] - p[2]).toFixed(2)})`);
}

function play() {
  cancelAnimationFrame(raf); if (!P) return; let t = 0, l = performance.now();
  const f = n => { t += Math.min(.1, (n - l) / 1000) * speed; l = n; if (t >= P.end) { render(P.end); return } render(t); raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f);
}

/* ---------- step-number drag handling ---------- */
function setupNumDrag() {
  const circles = GU.querySelectorAll('.bn-drag');
  circles.forEach(circle => {
    circle.addEventListener('pointerdown', e => {
      if (body.dataset.mode !== 'play') return;
      e.stopPropagation(); e.preventDefault();
      const idx = parseInt(circle.getAttribute('data-idx'));
      const p = pt(e);
      const cx = parseFloat(circle.getAttribute('cx')), cy = parseFloat(circle.getAttribute('cy'));
      const text = GU.querySelector(`.bt-drag[data-idx="${idx}"]`);
      circle.classList.add('dragging');
      svg.setPointerCapture(e.pointerId);
      numDrag = { idx, off: [cx - p[0], cy - p[1]], el: circle, tel: text };
    });
  });
  svg.addEventListener('pointermove', handleNumMove);
  svg.addEventListener('pointerup', handleNumUp);
  svg.addEventListener('pointercancel', handleNumUp);
}

function handleNumMove(e) {
  if (!numDrag) return;
  e.preventDefault();
  const p = pt(e);
  const nx = p[0] + numDrag.off[0], ny = p[1] + numDrag.off[1];
  numDrag.el.setAttribute('cx', nx); numDrag.el.setAttribute('cy', ny);
  numDrag.tel.setAttribute('x', nx); numDrag.tel.setAttribute('y', ny);
}

function handleNumUp(e) {
  if (!numDrag) return;
  const nx = parseFloat(numDrag.el.getAttribute('cx')), ny = parseFloat(numDrag.el.getAttribute('cy'));
  numPositions[numDrag.idx] = { x: nx, y: ny };
  numDrag.el.classList.remove('dragging');
  numDrag = null;
  scheduleSave();
}

/* Reset step number positions */
$('#reset-nums').onclick = () => {
  numPositions = [];
  if (body.dataset.mode === 'play' && strokes.length) generate();
  scheduleSave();
};

/* ---------- playback controls ---------- */
$('#gen').onclick = generate;
$('#replay').onclick = play;
$('#spd').oninput = e => { speed = e.target.value / 100; $('#spv').textContent = speed + '×' };
$('#edit').onclick = () => {
  cancelAnimationFrame(raf); P = null; GU.innerHTML = ''; INK.innerHTML = ''; PEN.style.display = 'none';
  svg.removeEventListener('pointermove', handleNumMove);
  svg.removeEventListener('pointerup', handleNumUp);
  svg.removeEventListener('pointercancel', handleNumUp);
  numDrag = null;
  if (document.fullscreenElement) document.exitFullscreen(); body.classList.remove('hideui'); body.dataset.mode = 'draw'; paint(); btns();
};
$('#hide').onclick = () => body.classList.add('hideui');
$('#show').onclick = () => body.classList.remove('hideui');
$('#full').onclick = async () => { body.classList.add('hideui'); try { await document.documentElement.requestFullscreen() } catch (e) { } };
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) body.classList.remove('hideui') });
svg.addEventListener('click', () => { if (body.dataset.mode === 'play' && body.classList.contains('hideui')) play() });

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  if (e.target.id === 'lab') return;
  const k = e.key.toLowerCase(), draw = body.dataset.mode === 'draw';
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y')) {
    e.preventDefault();
    if (draw && !showClean && !cur) ((k === 'y' || e.shiftKey) ? $('#redo') : $('#undo')).click(); return;
  }
  if (draw && tool === 'pen' && penOpen && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); finish(); return }
  if (draw && tool === 'select' && (e.key === 'Delete' || e.key === 'Backspace') && sel >= 0 && e.target.tagName !== 'INPUT') { e.preventDefault(); (selNode >= 0 && isV(strokes[sel])) ? delPoint() : delPath(); return }
  if (e.code === 'Space' && !draw) { e.preventDefault(); play() }
  if (e.key === 'Escape') body.classList.remove('hideui');
});

/* ---------- init ---------- */
function initApp() {
  /* Try loading saved project */
  if (!autoLoad()) {
    /* No saved data — create default layer */
    layers.push(createLayer({ name: 'Letter 1', label: $('#lab').value || 'A' }));
    loadLayerToActive(0);
  }
  wireLayerPanel();
  drawRule(); paint(); btns(); drawRef(); renderLayerPanel();
  msg('Draw each stroke separately, in the order you would write it.');
}
initApp();
