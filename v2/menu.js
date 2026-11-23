/* The menu (Figma 1:3), added 2026-11-20.
   - The "menu." button opens it: the black panel comes down from the top and pushes the whole
     page down by its height (CSS: html.menu-open moves .menu and .stage together). "exit.",
     Escape, or the button again closes it.
   - While it is open the page does not scroll; scrolling (wheel, touch swipe, arrow keys)
     moves the row of page previews instead, in an endless loop. The preview in the middle is
     the big one (360 x 211), the others 175 x 103, 10 apart (Figma spacing); the name under
     the middle shows which page it is.
   - Clicking a side preview brings it to the middle; clicking the middle one closes the menu
     and scrolls to that part of the page (until the separate pages exist).
   Measured on open and on resize only; the animation loop runs only while the row moves. */
(function () {
  'use strict';
  const html = document.documentElement;
  const btn = document.querySelector('.menu-btn');
  const menu = document.getElementById('site-menu');
  if (!btn || !menu) return;
  const exit = menu.querySelector('.m-exit');
  const slider = menu.querySelector('.m-slider');
  const nameEl = menu.querySelector('.m-name');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // placeholder previews: page name and the frame of this page it jumps to for now
  const PAGES = [
    ['home', '12'], ['portfolio', 'project'], ['services', 'examine'],
    ['about', 'about'], ['locations', 'locations'], ['contact', 'final'],
  ];

  // Figma sizes, in frame units (x --u)
  const SMALL_W = 175, SMALL_H = 103, BIG_W = 360, BIG_H = 211, PITCH = 185, PUSH = 92.5;
  const SMALL_CY = 186 + SMALL_H / 2, BIG_CY = 125 + BIG_H / 2;

  // su: the cards are sized from the panel's width, so every screen shows Figma's row (three small
  // cards each side of the big one, 20 from the edges at 1512); their height in the panel stays on u
  let u = 1, su = 1, W = 0, H = 461, cards = [];
  let offset = 0, target = 0, raf = 0, idle = 0;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:calc(1000 * var(--u));height:0';
  document.body.appendChild(probe);

  // enough cards to cover the screen plus one spare on each side, a whole number of page lists
  function layout() {
    u = probe.offsetWidth / 1000;
    W = menu.clientWidth;
    H = menu.clientHeight;
    su = W / 1512;
    const need = Math.ceil(W / (PITCH * su)) + 4;
    const n = Math.ceil(need / PAGES.length) * PAGES.length;
    if (n !== cards.length) {
      slider.textContent = '';
      cards = [];
      for (let i = 0; i < n; i++) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'm-card';
        const page = PAGES[i % PAGES.length][0];
        c.setAttribute('aria-label', page);
        c.addEventListener('click', () => clickCard(i));
        slider.appendChild(c);
        cards.push(c);
      }
    }
    // phones and tablets (2026-11-22): the page name sits just under the big card in the middle
    // instead of on the bottom row (desktop keeps the CSS spot, on the "menu." / "exit." line)
    if (matchMedia('(max-width: 1023px)').matches) {
      const bigBottom = (BIG_CY / 461) * H + (BIG_H * su) / 2;
      nameEl.style.top = (bigBottom + 6).toFixed(1) + 'px';
    } else {
      nameEl.style.top = '';
    }
    render();
  }

  // a card's place in slots from the middle, wrapped so the row has no ends
  const slotOf = (i) => {
    const n = cards.length;
    return ((((i - offset) % n) + n + n / 2) % n) - n / 2;
  };
  function render() {
    const cx = W / 2;
    cards.forEach((c, i) => {
      const p = slotOf(i), a = Math.abs(p);
      const f = Math.max(0, 1 - a);                     // 1 in the middle, 0 one slot away
      const x = cx + (p * PITCH + Math.sign(p) * Math.min(a, 1) * PUSH) * su;
      const w = SMALL_W + (BIG_W - SMALL_W) * f, h = SMALL_H + (BIG_H - SMALL_H) * f;
      // the same share of the panel's height as in Figma (461 high), so a taller panel keeps them centred
      const y = ((SMALL_CY + (BIG_CY - SMALL_CY) * f) / 461) * H;
      c.style.transform = `translate(${x - (BIG_W * u) / 2}px, ${y - (BIG_H * u) / 2}px) scale(${(w * su) / (BIG_W * u)}, ${(h * su) / (BIG_H * u)})`;
      c.tabIndex = a < 0.5 ? 0 : -1;
    });
    const mid = ((Math.round(offset) % PAGES.length) + PAGES.length) % PAGES.length;
    if (nameEl.textContent !== PAGES[mid][0]) nameEl.textContent = PAGES[mid][0];
  }

  // the loop: eases the row towards its target, stops itself when it gets there
  function tick() {
    const d = target - offset;
    offset = Math.abs(d) < 0.0005 || reduced ? target : offset + d * 0.12;
    render();
    raf = offset === target ? 0 : requestAnimationFrame(tick);
  }
  const go = () => { if (!raf) raf = requestAnimationFrame(tick); };
  // after the input pauses, settle with a whole preview in the middle
  const settle = () => { clearTimeout(idle); idle = setTimeout(() => { target = Math.round(target); go(); }, 160); };
  const moveBy = (slots) => { target += slots; go(); settle(); };

  function clickCard(i) {
    const p = slotOf(i);
    if (Math.abs(p) >= 0.5) { target = Math.round(offset + p); clearTimeout(idle); go(); return; }
    const frame = window.V2 && window.V2.frames && window.V2.frames[PAGES[i % PAGES.length][1]];
    close();
    if (frame !== undefined) {
      const lenis = window.WFM && window.WFM.lenis;
      setTimeout(() => (lenis ? lenis.scrollTo(frame, { duration: 1.2 }) : window.scrollTo(0, frame)), reduced ? 0 : 900);
    }
  }

  // ---- input while open: wheel, touch swipe, arrow keys ----
  const onWheel = (e) => {
    e.preventDefault();
    const px = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? window.innerHeight : 1;   // lines / pages -> px
    moveBy((px * scale) / (PITCH * su));
  };
  let touch = null;
  const onTouchStart = (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; };
  const onTouchMove = (e) => {
    if (!touch) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = touch.x - t.clientX, dy = touch.y - t.clientY;
    touch = { x: t.clientX, y: t.clientY };
    moveBy((Math.abs(dx) > Math.abs(dy) ? dx : dy) / (PITCH * su));
  };
  const onTouchEnd = () => { touch = null; };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); target = Math.round(target) + 1; go(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); target = Math.round(target) - 1; go(); }
  };

  function open() {
    if (html.classList.contains('menu-open')) return;
    layout();
    html.classList.add('menu-open');
    menu.inert = false;
    btn.setAttribute('aria-expanded', 'true');
    const lenis = window.WFM && window.WFM.lenis;
    if (lenis) lenis.stop();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('keydown', onKey);
    exit.focus({ preventScroll: true });
  }
  function close() {
    if (!html.classList.contains('menu-open')) return;
    html.classList.remove('menu-open');
    menu.inert = true;
    btn.setAttribute('aria-expanded', 'false');
    const lenis = window.WFM && window.WFM.lenis;
    if (lenis) lenis.start();
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(idle);
    target = offset = Math.round(target);
    btn.focus({ preventScroll: true });
  }

  btn.addEventListener('click', () => (html.classList.contains('menu-open') ? close() : open()));
  exit.addEventListener('click', close);
  // the screen size changes the scale: measure again (not while scrolling)
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(layout, 100); });
  layout();
})();
