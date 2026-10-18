// Nosso Valle Studio — interface

import { db, uid, persist } from './db.js';
import { Renderer, buildTimeline, clipWindows, FONT_STYLES, TEXT_ANIMS, TEXT_COLORS, FILTERS, LAYOUT_CELLS } from './engine.js';
import { TRACKS, getTrackBuffer, decodeBlob, detectBeat, unlockAudio, audioCtx } from './audio.js';
import { importFile, loadImage, fmtTime, fmtSec } from './media.js';
import { MediaPool, Playback } from './player.js';
import { exportReel } from './exporter.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
const clone = (o) => JSON.parse(JSON.stringify(o));

const S = {
  templates: [],
  categories: [],
  cat: 'Todos',
  dur: 'all',
  project: null,
  media: new Map(),
  settings: { watermark: { text: '@sitionossovalle', logo: null, pos: 'br', opacity: 0.85, size: 1 } },
  logoImg: null,
  musicBuf: null,
  clipBufs: [],
  pool: null,
  playback: null,
};

// ---------- utilidades de UI ----------

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function busy(text) {
  $('#busy').hidden = !text;
  if (text) $('#busy-text').textContent = text;
}

let sheetOnClose = null;
function openSheet(title, html, { short = false, onClose = null, clear = false } = {}) {
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = html;
  $('#sheet-body').scrollTop = 0;
  $('#sheet').classList.toggle('short', short);
  $('#sheet').classList.add('show');
  $('#backdrop').classList.add('show');
  $('#backdrop').classList.toggle('clear', clear);
  sheetOnClose = onClose;
  return $('#sheet-body');
}
function closeSheet() {
  $('#sheet').classList.remove('show');
  $('#backdrop').classList.remove('show');
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}
$('#sheet-close').onclick = closeSheet;
$('#backdrop').onclick = closeSheet;

// Abre o seletor de arquivos e devolve os escolhidos (precisa ser chamado num toque)
function pickFiles(inputId) {
  return new Promise((resolve) => {
    const inp = $('#' + inputId);
    inp.value = '';
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

function toggleHtml(id, checked, label, sub = '') {
  return `<label class="switch"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></span></label>`;
}

// ---------- Templates ----------

async function loadTemplates() {
  const res = await fetch('templates/templates.json', { cache: 'no-cache' });
  const data = await res.json();
  S.templates = data.templates;
  S.categories = data.categories;
}

function templateTotal(tpl) {
  const bpm = TRACKS.find((t) => t.id === tpl.music)?.bpm;
  return buildTimeline({ scenes: tpl.scenes, beatSync: tpl.beatSync, bpm }).total;
}

function previewProject(tpl) {
  const bpm = TRACKS.find((t) => t.id === tpl.music)?.bpm || 100;
  const tl = buildTimeline({ scenes: tpl.scenes });
  return {
    scenes: tpl.scenes, texts: tpl.texts || [], filter: tpl.filter, filterAmount: 1, art: tpl.art,
    beatSync: tpl.beatSync, bpm,
    clips: Array.from({ length: tl.clipCount }, () => ({})),
  };
}

// Prévias animadas da galeria (só anima o que está visível)
const galleryAnims = new Map();
let galleryRaf = 0, galleryLast = 0;
const visible = new Set();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
}, { rootMargin: '80px' });

function galleryLoop(now) {
  galleryRaf = requestAnimationFrame(galleryLoop);
  if (now - galleryLast < 45) return;
  galleryLast = now;
  if (!$('#home').classList.contains('active')) return;
  for (const cv of visible) {
    const a = galleryAnims.get(cv);
    if (!a) continue;
    const t = ((now / 1000 + a.offset) % (a.tl.total + 0.6));
    a.renderer.render(Math.min(t, a.tl.total - 0.01), { project: a.project, tl: a.tl, labels: false });
  }
}

function attachPreview(canvas, tpl, offset = 0) {
  const project = previewProject(tpl);
  const tl = buildTimeline(project);
  const a = { renderer: new Renderer(canvas), project, tl, offset };
  galleryAnims.set(canvas, a);
  io.observe(canvas);
  a.renderer.render(Math.min(1.6, tl.total * 0.3), { project, tl, labels: false });
  if (!galleryRaf) galleryRaf = requestAnimationFrame(galleryLoop);
}

const DURS = [
  { id: 'all', label: 'Qualquer duração', test: () => true },
  { id: 'short', label: 'Até 10s', test: (d) => d <= 10.5 },
  { id: 'mid', label: '10 a 15s', test: (d) => d > 10.5 && d <= 15.5 },
  { id: 'long', label: 'Mais de 15s', test: (d) => d > 15.5 },
];

function renderHome() {
  const cats = ['Todos', ...S.categories];
  $('#cat-chips').innerHTML = cats.map((c) => `<button class="chip ${c === S.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $('#dur-chips').innerHTML = DURS.map((d) => `<button class="chip ${d.id === S.dur ? 'on' : ''}" data-dur="${d.id}">${d.label}</button>`).join('');
  $$('#cat-chips .chip').forEach((b) => (b.onclick = () => { S.cat = b.dataset.cat; renderHome(); }));
  $$('#dur-chips .chip').forEach((b) => (b.onclick = () => { S.dur = b.dataset.dur; renderHome(); }));
  const durTest = DURS.find((d) => d.id === S.dur).test;
  const list = S.templates.filter((t) => (S.cat === 'Todos' || t.category === S.cat) && durTest(templateTotal(t)));
  $('#tpl-count').textContent = `${list.length} ${list.length === 1 ? 'modelo' : 'modelos'}`;
  for (const cv of galleryAnims.keys()) io.unobserve(cv);
  galleryAnims.clear();
  visible.clear();
  const grid = $('#grid');
  if (!list.length) { grid.innerHTML = '<p class="empty">Nenhum template com esses filtros.</p>'; return; }
  grid.innerHTML = list.map((t) => {
    const n = buildTimeline({ scenes: t.scenes }).clipCount;
    return `<button class="tcard" data-id="${t.id}">
      <div class="thumb"><canvas width="216" height="384"></canvas><span class="badge">${esc(t.category)}</span><span class="dur">${fmtSec(templateTotal(t))}</span></div>
      <h3>${esc(t.name)}</h3><p>${n} ${n === 1 ? 'clipe' : 'clipes'}</p></button>`;
  }).join('');
  $$('.tcard', grid).forEach((el, i) => {
    const tpl = S.templates.find((t) => t.id === el.dataset.id);
    attachPreview($('canvas', el), tpl, i * 1.7);
    el.onclick = () => openTemplate(tpl);
  });
}

async function renderProjects() {
  const projects = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  $('#projects-wrap').hidden = !projects.length;
  const box = $('#projects');
  box.innerHTML = projects.map((p) => `<div class="pcard" data-id="${p.id}" role="button" tabindex="0">
      <div class="pthumb" ${p.thumb ? `style="background-image:url('${p.thumb}')"` : ''}></div>
      <b>${esc(p.name)}</b><small>${new Date(p.updated).toLocaleDateString('pt-BR')}</small>
      <button class="del" aria-label="Apagar projeto">×</button></div>`).join('');
  $$('.pcard', box).forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('.del')) return;
      openProject(el.dataset.id);
    };
    $('.del', el).onclick = async () => {
      if (!confirm('Apagar este projeto? As fotos e vídeos continuam na sua galeria.')) return;
      await deleteProject(el.dataset.id);
      renderProjects();
    };
  });
}

async function deleteProject(id) {
  const all = await db.all('projects');
  const p = all.find((x) => x.id === id);
  if (!p) return;
  await db.del('projects', id);
  const used = new Set();
  for (const q of all) if (q.id !== id) for (const m of mediaIdsOf(q)) used.add(m);
  for (const m of mediaIdsOf(p)) if (!used.has(m)) await db.del('media', m);
}

function mediaIdsOf(p) {
  const ids = p.clips.map((c) => c.mediaId).filter(Boolean);
  if (p.music && p.music.startsWith('custom:')) ids.push(p.music.slice(7));
  return ids;
}

function openTemplate(tpl) {
  const tl = buildTimeline({ scenes: tpl.scenes, beatSync: tpl.beatSync, bpm: TRACKS.find((t) => t.id === tpl.music)?.bpm });
  const track = TRACKS.find((t) => t.id === tpl.music);
  const slots = [];
  tl.scenes.forEach((s) => {
    if (!s.cells.length) slots.push(`<span class="card">Cartão · ${fmtSec(s.dur)}</span>`);
    s.cells.forEach((c) => slots.push(`<span>${c + 1} · ${fmtSec(s.dur)}${(s.speed || 1) !== 1 ? ' · lento' : ''}</span>`));
  });
  const body = openSheet(tpl.name, `
    <div class="tpl-preview">
      <canvas width="324" height="576" id="tpl-canvas"></canvas>
      <div class="tpl-info">
        <p>${esc(tpl.description || '')}</p>
        <div class="facts">
          <div>🎞️ <span>Pede <b>${tl.clipCount} ${tl.clipCount === 1 ? 'clipe' : 'clipes'}</b></span></div>
          <div>⏱️ <span>Duração <b>${fmtSec(tl.total)}</b></span></div>
          <div>🎵 <span>${esc(track ? track.name : 'Música')}</span></div>
          <div>🎨 <span>${esc(FILTERS[tpl.filter]?.label || 'Original')}</span></div>
        </div>
      </div>
    </div>
    <div class="field"><div class="lbl">Duração de cada clipe</div><div class="slots-list">${slots.join('')}</div>
    <p class="hint">Vídeos ou fotos. Escolha na ordem em que quer que apareçam — dá para trocar depois.</p></div>
    <div class="stack">
      <button class="btn gold" id="tpl-pick">${icon('media')} Escolher fotos e vídeos</button>
      <button class="btn light" id="tpl-empty">Começar sem mídia</button>
    </div>`);
  const cv = $('#tpl-canvas', body);
  const project = previewProject(tpl);
  const ptl = buildTimeline(project);
  const r = new Renderer(cv);
  let raf = 0;
  const t0 = performance.now();
  const loop = (now) => {
    const t = ((now - t0) / 1000) % (ptl.total + 0.5);
    r.render(Math.min(t, ptl.total - 0.01), { project, tl: ptl, labels: false });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  sheetOnClose = () => cancelAnimationFrame(raf);
  $('#tpl-pick', body).onclick = async () => {
    unlockAudio();
    const files = await pickFiles('file-multi');
    if (!files.length) return;
    closeSheet();
    const p = await createProject(tpl);
    await addFilesToProject(p, files);
    await openProject(p.id, p);
  };
  $('#tpl-empty', body).onclick = async () => {
    unlockAudio();
    closeSheet();
    const p = await createProject(tpl);
    await openProject(p.id, p);
  };
}

async function createProject(tpl) {
  const track = TRACKS.find((t) => t.id === tpl.music) || TRACKS[0];
  const tl = buildTimeline({ scenes: tpl.scenes });
  const clips = [];
  tl.scenes.forEach((s) => s.cells.forEach(() => clips.push({ mediaId: null, trim: 0, speed: s.speed || 1, volume: 0, kb: true })));
  const p = {
    id: uid(), name: tpl.name, templateId: tpl.id, created: Date.now(), updated: Date.now(),
    scenes: clone(tpl.scenes), texts: clone(tpl.texts || []),
    filter: tpl.filter || 'nenhum', filterAmount: 1, art: tpl.art || 'day',
    music: track.id, musicVolume: 0.9, musicStart: 0, beatSync: !!tpl.beatSync, bpm: track.bpm, beatOffset: 0,
    watermark: !!S.settings.watermark.enabled, clips, thumb: null,
  };
  await db.put('projects', p);
  return p;
}

// ---------- Mídia ----------

async function addFilesToProject(p, files, startAt = null) {
  const records = [];
  for (let i = 0; i < files.length; i++) {
    busy(`Importando ${i + 1} de ${files.length}…`);
    try {
      const m = await importFile(files[i]);
      if (m.type === 'audio') continue;
      await db.put('media', m);
      S.media.set(m.id, m);
      records.push(m);
    } catch (e) {
      toast(`Não consegui abrir “${files[i].name}”.`);
    }
  }
  busy(null);
  let left = 0;
  let idx = startAt;
  for (const m of records) {
    if (idx === null || idx >= p.clips.length) idx = p.clips.findIndex((c) => !c.mediaId);
    if (idx < 0 || idx >= p.clips.length) { left++; continue; }
    assignMedia(p, idx, m);
    idx = startAt === null ? null : idx + 1;
  }
  if (left) toast(`${left} ${left === 1 ? 'item não coube' : 'itens não couberam'} neste template.`);
  updateThumb(p);
  await db.put('projects', p);
}

function clipNeed(p, i) {
  const tl = buildTimeline(p);
  const w = clipWindows(tl)[i];
  return w ? (w.end - w.start) * (p.clips[i].speed || 1) : 2;
}

function assignMedia(p, i, m) {
  const c = p.clips[i];
  c.mediaId = m.id;
  c.trim = 0;
  if (m.type === 'video') {
    const need = clipNeed(p, i);
    c.trim = Math.max(0, Math.min(0.5, (m.duration || 0) - need));
  }
}

function updateThumb(p) {
  const first = p.clips.find((c) => c.mediaId && S.media.get(c.mediaId));
  p.thumb = first ? S.media.get(first.mediaId).thumb : null;
}

async function loadProjectMedia(p) {
  for (const id of mediaIdsOf(p)) {
    if (!S.media.has(id)) {
      const m = await db.get('media', id);
      if (m) S.media.set(id, m);
    }
  }
  // remove referências a mídias que sumiram
  p.clips.forEach((c) => { if (c.mediaId && !S.media.has(c.mediaId)) c.mediaId = null; });
}

// ---------- Editor ----------

let renderer = null;
let saveTimer = 0;

function save() {
  const p = S.project;
  if (!p) return;
  p.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.put('projects', p).catch(() => toast('Não consegui salvar no aparelho.')), 500);
}

function state() {
  return {
    project: S.project,
    musicBuf: S.musicBuf,
    clipBufs: S.clipBufs,
    watermark: S.project && S.project.watermark ? { ...S.settings.watermark, logoImg: S.logoImg } : null,
  };
}

async function openProject(id, given = null) {
  busy('Abrindo projeto…');
  try {
    const p = given || (await db.get('projects', id));
    if (!p) { toast('Projeto não encontrado.'); return; }
    await loadProjectMedia(p);
    S.project = p;
    if (S.pool) S.pool.dispose();
    S.pool = new MediaPool((mid) => S.media.get(mid));
    await S.pool.preparePhotos(p);
    if (!renderer) renderer = new Renderer($('#preview'));
    S.playback = new Playback({
      renderer, pool: S.pool, getState: state,
      onTime: updateTime,
      onEnd: () => setPlaying(false),
    });
    S.clipBufs = [];
    S.musicBuf = null;
    $('#proj-name').value = p.name;
    showView('editor');
    renderTimeline();
    fitStage();
    S.playback.seek(Math.min(0.8, buildTimeline(p).total / 2));
    loadMusic();
    loadClipAudio();
  } finally {
    busy(null);
  }
}

function fitStage() {
  const st = $('#stage');
  const r = st.getBoundingClientRect();
  const h = Math.max(100, r.height - 8);
  const w = Math.min(r.width - 24, (h * 9) / 16);
  const cv = $('#preview');
  cv.style.width = `${Math.floor(w)}px`;
  cv.style.height = `${Math.floor((w * 16) / 9)}px`;
}
window.addEventListener('resize', () => { if ($('#editor').classList.contains('active')) fitStage(); });

function showView(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  if (id === 'home') {
    if (S.playback) S.playback.pause();
    if (S.pool) S.pool.releaseAll();
    renderProjects();
  }
}

async function loadMusic() {
  const p = S.project;
  const note = $('#loading-note');
  note.hidden = false;
  note.textContent = 'Preparando a música…';
  try {
    let buf = null;
    if (p.music.startsWith('custom:')) {
      const m = S.media.get(p.music.slice(7));
      if (m) buf = await decodeBlob(m.id, m.blob);
      if (!buf) toast('Não consegui ler o áudio importado.');
    } else {
      buf = await getTrackBuffer(p.music);
    }
    if (S.project !== p) return;
    S.musicBuf = buf;
    S.playback.refresh();
  } catch (e) {
    toast('Não foi possível preparar a música.');
  } finally {
    note.hidden = true;
  }
}

async function loadClipAudio() {
  const p = S.project;
  const bufs = [];
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    const m = c.mediaId && S.media.get(c.mediaId);
    if (m && m.type === 'video' && c.volume > 0) bufs[i] = await decodeBlob(m.id, m.blob);
  }
  if (S.project === p) S.clipBufs = bufs;
}

function updateTime(t) {
  const tl = buildTimeline(S.project);
  $('#time').textContent = `${fmtTime(t)} / ${fmtTime(tl.total)}`;
  if (!scrubbing) $('#scrub').value = Math.round((t / tl.total) * 1000) || 0;
  // destaca o clipe atual
  const i = tl.scenes.findIndex((s) => t < s.end);
  const sc = tl.scenes[i < 0 ? tl.scenes.length - 1 : i];
  $$('#timeline .slot').forEach((el) => el.classList.toggle('current', +el.dataset.scene === sc.index));
}

function setPlaying(on) {
  const pb = S.playback;
  if (on) { unlockAudio(); pb.play(); } else pb.pause();
  $('#stage').classList.toggle('playing', on);
  $('#btn-play').innerHTML = icon(on ? 'pause' : 'play');
  $('#btn-play').setAttribute('aria-label', on ? 'Pausar' : 'Reproduzir');
}

let scrubbing = false;
$('#scrub').addEventListener('input', () => {
  scrubbing = true;
  const tl = buildTimeline(S.project);
  if (S.playback.playing) setPlaying(false);
  S.playback.seek(($('#scrub').value / 1000) * tl.total);
});
$('#scrub').addEventListener('change', () => { scrubbing = false; });
$('#btn-play').onclick = () => setPlaying(!S.playback.playing);
$('#btn-play-big').onclick = () => setPlaying(true);
$('#preview').onclick = () => setPlaying(!S.playback.playing);
$('#btn-back').onclick = () => { closeSheet(); setPlaying(false); save(); showView('home'); };
$('#proj-name').addEventListener('input', () => { S.project.name = $('#proj-name').value || 'Sem nome'; save(); });

function renderTimeline() {
  const p = S.project;
  const tl = buildTimeline(p);
  const html = [];
  tl.scenes.forEach((s) => {
    if (!s.cells.length) {
      html.push(`<button class="slot card filled" data-scene="${s.index}" data-card="1"><div class="sthumb">Aa</div><small>${fmtSec(s.dur)}</small></button>`);
    }
    s.cells.forEach((ci) => {
      const c = p.clips[ci];
      const m = c.mediaId && S.media.get(c.mediaId);
      const split = s.cells.length > 1;
      html.push(`<button class="slot ${m ? 'filled' : ''} ${split ? 'split' : ''}" data-clip="${ci}" data-scene="${s.index}" aria-label="Clipe ${ci + 1}">
        <div class="sthumb" ${m ? `style="background-image:url('${m.thumb}')"` : ''}>${m ? '' : '+'}</div>
        <span class="num">${ci + 1}</span>${m ? `<span class="kind">${m.type === 'video' ? '▶' : '📷'}</span>` : ''}
        <small>${fmtSec(s.dur)}${(c.speed || 1) !== 1 ? ` ${String(c.speed).replace('.', ',')}x` : ''}</small></button>`);
    });
  });
  const box = $('#timeline');
  box.innerHTML = html.join('');
  $$('.slot', box).forEach((el) => {
    el.onclick = async () => {
      const sc = tl.scenes[+el.dataset.scene];
      if (S.playback.playing) setPlaying(false);
      S.playback.seek(sc.start + Math.min(0.6, sc.dur / 2));
      if (el.dataset.card) return openTexts(sc.index);
      const ci = +el.dataset.clip;
      if (!p.clips[ci].mediaId) {
        const files = await pickFiles('file-one');
        if (!files.length) return;
        await addFilesToProject(p, files, ci);
        afterMediaChange();
      } else openClip(ci);
    };
  });
}

async function afterMediaChange() {
  await S.pool.preparePhotos(S.project);
  updateThumb(S.project);
  renderTimeline();
  S.playback.draw();
  save();
  loadClipAudio();
}

// ---------- Folha: clipe ----------

function openClip(ci) {
  const p = S.project;
  const c = p.clips[ci];
  const m = S.media.get(c.mediaId);
  const isVideo = m.type === 'video';
  const need = clipNeed(p, ci);
  const maxTrim = Math.max(0, (m.duration || 0) - need);
  const body = openSheet(`Clipe ${ci + 1}`, `
    ${isVideo ? `<video class="trim-video" id="trim-video" muted playsinline webkit-playsinline preload="auto"></video>` : `<div class="trim-photo" style="background-image:url('${S.pool.url(m.id)}')"></div>`}
    ${isVideo ? `
    <div class="field"><label>Trecho do vídeo <small id="trim-lbl"></small></label>
      <input type="range" id="trim" min="0" max="${maxTrim.toFixed(2)}" step="0.05" value="${Math.min(c.trim, maxTrim)}" ${maxTrim <= 0 ? 'disabled' : ''}>
      <p class="hint">${maxTrim <= 0 ? 'O vídeo é curto: ele será usado inteiro.' : `Arraste para escolher o pedaço que aparece (${fmtSec(need)} do vídeo).`}</p>
      <button class="btn light" id="trim-play">${icon('play')} Ver este trecho</button>
    </div>
    <div class="field"><div class="lbl">Velocidade</div>
      <div class="seg" id="speed">${[0.5, 1, 2].map((v) => `<button data-v="${v}" class="${(c.speed || 1) === v ? 'on' : ''}">${String(v).replace('.', ',')}x${v === 0.5 ? ' lento' : ''}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Som original do vídeo <small id="vol-lbl">${Math.round((c.volume || 0) * 100)}%</small></label>
      <input type="range" id="vol" min="0" max="1" step="0.05" value="${c.volume || 0}">
    </div>` : `
    ${toggleHtml('kb', c.kb !== false, 'Movimento suave (zoom)', 'Efeito Ken Burns na foto')}`}
    <div class="row" style="margin-top:12px">
      <button class="btn light" id="mv-l" ${ci === 0 ? 'disabled' : ''}>${icon('left')} Mover</button>
      <button class="btn light" id="mv-r" ${ci === p.clips.length - 1 ? 'disabled' : ''}>Mover ${icon('right')}</button>
    </div>
    <div class="stack" style="margin-top:10px">
      <button class="btn" id="replace">${icon('media')} Trocar foto ou vídeo</button>
      <button class="btn danger" id="remove">Tirar deste clipe</button>
    </div>`, { short: false });
  let vid = null, stopAt = 0;
  if (isVideo) {
    vid = $('#trim-video', body);
    vid.src = S.pool.url(m.id);
    const showTrim = () => {
      const v = +$('#trim', body).value;
      $('#trim-lbl', body).textContent = `${fmtTime(v)} – ${fmtTime(Math.min(m.duration, v + need))}`;
    };
    showTrim();
    vid.addEventListener('loadedmetadata', () => { vid.currentTime = c.trim || 0.01; }, { once: true });
    $('#trim', body).oninput = () => {
      c.trim = +$('#trim', body).value;
      showTrim();
      vid.pause();
      vid.currentTime = c.trim;
      save();
    };
    $('#trim', body).onchange = () => S.playback.draw();
    $('#trim-play', body).onclick = () => {
      vid.currentTime = c.trim;
      vid.playbackRate = c.speed || 1;
      stopAt = c.trim + need;
      vid.play().catch(() => {});
    };
    vid.ontimeupdate = () => { if (stopAt && vid.currentTime >= stopAt) { vid.pause(); stopAt = 0; } };
    $$('#speed button', body).forEach((b) => (b.onclick = () => {
      c.speed = +b.dataset.v;
      save();
      renderTimeline();
      S.playback.draw();
      openClip(ci);
    }));
    $('#vol', body).oninput = () => {
      c.volume = +$('#vol', body).value;
      $('#vol-lbl', body).textContent = `${Math.round(c.volume * 100)}%`;
      save();
    };
    $('#vol', body).onchange = () => loadClipAudio();
  } else {
    $('#kb', body).onchange = () => { c.kb = $('#kb', body).checked; save(); S.playback.draw(); };
  }
  const move = (d) => {
    const j = ci + d;
    [p.clips[ci], p.clips[j]] = [p.clips[j], p.clips[ci]];
    // a velocidade pertence ao lugar do template
    [p.clips[ci].speed, p.clips[j].speed] = [p.clips[j].speed, p.clips[ci].speed];
    afterMediaChange();
    openClip(j);
  };
  $('#mv-l', body).onclick = () => move(-1);
  $('#mv-r', body).onclick = () => move(1);
  $('#replace', body).onclick = async () => {
    const files = await pickFiles('file-one');
    if (!files.length) return;
    p.clips[ci].mediaId = null;
    await addFilesToProject(p, files, ci);
    await afterMediaChange();
    openClip(ci);
  };
  $('#remove', body).onclick = () => {
    c.mediaId = null; c.trim = 0;
    closeSheet();
    afterMediaChange();
  };
  sheetOnClose = () => { if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); } };
}

// ---------- Folha: mídia ----------

function openMediaSheet() {
  const p = S.project;
  const filled = p.clips.filter((c) => c.mediaId).length;
  const body = openSheet('Mídia', `
    <p class="hint" style="margin-top:0">${filled} de ${p.clips.length} clipes preenchidos. As fotos e vídeos entram nos espaços vazios, em ordem.</p>
    <div class="stack" style="margin-top:12px">
      <button class="btn gold" id="m-add">${icon('plus')} Adicionar fotos e vídeos</button>
      <button class="btn light" id="m-refill" ${filled ? '' : 'hidden'}>Substituir todos</button>
    </div>
    <p class="hint">Dica: toque num clipe da linha do tempo para trocar, mover ou escolher o trecho.</p>`, { short: true });
  $('#m-add', body).onclick = async () => {
    const files = await pickFiles('file-multi');
    if (!files.length) return;
    closeSheet();
    await addFilesToProject(p, files);
    afterMediaChange();
  };
  $('#m-refill', body).onclick = async () => {
    const files = await pickFiles('file-multi');
    if (!files.length) return;
    closeSheet();
    p.clips.forEach((c) => { c.mediaId = null; });
    await addFilesToProject(p, files);
    afterMediaChange();
  };
}

// ---------- Folha: textos ----------

function openTexts(sceneFilter = null) {
  const p = S.project;
  const tl = buildTimeline(p);
  const rows = p.texts.map((t, i) => ({ t, i })).sort((a, b) => (a.t.scene ?? 0) - (b.t.scene ?? 0));
  const body = openSheet('Textos', `
    ${rows.map(({ t, i }) => `<button class="list-item ${sceneFilter === t.scene ? 'on' : ''}" data-i="${i}">
      <div class="main text-row"><span class="scene">Cena ${(t.scene ?? 0) + 1}</span><b style="font-family:'${FONT_STYLES[t.style]?.family || 'serif'}'">${esc(t.text || '(vazio)')}</b></div>${icon('right')}</button>`).join('') || '<p class="hint">Nenhum texto ainda.</p>'}
    <button class="btn" id="t-add" style="margin-top:8px">${icon('plus')} Adicionar texto nesta cena</button>`, { clear: true });
  $$('.list-item', body).forEach((el) => (el.onclick = () => editText(+el.dataset.i)));
  $('#t-add', body).onclick = () => {
    const t = S.playback.t;
    const sc = tl.scenes.find((s) => t < s.end) || tl.scenes[tl.scenes.length - 1];
    p.texts.push({ scene: sc.index, text: 'Seu texto aqui', style: 'elegante', anim: 'subir', y: 0.5, size: 1, color: '#ffffff', align: 'center' });
    save();
    editText(p.texts.length - 1);
  };
}

function editText(i) {
  const p = S.project;
  const t = p.texts[i];
  const tl = buildTimeline(p);
  const sc = tl.scenes[t.scene ?? 0] || tl.scenes[0];
  S.playback.seek(Math.min(sc.end - 0.05, sc.start + (t.delay || 0) + 0.9));
  const body = openSheet('Editar texto', `
    <div class="field"><textarea id="tx">${esc(t.text)}</textarea></div>
    <div class="field"><div class="lbl">Estilo da letra</div>
      <div class="opts">${Object.entries(FONT_STYLES).map(([k, f]) => `<button class="opt ${t.style === k ? 'on' : ''}" data-style="${k}" style="font-family:'${f.family}';font-weight:${f.weight};${f.italic ? 'font-style:italic;' : ''}${f.upper ? 'text-transform:uppercase;font-size:13px;letter-spacing:.06em;' : 'font-size:19px;'}">${f.label}</button>`).join('')}</div>
    </div>
    <div class="field"><div class="lbl">Animação de entrada</div>
      <div class="opts">${Object.entries(TEXT_ANIMS).map(([k, l]) => `<button class="opt ${(t.anim || 'aparecer') === k ? 'on' : ''}" data-anim="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="field"><div class="lbl">Cor</div>
      <div class="colors">${TEXT_COLORS.map((c) => `<button data-color="${c}" class="${(t.color || '#ffffff') === c ? 'on' : ''}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
    </div>
    ${toggleHtml('tx-bg', !!t.bg, 'Fundo atrás do texto', 'Faixa clara que ajuda a ler')}
    <div class="field"><label>Posição na tela <small>arraste ↕</small></label>
      <input type="range" id="tx-y" min="0.06" max="0.94" step="0.01" value="${t.y ?? 0.5}">
    </div>
    <div class="field"><div class="lbl">Alinhamento</div>
      <div class="seg" id="tx-align">${[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].map(([k, l]) => `<button data-v="${k}" class="${(t.align || 'center') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Tamanho <small id="tx-size-lbl">${Math.round((t.size || 1) * 100)}%</small></label>
      <input type="range" id="tx-size" min="0.4" max="3.4" step="0.05" value="${t.size || 1}">
    </div>
    <div class="field"><div class="lbl">Aparece na cena</div>
      <div class="chips" style="flex-wrap:wrap">${tl.scenes.map((s) => `<button class="chip ${s.index === (t.scene ?? 0) ? 'on' : ''}" data-scene="${s.index}">${s.index + 1}</button>`).join('')}</div>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn light" id="tx-done">Pronto</button>
      <button class="btn danger" id="tx-del">Excluir</button>
    </div>`, { clear: true });
  const redraw = () => { save(); S.playback.draw(); };
  $('#tx', body).oninput = () => { t.text = $('#tx', body).value; redraw(); };
  $$('[data-style]', body).forEach((b) => (b.onclick = () => { t.style = b.dataset.style; $$('[data-style]', body).forEach((x) => x.classList.toggle('on', x === b)); redraw(); }));
  $$('[data-anim]', body).forEach((b) => (b.onclick = () => {
    t.anim = b.dataset.anim;
    $$('[data-anim]', body).forEach((x) => x.classList.toggle('on', x === b));
    save();
    // mostra a animação
    const s2 = buildTimeline(p).scenes[t.scene ?? 0];
    setPlaying(false);
    S.playback.seek(s2.start + (t.delay || 0));
    setPlaying(true);
    setTimeout(() => { if (S.playback.playing) setPlaying(false); }, 1600);
  }));
  $$('[data-color]', body).forEach((b) => (b.onclick = () => { t.color = b.dataset.color; $$('[data-color]', body).forEach((x) => x.classList.toggle('on', x === b)); redraw(); }));
  $('#tx-bg', body).onchange = () => { t.bg = $('#tx-bg', body).checked; redraw(); };
  $('#tx-y', body).oninput = () => { t.y = +$('#tx-y', body).value; redraw(); };
  $$('#tx-align button', body).forEach((b) => (b.onclick = () => { t.align = b.dataset.v; $$('#tx-align button', body).forEach((x) => x.classList.toggle('on', x === b)); redraw(); }));
  $('#tx-size', body).oninput = () => { t.size = +$('#tx-size', body).value; $('#tx-size-lbl', body).textContent = `${Math.round(t.size * 100)}%`; redraw(); };
  $$('[data-scene]', body).forEach((b) => (b.onclick = () => {
    t.scene = +b.dataset.scene; t.span = 1; t.delay = 0;
    $$('[data-scene]', body).forEach((x) => x.classList.toggle('on', x === b));
    const s2 = buildTimeline(p).scenes[t.scene];
    save();
    S.playback.seek(s2.start + Math.min(0.9, s2.dur - 0.1));
  }));
  $('#tx-done', body).onclick = () => openTexts();
  $('#tx-del', body).onclick = () => { p.texts.splice(i, 1); redraw(); openTexts(); };
}

// ---------- Folha: filtro ----------

function openFilter() {
  const p = S.project;
  const body = openSheet('Filtro de cor', `
    <div class="opts two">${Object.entries(FILTERS).map(([k, f]) => `<button class="opt ${p.filter === k ? 'on' : ''}" data-f="${k}"><span class="sw" style="background:${f.swatch}"></span>${f.label}</button>`).join('')}</div>
    <div class="field"><label>Intensidade <small id="fa-lbl">${Math.round((p.filterAmount ?? 1) * 100)}%</small></label>
      <input type="range" id="fa" min="0" max="1" step="0.05" value="${p.filterAmount ?? 1}">
    </div>`, { short: true, clear: true });
  $$('[data-f]', body).forEach((b) => (b.onclick = () => {
    p.filter = b.dataset.f;
    $$('[data-f]', body).forEach((x) => x.classList.toggle('on', x === b));
    save(); S.playback.draw();
  }));
  $('#fa', body).oninput = () => {
    p.filterAmount = +$('#fa', body).value;
    $('#fa-lbl', body).textContent = `${Math.round(p.filterAmount * 100)}%`;
    save(); S.playback.draw();
  };
}

// ---------- Folha: música ----------

let auditionNode = null;
function stopAudition() {
  if (auditionNode) { try { auditionNode.stop(); } catch (e) { /* ignora */ } auditionNode = null; }
}

async function audition(id, btn) {
  stopAudition();
  unlockAudio();
  if (S.playback.playing) setPlaying(false);
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;margin:0;border-width:3px"></div>';
  try {
    const buf = await getTrackBuffer(id);
    const c = audioCtx();
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(c.destination);
    src.start(c.currentTime + 0.05, 0, 12);
    auditionNode = src;
    $$('.list-item .play').forEach((b) => (b.innerHTML = icon('play')));
    btn.innerHTML = icon('pause');
    src.onended = () => { if (auditionNode === src) { auditionNode = null; btn.innerHTML = icon('play'); } };
  } catch (e) {
    btn.innerHTML = icon('play');
  }
}

function snapMusicStart(p) {
  if (!p.beatSync || !p.bpm) return;
  const beat = 60 / p.bpm;
  const off = p.beatOffset || 0;
  p.musicStart = Math.max(0, off + Math.round(((p.musicStart || 0) - off) / beat) * beat);
}

function openMusic() {
  const p = S.project;
  const custom = p.music.startsWith('custom:') ? S.media.get(p.music.slice(7)) : null;
  const maxStart = S.musicBuf ? Math.max(0, S.musicBuf.duration - buildTimeline(p).total) : 0;
  const body = openSheet('Música', `
    ${TRACKS.map((t) => `<div class="list-item ${p.music === t.id ? 'on' : ''}" data-track="${t.id}" role="button" tabindex="0">
      <button class="play" data-aud="${t.id}" aria-label="Ouvir ${esc(t.name)}">${icon('play')}</button>
      <div class="main"><b>${esc(t.name)}</b><small>${esc(t.mood)}</small></div><span class="tag">${t.bpm} BPM</span></div>`).join('')}
    ${custom ? `<div class="list-item on"><div class="main"><b>${esc(custom.name)}</b><small>Seu áudio · ${p.bpm ? `${Math.round(p.bpm)} BPM detectado` : ''}</small></div></div>` : ''}
    <button class="btn light" id="mu-import">${icon('plus')} Usar meu próprio áudio</button>
    <p class="hint">Use só músicas que você tem direito de usar. As faixas acima foram criadas para o app e são livres de direitos.</p>
    <div class="field"><label>Volume da música <small id="mv-lbl">${Math.round((p.musicVolume ?? 1) * 100)}%</small></label>
      <input type="range" id="mu-vol" min="0" max="1" step="0.05" value="${p.musicVolume ?? 1}">
    </div>
    ${toggleHtml('mu-beat', !!p.beatSync, 'Cortes no ritmo da batida', 'Ajusta a duração das cenas à música')}
    <div class="field"><label>Começar a música em <small id="ms-lbl">${fmtTime(p.musicStart || 0)}</small></label>
      <input type="range" id="mu-start" min="0" max="${maxStart.toFixed(2)}" step="0.1" value="${Math.min(p.musicStart || 0, maxStart)}" ${maxStart <= 0 ? 'disabled' : ''}>
    </div>`, { onClose: stopAudition });
  $$('[data-aud]', body).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    if (auditionNode && b.innerHTML.includes('pause')) { stopAudition(); b.innerHTML = icon('play'); return; }
    audition(b.dataset.aud, b);
  }));
  $$('[data-track]', body).forEach((el) => (el.onclick = () => {
    const t = TRACKS.find((x) => x.id === el.dataset.track);
    stopAudition();
    p.music = t.id; p.bpm = t.bpm; p.beatOffset = 0; p.musicStart = 0;
    save();
    afterTimingChange();
    loadMusic().then(() => openMusic());
    $$('[data-track]', body).forEach((x) => x.classList.toggle('on', x === el));
  }));
  $('#mu-import', body).onclick = async () => {
    stopAudition();
    const files = await pickFiles('file-audio');
    if (!files.length) return;
    busy('Analisando o ritmo da música…');
    try {
      const f = files[0];
      const m = { id: uid(), type: 'audio', name: f.name, blob: f, created: Date.now() };
      const buf = await decodeBlob(m.id, m.blob);
      if (!buf) { toast('Formato de áudio não suportado. Tente MP3 ou M4A.'); return; }
      await db.put('media', m);
      S.media.set(m.id, m);
      const { bpm, offset } = detectBeat(buf);
      p.music = 'custom:' + m.id; p.bpm = bpm; p.beatOffset = offset; p.musicStart = offset;
      save();
      afterTimingChange();
      await loadMusic();
      openMusic();
    } finally { busy(null); }
  };
  $('#mu-vol', body).oninput = () => {
    p.musicVolume = +$('#mu-vol', body).value;
    $('#mv-lbl', body).textContent = `${Math.round(p.musicVolume * 100)}%`;
    save();
  };
  $('#mu-vol', body).onchange = () => S.playback.refresh();
  $('#mu-beat', body).onchange = () => { p.beatSync = $('#mu-beat', body).checked; snapMusicStart(p); save(); afterTimingChange(); };
  $('#mu-start', body).oninput = () => {
    p.musicStart = +$('#mu-start', body).value;
    snapMusicStart(p);
    $('#ms-lbl', body).textContent = fmtTime(p.musicStart);
    save();
  };
  $('#mu-start', body).onchange = () => { S.playback.seek(0); };
}

function afterTimingChange() {
  renderTimeline();
  S.playback.seek(Math.min(S.playback.t, buildTimeline(S.project).total));
}

// ---------- Folha: marca d'água ----------

function watermarkFields(withProjectToggle) {
  const w = S.settings.watermark;
  return `
    ${withProjectToggle ? toggleHtml('wm-on', !!S.project.watermark, 'Mostrar marca neste vídeo') : ''}
    <div class="field"><label>Texto (seu @ ou nome)</label><input type="text" id="wm-text" value="${esc(w.text)}" placeholder="@sitionossovalle"></div>
    <div class="field"><div class="lbl">Logo <small>opcional, PNG com fundo transparente fica melhor</small></div>
      <div class="row"><button class="btn light" id="wm-logo">${w.logo ? 'Trocar logo' : 'Escolher logo'}</button>${w.logo ? '<button class="btn danger" id="wm-logo-x">Remover logo</button>' : ''}</div>
    </div>
    <div class="field"><div class="lbl">Posição</div>
      <div class="opts two">${[['tl', '↖ Em cima, esquerda'], ['tr', '↗ Em cima, direita'], ['bl', '↙ Embaixo, esquerda'], ['br', '↘ Embaixo, direita']].map(([k, l]) => `<button class="opt ${w.pos === k ? 'on' : ''}" data-pos="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Tamanho</label><input type="range" id="wm-size" min="0.6" max="1.8" step="0.05" value="${w.size || 1}"></div>
    <div class="field"><label>Transparência</label><input type="range" id="wm-op" min="0.3" max="1" step="0.05" value="${w.opacity ?? 0.85}"></div>`;
}

async function saveSettings() {
  await db.put('settings', S.settings, 'main');
}

async function loadLogo() {
  S.logoImg = null;
  if (S.settings.watermark.logo) {
    try { S.logoImg = await loadImage(S.settings.watermark.logo); } catch (e) { /* ignora */ }
  }
}

function bindWatermark(body, reopen) {
  const w = S.settings.watermark;
  const redraw = () => { saveSettings(); if (S.playback && S.project) S.playback.draw(); };
  const on = $('#wm-on', body);
  if (on) on.onchange = () => {
    S.project.watermark = on.checked;
    w.enabled = on.checked; // lembra a preferência para os próximos projetos
    save(); redraw();
  };
  $('#wm-text', body).oninput = () => { w.text = $('#wm-text', body).value; redraw(); };
  $('#wm-logo', body).onclick = async () => {
    const files = await pickFiles('file-logo');
    if (!files.length) return;
    const img = await loadImage(URL.createObjectURL(files[0]));
    const c = document.createElement('canvas');
    const s = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    w.logo = c.toDataURL('image/png');
    await loadLogo();
    redraw();
    reopen();
  };
  const x = $('#wm-logo-x', body);
  if (x) x.onclick = async () => { w.logo = null; await loadLogo(); redraw(); reopen(); };
  $$('[data-pos]', body).forEach((b) => (b.onclick = () => { w.pos = b.dataset.pos; $$('[data-pos]', body).forEach((y) => y.classList.toggle('on', y === b)); redraw(); }));
  $('#wm-size', body).oninput = () => { w.size = +$('#wm-size', body).value; redraw(); };
  $('#wm-op', body).oninput = () => { w.opacity = +$('#wm-op', body).value; redraw(); };
}

function openMark() {
  const body = openSheet('Marca d’água', watermarkFields(true) + '<p class="hint">O texto, logo e posição valem para todos os projetos.</p>', { clear: true });
  bindWatermark(body, openMark);
}

// ---------- Ajustes / Sobre ----------

function openSettings() {
  const body = openSheet('Ajustes', `
    <h3 style="font-size:21px;color:var(--mata);margin-top:4px">Marca d’água</h3>
    ${toggleHtml('wm-default', !!S.settings.watermark.enabled, 'Ligar em novos projetos')}
    ${watermarkFields(false)}
    <div class="stack" style="margin-top:18px">
      <button class="btn light" id="st-about">Sobre o app e licenças</button>
      <button class="btn danger" id="st-clear">Apagar todos os projetos</button>
    </div>`);
  bindWatermark(body, openSettings);
  $('#wm-default', body).onchange = () => { S.settings.watermark.enabled = $('#wm-default', body).checked; saveSettings(); };
  $('#st-about', body).onclick = openAbout;
  $('#st-clear', body).onclick = async () => {
    if (!confirm('Apagar todos os projetos e mídias guardadas no app? Sua galeria de fotos não é afetada.')) return;
    await db.clear('projects'); await db.clear('media');
    S.media.clear();
    closeSheet(); renderProjects(); toast('Tudo apagado.');
  };
}

function openAbout() {
  openSheet('Sobre', `<div class="prose">
    <p><b>Nosso Valle Studio</b> é o editor de reels do Sítio Nosso Valle, na Serra da Mantiqueira (Bueno Brandão/MG).</p>
    <h3>Privacidade</h3>
    <p>Tudo acontece no seu aparelho. Seus vídeos e fotos nunca são enviados para nenhum servidor. Não há login.</p>
    <h3>Músicas</h3>
    <p>As 6 faixas do app (${TRACKS.map((t) => esc(t.name)).join(', ')}) são compostas por código dentro do próprio app — não usam gravações de ninguém. São livres de direitos autorais (CC0, domínio público): pode usar em reels, anúncios e onde quiser.</p>
    <p>Ao importar o seu próprio áudio, use apenas músicas que você tem direito de usar.</p>
    <h3>Fontes</h3>
    <p>Playfair Display, Cormorant Garamond, Montserrat, Caveat, Bebas Neue e Josefin Sans — licença SIL Open Font License 1.1.</p>
    <h3>Bibliotecas</h3>
    <p>mp4-muxer (MIT) para montar o arquivo MP4.</p>
    <h3>Versão</h3><p>1.0</p></div>`);
}

// ---------- Exportar ----------

let exportAbort = null;
async function startExport() {
  if (S.playback.playing) setPlaying(false);
  closeSheet();
  unlockAudio();
  const p = S.project;
  const empty = p.clips.filter((c) => !c.mediaId).length;
  if (empty && !confirm(`${empty} ${empty === 1 ? 'clipe está vazio e vai aparecer' : 'clipes estão vazios e vão aparecer'} com a ilustração. Exportar mesmo assim?`)) return;
  if (!S.musicBuf) {
    busy('Preparando a música…');
    await loadMusic();
    busy(null);
  }
  await loadClipAudio();
  const body = openSheet('Exportando', `
    <div class="export-stage"><canvas id="ex-canvas" width="1080" height="1920"></canvas></div>
    <div class="progress"><div id="ex-bar"></div></div>
    <p class="stage-text" id="ex-stage">Preparando…</p>
    <p class="hint" style="text-align:center">Deixe o app aberto e a tela ligada até terminar. Leva mais ou menos o tempo do vídeo.</p>
    <button class="btn danger" id="ex-cancel" style="margin-top:12px">Cancelar</button>`, {
    onClose: () => { if (exportAbort) exportAbort.abort(); },
  });
  exportAbort = new AbortController();
  $('#ex-cancel', body).onclick = () => { exportAbort.abort(); };
  S.pool.releaseAll();
  const pool = new MediaPool((mid) => S.media.get(mid));
  try {
    const res = await exportReel({
      state: state(), pool, canvas: $('#ex-canvas', body), signal: exportAbort.signal,
      onProgress: ({ stage, p: pr }) => {
        $('#ex-stage', body).textContent = `${stage} ${Math.round(pr * 100)}%`;
        $('#ex-bar', body).style.width = `${pr * 100}%`;
      },
    });
    exportAbort = null;
    showExportResult(res);
  } catch (e) {
    exportAbort = null;
    if (e && e.name === 'AbortError') { toast('Exportação cancelada.'); }
    else { console.error(e); closeSheet(); alert('Não foi possível exportar: ' + (e && e.message ? e.message : e)); }
  } finally {
    pool.dispose();
    S.playback.draw();
  }
}

function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reel';
}

function showExportResult({ blob, ext, mime }) {
  const name = `nosso-valle-${slug(S.project.name)}.${ext}`;
  const file = new File([blob], name, { type: mime });
  const url = URL.createObjectURL(blob);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const mb = (blob.size / 1024 / 1024).toFixed(1).replace('.', ',');
  const body = openSheet('Seu reel está pronto! 🎉', `
    <div class="export-stage"><video src="${url}" controls playsinline loop autoplay muted></video></div>
    <p class="hint" style="text-align:center">${ext.toUpperCase()} · 1080×1920 · 30 fps · ${mb} MB</p>
    <div class="stack" style="margin-top:10px">
      ${canShare ? `<button class="btn gold" id="ex-share">${icon('share')} Compartilhar ou salvar no iPhone</button>` : ''}
      <a class="btn ${canShare ? 'light' : 'gold'}" id="ex-dl" href="${url}" download="${name}" style="text-decoration:none">${icon('download')} Baixar arquivo</a>
    </div>
    <p class="hint">${canShare ? 'No menu de compartilhar, toque em <b>“Salvar vídeo”</b> para guardar na galeria, ou escolha Instagram/TikTok direto.' : 'O arquivo vai para a pasta de downloads. No iPhone, abra o app Arquivos → Downloads, toque no vídeo e em compartilhar → <b>“Salvar vídeo”</b>.'}</p>`, {
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 60000),
  });
  const sh = $('#ex-share', body);
  if (sh) sh.onclick = async () => {
    try { await navigator.share({ files: [file], title: S.project.name }); }
    catch (e) { if (e.name !== 'AbortError') toast('Não deu para abrir o compartilhamento. Use “Baixar arquivo”.'); }
  };
}

// ---------- Ferramentas ----------

$$('.tools button').forEach((b) => (b.onclick = () => {
  if (S.playback.playing) setPlaying(false);
  ({ media: openMediaSheet, texts: () => openTexts(), filter: openFilter, music: openMusic, mark: openMark })[b.dataset.tool]();
}));
$('#btn-export').onclick = startExport;
$('#btn-settings').onclick = openSettings;
$('#btn-about').onclick = openAbout;

// ---------- Início ----------

async function init() {
  try {
    const st = await db.get('settings', 'main');
    if (st) S.settings = { ...S.settings, ...st, watermark: { ...S.settings.watermark, ...(st.watermark || {}) } };
  } catch (e) { /* primeira vez */ }
  await loadLogo();
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    await Promise.all(Object.values(FONT_STYLES).map((f) => document.fonts.load(`${f.italic ? 'italic ' : ''}${f.weight} 40px "${f.family}"`).catch(() => {})));
  } catch (e) { /* ignora */ }
  try {
    await loadTemplates();
  } catch (e) {
    $('#grid').innerHTML = '<p class="empty">Não consegui carregar os templates. Verifique a internet e abra de novo.</p>';
    return;
  }
  renderHome();
  renderProjects();
  persist();
  // pré-gera a música mais usada em segundo plano
  setTimeout(() => getTrackBuffer('amanhecer').catch(() => {}), 1500);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('pagehide', () => { if (S.project) db.put('projects', S.project).catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.playback && S.playback.playing) setPlaying(false);
});

// usado nos testes automáticos
window.__valle = { S, buildTimeline, LAYOUT_CELLS };

init();
