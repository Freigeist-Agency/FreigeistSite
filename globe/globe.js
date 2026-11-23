// The /globe page's "locations." globe: /v2's globe.js (drag in every direction, "nbo" / "cgn"
// turn it to that city's dot, "remote" lets it spin again), drawn as dots only. It uses the
// self-hosted "dots only" build of cobe 0.6.3, which leaves everything but the land dots and the
// markers transparent, so the section's background and "locations." (behind the globe) show
// through. The dots are white and the globe flips colour (globe.css), so they come out black on
// the day background, white on the night one, and inverted over the letters. "day" / "night"
// only switch the background.
import createGlobe from '../js/vendor/cobe/0.6.3-dots/cobe.esm.js';
const canvas = document.getElementById("loc-canvas");
if (canvas) {
  const NAIROBI = [-1.2921, 36.8219], COLOGNE = [50.9375, 6.9603];
  const root = document.documentElement;
  let mode = 'day';
  // cobe's angles that bring a [latitude, longitude] to the front (from cobe's own examples)
  const anglesFor = ([lat, lon]) => [Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
  const TILT = 1.3;                                   // up/down limit, so it never flips over a pole
  let phi = 0;
  let theta = 0.15;
  let drag = null;                                    // { x, y, phi, theta } while a pointer drags
  let focus = null;                                   // [phi, theta] the globe is turning towards
  let hasFadedIn = false;
  let currentGlobe = null;
  let currentWidth = canvas.offsetWidth;
  const capDpr = () => Math.min(window.devicePixelRatio || 1, 2, 2048 / Math.max(canvas.offsetWidth, 1));
  const isReducedMotion = () => {
    const wfm = window.WFM;
    if (wfm && typeof wfm.reduced !== 'undefined') return !!wfm.reduced;
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  const initGlobe = () => {
    if (currentWidth === 0) {
      currentWidth = canvas.offsetWidth;
      setTimeout(initGlobe, 100);
      return;
    }
    // THE GPU FIX: cap the buffer at 2048px by lowering the pixel ratio, not cobe's width.
    // phenomenon sizes the buffer as clientWidth * devicePixelRatio; cobe centres the sphere
    // at width/2, so the two must match or the globe draws off-centre (left and low).
    const dpr = capDpr();
    const internalResolution = currentWidth * dpr;
    try {
      currentGlobe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: internalResolution,
        height: internalResolution,
        phi: 0,
        theta: 0.15,
        // the dots-only build draws no sphere or glow, so dark and glowColor have no effect
        dark: 0,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        // must be a number: left out, the shader gets NaN and some GPUs then draw no dots at all
        mapBaseBrightness: 0,
        baseColor: [1, 1, 1],
        markerColor: [1, 1, 1],
        glowColor: [0, 0, 0],
        markers: [
          { location: [-1.2921, 36.8219], size: 0.08 }, // Nairobi
          { location: [50.9375, 6.9603], size: 0.08 }   // Cologne
        ],
        onRender: (state) => {
          if (focus) {
            // ease towards the chosen city, the short way round
            let dPhi = (focus[0] - phi) % (2 * Math.PI);
            if (dPhi > Math.PI) dPhi -= 2 * Math.PI;
            if (dPhi < -Math.PI) dPhi += 2 * Math.PI;
            const k = isReducedMotion() ? 1 : 0.08;
            phi += dPhi * k;
            theta += (focus[1] - theta) * k;
          } else if (drag === null) {
            if (!isReducedMotion()) {
              phi += 0.003;
            }
          }
          state.phi = phi;
          state.theta = theta;
          // Always match the real drawing buffer (sized by phenomenon on resize)
          state.width = canvas.width;
          state.height = canvas.height;
          if (!hasFadedIn) {
            hasFadedIn = true;
            requestAnimationFrame(() => {
              canvas.style.opacity = "1";
            });
          }
        }
      });
      // Pause the loop while the canvas is off-screen. No hidden-tab pause: browsers already
      // stop requestAnimationFrame in a background tab, so the loop freezes and carries on by
      // itself on return. Pausing it by hand on visibilitychange is what left the globe stopped
      // (the observer never fires again if nothing scrolled), and resuming by hand can start a
      // second loop from the frame queued before the pause (2x speed). Resume is deferred one
      // frame for the same reason: phenomenon's toggle(true) calls render() immediately.
      if ('IntersectionObserver' in window) {
        let inView = false;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) inView = entry.isIntersecting;
          if (!currentGlobe) return;
          if (!inView) { currentGlobe.toggle(false); return; }
          requestAnimationFrame(() => { if (currentGlobe && inView) currentGlobe.toggle(true); });
        }, { rootMargin: '200px 0px' });
        observer.observe(canvas);
      }
    } catch (error) {
      console.error("🚨 WebGL Crash: The browser's graphics engine refused to draw the globe.", error);
    }
  };
  setTimeout(initGlobe, 150);
  // Registered before createGlobe, so it runs before phenomenon's own resize handler
  window.addEventListener("resize", () => {
    if (canvas.offsetWidth > 0) {
      currentWidth = canvas.offsetWidth;
      if (currentGlobe) currentGlobe.devicePixelRatio = capDpr();
    }
  });
  // --- Drag: sideways spins, up/down tilts (same 200 px per radian as the live globe) ---
  // Touch keeps vertical swipes for page scrolling (CSS touch-action: pan-y), so on a phone
  // a drag spins sideways; the labels still turn it to each city.
  const pressed = (btn) => document.querySelectorAll('.loc-place').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, phi, theta };
    focus = null;
    pressed(null);
  });
  window.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    phi = drag.phi + (e.clientX - drag.x) / 200;
    theta = Math.max(-TILT, Math.min(TILT, drag.theta + (e.clientY - drag.y) / 200));
  });
  window.addEventListener("pointerup", () => { drag = null; });
  window.addEventListener("pointercancel", () => { drag = null; });

  // --- Labels: turn to a city, or let it spin ---
  // cobe brings a city to the sphere's centre, but in this layout the centre is below the
  // screen. So the globe tilts further, putting the city in the middle of the part of the
  // sphere that is on screen (worked out from the canvas's on-screen box at click time;
  // cobe's sphere spans ~76% of its canvas).
  const showCity = (city) => {
    const [cPhi, cTheta] = anglesFor(city);
    const q = canvas.getBoundingClientRect();
    const r = q.width * 0.38, cy = q.top + q.height / 2;
    const top = Math.max(q.top + q.height / 2 - r, 0);
    const bottom = Math.min(cy + r, window.innerHeight);
    const targetY = (top + bottom) / 2;
    const lift = Math.asin(Math.max(-0.95, Math.min(0.95, (cy - targetY) / r)));
    return [cPhi, Math.max(-TILT, Math.min(TILT, cTheta - lift))];
  };
  // --- The info lines follow the chosen location (placeholders until the real details) ---
  const INFO = {
    remote: { address: 'remote address', hours: 'remote opening hours', mail: 'sema@freigeist.agency' },
    nbo: { address: 'nairobi address', hours: 'nairobi opening hours', mail: 'sema@freigeist.agency' },
    cgn: { address: 'cologne address', hours: 'cologne opening hours', mail: 'sema@freigeist.agency' },
  };
  const info = document.querySelector('.loc-info');
  let swapTimer;
  const showInfo = (key) => {
    if (!info) return;
    const d = INFO[key];
    const fill = () => {
      info.querySelector('.li-address').textContent = d.address;
      info.querySelector('.li-hours').textContent = d.hours;
      const mail = info.querySelector('.li-mail');
      mail.textContent = d.mail;
      mail.href = 'mailto:' + d.mail;
    };
    clearTimeout(swapTimer);
    if (isReducedMotion()) { fill(); return; }
    info.classList.add('is-swapping');                 // fade out (0.2s, CSS), swap, fade in
    swapTimer = setTimeout(() => { fill(); info.classList.remove('is-swapping'); }, 200);
  };

  const on = (sel, fn) => { const b = document.querySelector(sel); if (b) b.addEventListener("click", () => { fn(); pressed(b); }); };
  on('.loc-nbo', () => { focus = showCity(NAIROBI); showInfo('nbo'); });
  on('.loc-cgn', () => { focus = showCity(COLOGNE); showInfo('cgn'); });
  on('.loc-remote', () => { focus = null; showInfo('remote'); });

  // --- day / night: one switch; the background follows the attribute on <html> (globe.css) ---
  const modeBtn = document.querySelector('.loc-mode');
  const setMode = (next) => {
    mode = next;
    root.dataset.globeMode = next;
    if (modeBtn) modeBtn.setAttribute('aria-checked', String(next === 'night'));
  };
  root.dataset.globeMode = mode;
  if (modeBtn) modeBtn.addEventListener('click', () => setMode(mode === 'day' ? 'night' : 'day'));
}
