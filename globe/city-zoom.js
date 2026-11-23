// The city zoom on /globe's "locations." section (design: city-zoom-design.md; Joel OK'd the
// mockup on 2026-11-23). Picking a city (its label, or its dot on the globe) hands the page's globe
// over to a full-screen copy that can grow past its box, then one GSAP timeline plays:
//   spin  - the globe turns the short way round to the country and slides to the screen's centre
//   zoom  - cobe's scale grows until the country fills the screen
//   dense - a 2D canvas of the country's dense dots (country-dots.json) takes over from cobe,
//           drawn with cobe's own projection so it lands exactly where cobe drew the country
//   morph - the dots leave the map: the northern ones spell the city's name, the rest fill the
//           project tiles (staggered, so the country dissolves rather than jumps)
//   solid - the name dots turn into the real heading and the tile dots into the posters
// It ends on the city's own page: the section is read from /work/<city> and the address changes
// to it, so a reload or a shared link opens the same page. Back (its link, the browser's back,
// Escape) plays the timeline in reverse and hands the globe back.
// "remote" plays the other way (remote-zoom-design.md): the globe shrinks onto Earth's orbit and
// the solar system appears around it, with FRED. behind (solar-system.js). It stays on /globe, with
// its own history step (#remote); the labels stay usable there.
// Day / night: both canvases draw white dots flipped against what is below them (globe.css), so
// they come out in the section's ink either way; the work page's colours follow
// html[data-globe-mode] (work/work.css).
import createGlobe from '../js/vendor/cobe/0.6.3-dots/cobe.esm.js';
import { createSolarSystem } from './solar-system.js';

export const CITIES = { nairobi: [-1.2921, 36.8219], cologne: [50.9375, 6.9603] };
export const REMOTE = 'remote';
const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const MAX_DELAY = 0.45;                       // share of the morph over which the dots set off
const NEAR_PX = 28;                           // how close a click must be to a city's dot
const DOTS_URL = new URL('country-dots.json', import.meta.url);
const workAddress = (name) => `/work/${name}`;
const workFile = (name) => `/work/${name}.html`;   // the same page; plain file servers need the .html

// cobe's projection (index.esm.js places markers at [-cos(lat)cos(l), sin(lat), cos(lat)sin(l)],
// l = lon - 180deg, and the shader rotates by L(theta, phi)), onto a sphere of radius r centred
// at (cx, cy) on the screen. z > 0 is the side facing the viewer.
function projectOn(lat, lon, phi, theta, cx, cy, r) {
  const la = lat * RAD, l = lon * RAD - Math.PI;
  const gx = -Math.cos(la) * Math.cos(l), gy = Math.sin(la), gz = Math.cos(la) * Math.sin(l);
  const c = Math.cos(theta), e = Math.sin(theta), d = Math.cos(phi), f = Math.sin(phi);
  const fx = d * gx + f * gz;
  const fy = f * e * gx + c * gy - d * e * gz;
  const fz = -f * c * gx + e * gy + d * c * gz;
  return [cx + fx * r, cy - fy * r, fz];
}
// the phi / theta that bring [lat, lon] to the front (cobe's own examples)
const anglesFor = ([lat, lon]) => [Math.PI - (lon * RAD - Math.PI / 2), lat * RAD];
const smooth = (t) => t * t * (3 - 2 * t);
// a stable pseudo-random number per dot, so the stagger is the same forwards and backwards
const hash = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// the cities' dots sampled from the rendered heading (an offscreen copy of its text)
function textTargets(el, gap) {
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(box.width));
  c.height = Math.max(1, Math.ceil(box.height));
  const g = c.getContext('2d');
  g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in g) g.letterSpacing = cs.letterSpacing;
  g.textBaseline = 'top';
  g.fillText(el.textContent, 0, (box.height - parseFloat(cs.fontSize)) / 2);   // line-height 1
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const out = [];
  for (let y = gap / 2; y < c.height; y += gap) {
    for (let x = gap / 2; x < c.width; x += gap) {
      if (px[(Math.floor(y) * c.width + Math.floor(x)) * 4 + 3] > 140) out.push([box.left + x, box.top + y]);
    }
  }
  return out;
}

// an even grid over the tiles' picture boxes, about `count` points in all
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

/**
 * @param {object} deps
 * @param {HTMLCanvasElement} deps.pageCanvas  the section's own globe
 * @param {{ angles(): {phi:number, theta:number}, pause(): void, hide(): void, release(): void }} deps.page
 *        controls for the page's globe: stop drawing, hide its canvas, give it back
 * @param {object} deps.look      the cobe options both globes share, so the hand-over is seamless
 * @param {string[]} deps.fadeOut what fades away while the globe zooms in (the section's texts, nav)
 * @param {string[]} deps.fadeOutRemote what fades away while it zooms out (the labels stay)
 * @param {() => boolean} deps.isReduced
 * @returns {{ play(name: string, opts?: {opener?: Element}): Promise<boolean>, cityAt(x: number, y: number): string|null, isOpen(): boolean } | null}
 */
export function createCityZoom({ pageCanvas, page, look, fadeOut, fadeOutRemote, isReduced }) {
  const gsap = window.gsap;
  const root = document.documentElement;
  const mount = document.querySelector('.cz-mount');
  let globeCanvas = document.querySelector('.cz-globe');   // replaced if its WebGL context is lost
  const dotsCanvas = document.querySelector('.cz-dots');
  if (!gsap || !pageCanvas || !mount || !globeCanvas || !dotsCanvas) return null;
  const ctx = dotsCanvas.getContext('2d');

  // the one state the timeline animates; the zoom globe and the dots canvas draw from it.
  // ox / oy: where the sphere's centre sits, from the screen's centre (CSS px)
  const S = { phi: 0, theta: 0, scale: 1, ox: 0, oy: 0, globeAlpha: 0, denseAlpha: 0, morph: 0, solid: 0 };
  // the solar system's parts (0..1 shown) and its orbiting time, for "remote"
  const SOLAR_START = { sun: 0, rings: 0, planets: 0, earth: 0, fred: 0, eyes: 0, orbit: 0 };
  Object.assign(S, SOLAR_START);
  const solar = createSolarSystem();
  const view = { vw: 0, vh: 0, side: 0, dpr: 1, startScale: 1 };   // startScale: the page globe's size
  let countries = null;       // country-dots.json, once loaded
  const works = {};           // name -> Promise of the section read from /work/<name>
  let city = null;            // the city shown (or being played to), or REMOTE
  let tl = null;              // its timeline
  let dots = [];              // [{ lat, lon, tx, ty, r, delay }]
  let work = null;            // the work section in the page
  let opener = null;          // what to give focus back to
  let home = '';              // the address to go back to
  let busy = false;           // a hand-over is under way
  let dirty = false;          // the window changed size while the timeline ran

  const lenis = () => (window.WFM && window.WFM.lenis) || null;

  function measure() {
    view.vw = innerWidth;
    view.vh = innerHeight;
    view.side = Math.max(view.vw, view.vh);
    view.dpr = Math.min(devicePixelRatio || 1, 2, 2048 / view.side);
    globeCanvas.style.width = `${view.side}px`;          // a square over the whole screen, centred
    globeCanvas.style.height = `${view.side}px`;
    const k = Math.min(devicePixelRatio || 1, 2);
    dotsCanvas.width = Math.round(view.vw * k);
    dotsCanvas.height = Math.round(view.vh * k);
    solar.layout(view.vw, view.vh);
  }
  const isRemote = () => city === REMOTE;
  const project = (lat, lon) => projectOn(lat, lon, S.phi, S.theta,
    view.vw / 2 + S.ox, view.vh / 2 + S.oy, 0.4 * S.scale * view.side);   // sphere: 0.8 of half the canvas

  // ---- the zoom globe ----
  // GPU load: cobe's shader runs for every pixel of a square as big as the longer screen side, so
  // it draws at full sharpness only while the whole globe shows, at 1 pixel per CSS pixel once
  // zoomed in, and not at all while its canvas is invisible: browsers can hold back the drawing
  // of an invisible WebGL canvas and run all of it at once when it shows again (a long freeze,
  // possibly a GPU reset).
  let globe = null;
  let globeDpr = 1;
  // cobe's offset uniform is in drawing-buffer pixels and gets multiplied by the scale
  const offset = () => [(2 * S.ox * globeDpr) / S.scale, (2 * S.oy * globeDpr) / S.scale];
  function startGlobe() {
    globeDpr = view.dpr;
    globe = createGlobe(globeCanvas, {
      ...look,
      devicePixelRatio: globeDpr,
      width: view.side * globeDpr,
      height: view.side * globeDpr,
      phi: S.phi,
      theta: S.theta,
      scale: S.scale,
      offset: offset(),
      onRender: (state) => {
        state.phi = S.phi;
        state.theta = S.theta;
        state.scale = S.scale;
        state.offset = offset();
        state.width = globeCanvas.width;
        state.height = globeCanvas.height;
      },
    });
    globe.toggle(false);
  }
  function setGlobeDpr(dpr, force = false) {
    if (!globe || (dpr === globeDpr && !force)) return;
    globeDpr = dpr;
    globe.devicePixelRatio = dpr;
    globe.resize();                             // phenomenon resizes the buffer; onRender follows it
  }
  function showGlobe(on) {
    if (globe && on !== globe.shouldRender) globe.toggle(on);
  }
  // A dropped WebGL context (a GPU reset) can leave the canvas blank for good: put a fresh canvas
  // in its place and start the zoom globe again on it.
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
    globeCanvas.replaceWith(fresh);
    globeCanvas = fresh;
    watchContext(globeCanvas);
    measure();
    startGlobe();
    showGlobe(S.globeAlpha > 0);
  }
  watchContext(globeCanvas);

  // ---- the dots ----
  function drawDots() {
    const k = dotsCanvas.width / view.vw;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, view.vw, view.vh);
    if (isRemote()) { solar.draw(ctx, S, root.dataset.globeMode); return; }
    if (!city || !countries || (S.denseAlpha <= 0 && S.morph <= 0)) return;
    const data = countries[city];
    const step = ((data.bounds[2] - data.bounds[0]) / 70) * RAD * 0.4 * S.scale * view.side;
    const rMap = Math.max(0.8, step * 0.3);
    ctx.fillStyle = '#fff';                     // flipped by the canvas's blend: the section's ink
    for (const p of dots) {
      const [sx, sy, sz] = project(p.lat, p.lon);
      if (sz <= 0 && S.morph === 0) continue;
      const u = smooth(Math.min(1, Math.max(0, (S.morph - p.delay) / (1 - MAX_DELAY))));
      const x = sx + (p.tx - sx) * u, y = sy + (p.ty - sy) * u;
      const r = rMap + (p.r - rMap) * u;
      const a = S.denseAlpha * (u === 1 ? 1 - S.solid : 1);   // in place, they give way to the real thing
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // every frame of the timeline: the zoom globe's visibility and sharpness, then the dots
  function render() {
    globeCanvas.style.opacity = String(S.globeAlpha);
    showGlobe(S.globeAlpha > 0);
    setGlobeDpr(S.scale > view.startScale * 1.5 || isRemote() ? 1 : view.dpr);
    drawDots();
  }

  // ---- the data: the country dots and each city's work section ----
  function loadCountries() {
    if (!countries) {
      countries = fetch(DOTS_URL).then((res) => {
        if (!res.ok) throw new Error(`country dots: HTTP ${res.status}`);
        return res.json();
      }).then((json) => { countries = json; return json; }, (err) => { countries = null; throw err; });
    }
    return Promise.resolve(countries);
  }
  function loadWork(name) {
    if (!works[name]) {
      works[name] = fetch(workFile(name)).then((res) => {
        if (!res.ok) throw new Error(`${workFile(name)}: HTTP ${res.status}`);
        return res.text();
      }).then((html) => {
        const section = new DOMParser().parseFromString(html, 'text/html').querySelector('.cz-work');
        if (!section) throw new Error(`${workFile(name)}: no work section`);
        section.querySelectorAll('script').forEach((s) => s.remove());
        return section;
      }).catch((err) => { delete works[name]; throw err; });
    }
    return works[name];
  }
  // fetched ahead while the page is idle, so a pick starts at once
  const prefetch = () => {
    loadCountries().catch(() => {});
    Object.keys(CITIES).forEach((n) => loadWork(n).catch(() => {}));
  };
  if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 4000 });
  else setTimeout(prefetch, 2000);

  // ---- the work page and where each dot goes ----
  const parts = () => ({
    title: work.querySelector('.cz-title'),
    media: [...work.querySelectorAll('.cz-tile-media')],
    labels: [...work.querySelectorAll('.cz-tile-name, .cz-tile-tags, .cz-back')],
  });
  function mountWork(section) {
    work = document.importNode(section, true);
    work.hidden = false;
    work.querySelector('.cz-back').addEventListener('click', (e) => { e.preventDefault(); goBack(); });
    mount.replaceChildren(work);
  }
  function aimDots() {
    const { title, media } = parts();
    // the country's dots, northern ones first: they become the name, which sits at the top
    const src = countries[city].dots.map(([lat, lon]) => ({ lat, lon })).sort((a, b) => b.lat - a.lat || a.lon - b.lon);
    const fs = parseFloat(getComputedStyle(title).fontSize);
    const textGap = Math.max(4, fs / 26);
    let text = textTargets(title, textGap);
    const cap = src.length * 0.45;
    if (text.length > cap) text = text.filter((_, i) => i % Math.ceil(text.length / cap) === 0);
    const { out: tiles, gap } = tileTargets(media.map((m) => m.getBoundingClientRect()), src.length - text.length);
    // matched left to right within each group, so the dots stream instead of criss-crossing
    const textDots = src.slice(0, text.length).sort((a, b) => a.lon - b.lon);
    const tileDots = src.slice(text.length).sort((a, b) => a.lon - b.lon);
    text.sort((a, b) => a[0] - b[0]);
    tiles.sort((a, b) => a[0] - b[0]);
    const rText = Math.max(1.2, textGap * 0.38);
    const rTile = Math.max(1, gap * 0.32);
    dots = [
      ...textDots.map((d, i) => ({ ...d, tx: text[i][0], ty: text[i][1], r: rText })),
      ...tileDots.map((d, i) => {
        const t = tiles[Math.min(tiles.length - 1, Math.floor((i * tiles.length) / tileDots.length))] || [view.vw / 2, view.vh / 2];
        return { ...d, tx: t[0], ty: t[1], r: rTile };
      }),
    ].map((d, i) => ({ ...d, delay: hash(i + 1) * MAX_DELAY }));
  }

  // ---- the timeline ----
  // where the page's globe is right now, as a start for the zoom globe
  function startFrom() {
    const r = pageCanvas.getBoundingClientRect();
    const { phi, theta } = page.angles();
    return { phi, theta, scale: r.width / view.side, ox: r.left + r.width / 2 - view.vw / 2, oy: r.top + r.height / 2 - view.vh / 2 };
  }
  function countryFrame(name) {
    const [s, w, n, e] = countries[name].bounds;
    const mid = [(s + n) / 2, (w + e) / 2];
    const span = Math.max(n - s, (e - w) * Math.cos(mid[0] * RAD)) * RAD;
    const fit = Math.min(0.62 * view.vh, 0.86 * view.vw);
    return { mid, scale: fit / (0.4 * view.side * span) };
  }
  function build(name, from) {
    const { mid, scale } = countryFrame(name);
    const [p0, t0] = anglesFor(mid);
    const phi = p0 + TAU * Math.round((from.phi - p0) / TAU);   // the short way round
    const { title, media, labels } = parts();
    const t = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: render, onComplete: arrived, onReverseComplete: left });
    t.fromTo(S, { phi: from.phi, theta: from.theta }, { phi, theta: t0, duration: 0.9, ease: 'power2.inOut' }, 0)
      .fromTo(S, { ox: from.ox, oy: from.oy }, { ox: 0, oy: 0, duration: 1.5, ease: 'power2.inOut' }, 0.3)
      .fromTo(fadeOut, { opacity: 1 }, { opacity: 0, duration: 0.5 }, 0.3)
      .fromTo(S, { scale: from.scale }, { scale, duration: 1.3, ease: 'power2.in' }, 0.8)
      .fromTo(S, { denseAlpha: 0 }, { denseAlpha: 1, duration: 0.3 }, 1.75)
      .fromTo(S, { globeAlpha: 1 }, { globeAlpha: 0, duration: 0.3 }, 1.8)
      .fromTo(work, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 1.9)   // same colour as the section: no visible change
      .fromTo(S, { morph: 0 }, { morph: 1, duration: 1.6 }, 2.2)
      .fromTo(S, { solid: 0 }, { solid: 1, duration: 0.5 }, 3.7)
      .fromTo([title, ...media], { opacity: 0 }, { opacity: 1, duration: 0.5 }, 3.7)
      .fromTo(labels, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 3.9);
    return t;
  }

  // remote: the globe shrinks onto Earth's place in the solar system, which appears around it
  function buildRemote(from) {
    const e = solar.earth(0);
    const scale = e.r / (0.4 * view.side);
    const t = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: render, onComplete: arrived, onReverseComplete: left });
    t.fromTo(S, { theta: from.theta }, { theta: 0.35, duration: 1.4, ease: 'power2.inOut' }, 0)
      .fromTo(S, { scale: from.scale }, { scale, duration: 1.5, ease: 'power3.inOut' }, 0)
      .fromTo(S, { ox: from.ox, oy: from.oy }, { ox: e.x - view.vw / 2, oy: e.y - view.vh / 2, duration: 1.5, ease: 'power3.inOut' }, 0)
      .fromTo(fadeOutRemote, { opacity: 1 }, { opacity: 0, duration: 0.4 }, 0.2)
      .fromTo(S, { sun: 0 }, { sun: 1, duration: 0.6, ease: 'power2.out' }, 0.9)
      .fromTo(S, { rings: 0 }, { rings: 1, duration: 1.0 }, 1.0)
      .fromTo(S, { earth: 0 }, { earth: 1, duration: 0.25 }, 1.3)
      .fromTo(S, { globeAlpha: 1 }, { globeAlpha: 0, duration: 0.25 }, 1.4)   // cobe blurs when this small
      .fromTo(S, { planets: 0 }, { planets: 1, duration: 0.6 }, 1.4)
      // FRED. rises from behind the plane of the orbits, slow and heavy, then his eyes ignite
      .fromTo(S, { fred: 0 }, { fred: 1, duration: 2.2, ease: 'power2.inOut' }, 1.6)
      .fromTo(S, { eyes: 0 }, { eyes: 1, duration: 0.15 }, 3.5);   // then they breathe (solar-system.js)
    return t;
  }
  // remote at rest: the planets keep going round (paused for reduced motion)
  let lastTick = 0;
  function orbitTick(time) {
    const dt = lastTick ? Math.min(0.1, time - lastTick) : 0;
    lastTick = time;
    S.orbit += dt;
    drawDots();
  }
  function startOrbit() {
    if (isReduced()) return;
    lastTick = 0;
    gsap.ticker.add(orbitTick);
  }
  function stopOrbit() { gsap.ticker.remove(orbitTick); }

  function arrived() {
    if (!city) return;
    if (isRemote()) {
      root.dataset.cityZoom = REMOTE;
      if (dirty) rebuild();
      startOrbit();
      return;
    }
    root.dataset.cityZoom = 'work';
    if (dirty) rebuild();
    parts().title.focus({ preventScroll: true });
  }
  function left() {
    if (!city) return;
    if (tl) tl.kill();
    tl = null;
    stopOrbit();
    const wasRemote = isRemote();
    city = null;
    dots = [];
    Object.assign(S, SOLAR_START);
    drawDots();
    S.globeAlpha = 0;
    globeCanvas.style.opacity = '0';
    showGlobe(false);
    page.release();                             // its last frame is this frame: no jump
    gsap.set(wasRemote ? fadeOutRemote : fadeOut, { clearProps: 'opacity' });
    mount.replaceChildren();
    work = null;
    root.classList.remove('cz-open', 'cz-remote');
    root.dataset.cityZoom = 'off';
    const l = lenis();
    if (l) l.start();
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    const done = whenLeft;
    whenLeft = null;
    if (done) done();
  }
  let whenLeft = null;          // resolves the wait for the zoom to finish going back
  // after a resize: the same end state, measured again
  function rebuild() {
    dirty = false;
    measure();
    setGlobeDpr(view.dpr, true);
    if (tl) tl.kill();
    const from = startFrom();
    view.startScale = from.scale;
    if (isRemote()) {
      tl = buildRemote(from);
    } else {
      aimDots();
      tl = build(city, from);
    }
    tl.progress(1);
    drawDots();
  }

  async function play(name, { opener: from = null, push = true, instant = false } = {}) {
    if ((!CITIES[name] && name !== REMOTE) || busy) return false;
    if (city === name) return false;
    if (isRemote() && root.dataset.cityZoom === REMOTE && name !== REMOTE) {
      await new Promise((resolve) => { whenLeft = resolve; goBack(); });   // back to Earth first
    }
    if (city) return false;
    busy = true;
    let section = null;
    try {
      if (name === REMOTE) await solar.ready;
      else [section] = await Promise.all([loadWork(name), loadCountries()]);
    } catch (err) {
      busy = false;
      console.error('city zoom: could not load the city\'s page, opening it directly', err);
      location.assign(workAddress(name));      // the page itself still works without the zoom
      return false;
    }
    city = name;
    opener = from;
    home = location.pathname + location.search + location.hash;
    root.dataset.cityZoom = 'moving';
    const l = lenis();
    if (l) l.stop();
    root.classList.add('cz-open');              // shows the zoom's canvases (transparent so far)
    if (name === REMOTE) root.classList.add('cz-remote');   // the labels stay usable
    page.pause();                               // the page's globe holds still on its last frame
    measure();
    try {
      if (!globe) startGlobe(); else setGlobeDpr(view.dpr, true);
    } catch (err) {
      busy = false;
      if (name === REMOTE) {
        console.error('city zoom: WebGL refused the zoom globe; remote stays on the globe', err);
        city = null;
        root.classList.remove('cz-open', 'cz-remote');
        root.dataset.cityZoom = 'off';
        page.release();
        if (l) l.start();
        return false;
      }
      console.error('city zoom: WebGL refused the zoom globe, opening the page directly', err);
      location.assign(workAddress(name));
      return false;
    }
    Object.assign(S, startFrom(), { globeAlpha: 0, denseAlpha: 0, morph: 0, solid: 0 }, SOLAR_START);
    view.startScale = S.scale;
    // let the zoom globe draw a few frames while still invisible, then swap it for the page's
    // globe in one go (both show the same picture, so nothing moves)
    showGlobe(true);
    for (let i = 0; i < 3; i++) await nextFrame();
    S.globeAlpha = 1;
    globeCanvas.style.opacity = '1';
    page.hide();

    if (name === REMOTE) {
      tl = buildRemote({ ...S });
      if (push) history.pushState({ cz: REMOTE }, '', `${location.pathname}${location.search}#remote`);
    } else {
      mountWork(section);
      aimDots();
      tl = build(name, { ...S });
      if (push) history.pushState({ cz: name }, '', workAddress(name));
    }
    busy = false;
    if (instant || isReduced()) { tl.progress(1); arrived(); } else tl.play();
    return true;
  }

  function reverse() {
    if (!tl || busy) return;
    const wasResting = root.dataset.cityZoom === REMOTE;
    root.dataset.cityZoom = 'moving';
    stopOrbit();
    if (isReduced()) { tl.progress(0); left(); return; }
    // remote: the planets wind back to where they started, then the zoom plays in reverse
    if (wasResting && S.orbit > 0) {
      gsap.to(S, { orbit: 0, duration: Math.min(1.2, 0.4 + S.orbit / 30), ease: 'power2.inOut', onUpdate: drawDots, onComplete: () => tl && tl.reverse() });
    } else tl.reverse();
  }
  // our own history step: the browser's back plays it (popstate below); otherwise go back here
  function goBack() {
    if (history.state && history.state.cz === city && !history.state.entry) history.back();
    else { history.replaceState(null, '', (home || location.pathname).replace(/#remote$/, '#locations')); reverse(); }
  }

  addEventListener('popstate', (e) => {
    const want = e.state && e.state.cz;
    if (want && (CITIES[want] || want === REMOTE) && !city) play(want, { push: false });
    else if (!want && city) reverse();
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && city && (root.dataset.cityZoom === 'work' || root.dataset.cityZoom === REMOTE)) goBack();
  });
  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!city) { measure(); return; }
      if (root.dataset.cityZoom === 'work' || root.dataset.cityZoom === REMOTE) rebuild();
      else dirty = true;                        // finished by arrived(); a reverse ends at the page anyway
    }, 250);
  });

  // the city whose dot is under (x, y) on the page's globe, if any
  function cityAt(x, y) {
    const r = pageCanvas.getBoundingClientRect();
    const { phi, theta } = page.angles();
    for (const [name, [lat, lon]] of Object.entries(CITIES)) {
      const [sx, sy, sz] = projectOn(lat, lon, phi, theta, r.left + r.width / 2, r.top + r.height / 2, 0.4 * r.width);
      if (sz > 0.15 && Math.hypot(sx - x, sy - y) < NEAR_PX) return name;
    }
    return null;
  }

  // for checking frames in a test browser
  window.CZ = { S, play, reverse, cityAt, get tl() { return tl; }, get globe() { return globe; } };
  return { play, back: goBack, cityAt, current: () => city };
}
