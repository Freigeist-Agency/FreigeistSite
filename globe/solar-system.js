// The solar system that "remote" zooms out to (design: remote-zoom-design.md, 2026-11-23): the sun,
// eight planets on dotted, tilted orbits and a huge FRED. behind it all, every part drawn in the
// same dots as the globe. It only draws; city-zoom.js animates the state it reads:
//   { sun, rings, planets, earth, fred, eyes } - each 0..1, how far that part has appeared
//   orbit                                      - seconds of orbiting since the zoom arrived
// The canvas it draws on flips white against the page (mix-blend-mode: difference), so white here
// comes out as the section's ink by day and by night.
const TAU = Math.PI * 2;
const TILT = 0.36;                             // how flat the orbits look (their height / width)
const FRED_URL = new URL('../v2/img/loader-icon.svg', import.meta.url);   // FRED.'s outline, 1434 square
const FRED_GRID = 64;                          // FRED.'s dots across his width
// Sunbeam Yellow (#FFEA00) after the canvas's flip: drawn as itself on the night background, as its
// complement on the day one (white minus yellow), so his eyes always come out yellow
const EYES = { night: '#ffea00', day: '#0015ff' };

// stylised, not to scale: size (of the largest orbit), where each starts (angle) and how fast it goes
const PLANETS = [
  { size: 0.011, start: 0.4 },              // mercury
  { size: 0.018, start: 2.3 },              // venus
  { size: 0.021, start: 1.15, earth: true },// earth: front right, where the globe lands
  { size: 0.015, start: 3.7 },              // mars
  { size: 0.052, start: 5.2 },              // jupiter
  { size: 0.044, start: 0.15, ring: true }, // saturn
  { size: 0.029, start: 2.75 },             // uranus
  { size: 0.028, start: 4.3 },              // neptune
];

const clamp01 = (v) => Math.min(1, Math.max(0, v));

// FRED.'s dots, in his own 0..1 box: the body (outer outline filled in) and the eyes, apart
async function loadFred() {
  const res = await fetch(FRED_URL);
  if (!res.ok) throw new Error(`FRED.: HTTP ${res.status}`);
  const svg = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const ds = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'));
  if (ds.length < 3) throw new Error('FRED.: unexpected outline');
  const body = new Path2D(ds[0].slice(0, ds[0].indexOf('Z') + 1));   // the outer edge only: a silhouette
  const eyes = ds.slice(1).map((d) => new Path2D(d));
  const g = document.createElement('canvas').getContext('2d');
  const side = 1434, step = side / FRED_GRID;
  const out = { body: [], eyes: [] };
  for (let row = 0, y = step / 2; y < side; y += step, row++) {
    for (let x = step / 2 + (row % 2) * (step / 2); x < side; x += step) {   // staggered, like the globe
      if (!eyes.some((e) => g.isPointInPath(e, x, y)) && g.isPointInPath(body, x, y)) out.body.push([x / side, y / side]);
    }
  }
  // the eyes are small: sampled finer so they read
  const fine = step / 2;
  for (let y = fine / 2; y < side; y += fine) {
    for (let x = fine / 2; x < side; x += fine) {
      if (eyes.some((e) => g.isPointInPath(e, x, y))) out.eyes.push([x / side, y / side]);
    }
  }
  return out;
}

export function createSolarSystem() {
  let fred = null;
  const ready = loadFred().then((f) => { fred = f; }, (err) => { console.error('remote zoom: FRED. could not load', err); });
  let L = null;                                // the layout for the current screen

  function layout(vw, vh) {
    const rMax = 0.46 * Math.min(vw, vh * 2);
    const sunR = Math.max(12, 0.085 * rMax);
    const inner = sunR * 2.3;
    L = {
      vw, vh, cx: vw / 2, cy: vh * 0.56, rMax, sunR,
      planets: PLANETS.map((p, i) => {
        const R = inner + Math.pow(i / (PLANETS.length - 1), 0.85) * (rMax - inner);
        return { ...p, R, r: Math.max(3, p.size * rMax), speed: 0.06 / Math.pow(R / rMax, 1.5) };
      }),
    };
    return L;
  }
  const angleOf = (p, orbit) => p.start + p.speed * orbit;
  const placeOf = (p, orbit) => {
    const a = angleOf(p, orbit);
    return { x: L.cx + p.R * Math.cos(a), y: L.cy + p.R * TILT * Math.sin(a), front: Math.sin(a) >= 0 };
  };
  // where Earth is (and how big): the zoom-out lands the globe there
  function earth(orbit = 0) {
    const p = L.planets.find((q) => q.earth);
    const { x, y } = placeOf(p, orbit);
    return { x, y, r: p.r };
  }

  // a disc of dots, lit from the sun's side (the sun itself shines all over)
  function ball(ctx, x, y, r, alpha, shaded = true) {
    if (alpha <= 0.01) return;
    const g = Math.max(2.2, r / 5);
    const dot = g * 0.4;
    const rr = (r - dot * 0.5) ** 2;
    const dx = L.cx - x, dy = L.cy - y, dl = Math.hypot(dx, dy) || 1;
    const rowH = g * 0.866;                     // staggered rows, like the globe's dots
    for (let row = Math.floor(-r / rowH), j = row * rowH; j <= r; row++, j += rowH) {
      for (let i = -r + (Math.abs(row) % 2) * (g / 2); i <= r; i += g) {
        if (i * i + j * j > rr) continue;
        const lit = shaded ? 0.55 + 0.45 * ((i * dx + j * dy) / (dl * r)) : 1;   // brighter towards the sun
        ctx.globalAlpha = alpha * lit;
        ctx.beginPath();
        ctx.arc(x + i, y + j, dot, 0, TAU);
        ctx.fill();
      }
    }
  }
  function ring(ctx, cx, cy, R, k, share, alpha, gap = 7, dot = 0.8) {
    if (alpha <= 0.01 || share <= 0) return;
    const n = Math.max(12, Math.ceil((TAU * R) / gap));
    const shown = Math.floor(n * share);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < shown; i++) {
      const a = Math.PI / 2 + (i / n) * TAU;  // draws outwards from the front
      ctx.beginPath();
      ctx.arc(cx + R * Math.cos(a), cy + R * k * Math.sin(a), dot, 0, TAU);
      ctx.fill();
    }
  }
  function planet(ctx, p, S) {
    const { x, y } = placeOf(p, S.orbit);
    const a = p.earth ? S.earth : S.planets;
    if (p.ring) ring(ctx, x, y, p.r * 2.1, 0.3, 1, a * 0.8, 2.4, 0.6);
    ball(ctx, x, y, p.r, a);
  }

  function draw(ctx, S, mode) {
    if (!L) return;
    ctx.fillStyle = '#fff';
    // FRED., huge and faint behind it all, rising a little as he appears
    if (fred && S.fred > 0.01) {
      const H = Math.min(0.9 * L.vh, 0.95 * L.vw), W = H;   // his box is square: phones fit his width
      const left = L.cx - W / 2, top = (L.vh - H) / 2 + (1 - S.fred) * 0.06 * L.vh;
      const dot = (H / FRED_GRID) * 0.26;
      ctx.globalAlpha = 0.3 * S.fred;
      for (const [u, v] of fred.body) {
        ctx.beginPath();
        ctx.arc(left + u * W, top + v * H, dot, 0, TAU);
        ctx.fill();
      }
      if (S.eyes > 0.01) {
        ctx.fillStyle = EYES[mode] || EYES.day;
        ctx.globalAlpha = S.eyes;
        for (const [u, v] of fred.eyes) {
          ctx.beginPath();
          ctx.arc(left + u * W, top + v * H, dot * 0.9, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#fff';
      }
    }
    // the orbits, each drawn round from the front, the inner ones first
    L.planets.forEach((p, i) => ring(ctx, L.cx, L.cy, p.R, TILT, clamp01(S.rings * 1.6 - i * 0.08), 0.4));
    // the far side of the orbits, then the sun, then the near side
    for (const p of L.planets) if (!placeOf(p, S.orbit).front) planet(ctx, p, S);
    ball(ctx, L.cx, L.cy, L.sunR * S.sun, S.sun, false);
    for (const p of L.planets) if (placeOf(p, S.orbit).front) planet(ctx, p, S);
    ctx.globalAlpha = 1;
  }

  return { ready, layout, earth, draw };
}
