// The solar system that "remote" zooms out to (design: remote-zoom-design.md, 2026-11-23): the sun,
// eight planets on dotted, tilted orbits and a huge FRED. peering over them like an angry god, his
// eyes burning (their own canvas, in real colour). Every other part is drawn in the
// same dots as the globe. It only draws; city-zoom.js animates the state it reads:
//   { sun, rings, planets, earth, fred, eyes } - each 0..1, how far that part has appeared
//   orbit                                      - seconds of orbiting since the zoom arrived
// The canvas it draws on flips white against the page (mix-blend-mode: difference), so white here
// comes out as the section's ink by day and by night.
const TAU = Math.PI * 2;
const TILT = 0.36;                             // how flat the orbits look (their height / width)
const FRED_URL = new URL('../v2/img/loader-icon.svg', import.meta.url);   // FRED.'s outline, 1434 square
const FRED_GRID = 64;                          // FRED.'s dots across his width
// FRED.'s eyes: Sunbeam Yellow (#FFEA00) dots with a glow around them. Yellow glow vanishes on
// white, so by day the glow runs hotter (amber) to read against the page.
const EYE = '#ffea00';
const GLOW = { night: 'rgba(255, 234, 0, A)', day: 'rgba(255, 128, 0, A)' };   // A: the alpha

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
  // the eyes are small: sampled finer so they read; each eye apart, with its middle and size
  const fine = step / 2;
  out.eyes = eyes.map((e) => {
    const dots = [];
    for (let y = fine / 2; y < side; y += fine) {
      for (let x = fine / 2; x < side; x += fine) if (g.isPointInPath(e, x, y)) dots.push([x / side, y / side]);
    }
    const us = dots.map((d) => d[0]), vs = dots.map((d) => d[1]);
    const mid = [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
    const size = Math.max(Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
    return { dots, mid, size };
  });
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
      vw, vh, cx: vw / 2, cy: vh * 0.62, rMax, sunR,
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

  // How much of FRED. shows at a point: he rises from behind the plane of the orbits, like a god
  // over his galaxy. Above the plane's far edge he shows fully; between its far and near edges he is
  // behind the plane (seen faintly through it); below its near edge, and below the plane's level
  // beside it, he is hidden.
  function behindPlane(x, y) {
    const Rx = L.rMax, Ry = L.rMax * TILT, dx = (x - L.cx) / Rx;
    if (Math.abs(dx) >= 1) return y < L.cy ? 1 : 0;
    return y < L.cy - Ry * Math.sqrt(1 - dx * dx) ? 1 : 0;   // only above the plane's far edge
  }
  // one soft round halo per mode, drawn once and stamped round every eye dot
  const sprites = {};
  function haloSprite(mode) {
    const key = GLOW[mode] ? mode : 'day';
    if (!sprites[key]) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, GLOW[key].replace('A', '1'));
      grad.addColorStop(1, GLOW[key].replace('A', '0'));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      sprites[key] = c;
    }
    return sprites[key];
  }
  const hash = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  // a heat-haze flicker: quick, uneven, never fully dark
  const flicker = (t) => 0.78 + 0.12 * Math.sin(t * 13.1) * Math.sin(t * 7.3) + 0.1 * Math.sin(t * 29.7 + Math.sin(t * 3.1) * 2);
  // FRED. peers over the plane of the orbits: only the top of his head and the top of his eyes
  // clear its far edge, like an angry god looming over his galaxy
  function drawFred(ctx, S, fx) {
    const H = Math.min(1.05 * L.vh, 1.1 * L.vw), W = H;   // his box is square
    const edge = L.cy - L.rMax * TILT;                     // the plane's far edge, straight above the sun
    const rest = edge - 0.33 * H;                          // his eyes' middle (0.22-0.40 of his box) on that edge
    const left = L.cx - W / 2, top = rest + (1 - S.fred) * 0.45 * H;
    const dot = (H / FRED_GRID) * 0.27;
    ctx.globalAlpha = 0.42 * Math.min(1, S.fred * 2);
    for (const [u, v] of fred.body) {
      const x = left + u * W, y = top + v * H;
      if (!behindPlane(x, y)) continue;
      ctx.beginPath();
      ctx.arc(x, y, dot, 0, TAU);
      ctx.fill();
    }
    if (S.eyes <= 0.01 || !fx.eyes) return;
    // The eyes burn. Everything is clipped to above the plane's far edge. Round each eye a haze
    // flickers; the eye's dots ripple sideways row by row, like air over heat, and a
    // few sparks rise off them and fade.
    const g = fx.eyes, t = fx.time;
    const a = S.eyes * flicker(t);
    g.save();
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(L.vw, 0);
    g.lineTo(L.vw, L.cy);
    for (let i = 0; i <= 64; i++) {             // the far edge, right to left
      const th = (i / 64) * Math.PI;
      g.lineTo(L.cx + L.rMax * Math.cos(th), L.cy - L.rMax * TILT * Math.sin(th));
    }
    g.lineTo(0, L.cy);
    g.closePath();
    g.clip();
    for (const eye of fred.eyes) {
      const ex = left + eye.mid[0] * W, ey = top + eye.mid[1] * H;
      // the haze follows the eye's own shape: a soft halo round every eye dot, reaching a dot and a
      // half (of FRED.'s dot spacing) past the eye's edge; the halos pile up, so it burns
      // strongest in the middle of the eye and fades out at the rim (Joel, 2026-11-23)
      const reach = 1.5 * (H / FRED_GRID);
      const sprite = haloSprite(fx.mode);
      g.globalCompositeOperation = 'lighter';
      for (const [u, v] of eye.dots) {
        const x = left + u * W, y = top + v * H;
        const centre = 1 - Math.min(1, Math.hypot(x - ex, y - ey) / (eye.size * H * 0.6));
        g.globalAlpha = (0.05 + 0.09 * centre) * a;
        g.drawImage(sprite, x - reach, y - reach, 2 * reach, 2 * reach);
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = EYE;
      const wob = dot * 0.7;
      eye.dots.forEach(([u, v], i) => {
        const h = hash(i + 1);
        let x = left + u * W + Math.sin(v * 140 - t * 11) * wob;   // a ripple running up the rows
        let y = top + v * H - Math.abs(Math.sin(t * 7 + u * 50 + h * 5)) * wob * 0.6;
        g.globalAlpha = a * (0.8 + 0.2 * Math.sin(t * 17 + h * 30));
        g.beginPath();
        g.arc(x, y, dot * 0.95, 0, TAU);
        g.fill();
        if (h < 0.1) {                          // a spark: rises about a tenth of his height, fading
          const k = (t * 0.7 + h * 11) % 1;
          x += Math.sin(t * 3 + h * 50) * wob * 3;
          y -= k * 0.1 * H;
          g.globalAlpha = a * (1 - k) * 0.8;
          g.beginPath();
          g.arc(x, y, dot * 0.55, 0, TAU);
          g.fill();
        }
      });
    }
    g.restore();
  }

  // fx: { mode: 'day' | 'night', eyes: the eyes' canvas context, time: seconds (0 = still) }
  function draw(ctx, S, fx) {
    if (!L) return;
    ctx.fillStyle = '#fff';
    if (fred && S.fred > 0.01) drawFred(ctx, S, fx);
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
