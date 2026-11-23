/* The loader (Figma 73:766 -> 191:363 -> the site), added 2026-11-20.
   The counter on the left counts 0 -> 100 while the blurred icon fades smoothly from frame 1
   (29% strength) to frame 2 (full Sunbeam Yellow). At 100 (no fades): the icon shrinks sharp into the
   bottom-right corner (Figma 203:14), the black panel rises into a strip across the top (203:6),
   and the strip closes into the hero's logo block, the icon landing in its cut-out (the site).
   The count takes at least MIN_MS; if the page has not finished loading by 90 it waits there
   for it (so it never claims "100" before the page is ready), up to MAX_MS.
   The page cannot scroll while it shows. Under reduced motion: no counting, it just fades out
   once the page has loaded. */
(function () {
  'use strict';
  const loader = document.querySelector('.loader');
  if (!loader) return;
  const icon = loader.querySelector('.loader-icon');
  const count = loader.querySelector('.loader-count');
  const MIN_MS = 2400, MAX_MS = 8000, HOLD_AT = 90;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  loader.classList.add('is-running');                          // the script runs: no CSS failsafe
  const lenis = window.WFM && window.WFM.lenis;
  if (lenis) lenis.stop();

  let loaded = document.readyState === 'complete';
  window.addEventListener('load', () => { loaded = true; }, { once: true });

  const ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;        // sine in-out, like the page's text
  const show = (n) => {
    count.textContent = String(Math.round(n));
    icon.style.opacity = String(0.29 + 0.71 * (n / 100));
  };
  // at 100: the icon morphs into the icon cut into the hero's logo block (top left; Figma frame 12).
  // The loader's icon is the same shape at 1434 square; in the logo it is 0.14575 of that, its box
  // at 246 / 102 in the block's own 491-wide units (Figma: the 209 icon frame at 236 + 10 / 102).
  // The steps are in finish() below (2026-11-20: no fading). Further down the page it lands on the
  // navbar's left element instead. Without GSAP or under reduced motion it just fades out.
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    show(100);
    const logo = document.querySelector('.logo-block');
    const gsap = window.gsap;
    const release = () => { loader.classList.add('is-done'); if (lenis) lenis.start(); };
    if (!gsap || reduced || !logo) { release(); return; }
    // where the icon sits in the block, in the block's 491-wide units: in the hero's block (Figma
    // frame 12: its box at 246 / 102, 209 square, cut by the block's bottom at 208) or, further down
    // the page, in the slim navbar it has become (Figma 63:394: 0.04523 of the loader's icon, its box
    // at 0 / 18, cut by the block's bottom at 50)
    const atTop = window.scrollY <= 5;
    const I = atTop ? { x: 246, y: 102, s: 209, bottom: 208 } : { x: 0, y: 18, s: 1434 * 0.04523, bottom: 50 };
    const box = logo.getBoundingClientRect(), k = box.width / 491;
    const size = I.s * k, w0 = icon.offsetWidth;
    const W = loader.clientWidth, H = loader.clientHeight;
    // the icon rides at the panel's bottom right: this far in from its right edge and this far
    // above its bottom edge, as in the logo (Figma 203:14 and 203:6 keep the same offsets)
    const fromRight = box.right - (box.left + (I.x + I.s) * k), fromBottom = (I.bottom - I.y) * k;
    const iconTo = (right, bottom) => ({ x: right - fromRight - size - icon.offsetLeft, y: bottom - fromBottom - icon.offsetTop });
    const inset = (top, right, bottom, left) => 'inset(' + [top, right, bottom, left].map((v) => Math.max(0, v) + 'px').join(' ') + ')';
    // no fades (2026-11-20), three moves:
    // 1. Figma 203:14: the icon sharpens and shrinks to its logo size in the bottom-right corner of
    //    the still-full black screen (cut off by the screen's bottom edge);
    // 2. Figma 203:6: the panel's bottom edge rises until it is a strip as tall as the logo block
    //    across the top, carrying the icon up (the panel is shrunk by its visible area, clip-path,
    //    which also trims the icon at its edge);
    // 3. one element only: the loader hands over to the logo block itself, stretched to that strip
    //    (its own shape made wider: the right-hand points of its outline, icon included, moved out
    //    to the screen's right edge), and the logo block narrows back to its own shape.
    loader.style.clipPath = inset(0, 0, 0, 0);
    const ease = 'power3.inOut';
    const path = logo.querySelector('path'), d0 = path.getAttribute('d'), vb0 = logo.getAttribute('viewBox');
    const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g, nums = d0.match(NUM).map(Number), parts = d0.split(NUM);
    // which numbers are widths (x): every number after H, the first of each pair after M / L / C
    const isX = []; { let cmd = '', i = 0;
      d0.replace(/([MLHVCZ])|(-?\d*\.?\d+(?:e-?\d+)?)/g, (m, c) => { if (c) { cmd = c; i = 0; } else { isX.push(cmd === 'H' || ((cmd === 'M' || cmd === 'L' || cmd === 'C') && i % 2 === 0)); i++; } return m; }); }
    const vbH = logo.viewBox.baseVal.height;
    const wide = (W - box.left) / k;                                  // strip width, block units
    const stretch = { w: wide };
    const drawStrip = () => {
      const dw = stretch.w - 491; let d = parts[0];
      nums.forEach((v, i) => { d += +(isX[i] && v > 245.5 ? v + dw : v).toFixed(3) + parts[i + 1]; });
      path.setAttribute('d', d);
      logo.setAttribute('viewBox', '0 0 ' + stretch.w.toFixed(3) + ' ' + vbH);
      logo.style.width = (stretch.w * k).toFixed(2) + 'px';
    };
    // the loader goes at the hand-over; the page may scroll only once the logo has its own shape back
    const handOver = () => { drawStrip(); loader.style.transition = 'none'; loader.classList.add('is-done'); };
    // hand the block back: the page redraws it for wherever it is now (2026-11-22: putting the
    // hero shape back left it stuck in that shape if the page had moved during the loader)
    const restore = () => {
      logo.style.width = '';
      if (window.V2 && window.V2.redrawLogo) window.V2.redrawLogo(); else { path.setAttribute('d', d0); logo.setAttribute('viewBox', vb0); }
      release();
    };
    gsap.timeline({ onComplete: restore })
      .to(icon, { ...iconTo(W, H), scale: size / w0, transformOrigin: '0 0', filter: 'blur(0px)', duration: 1, ease }, 0)
      .to(loader, { clipPath: inset(0, 0, H - box.bottom, 0), duration: 0.8, ease }, 1)
      .to(icon, { ...iconTo(W, box.bottom), duration: 0.8, ease }, 1)
      .call(handOver, null, 1.8)
      .to(stretch, { w: 491, duration: 0.8, ease, onUpdate: drawStrip }, 1.8);
  };

  if (reduced) {
    show(100);
    if (loaded) finish(); else window.addEventListener('load', finish, { once: true });
    setTimeout(finish, MAX_MS);
    return;
  }

  const t0 = performance.now();
  let raf = 0, n = 0, held = false;
  function tick(now) {
    const t = Math.min(1, (now - t0) / MIN_MS);
    const ready = loaded || now - t0 >= MAX_MS;
    const want = 100 * ease(t);
    const goal = ready ? want : Math.min(want, HOLD_AT);  // not loaded yet: hold at 90
    if (goal < want) held = true;
    // after a hold, count on from 90 at a steady pace instead of jumping
    n = held && goal - n > 1.2 ? n + 1.2 : Math.max(n, goal);
    show(n);
    if (n >= 100 - 1e-6) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }
  show(0);
  raf = requestAnimationFrame(tick);
})();
