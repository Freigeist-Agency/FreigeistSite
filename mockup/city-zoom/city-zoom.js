// City zoom mockup (design: city-zoom-design.md, 2026-11-23).
// One GSAP timeline drives everything from a single state object, so "back" is just reverse():
//   spin  - the globe turns the short way round to the country
//   zoom  - cobe's scale grows until the country fills the screen
//   dense - a 2D canvas of the country's dense dots (country-dots.json) takes over from cobe,
//           drawn with cobe's own projection so it lands exactly where cobe drew the country
//   morph - the dots leave the map: the northern ones spell the city's name, the rest fill the
//           project tiles (staggered, so the country dissolves rather than jumps)
//   solid - the name dots turn into the real heading and the tile dots into the posters
import createGlobe from '../../js/vendor/cobe/0.6.3-dots/cobe.esm.js';

const PROJECTS = {   // placeholder split (Joel, 2026-11-23): random, two per city
  nairobi: {
    title: 'nairobi.',
    tiles: [
      { name: 'stahlbox x holypriest.', tags: 'events & music.', poster: '../../videos/STAHLBOX-HOLYPREIST---NO-TEXT_poster.0000000.jpg' },
      { name: 'vitali koch.', tags: 'finance & insurance.', poster: '../../videos/Sequenz-01_1_poster.0000000.jpg' },
    ],
  },
  cologne: {
    title: 'cologne.',
    tiles: [
      { name: 'motus intimi.', tags: 'events & music.', poster: '../../videos/MOTUS-INTIMI-RENDER---NO-TEXT_poster.0000000.jpg' },
      { name: 'blaustrand.', tags: 'events & music.', poster: '../../videos/upscaled_4k_poster.0000000.jpg' },
    ],
  },
};
const CITIES = { nairobi: [-1.2921, 36.8219], cologne: [50.9375, 6.9603] };
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const MAX_DELAY = 0.45;                       // share of the morph over which the dots set off

const root = document.querySelector('.cz');
let globeCanvas = document.querySelector('.cz-globe');   // replaced if its WebGL context is lost
const dotsCanvas = document.querySelector('.cz-dots');
const ctx = dotsCanvas.getContext('2d');
const work = document.querySelector('.cz-work');
const titleEl = document.querySelector('.cz-title');
const tilesEl = document.querySelector('.cz-tiles');
const placeBtns = [...document.querySelectorAll('.cz-place')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// the one state the timeline animates; cobe and the dots canvas both draw from it every frame
const S = { phi: 0.4, theta: 0.2, scale: 1, globeAlpha: 1, denseAlpha: 0, morph: 0, solid: 0 };
let countries = null;     // country-dots.json
let city = null;          // the city being shown (or played to)
let tl = null;            // its timeline
let dots = [];            // [{ lat, lon, tx, ty, kind: 'text' | 'tile', delay }]
let view = { vw: 0, vh: 0, side: 0, dpr: 1, baseScale: 1 };

// ---- cobe's projection, so the 2D dots land exactly on cobe's dots ----
// World point as cobe places markers (index.esm.js: [-cos(lat)cos(l), sin(lat), cos(lat)sin(l)],
// l = lon - 180deg), then rotated like the shader (g = f * L(theta, phi), so f = L g).
function project(lat, lon, phi, theta, scale) {
  const la = lat * RAD, l = lon * RAD - Math.PI;
  const gx = -Math.cos(la) * Math.cos(l), gy = Math.sin(la), gz = Math.cos(la) * Math.sin(l);
  const c = Math.cos(theta), e = Math.sin(theta), d = Math.cos(phi), f = Math.sin(phi);
  const fx = d * gx + f * gz;
  const fy = f * e * gx + c * gy - d * e * gz;
  const fz = -f * c * gx + e * gy + d * c * gz;
  const r = 0.4 * scale * view.side;          // the shader's sphere radius is 0.8 of half the canvas
  return [view.vw / 2 + fx * r, view.vh / 2 - fy * r, fz];
}
// the phi / theta that bring [lat, lon] to the front (cobe's own examples)
const anglesFor = ([lat, lon]) => [Math.PI - (lon * RAD - Math.PI / 2), lat * RAD];

function measure() {
  view.vw = innerWidth;
  view.vh = innerHeight;
  view.side = Math.max(view.vw, view.vh);
  view.dpr = Math.min(devicePixelRatio || 1, 2, 2048 / view.side);
  view.baseScale = (0.85 * Math.min(view.vw, view.vh)) / (0.8 * view.side);
  dotsCanvas.width = Math.round(view.vw * Math.min(devicePixelRatio || 1, 2));
  dotsCanvas.height = Math.round(view.vh * Math.min(devicePixelRatio || 1, 2));
}

// ---- the globe ----
// GPU load: cobe's shader runs for every pixel of a canvas as big as the longer screen side, so
// it renders at full sharpness only while the whole globe shows. Zoomed in (dots big, picture
// fading out) it drops to 1 pixel per CSS pixel, and on the work page it stops altogether.
const MARKERS = Object.values(CITIES).map((location) => ({ location, size: 0.05 }));
let globe = null;
let globeDpr = 1;
function startGlobe() {
  if (root.dataset.state === 'globe') S.scale = view.baseScale;
  globeDpr = view.dpr;
  globe = createGlobe(globeCanvas, {
    devicePixelRatio: globeDpr,
    width: view.side * globeDpr,
    height: view.side * globeDpr,
    phi: S.phi,
    theta: S.theta,
    scale: S.scale,
    dark: 0,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: 6,
    mapBaseBrightness: 0,                     // must be a number, or the shader gets NaN
    baseColor: [1, 1, 1],
    markerColor: [1, 1, 1],
    glowColor: [0, 0, 0],
    markers: MARKERS,
    onRender: (state) => {
      state.phi = S.phi;
      state.theta = S.theta;
      state.scale = S.scale;
      state.width = globeCanvas.width;
      state.height = globeCanvas.height;
    },
  });
  if (root.dataset.state === 'work') globe.toggle(false);
}
function setGlobeDpr(dpr) {
  if (!globe || dpr === globeDpr) return;
  globeDpr = dpr;
  globe.devicePixelRatio = dpr;
  globe.resize();                             // phenomenon resizes the buffer; onRender follows it
}
// If the browser drops the WebGL context (a GPU reset), the old canvas can stay blank for good:
// put a fresh canvas in its place and start the globe again on it.
function watchContext(c) {
  c.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('city zoom: the globe lost its WebGL context; restarting it');
    setTimeout(restartGlobe, 200);
  });
}
function restartGlobe() {
  try { if (globe) globe.destroy(); } catch (err) { /* the old context is gone already */ }
  globe = null;
  const fresh = globeCanvas.cloneNode(false);
  fresh.style.opacity = String(S.globeAlpha);
  globeCanvas.replaceWith(fresh);
  globeCanvas = fresh;
  bindGlobeInput(globeCanvas);
  watchContext(globeCanvas);
  startGlobe();
}

// ---- the dots ----
function smooth(t) { return t * t * (3 - 2 * t); }
function drawDots() {
  const k = dotsCanvas.width / view.vw;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, view.vw, view.vh);
  if (!city || (S.denseAlpha <= 0 && S.morph <= 0)) return;
  const data = countries[city];
  const step = ((data.bounds[2] - data.bounds[0]) / 70) * RAD * 0.4 * S.scale * view.side;
  const rMap = Math.max(0.8, step * 0.3);
  ctx.fillStyle = '#000';
  for (const p of dots) {
    const [sx, sy, sz] = project(p.lat, p.lon, S.phi, S.theta, S.scale);
    if (sz <= 0 && S.morph === 0) continue;
    const u = smooth(Math.min(1, Math.max(0, (S.morph - p.delay) / (1 - MAX_DELAY))));
    const x = sx + (p.tx - sx) * u, y = sy + (p.ty - sy) * u;
    const r = rMap + (p.r - rMap) * u;
    const fade = u === 1 ? 1 - S.solid : 1;    // once in place, the dots give way to the real thing
    const a = S.denseAlpha * fade;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- where each dot goes: the name's letters and the tiles ----
function textTargets(el, gap) {
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const c = document.createElement('canvas');
  c.width = Math.ceil(box.width);
  c.height = Math.ceil(box.height);
  const g = c.getContext('2d');
  g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
  g.textBaseline = 'top';
  // line-height 1: the em box starts at the top of the line box
  g.fillText(el.textContent, 0, (box.height - parseFloat(cs.fontSize)) / 2);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let y = gap / 2; y < c.height; y += gap) {
    for (let x = gap / 2; x < c.width; x += gap) {
      if (px[(Math.floor(y) * c.width + Math.floor(x)) * 4 + 3] > 140) out.push([box.left + x, box.top + y]);
    }
  }
  return out;
}

function tileTargets(rects, count) {
  const area = rects.reduce((s, r) => s + r.width * r.height, 0);
  const gap = Math.sqrt(area / Math.max(count, 1));
  const out = [];
  for (const r of rects) {
    for (let y = r.top + gap / 2; y < r.bottom; y += gap) {
      for (let x = r.left + gap / 2; x < r.right; x += gap) out.push([x, y]);
    }
  }
  return { out, gap };
}

// a stable pseudo-random number per dot, so the stagger is the same forwards and backwards
const hash = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

function buildWork(name) {
  const p = PROJECTS[name];
  titleEl.textContent = p.title;
  tilesEl.replaceChildren(...p.tiles.map((t) => {
    const li = document.createElement('li');
    li.className = 'cz-tile';
    const media = document.createElement('div');
    media.className = 'cz-tile-media';
    const img = document.createElement('img');
    img.src = t.poster;
    img.alt = '';
    media.append(img);
    const nm = document.createElement('p');
    nm.className = 'cz-tile-name';
    nm.textContent = t.name;
    const tg = document.createElement('p');
    tg.className = 'cz-tile-tags';
    tg.textContent = t.tags;
    li.append(media, nm, tg);
    return li;
  }));
  work.hidden = false;                        // laid out (but invisible) so it can be measured
  gsap.set([titleEl, '.cz-tile-media', '.cz-tile-name', '.cz-tile-tags', '.cz-back'], { opacity: 0 });

  // the dots of this country, northern ones first: they become the name (which sits at the top)
  const src = countries[name].dots.map(([lat, lon]) => ({ lat, lon })).sort((a, b) => b.lat - a.lat || a.lon - b.lon);
  const fs = parseFloat(getComputedStyle(titleEl).fontSize);
  let text = textTargets(titleEl, Math.max(4, fs / 26));
  if (text.length > src.length * 0.45) text = text.filter((_, i) => i % Math.ceil(text.length / (src.length * 0.45)) === 0);
  const rects = [...document.querySelectorAll('.cz-tile-media')].map((m) => m.getBoundingClientRect());
  const { out: tiles, gap } = tileTargets(rects, src.length - text.length);

  // match left-to-right within each group, so the dots stream instead of criss-crossing
  const textDots = src.slice(0, text.length).sort((a, b) => a.lon - b.lon);
  const tileDots = src.slice(text.length).sort((a, b) => a.lon - b.lon);
  text.sort((a, b) => a[0] - b[0]);
  tiles.sort((a, b) => a[0] - b[0]);
  const rText = Math.max(1.2, Math.max(4, fs / 26) * 0.38);
  const rTile = Math.max(1, gap * 0.32);
  dots = [
    ...textDots.map((d, i) => ({ ...d, tx: text[i][0], ty: text[i][1], r: rText, kind: 'text' })),
    ...tileDots.map((d, i) => {
      const t = tiles[Math.min(tiles.length - 1, Math.floor((i * tiles.length) / tileDots.length))];
      return { ...d, tx: t[0], ty: t[1], r: rTile, kind: 'tile' };
    }),
  ].map((d, i) => ({ ...d, delay: hash(i + 1) * MAX_DELAY }));
}

// ---- the timeline ----
function countryFrame(name) {
  const [s, w, n, e] = countries[name].bounds;
  const mid = [(s + n) / 2, (w + e) / 2];
  const span = Math.max(n - s, (e - w) * Math.cos(mid[0] * RAD)) * RAD;
  const fit = Math.min(0.62 * view.vh, 0.86 * view.vw);
  return { mid, scale: fit / (0.4 * view.side * span) };
}

function build(name) {
  const { mid, scale } = countryFrame(name);
  const [p0, t0] = anglesFor(mid);
  const phi = p0 + TAU * Math.round((S.phi - p0) / TAU);   // the short way round
  const t = gsap.timeline({
    paused: true,
    defaults: { ease: 'none' },
    onUpdate: drawDots,
    onComplete: () => {
      root.dataset.state = 'work';
      if (globe) globe.toggle(false);         // nothing of the globe shows on the work page
      titleEl.focus({ preventScroll: true });
    },
    onReverseComplete: () => {
      root.dataset.state = 'globe';
      work.hidden = true;
      city = null;
      drawDots();
      placeBtns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
    },
  });
  t.to(S, { phi, theta: t0, duration: 0.9, ease: 'power2.inOut' }, 0)
    .to(['.cz-word', '.cz-places', '.cz-hint'], { opacity: 0, duration: 0.5 }, 0.6)
    .to(S, { scale, duration: 1.3, ease: 'power2.in' }, 0.8)
    .to(S, { denseAlpha: 1, duration: 0.3 }, 1.75)
    .to(S, { globeAlpha: 0, duration: 0.3, onUpdate: () => { globeCanvas.style.opacity = S.globeAlpha; } }, 1.8)
    .to(S, { morph: 1, duration: 1.6 }, 2.2)
    .to(S, { solid: 1, duration: 0.5 }, 3.7)
    .to(titleEl, { opacity: 1, duration: 0.5 }, 3.7)
    .to('.cz-tile-media', { opacity: 1, duration: 0.5 }, 3.7)
    .to(['.cz-tile-name', '.cz-tile-tags', '.cz-back'], { opacity: 1, duration: 0.4 }, 3.9);
  return t;
}

function play(name, { push = true, instant = false } = {}) {
  if (!PROJECTS[name] || !countries) return;
  if (tl) tl.kill();
  city = name;
  root.dataset.state = 'moving';
  placeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.city === name)));
  buildWork(name);
  tl = build(name);
  if (push) history.pushState({ cz: name }, '', `?city=${name}`);
  if (instant || reduced) tl.progress(1); else tl.play();
}

function back() {
  if (!tl) return;
  root.dataset.state = 'moving';
  if (globe) requestAnimationFrame(() => globe && globe.toggle(true));   // a frame later: toggle(true) renders at once
  if (reduced) tl.progress(0); else tl.reverse();
}

// ---- input ----
placeBtns.forEach((b) => b.addEventListener('click', () => {
  if (root.dataset.state !== 'globe') return;
  if (b.dataset.city === 'remote') return;   // remote keeps spinning (its own zoom-out comes later)
  play(b.dataset.city);
}));
document.querySelector('.cz-back').addEventListener('click', () => {
  // our own step: the browser's back. Opened straight on the work page: stay on this page and play back
  if (history.state && history.state.cz && !history.state.entry) history.back();
  else { history.replaceState(null, '', location.pathname); back(); }
});
addEventListener('popstate', () => {
  const want = new URLSearchParams(location.search).get('city');
  if (want && want !== city) play(want, { push: false });
  else if (!want && city) back();
});

// clicking a city's own dot on the globe
function cityNear(x, y) {
  for (const [name, loc] of Object.entries(CITIES)) {
    const [sx, sy, sz] = project(loc[0], loc[1], S.phi, S.theta, S.scale);
    if (sz > 0.15 && Math.hypot(sx - x, sy - y) < 28) return name;
  }
  return null;
}
function bindGlobeInput(c) {
  c.addEventListener('pointermove', (e) => {
    c.classList.toggle('is-near', root.dataset.state === 'globe' && !!cityNear(e.clientX, e.clientY));
  });
  c.addEventListener('click', (e) => {
    if (root.dataset.state !== 'globe') return;
    const name = cityNear(e.clientX, e.clientY);
    if (name) play(name);
  });
}
bindGlobeInput(globeCanvas);
watchContext(globeCanvas);

// the idle spin, only while the globe is showing
gsap.ticker.add(() => {
  if (root.dataset.state === 'globe' && !reduced) S.phi += 0.003;
  setGlobeDpr(S.scale > view.baseScale * 1.5 ? 1 : view.dpr);
});

addEventListener('resize', () => {
  measure();
  if (root.dataset.state === 'globe') S.scale = view.baseScale;
  if (globe) { globeDpr = 0; setGlobeDpr(S.scale > view.baseScale * 1.5 ? 1 : view.dpr); }
  if (city && root.dataset.state === 'work') { buildWork(city); gsap.set([titleEl, '.cz-tile-media', '.cz-tile-name', '.cz-tile-tags', '.cz-back'], { opacity: 1 }); }
  drawDots();
});

// ---- start ----
measure();
startGlobe();
try {
  countries = await (await fetch('country-dots.json')).json();
} catch (err) {
  console.error('city zoom: could not load the country dots', err);
}
const first = new URLSearchParams(location.search).get('city');
if (first && PROJECTS[first]) {                // opened from a shared link: start on the work page
  history.replaceState({ cz: first, entry: true }, '', location.href);
  play(first, { push: false, instant: true });
}
window.CZ = { S, play, back, project, get tl() { return tl; }, get globe() { return globe; }, get canvas() { return globeCanvas; } };   // for checking frames in a test browser
