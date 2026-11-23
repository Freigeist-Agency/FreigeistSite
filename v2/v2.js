// Freigeist v2 motion. One Figma frame = one screen: the stage is fixed, and scrolling moves
// it from one frame to the next. Distances are Figma pixels times u (see v2.css).
(() => {
  if (!window.gsap || !window.ScrollTrigger) return;   // fail open: the page scrolls as a static layout

  // ---- base setup (webflow-motion Tier 0) ----
  gsap.registerPlugin(ScrollTrigger);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // fine: a mouse (FRED, the ghost cursor in fred.js, reads it, as on the live homepage)
  window.WFM = { reduced, fine: matchMedia('(pointer: fine)').matches, lenis: null };
  let rt; window.WFM.refresh = () => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); };
  addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());

  const video = document.querySelector('.bg-video');
  if (reduced) {                       // no moving background, no frame choreography
    if (video) { video.removeAttribute('autoplay'); video.pause(); }
    return;
  }

  if (window.Lenis) {
    const lenis = new Lenis({ syncTouch: false });   // touch keeps the phone's own scrolling
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.WFM.lenis = lenis;
  }

  document.documentElement.classList.add('motion');

  // Read u and the screen height from the CSS itself, so JS and CSS can never disagree.
  // Measured once per build, never inside an animation frame. 100svh (not innerHeight) so the
  // phone URL bar sliding in and out does not count as a size change.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;width:calc(1000 * var(--u));height:100svh';
  document.body.appendChild(probe);
  const measure = () => {
    const u = probe.offsetWidth / 1000, vh = probe.offsetHeight;
    return { u, vh, oy: Math.max(0, (vh - 982 * u) / 2) };
  };

  const space = document.querySelector('.scroll-space');
  const we = ['.we-word', '.we-list'];
  // the featured projects; read again on every build, since "show more" adds cards (2026-11-22)
  let projs, names, tags;
  const readProjects = () => {
    projs = [...document.querySelectorAll('.proj')];
    names = [...document.querySelectorAll('.proj-name')];
    tags = [...document.querySelectorAll('.proj-tags')];
  };
  readProjects();

  // Where a project sits, in Figma pixels, n places from the one in focus:
  // n = 0 is the big card; n > 0 the strips below (coming), n < 0 the strips above (seen).
  // Each project is a full card; a strip is a 13-high slice through the card's middle, cut
  // to the strip width, moved to its strip spot. Same numbers as the .proj rules in v2.css.
  const PROJ = {
    big:   { x: 206, y: 168, w: 1105, h: 642, stripX: 392, stripW: 729, below: 823 },   // Figma 138:215 / 140:364
    small: { x: 20,  y: 168, w: 780,  h: 453, stripX: 20,  stripW: 780, below: 720 },   // phone layout
  };
  const STRIP_H = 13, PITCH = 26;
  function projState(n, P, u) {
    if (n === 0) return { clipPath: 'inset(0px 0px 0px 0px)', y: 0 };
    const top = (P.h - STRIP_H) / 2;                                // slice through the middle
    const left = P.stripX - P.x, right = (P.x + P.w) - (P.stripX + P.stripW);
    const stripY = n > 0 ? P.below + PITCH * (n - 1)                // below: first 13 under the card
                         : P.y - PITCH * -n;                        // above: 26 apart, nearest first
    return { clipPath: `inset(${top * u}px ${right * u}px ${top * u}px ${left * u}px)`, y: (stripY - P.y - top) * u };
  }
  const track = document.querySelector('.featured-track');
  const firstCopy = track.querySelector('.featured-copy');
  let tl, marquee, ctaPlay, endPlay, stPlay, osPlay, wsPlay, wsLive, wsBgPlays = [], stepPlays = [], projPlays = [];
  const stVid = document.querySelector('.st-vid');
  const stepVideos = [...document.querySelectorAll('.step-video')];
  const ctaVideo = document.querySelector('.cta-video video');
  const endVideo = document.querySelector('.end-video');

  // "featured work." endless carousel, left to right. Enough copies to cover the screen plus
  // one, and the track slides from -1 copy to 0 and repeats, so the seam is never seen.
  // Speed: 120 Figma pixels a second, so it scales with the screen like everything else.
  function buildMarquee(u, W) {
    if (marquee) marquee.kill();
    track.querySelectorAll('.featured-copy:not(:first-child)').forEach((c) => c.remove());
    const copyW = firstCopy.offsetWidth;                            // measured once per build
    const copies = Math.ceil(W / copyW) + 1;
    for (let i = 0; i < copies; i++) track.appendChild(firstCopy.cloneNode(true));
    marquee = gsap.fromTo(track, { x: -copyW }, { x: 0, duration: copyW / (120 * u), ease: 'none', repeat: -1 });
  }

  // ---- The hero's logo block -> the navbar's left element (Figma frame 12 -> Nav 63:394) ----
  // Both shapes are the same outline (a white block with the icon cut in at the bottom), only
  // shorter in the nav: 491 x 208 -> 491 x 50, the icon smaller and at the left. Their paths have
  // the same commands, number for number, so the morph eases every number from one to the
  // other; the block also moves from its hero spot (-10) to the screen's edge (0).
  const LOGO_NAV = 'M491 50H62.6738L60.5615 28.0742L60.5254 27.6943L60.249 27.4365L50.6318 18.4453L50.1553 18L49.4854 18.1631L27.4043 23.5283L26.8457 23.6641L26.5068 24.2354L11.2227 50H0V0H491V50ZM58.6934 28.5869C58.7739 30.6143 59.1595 40.3198 59.5439 50H17.9385L28.7334 26.0488C29.9322 25.743 48.3271 21.0498 49.4717 20.7578C50.3781 21.5273 58.1634 28.137 58.6934 28.5869ZM48.1455 43.7949L55.5469 40.8955V35.376L48.1455 43.7949ZM32.8896 38.6484L44.6562 43.418L34.8105 31.9072L32.8896 38.6484Z';
  const logoSvg = document.querySelector('.logo-block');
  const logoPath = logoSvg.querySelector('path');
  const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g;
  const LOGO_HERO = logoPath.getAttribute('d');
  const logoHero = LOGO_HERO.match(NUM).map(Number), logoB = LOGO_NAV.match(NUM).map(Number);
  // which of the path's numbers are heights (y): pairs after M / L / C, every number after V
  const logoIsY = (() => {
    const mask = []; let cmd = '', k = 0;
    LOGO_HERO.replace(/([MLHVCZ])|(-?d*.?d+(?:e-?d+)?)/g, (m, c, num) => {
      if (c) { cmd = c; k = 0; return m; }
      mask.push(cmd === 'V' || ((cmd === 'M' || cmd === 'L' || cmd === 'C') && k % 2 === 1)); k++; return m;
    });
    return mask;
  })();
  // The block's starting height in its 491-wide units (Figma: 208). setLogoStart can make it taller
  // with its top edge kept and the icon still cut into its bottom edge.
  let logoH0 = 208, logoA = logoHero;
  const setLogoStart = (h0) => { logoH0 = h0; logoA = logoHero.map((v, i) => (logoIsY[i] && v !== 0 ? v + h0 - 208 : v)); };
  const logoParts = logoPath.getAttribute('d').split(NUM);           // the commands between the numbers
  const logoMorph = { t: 0 };
  let lastLogoT = -1, logoW = 491, logoLeft = 0;                                   // logoW: measured in build()
  function drawLogo() {
    const t = logoMorph.t;
    if (t === lastLogoT) return;
    lastLogoT = t;
    let d = logoParts[0];
    for (let i = 0; i < logoA.length; i++) d += +(logoA[i] + (logoB[i] - logoA[i]) * t).toFixed(3) + logoParts[i + 1];
    logoPath.setAttribute('d', d);
    logoSvg.setAttribute('viewBox', `0 0 491 ${(logoH0 + (50 - logoH0) * t).toFixed(3)}`);
    logoSvg.style.transform = t ? `translateX(${-logoLeft * t}px)` : '';   // from its hero spot to the screen's edge
  }

  // ---- The brand guidelines' line elements (2026-11-20) ----
  // Thin lines in the background of the white sections (under every video, box and word; first
  // in the stage), as in the brand guidelines: long diagonals that bounce
  // off the screen's sides and big arcs. They are laid out along the whole scroll (y = scroll
  // position), so a line simply runs on from one section into the next and is never cut at a
  // section's edge; the layer shows the slice of that long strip at the current scroll (its
  // viewBox moves with the scroll). Each line draws itself in just ahead of the bottom of the
  // screen as you scroll down, and undraws scrolling back up. They start once the hero video has
  // shrunk away, step aside while the statement video fills the screen, and end under the
  // closing video. Built once per build; per frame only attributes change, nothing is measured.
  const linesSvg = document.querySelector('.lines');
  const SVGNS = 'http://www.w3.org/2000/svg';
  // Each line moves at its own speed (2026-11-22, "more dynamic"): a line with speed s sits in a
  // strip that slides s pixels per pixel scrolled, so some drift slower than the page and some
  // run faster, and they slide past one another. Each line's drawing is timed to its own speed,
  // so its tip still sits 85% down the screen, every line starts drawing as the hero video starts
  // to shrink (startScroll), and every line's far end stays under the rising footer.
  function buildLines({ W, vh, u, small, total, startScroll, endScroll, hideFrom, hideTo }) {
    if (!linesSvg) return;
    linesSvg.textContent = '';
    linesSvg.setAttribute('viewBox', `0 0 ${W} ${vh}`);
    gsap.set(linesSvg, { opacity: 1 });
    const lead = 0.85 * vh;                      // the drawn tip sits 85% down the screen
    const groups = [];                           // [group, speed]
    // d is in the line's own strip (y = s x scroll + screen y); start / end are scroll positions
    const add = (d, len, start, end, s) => {
      const g = document.createElementNS(SVGNS, 'g');
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      p.style.strokeDasharray = `${len} ${len + 4}`;
      p.style.strokeDashoffset = String(len + 2);                    // nothing drawn yet (no cap dot)
      g.appendChild(p);
      linesSvg.appendChild(g);
      groups.push([g, s]);
      // nothing may run past the end of the scroll: the timeline would grow longer than the
      // scroll and every animation would drift ahead of it. A line still drawing at the end
      // (under the footer by then) stops where it has got to.
      const stop = Math.min(end, total);
      if (stop <= start) return;                 // starts after the end: never seen
      const offsetAtStop = (len + 2) * (1 - (stop - start) / (end - start));
      tl.fromTo(p, { strokeDashoffset: len + 2 }, { strokeDashoffset: offsetAtStop, duration: stop - start, immediateRender: false }, start);
    };
    // diagonals at a fixed slant, bouncing from side to side down to the end. No line starts or
    // turns on the page (2026-11-22): each starts just beyond a side of the screen and bounces
    // just beyond the sides, so only lines passing through are ever seen.
    const OUT = 30;                              // px beyond the screen's sides
    const bounce = (goingRight, rise, s) => {    // rise: strip length it takes to cross the screen once
      const span = W + 2 * OUT, m = span / rise; // sideways per unit down
      const from = s * startScroll + lead, to = s * endScroll + 1.5 * vh;
      let x = goingRight ? -OUT : W + OUT, y = from, dir = goingRight ? 1 : -1, d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      while (y < to) {                           // the last stretch also runs on to a side, so the
        const toWall = dir > 0 ? W + OUT - x : x + OUT;               // line ends off the page too
        const dy = toWall / m;
        x += dir * dy * m; y += dy; d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        dir = -dir;
      }
      const len = (y - from) * Math.sqrt(1 + m * m);                 // the slant never changes
      add(d, len, startScroll, (y - lead) / s, s);
    };
    bounce(true, (small ? 1.7 : 1.5) * vh, 0.75);                    // drifts behind the page
    bounce(false, (small ? 3.1 : 2.6) * vh, 1.3);                    // runs ahead of it
    // arcs: big circles centred beyond a side of the screen, alternating sides, one every ~2.4
    // screens of scroll, each at its own speed; only the half facing into the screen is drawn
    const R = small ? 1.15 * W : 0.95 * Math.max(W, vh);
    const ARC_SPEEDS = [0.6, 1.15, 0.85, 1.4, 1];
    for (let S = startScroll, k = 0; S < endScroll; S += 2.4 * vh, k++) {   // S: scroll where it starts
      const s = ARC_SPEEDS[k % ARC_SPEEDS.length];
      const top = s * S + lead, cy = top + R;
      const left = k % 2 === 0, cx = left ? -0.35 * W : 1.35 * W;
      const d = `M${cx.toFixed(1)} ${top.toFixed(1)}A${R.toFixed(1)} ${R.toFixed(1)} 0 0 ${left ? 1 : 0} ${cx.toFixed(1)} ${(cy + R).toFixed(1)}`;
      add(d, Math.PI * R, S, (cy + R - lead) / s, s);
    }
    // the layer shows the slice at the current scroll; each line's strip is shifted so it slides
    // at its own speed (screen y = strip y - s x scroll). Steps aside over the full-screen video.
    const view = { y: 0 };
    const place = () => {
      linesSvg.setAttribute('viewBox', `0 ${view.y.toFixed(1)} ${W} ${vh}`);
      groups.forEach(([g, s]) => g.setAttribute('transform', `translate(0 ${((1 - s) * view.y).toFixed(1)})`));
    };
    tl.fromTo(view, { y: 0 }, { y: total, duration: total, onUpdate: place }, 0)
      .to(linesSvg, { opacity: 0, duration: 150 * u }, hideFrom)
      .to(linesSvg, { opacity: 1, duration: 150 * u, immediateRender: false }, hideTo);
  }

  // ---- Paragraph line reveal, ported from mtm-coiffure (js/word-reveal.js; 2026-11-20) ----
  // Same motion values: each line rises 0.6em and fades in with a back.out(1.7) pop, line by
  // line, scrubbed by scroll (so scrolling back up hides it again). MTM times a line from its
  // place on the page; here the stage is fixed and the paragraphs move on the timeline, so a
  // line's window opens when the line itself is on screen during its paragraph's entrance
  // (found by sampling that entrance at build time, never while scrolling), and every line is
  // in by the time the paragraph reaches its spot. A line never starts before the one above it.
  const LINE_FROM_Y = '0.6em', LINE_EASE = 'back.out(1.7)';
  const ENTER_MARGIN_VH = 0.03, LINE_SPAN_VH = 0.2, MIN_SPAN_VH = 0.03;
  const REVEAL = ['.st-copy', '.ab-text', '.ex-copy', '.pc-2', '.pc-3', '.pc-4'];   // running text only
  const paras = [];                                        // { el, words: [span] }
  function splitParagraphs() {
    REVEAL.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.__split) return;
      el.__split = true;
      // one screen-reader copy, read once and normally; the split words are hidden from it
      const sr = document.createElement('p');
      sr.className = 'wr-sr';
      sr.textContent = el.textContent.replace(/\s+/g, ' ').trim();
      el.parentNode.insertBefore(sr, el);
      el.setAttribute('aria-hidden', 'true');
      const words = [];
      const split = (node) => [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            part.match(/[^-]+-?|-/g).forEach((piece) => {        // a line may break after a hyphen
              const w = document.createElement('span');
              w.className = 'wr-word';
              w.textContent = piece;
              frag.appendChild(w);
              words.push(w);
            });
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') split(n);
      });
      split(el);
      paras.push({ el, words });
    });
  }
  function lineReveal(vh) {
    const now = tl.time();
    const margin = ENTER_MARGIN_VH * vh, span = LINE_SPAN_VH * vh, minSpan = MIN_SPAN_VH * vh;
    const plans = paras.map(({ el, words }) => {
      gsap.set(words, { clearProps: 'transform,opacity' });
      // the words grouped into the lines the browser laid them out on (offsets ignore transforms)
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const lines = [];
      words.forEach((w) => {
        const mid = w.offsetTop + w.offsetHeight / 2;
        const last = lines[lines.length - 1];
        if (!last || Math.abs(mid - last.mid) > 0.4 * fs) lines.push({ mid, top: w.offsetTop, bottom: w.offsetTop + w.offsetHeight, words: [w] });
        else { last.words.push(w); last.bottom = Math.max(last.bottom, w.offsetTop + w.offsetHeight); }
      });
      // its entrance: the first of its tweens that ends with it on the screen (on a phone the
      // halved gap can already show its top edge as that tween starts); none if it is on
      // screen from the very start
      const onScreen = (t) => { tl.time(t); const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; };
      const tweens = tl.getTweensOf(el).sort((a, b) => a.startTime() - b.startTime());
      const entry = onScreen(0) ? null : tweens.find((tw) => onScreen(tw.endTime()));
      return { el, fs, lines, entry };
    });
    plans.forEach(({ el, fs, lines, entry }) => {
      if (!entry) return;                                  // on screen from the start: left plain
      const a = entry.startTime(), b = entry.endTime(), N = 40;
      const open = lines.map(() => b);
      for (let i = 0; i <= N; i++) {
        const t = a + ((b - a) * i) / N;
        tl.time(t);
        const r = el.getBoundingClientRect(), k = r.height / el.offsetHeight;   // k: its scale
        lines.forEach((ln, j) => {
          if (open[j] < b || t >= b) return;
          const top = r.top + ln.top * k, bottom = r.top + ln.bottom * k;
          if (top >= 0 && bottom + 0.6 * fs * k <= vh - margin) open[j] = t;   // the whole (shifted) line is on screen
        });
      }
      // a line starts at least one line-height of scroll after the one above it: on MTM's page
      // that spacing comes from the page scrolling; here it also keeps the top-first order for
      // paragraphs that come in from above (their lower lines reach the screen first)
      const k = el.getBoundingClientRect().height / el.offsetHeight;
      lines.forEach((ln, j) => {
        const start = j ? Math.max(open[j], ln.prev) : open[j];
        if (j + 1 < lines.length) lines[j + 1].prev = start + (lines[j + 1].top - ln.top) * k;
        const len = Math.max(Math.min(b - start, span), minSpan);
        gsap.set(ln.words, { y: LINE_FROM_Y, opacity: 0 });
        tl.fromTo(ln.words, { y: LINE_FROM_Y, opacity: 0 },
          { y: 0, opacity: 1, ease: LINE_EASE, duration: len, immediateRender: false }, start);
      });
    });
    tl.time(now);
  }

  function build() {
    if (tl) { tl.scrollTrigger.kill(); tl.kill(); }
    readProjects();
    gsap.set(['.logo-block', '.scroll-hint', '.wm', ...we, '.portfolio', '.bg-video', '.featured', '.work', ...projs, '.os-our', '.os-scope', '.os-video', '.ws-word', '.ws-panel', '.st-help', '.st-big', '.st-video', '.st-copy', '.stat', '.ab-list', '.ab-text', '.ab-photo', '.ab-about', '.ab-cap', '.cta-video', '.cta-sub', '.cta-click', '.ex-box', '.ex-word', '.ex-copy', '.ex-services', '.pw', '.pc', '.loc-globe', '.loc-word', '.loc-place', '.loc-info', '.end-bg', '.end-video', '.foot-word', '.foot-mail', '.foot-col'], { clearProps: 'transform' });
    gsap.set('.end-video', { clearProps: 'width,height,left,top' });   // the footer shrink sets these
    gsap.set('.os-shade', { clearProps: 'opacity' });                  // our. scope. darkening
    gsap.set('.os-video', { clearProps: 'width,height' });             // ... and its fill
    gsap.set(['.os-our', '.os-scope', '.ws-panel', '.ws-col', '.os-video'], { clearProps: 'opacity,visibility' });   // ... its words, panels, video
    gsap.set('.ws-bg', { clearProps: 'width,height,transform' });       // the frames' own videos
    lastLogoT = -1;                                                  // the morph redraws at the new size
    // the block keeps Figma's 491 x 208 at the top (the loader's strip in Figma 203:6 is that tall;
    // the screen-shaped block of earlier on 2026-11-20 was dropped with it)
    logoSvg.style.width = '';
    logoW = logoSvg.clientWidth;
    logoLeft = logoSvg.getBoundingClientRect().left;                 // transform cleared just above
    setLogoStart(208);
    gsap.set(['.ex-box', '.pb'], { clearProps: 'opacity' });           // back to the CSS start
    gsap.set('.st-video', { clearProps: 'width,height' });         // back to the CSS size to measure

    const { u, oy, vh } = measure();
    // frame 12 -> 23: "we" rises from just below the screen to 799; logo and hint move up with it
    const weStart = Math.max(oy + 1100 * u, vh + 20 * u);
    const d1 = weStart - (oy + 799 * u);
    // logo and hint leave through the top; on tall screens they have further to go than "we"
    const out = Math.max(d1, oy + 230 * u);
    // a short pause on each frame so the scroll can come to rest on it
    const hold = 40 * u;
    // frame 23 -> 35: "we" rises 157 more while the wordmark splits apart
    const d2 = 157 * u;
    const s2 = d1 + hold;                       // where the 23 -> 35 step starts
    // frame 35 -> 24: "we" keeps rising, 642 -> 204; the wordmark leftovers slide out;
    // "portfolio" rises in from below the screen to 782
    const d3 = (642 - 204) * u;
    const s3 = s2 + d2 + hold;
    const pStart = Math.max(d3, vh - (oy + 782 * u) + 20 * u);   // starts just below the screen
    // frame 24 -> 109:3: the background video shrinks to half width and half height,
    // into the bottom-right corner; everything else holds still
    const d4 = 491 * u;
    const s4 = s3 + d3 + hold;
    // shrink -> featured: parallax. The text group rises slower than the scroll, the small video
    // faster (speeds from Figma 137:163: 204 and 446 against 288 of scroll), and "featured work."
    // rises at scroll speed to its Figma spot (line top 704.4, baseline 988, bottom edge).
    // It starts far enough below that it lands exactly when the last of the others has left
    // through the top, so it is only fully on screen once they are gone.
    const rText = 204 / 288, rVideo = 446 / 288;
    const portfolioBottom = oy + (782 + 74) * u;                   // on screen, frame 24 spot
    // the distance the others would need to leave the top at those speeds...
    const exit = Math.max((portfolioBottom + 10 * u) / rText,      // "portfolio" (lowest text) out
                          (vh + 10 * u) / rVideo);                 // video out
    // ...and the gap below them that "featured work." starts from, shortened (2026-11-20):
    // first 15% shorter, then another 10% on big screens and another 25% on phones (< 768).
    // The others keep their own parallax speeds, so they are not all gone when it lands
    // (the earlier "only visible once they've left" rule was dropped).
    const small = matchMedia('(max-width: 767px)').matches;
    const d5 = 0.85 * (small ? 0.75 : 0.9) * exit;
    const s5 = s4 + d4 + hold;
    // phones: the white gap between "portfolio" and the incoming "featured work." is halved
    // (2026-11-20). It starts with half the gap to "portfolio"'s bottom and still lands on its
    // spot a little earlier, at the same speed. Measured from the layout (no transforms).
    let featStart = d5, featDur = d5;
    if (small) {
      const pf = document.querySelector('.portfolio'), fe = document.querySelector('.featured');
      const pBottom = pf.offsetTop + pf.offsetHeight;
      const fGlyphTop = fe.offsetTop + (0.8465 - 0.716) * parseFloat(getComputedStyle(fe).fontSize);
      const gap0 = fGlyphTop + d5 - pBottom;
      featStart = Math.max(0, gap0 / 2 - (fGlyphTop - pBottom));
      // it rises halfway between its old speed and "portfolio"'s, so the halved gap holds
      featDur = (featStart * 2) / (1 + rText);
    }
    // featured -> first project (Figma 138:215): the card, its labels and the preview strips
    // rise together from just below the screen to their spots (card top 168) at scroll speed.
    // "featured work." keeps sliding sideways while moving up to the top (line top -48:
    // Figma baseline 235.6). The leftover "we", "portfolio" and video keep rising at their
    // parallax speeds, at least far enough to be off the top by the end.
    const d6 = vh + 10 * u - (oy + 168 * u);
    const s6 = s5 + d5 + hold;
    const featTop = (vh - 982 * u) + 704.4 * u;                    // where it landed (bottom edge)
    const featUp = -48 * u - featTop;                              // to its top spot
    const textUp = Math.max(rText * d6, rText * (exit - d5));      // whichever takes it further
    const videoUp = Math.max(rVideo * d6, vh + 10 * u - rVideo * d5);
    // through the projects (Figma 140:364): each step, the card in focus folds into the nearest
    // strip above, the first strip below opens into the card, and every other strip moves up
    // one place. One card height of scroll per project.
    const P = small ? PROJ.small : PROJ.big;
    const dP = P.h * u;
    const sP = s6 + d6 + hold;
    const steps = projs.length - 1;
    // last project -> statement (Figma 102:6), all at scroll speed:
    // 1. the cards (and labels) slide up and away under "featured work.", which stays pinned;
    // 2. then "featured work." scrolls up and away (its line box ends 287 below the top);
    // 3. the statement rises in from below to its spots, "(we help you to)" (114) first. It
    //    starts once the last card's bottom edge passes the middle of the screen, so it
    //    overlaps steps 1 and 2 (the moment picked from a screenshot, 2026-11-20).
    const sOut = sP + steps * (dP + hold);
    const dOut = oy + Math.max(P.y + P.h, 720) * u + 10 * u;       // lowest card / label off the top
    const sFeat = sOut + dOut;
    const dFeat = (287 + 10) * u;
    // "our. scope." (Figma 145:464 -> 152:537, 2026-11-22), between the projects and the statement:
    // 1. it rises in from below at scroll speed, starting where the statement used to (the last
    //    card's bottom edge at the middle of the screen), overlapping the cards and "featured work."
    //    leaving; 2. "our." and "scope." slide to the middle of the screen while the video grows
    //    942 / 709 and darkens 60%; 3. it scrolls up and away while the statement rises in.
    // Places are measured here (transforms cleared), nothing per frame.
    const osWords = ['.os-our', '.os-scope'], os = ['.os-our', '.os-scope', '.os-video'];
    const osEls = os.map((s) => document.querySelector(s));
    const Wos = document.querySelector('.stage').clientWidth;
    const glyphBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const osShift = osWords.map((s) => { const g = glyphBox(document.querySelector(s)); return Wos / 2 - (g.left + g.width / 2); });
    const osTop = Math.min(...osEls.map((e) => e.offsetTop));
    const osScale = small ? 780 / 560 : 942 / 709;
    const osVid = osEls[2];
    const osBottom = Math.max(osEls[1].offsetTop + osEls[1].offsetHeight,               // "scope."
      osVid.offsetTop + osVid.offsetHeight / 2 + (osVid.offsetHeight * osScale) / 2);  // the grown video
    const sOS = sOut + Math.max(0, oy + (P.y + P.h) * u - vh / 2);  // card bottom at mid-screen
    const dOS = vh + 10 * u - osTop;
    const sAB = Math.max(sOS + dOS, sFeat + dFeat) + hold;
    const dAB = 600 * u;
    // 2b (2026-11-22). The video then grows to fill the screen; once it has, the workshops text
    //    (Figma 73:484) plays in, and there is a screen of scroll to read it before it all leaves.
    const sFill = sAB + dAB + hold;
    const dFill = 500 * u;
    // the workshops frames (Figma 73:484, 73:485, ...): after a pause to read each, the panels move
    // sideways one screen width (at scroll speed) to the next; the big word switches halfway
    const wsPanels = [...document.querySelectorAll('.ws-panel')];
    const wordsOf = (i) => [...document.querySelectorAll('.ws-word-' + i + ' .ws-swap')];   // (the entrance moves .ws-in, so the two never fight)   // a frame's big word(s)
    const wsRead = 0.6 * vh, dH = Wos;
    const sH = (i) => sFill + dFill + wsRead + (i - 1) * (dH + wsRead);   // move to frame i (1, 2, ...)
    // the frames are the panels plus a last one (the call to action), reached by a scale-down
    const sOSx = sH(wsPanels.length) + dH + wsRead;                     // after the last frame's pause, away
    const dOSx = Math.max(osBottom, vh) + 10 * u;                     // the full-screen video's bottom
    // the statement follows the call to action's box (its last frame). Both move at scroll speed, so
    // the gap between the box's bottom and "(we help you to)" stays the same while both are on
    // screen; it was halved on 2026-11-22 (it used to start once the box's bottom passed the middle
    // of the screen). "(we help you to)" starts 10 below the screen.
    const boxBottom = (vh - 982 * u) / 2 + (small ? 214 + 560 : 197.5 + 593) * u;
    const gapWas = vh + 10 * u - boxBottom + Math.max(0, Math.max(osBottom, vh) - vh / 2);
    const sSt = sOSx + Math.max(0, gapWas / 2 - (vh + 10 * u - boxBottom));
    const ws = ['.ws-word', '.ws-panel'];
    const dSt = vh + 10 * u - (oy + 114 * u);
    const statement = ['.st-help', '.st-big', '.st-video', '.st-copy'];
    // statement -> stretched video (Figma 137:191): the video grows from 1001 x 279 to fill the
    // width (24 from the left, 20 from the right) and 723 high, its top moving up 8; at the same
    // time, parallax: the big lines (and "(we help you to)") rise 172, the paragraph only 103.
    // The video box itself grows (not a scale), so a real video fills it instead of stretching.
    const sStr = Math.max(sSt + dSt, sOSx + dOSx) + hold;
    const dStr = 400 * u;
    const vidEl = document.querySelector('.st-video');
    const vidW0 = vidEl.offsetWidth, vidH0 = vidEl.offsetHeight;   // measured once per build
    const vidW1 = document.querySelector('.stage').clientWidth - (small ? 40 : 44) * u;
    const vidH1 = vidH0 * 723 / 279;
    // stretched -> full video (Figma 138:203): the text scrolls up and off the top at scroll
    // speed; the video rises a little slower (parallax), grows to 826 high and settles 22 from
    // both sides and 68 from the top of the frame (phone: same shape, centred in the frame).
    // The step lasts as long as the lowest text needs to clear the top.
    const textOut = [['.st-big', -172], ['.st-copy', -103], ['.st-help', -172]].map(([s, dy]) => {
      const el = document.querySelector(s);                         // layout box, no transforms
      return el.offsetTop + el.offsetHeight + dy * u + 10 * u;
    });
    const vidTopNow = vidEl.offsetTop - 8 * u;                       // where the stretch left it
    const vidH2 = small ? vidW1 * 826 / 1468 : 826 * u;
    const vidTop2 = small ? oy + (982 * u - vidH2) / 2 : oy + 68 * u;
    const sFull = sStr + dStr + hold;
    const dFull = Math.max(...textOut, vidTopNow - vidTop2);
    // full video -> statistics (Figma 138:211): first the video zooms to fill the whole screen;
    // once the zoom is complete, a black overlay fades in to 70% and the three statistics fade
    // in over it (fade starts after the zoom, agreed 2026-11-20).
    const Wst = document.querySelector('.stage').clientWidth;
    const sZoom = sFull + dFull + hold;
    const dZoom = 400 * u;
    const sFade = sZoom + dZoom;
    const dFade = 300 * u;
    // statistics -> about (Figma 140:391), straight after the fade with no pause: the whole
    // statistics screen (video with the overlay and the numbers inside it) scrolls up and away
    // while the about frame comes up right behind it, at scroll speed like a normal page.
    // The services list rides exactly 20px below the video's bottom edge the whole way
    // (agreed 2026-11-20): it ends at 16 from the top, so the video ends 20 - 16 above the top.
    const sAb = sFade + dFade;
    const dAb = vh + 20 - 16 * u;
    // Figma 140:378 is the midpoint of this step: the list at 312, just under the video, and
    // the paragraph at 640 (it ends at 75, the list at 16). So the paragraph, and the photo and
    // "about" with it, rise (640 - 75) / (312 - 16) times as fast as the list: parallax.
    // The numbers stay fully visible and leave with the video, clipped by it (Figma shows them
    // gone at that point, but they are not to fade, agreed 2026-11-20).
    const kAb = (640 - 75) / (312 - 16);
    const aboutLead = ['.ab-text', '.ab-photo', '.ab-about'];
    const about = ['.ab-list', '.ab-text', '.ab-photo', '.ab-about'];
    // about -> lead strategist (Figma 140:401): the text stays; the photo rises 330 (937 -> 607)
    // at scroll speed, and its caption rides with the photo's top while fading in.
    const sPh = sAb + dAb + hold;
    const dPh = 330 * u;
    // partners (Figma 145:451): four partner photos in a column 385 apart. Each step the whole
    // column rises 385 at scroll speed: the photo in focus moves up to the upper spot (222), the
    // one already there keeps going off the top, the next partner rises into the lower spot
    // (607); the captions cross-fade (old out in the first 40%, new in during the last 40%).
    const caps = [...document.querySelectorAll('.ab-cap')];
    const dPt = 385 * u;
    const sPt = sPh + dPh + hold;
    const ptSteps = caps.length - 1;
    // the order here was swapped on 2026-11-23: the process steps ("examine." ...) now come
    // right after the partners, and the call to action after the steps, before locations.
    // last partner -> "examine." (Figma 4:2): the whole about section (list, paragraph, photos,
    // captions, "about") scrolls up and away while the examine frame rises in from below, one
    // screen at scroll speed like a normal page.
    const aboutAll = ['.ab-list', '.ab-text', '.ab-photo', '.ab-about', '.ab-cap'];
    const sEx1 = sPt + ptSteps * (dPt + hold);
    const dEx1 = vh + 10 * u;
    const ex = ['.ex-box', '.ex-word', '.ex-copy'];
    const exStart = dEx1;
    const cta = ['.cta-video', '.cta-sub', '.cta-click'];
    const growScale = small ? 820 / 780 : 1195 / 815;
    // then into the end layout (second sketch, 2026-11-20): the video ends centred on the page,
    // 872 x 864 (size from the first sketch) at 320 / 59; "examine." slides in from the left
    // and grows to 240, left 102, baseline 252 (top 252 - 0.8465 x 240 = 48.8); the paragraph
    // ends at 1007 / 655 at x1.2. The text spots are estimated by eye from the sketch, relative
    // to the video (no file to measure). Transforms with origin top-left, so the offsets below
    // are end spot minus Figma 4:2 spot, in Figma pixels.
    const sEx2 = sEx1 + dEx1 + hold;
    const dEx2 = 500 * u;
    const EX = small   // phone: the video fills the canvas width (780) and is centred vertically
      ? { word: [403, -62.3, 1], box: [-24, -273.3, 780 / 732], copy: [0, 634.5, 1] }
      : { word: [485, -96.8, 240 / 207], box: [-70, -319, 872 / 732], copy: [53, 593, 1.2] };
    // every step's paragraph sits with its last line 10px above the video's bottom edge
    // (agreed 2026-11-20). Heights differ per paragraph, so they are measured here.
    const vidBottomF = small ? 104.7 + 772.6 : 59 + 864;            // frame units
    const paraTopFor = (el, scale) => vidBottomF - 10 / u - (el.offsetHeight * scale) / u;
    EX.copy[1] = paraTopFor(document.querySelector('.ex-copy'), EX.copy[2]) - 62;
    // every step's word has the top of its own tallest letter 10px below the video's top
    // edge (agreed 2026-11-20). The words differ ("manage." has no tall letters, the "i" dot
    // of "examine." is higher than the "t" of "execute."), so each word's tallest letter is
    // measured here. With line-height 1 the baseline sits 0.8465 em below the line top.
    const vidTopF = small ? 104.7 : 59;
    const wordPx = (small ? 207 : 240) * u;                          // rendered font size
    const meter = document.createElement('canvas').getContext('2d');
    meter.font = `${wordPx}px Arial`;
    const wordTopFor = (el) => {                                     // line top, frame units
      const ascent = Math.max(...[...el.textContent.trim()].map((ch) => meter.measureText(ch).actualBoundingBoxAscent));
      return vidTopF + (10 - (0.8465 * wordPx - ascent)) / u;
    };
    EX.word[1] = wordTopFor(document.querySelector('.ex-word')) - 145.6;   // from Figma 4:2's 145.6
    // the next steps (Figma 8:137: consult., execute., manage.), each from the one before:
    // 1. the word slides right across the top of the screen until it is gone;
    // 2. then, together: the video cross-fades into the next one (the next fades in on top,
    //    then the old one is hidden, so the page never shows through), the old paragraph
    //    slides down out of view, the new one comes in from the top, and the next word
    //    slides in from the left to the same spot.
    const pWords = ['.ex-word', '.pw-2', '.pw-3', '.pw-4'];
    const pBoxes = ['.ex-box', '.pb-2', '.pb-3', '.pb-4'];
    const pCopies = ['.ex-copy', '.pc-2', '.pc-3', '.pc-4'];
    const Wpg = document.querySelector('.stage').clientWidth;
    // the word's slide takes 1000 of scroll (slowed from 600, 2026-11-20); text eases sine in-out
    const dWord = 1000 * u, dSwap = 500 * u, textEase = 'sine.inOut';
    // resting y of each paragraph (0 for "examine.", which is placed by its own transform)
    const paraRest = pCopies.map((s, k) => (k === 0 ? null
      : (paraTopFor(document.querySelector(s), 1) - (small ? 696.8 : 655)) * u));
    const sSteps = sEx2 + dEx2 + hold;
    // last step -> call to action (Figma 154:602): the manage step scrolls up and away while
    // the video with "(click me)" rises in right behind it, one screen at scroll speed.
    const sCta = sSteps + (pWords.length - 1) * (dWord + dSwap + hold);
    const dCta = vh + 10 * u;
    const lastStep = [pWords[3], pBoxes[3], pCopies[3], '.ex-services'];   // "services" leaves with the section
    // call to action -> grown (Figma 157:604): the video scales up around its centre from 815
    // to 1195 wide (x 1.466; on phones only enough to fill the width). The text stays, and the
    // page stays white (Figma shows it grey there; no darkening, agreed 2026-11-20).
    const sGrow = sCta + dCta + hold;
    const dGrow = 400 * u;
    // grown call to action -> locations (Figma 186:285): the call to action scrolls up and away
    // while the locations frame with the globe rises in from below, one screen at scroll speed.
    const sLoc = sGrow + dGrow + hold;
    const loc = ['.loc-globe', '.loc-word', '.loc-place', '.loc-info'];
    // the white gap between the last video and the incoming "locations." (2026-11-20): doubled
    // on large screens (1024+), halved on phones, unchanged on tablets. Both move at scroll speed, so the gap holds while
    // they move; "locations." starts that much further (or closer) and lands on its spot.
    const dLeave = vh + 10 * u;                 // the call to action always moves a full screen up and out
    let dLoc = dLeave;
    {
      const cv = document.querySelector('.cta-video'), lw = document.querySelector('.loc-word');
      const lTop = lw.offsetTop + (0.8465 - 0.716) * parseFloat(getComputedStyle(lw).fontSize);
      const ctaBottom = cv.offsetTop + cv.offsetHeight / 2 + (cv.offsetHeight * growScale) / 2;   // grown
      const gap0 = lTop + dLoc - ctaBottom;
      // "locations." must not show while the call to action rests mid-screen: it starts at
      // least fully below the screen (the phone halving only shortens it down to there)
      const locBelow = vh - Math.min(...loc.map((s) => document.querySelector(s).offsetTop)) + 2;
      const tablet = !small && matchMedia('(max-width: 1023px)').matches;   // 768-1023: kept as it was
      dLoc = Math.max(dLoc + gap0 * ((small ? 0.5 : tablet ? 1 : 2) - 1), locBelow);
    }
    // locations -> the hero video full screen (Figma 49:163): locations stays where it is
    // (sticky) while the video rises in from below and pulls over it, one screen at scroll speed
    const sEnd = sLoc + Math.max(dLoc, dLeave) + hold;
    const dEnd = vh;
    // hero video -> footer (Figma 49:208): the video shrinks into a 510 x 331 box centred on the
    // platinum page, over the same scroll as the hero's own shrink. Its box (not a scale) is
    // animated so the picture keeps its "cover" framing at the small size, as in Figma.
    const sFoot = sEnd + dEnd + hold;
    const dFoot = 491 * u;
    const footBox = { width: 510 * u, height: 331 * u, left: (Wpg - 510 * u) / 2, top: (vh - 331 * u) / 2 };
    // footer -> the name (Figma 49:294): "freigeistagency™" rises in from below the screen to
    // the middle, over the small video, at scroll speed
    const sName = sFoot + dFoot + hold;
    const fw = document.querySelector('.foot-word');
    const dName = vh - fw.offsetTop + 10 * u;           // its top starts 10 below the screen
    // the name -> the final footer (Figma 49:282): the email and the three link columns fade
    // in while rising a little into place
    const sLinks = sName + dName + hold;
    const dLinks = 300 * u;
    const total = sLinks + dLinks + hold;

    space.style.height = `${vh + total}px`;
    // scroll position of each frame (the middle of its pause); p1..p6 = that project in focus
    const frames = { 12: 0, 23: d1 + hold / 2, 35: s3 - hold / 2, 24: s4 - hold / 2,
      shrink: s5 - hold / 2, featured: s6 - hold / 2 };
    for (let k = 0; k <= steps; k++) frames['p' + (k + 1)] = sP - hold / 2 + k * (dP + hold);
    frames.project = frames.p1;
    frames.scope = sAB - hold / 2;               // Figma 145:464
    frames.scopeEnd = sFill - hold / 2;         // Figma 152:537
    frames.workshops = sFill + dFill + 0.45 * vh; // Figma 73:484, the text in
    for (let i = 1; i <= wsPanels.length; i++) frames['workshops' + (i + 1)] = sH(i) + dH + wsRead / 2;   // Figma 73:485, ...
    frames.statement = sStr - hold / 2;
    frames.stretch = sFull - hold / 2;
    frames.full = sZoom - hold / 2;
    frames.stats = sAb;                         // the fade's end (no pause: the next step starts here)
    frames.about = sPh - hold / 2;
    // partner1..partner4 = that partner in the lower spot (partner1 is Figma 140:401, partner2 145:451)
    for (let k = 0; k <= ptSteps; k++) frames['partner' + (k + 1)] = sPt - hold / 2 + k * (dPt + hold);
    frames.lead = frames.partner1;
    frames.cta = sGrow - hold / 2;
    frames.grow = sLoc - hold / 2;
    frames.examine = sEx2 - hold / 2;          // Figma 4:2
    frames.examined = sSteps - hold / 2;       // the sketch's end layout
    ['consult', 'execute', 'manage'].forEach((name, k) => {
      frames[name] = sSteps + k * (dWord + dSwap + hold) + dWord + dSwap + hold / 2;
    });
    frames.locations = sEnd - hold / 2;
    frames.end = sFoot - hold / 2;             // Figma 49:163
    frames.footer = sName - hold / 2;          // Figma 49:208
    frames.name = sLinks - hold / 2;           // Figma 49:294
    frames.final = total - hold / 2;           // Figma 49:282
    frames.mid = sAb + dAb - 296 * u;          // Figma 140:378: the list 296 above its end spot
    // redrawLogo: the logo block in the right shape for the current scroll (the loader calls it
    // when it hands the block back, in case the page has moved meanwhile)
    window.V2 = { frames, redrawLogo: () => { lastLogoT = -1; drawLogo(); } };

    // starting places: project 1 in focus with its labels, the rest as strips below
    projs.forEach((el, j) => gsap.set(el, projState(j, P, u)));
    gsap.set([...names, ...tags], { opacity: 0 });
    gsap.set([names[0], tags[0]], { opacity: 1 });

    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { start: 0, end: total, scrub: 0.2 },    // positional traverse: low lag
    });
    // A group that enters from below with a shortened start (the halved phone gaps) could sit
    // with its top edge on screen before its step. Then it waits fully below the screen and
    // rises at scroll speed into its start spot, arriving exactly as its step begins.
    // Returns true when it added that lead-in (the step's own tween must then not render early).
    const preRoll = (targets, startY, at) => {
      const top = Math.min(...targets.map((s) => document.querySelector(s).offsetTop));
      const off = vh - top + 2;
      if (startY >= off) return false;
      tl.fromTo(targets, { y: off }, { y: startY, duration: off - startY }, at - (off - startY));
      return true;
    };
    tl.fromTo(we, { y: d1 }, { y: 0, duration: d1 }, 0)
      .to('.scroll-hint', { y: -out, duration: d1 }, 0)
      // the logo block morphs into the navbar's left element over the same scroll, and stays
      .fromTo(logoMorph, { t: 0 }, { t: 1, duration: d1, onUpdate: drawLogo }, 0)
      .to(we, { y: -d2, duration: d2 }, s2)
      .to(['.wm-geist', '.wm-agency', '.wm-tagline'], { x: -750 * u, duration: d2 }, s2)
      .to('.wm-frei', { x: 146 * u, duration: d2 }, s2)
      // 35 -> 24: "we" keeps rising, "portfolio" rises in from below
      .to(we, { y: -(d2 + d3), duration: d3 }, s3)
      .fromTo('.portfolio', { y: pStart }, { y: 0, duration: d3 }, s3);

    // The wordmark leftovers keep their 23 -> 35 speed and direction until each one's far
    // edge is off screen. Widths are measured here (build time, not per frame), so a minimum
    // text size on small screens can't leave a sliver behind.
    const W = document.querySelector('.stage').clientWidth;
    buildMarquee(u, W);
    ['.wm-geist', '.wm-agency', '.wm-tagline'].forEach((s) => {
      const el = document.querySelector(s);
      const endX = -(el.offsetLeft + el.offsetWidth + 10);            // right edge past the left side
      tl.to(s, { x: endX, duration: (-endX - 750 * u) * 157 / 750 }, s3);
    });
    const frei = document.querySelector('.wm-frei');
    const freiEnd = W - frei.offsetLeft + 10;                          // left edge past the right side
    tl.to(frei, { x: freiEnd, duration: (freiEnd - 146 * u) * 157 / 146 }, s3)
      // a transform (scale), not width/height, so the shrink costs no layout work per frame
      .fromTo('.bg-video', { scale: 1 }, { scale: 0.5, duration: d4 }, s4)
      // featured work enters; everything above it moves up at its own speed and leaves (parallax)
      .fromTo('.featured', { y: featStart }, { y: 0, duration: featDur }, s5)
      .to(we, { y: -(d2 + d3) - rText * d5, duration: d5 }, s5)
      .to('.portfolio', { y: -rText * d5, duration: d5 }, s5)
      .to('.bg-video', { y: -rVideo * d5, duration: d5 }, s5)
      // featured -> first project (the whole group of projects rises as one)
      .fromTo('.work', { y: d6 }, { y: 0, duration: d6 }, s6)
      .to('.featured', { y: featUp, duration: d6 }, s6)
      .to(we, { y: -(d2 + d3) - rText * d5 - textUp, duration: d6 }, s6)
      .to('.portfolio', { y: -rText * d5 - textUp, duration: d6 }, s6)
      .to('.bg-video', { y: -rVideo * d5 - videoUp, duration: d6 }, s6);

    // project k -> k+1: every project moves one place up; the labels cross-fade (old out in
    // the first 40% of the step, new in during the last 40%, so they never overlap)
    for (let k = 0; k < steps; k++) {
      const at = sP + k * (dP + hold);
      // immediateRender only on the first step, or later steps' starting places would be
      // applied at build time and overwrite where the projects start
      projs.forEach((el, j) => tl.fromTo(el, projState(j - k, P, u),
        { ...projState(j - k - 1, P, u), duration: dP, immediateRender: k === 0 }, at));
      tl.to([names[k], tags[k]], { opacity: 0, duration: dP * 0.4 }, at)
        .to([names[k + 1], tags[k + 1]], { opacity: 1, duration: dP * 0.4 }, at + dP * 0.6);
    }
    // "show more" (Figma 208:6): appears as the last project settles into focus, goes as the
    // projects leave; not at all once the project list is used up
    gsap.set('.show-more', { autoAlpha: 0 });
    if (moreLeft() > 0) {
      const lastIn = steps > 0 ? sP + (steps - 1) * (dP + hold) + dP : sP;
      tl.fromTo('.show-more', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 * dP, immediateRender: false }, lastIn - 0.3 * dP)
        .to('.show-more', { autoAlpha: 0, duration: 0.3 * dP }, sP + steps * (dP + hold));
    }
    // last project -> statement. Each statement piece moves on its own (not inside one moving
    // box), so the paragraph's colour flip still sees the white page and the video under it.
    tl.to('.work', { y: -dOut, duration: dOut }, sOut)
      .to('.featured', { y: featUp - dFeat, duration: dFeat }, sFeat)
      // our. scope.: rises in, the words slide to the middle as the video grows and darkens, leaves
      .fromTo(os, { y: dOS }, { y: 0, duration: dOS }, sOS)
      .to('.os-our', { x: osShift[0], duration: dAB, ease: 'sine.inOut' }, sAB)
      .to('.os-scope', { x: osShift[1], duration: dAB, ease: 'sine.inOut' }, sAB)
      .fromTo('.os-video', { scale: 1 }, { scale: osScale, duration: dAB, ease: 'sine.inOut', immediateRender: false }, sAB)
      .fromTo('.os-shade', { opacity: 0 }, { opacity: 0.6, duration: dAB, ease: 'sine.inOut', immediateRender: false }, sAB)
      // the video fills the screen: its box becomes the screen (scale back to 1, moved to the corner)
      .to('.os-video', { width: Wos, height: vh, x: -osVid.offsetLeft, y: -osVid.offsetTop, scale: 1, duration: dFill, ease: 'sine.inOut' }, sFill)
      .to([...os, ...ws], { y: `-=${dOSx}`, duration: dOSx }, sOSx)
      .fromTo(statement, { y: dSt }, { y: 0, duration: dSt }, sSt)
      // statement -> stretched video
      .to(['.st-help', '.st-big'], { y: -172 * u, duration: dStr }, sStr)
      .to('.st-copy', { y: -103 * u, duration: dStr }, sStr)
      .to(vidEl, { y: -8 * u, duration: dStr }, sStr)
      .fromTo(vidEl, { width: vidW0, height: vidH0 }, { width: vidW1, height: vidH1, duration: dStr, immediateRender: false }, sStr)
      // stretched -> full video
      .to(['.st-help', '.st-big'], { y: -172 * u - dFull, duration: dFull }, sFull)
      .to('.st-copy', { y: -103 * u - dFull, duration: dFull }, sFull)
      .to(vidEl, { x: (small ? 0 : -2) * u, y: vidTop2 - vidEl.offsetTop, height: vidH2, duration: dFull }, sFull)
      // full video -> statistics
      .to(vidEl, { x: -vidEl.offsetLeft, y: -vidEl.offsetTop, width: Wst, height: vh, duration: dZoom }, sZoom)
      .fromTo('.st-shade', { opacity: 0 }, { opacity: 0.7, duration: dFade, immediateRender: false }, sFade)
      .fromTo('.stat', { opacity: 0 }, { opacity: 1, duration: dFade, immediateRender: false }, sFade)
      // statistics -> about
      .to(vidEl, { y: -vidEl.offsetTop - dAb, duration: dAb }, sAb)  // numbers ride inside it
      .fromTo('.ab-list', { y: dAb }, { y: 0, duration: dAb }, sAb)
      .fromTo(aboutLead, { y: kAb * dAb }, { y: 0, duration: dAb }, sAb)
      // about -> lead strategist
      .to('.ab-photo', { y: -dPh, duration: dPh }, sPh)
      .fromTo(caps[0], { y: dPh, opacity: 0 }, { y: 0, opacity: 1, duration: dPh, immediateRender: false }, sPh);

    // partner k -> k+1. Each photo has its own path, n places from the one in focus:
    // n = 0 the lower spot (607), n = -1 the upper spot (222), n <= -2 fully above the top of
    // the screen (on tall screens there is room above the frame, so "off the frame" is not
    // enough), n > 0 waiting below, 385 apart. Photo j's CSS spot is 937 + 385 j (frame units).
    const photoEls = [...document.querySelectorAll('.ab-photo')];
    const offTop = -(vh - 982 * u) / u - 359 - 20;                  // frame y just above the screen
    const slotY = (n) => (n === 0 ? 607 : n === -1 ? 222 : n <= -2 ? offTop : 607 + 385 * n);
    const photoY = (j, n) => ({ y: (slotY(n) - (937 + 385 * j)) * u });
    for (let k = 0; k < ptSteps; k++) {
      const at = sPt + k * (dPt + hold);
      photoEls.forEach((el, j) => tl.fromTo(el, photoY(j, j - k), { ...photoY(j, j - k - 1), duration: dPt, immediateRender: false }, at));
      tl
        .to(caps[k], { opacity: 0, duration: dPt * 0.4 }, at)
        .fromTo(caps[k + 1], { opacity: 0 }, { opacity: 1, duration: dPt * 0.4, immediateRender: false }, at + dPt * 0.6);
    }
    // last partner -> examine ("-=" moves each piece on from wherever it is by then)
    tl.to(aboutAll, { y: `-=${dEx1}`, duration: dEx1 }, sEx1)
      .fromTo(ex, { y: exStart }, { y: 0, duration: exStart, immediateRender: !preRoll(ex, exStart, sEx1) }, sEx1)
      // examine -> the sketch's end layout
      .to('.ex-word', { x: EX.word[0] * u, y: EX.word[1] * u, scale: EX.word[2], duration: dEx2, ease: textEase }, sEx2)
      .to('.ex-box', { x: EX.box[0] * u, y: EX.box[1] * u, scale: EX.box[2], duration: dEx2 }, sEx2)
      .to('.ex-copy', { x: EX.copy[0] * u, y: EX.copy[1] * u, scale: EX.copy[2], duration: dEx2, ease: textEase }, sEx2)
      // "services" (Figma 8:137) slides in from the left into the end layout, and stays for the steps
      .fromTo('.ex-services', { x: -Wpg }, { x: 0, duration: dEx2, ease: textEase, immediateRender: false }, sEx2);

    gsap.set('.ex-services', { x: -Wpg });
    // the next steps wait off screen: words to the left (at their 10px-under-the-top height),
    // paragraphs a screen above their rest
    pWords.slice(1).forEach((s) => gsap.set(s, { x: -Wpg, y: (wordTopFor(document.querySelector(s)) - (small ? 83.3 : 48.8)) * u }));
    pCopies.slice(1).forEach((s, i) => gsap.set(s, { y: paraRest[i + 1] - vh }));
    for (let k = 0; k < pWords.length - 1; k++) {
      const at = sSteps + k * (dWord + dSwap + hold), swap = at + dWord;
      tl.to(pWords[k], { x: `+=${Wpg}`, duration: dWord, ease: textEase }, at)
        .fromTo(pBoxes[k + 1], { opacity: 0 }, { opacity: 1, duration: dSwap, immediateRender: false }, swap)
        .set(pBoxes[k], { opacity: 0 }, swap + dSwap)
        .to(pCopies[k], { y: `+=${vh}`, duration: dSwap, ease: textEase }, swap)
        .fromTo(pCopies[k + 1], { y: paraRest[k + 1] - vh }, { y: paraRest[k + 1], duration: dSwap, ease: textEase, immediateRender: false }, swap)
        .fromTo(pWords[k + 1], { x: -Wpg }, { x: 0, duration: dSwap, ease: textEase, immediateRender: false }, swap);
    }
    // last step -> call to action
    tl.to(lastStep, { y: `-=${dCta}`, duration: dCta }, sCta)
      .fromTo(cta, { y: dCta }, { y: 0, duration: dCta }, sCta)
      // call to action -> grown: a transform (scale), so no layout work per frame
      .fromTo('.cta-video', { scale: 1 }, { scale: growScale, duration: dGrow, immediateRender: false }, sGrow)
      // grown call to action -> locations
      .to(cta, { y: `-=${dLeave}`, duration: dLeave }, sLoc)
      .fromTo(loc, { y: dLoc }, { y: 0, duration: dLoc, immediateRender: !preRoll(loc, dLoc, sLoc) }, sLoc)
      // locations -> the hero video: locations stays put (sticky) while the video pulls up over it
      .fromTo(['.end-bg', '.end-video'], { y: dEnd }, { y: 0, duration: dEnd }, sEnd)
      // hero video -> footer: shrinks to its box on the platinum page
      .fromTo('.end-video', { width: Wpg, height: vh, left: 0, top: 0 },
        { ...footBox, duration: dFoot, immediateRender: false }, sFoot)
      // footer -> the name rises in
      .fromTo('.foot-word', { y: dName }, { y: 0, duration: dName }, sName)
      // the name -> the final footer
      .fromTo(['.foot-mail', '.foot-col'], { autoAlpha: 0, y: 40 * u }, { autoAlpha: 1, y: 0, duration: dLinks, ease: 'sine.out' }, sLinks)
      .set({}, {}, total);                      // keeps the timeline as long as the scroll

    buildLines({ W: document.querySelector('.stage').clientWidth, vh, u, small, total,
      // drawing starts as the hero video starts to shrink; the lines end under the footer, which
      // rises from sEnd; back in fully as the statement video leaves
      startScroll: s4, endScroll: sEnd, hideFrom: sZoom, hideTo: sAb + dAb - 150 * u });
    // the workshops frames move sideways, and the big word switches halfway (2026-11-22). The last
    // frame, the call to action (Figma 145:531), is reached by a scale-down instead: the video
    // shrinks from the full screen into its 827 x 593 box at 343 / 197.5 while the last panel's
    // columns fade, and the big word switches halfway as before.
    const lastWs = wsPanels.length;                                    // the call to action's number
    // "our." and "scope." are covered once the video fills the screen; they go then, so they do not
    // show again around the shrunken video (back when scrolling back up)
    tl.set(['.os-our', '.os-scope'], { autoAlpha: 0 }, sFill + dFill);
    wsPanels.forEach((p, i) => gsap.set(p, { x: i * Wos }));        // each frame one screen to the right
    for (let i = 1; i <= lastWs; i++) gsap.set(wordsOf(i), { yPercent: 105 });
    for (let i = 1; i <= lastWs; i++) {
      const at = sH(i);
      if (i < lastWs) tl.to(wsPanels, { x: `-=${Wos}`, duration: dH }, at);
      else {
        const ox5 = (Wos - 1512 * u) / 2, oy5 = (vh - 982 * u) / 2;
        const box = small ? { x: 20 * u, y: oy5 + 214 * u, w: 780 * u, h: 560 * u }
                          : { x: ox5 + 343 * u, y: oy5 + 197.5 * u, w: 827 * u, h: 593 * u };
        const lastBg = wsPanels[i - 1].querySelector('.ws-bg');
        if (lastBg) tl.to(lastBg, { width: box.w, height: box.h, x: box.x, y: box.y, duration: dH, ease: 'sine.inOut' }, at);
        else tl.to('.os-video', { width: box.w, height: box.h, x: box.x - osVid.offsetLeft, y: box.y - osVid.offsetTop, duration: dH, ease: 'sine.inOut' }, at);
        tl.to(wsPanels[i - 1].querySelectorAll('.ws-col'), { autoAlpha: 0, duration: 0.4 * dH }, at);
      }
      tl.fromTo(wordsOf(i - 1), { yPercent: 0 }, { yPercent: -105, duration: 0.12 * dH, ease: 'power2.in', immediateRender: false }, at + 0.38 * dH)
        .fromTo(wordsOf(i), { yPercent: 105 }, { yPercent: 0, duration: 0.12 * dH, ease: 'power2.out', immediateRender: false }, at + 0.5 * dH);
    }
    const bgPanels = wsPanels.map((p, i) => [p.querySelector('.ws-bgvid'), i]).filter(([v]) => v);
    if (bgPanels.length) tl.set('.os-video', { autoAlpha: 0 }, sH(bgPanels[0][1]) + dH);
    wsBgPlays.forEach((t) => t.kill());
    wsBgPlays = bgPanels.map(([v, i]) => ScrollTrigger.create({
      start: sH(i), end: i + 1 < lastWs ? sH(i + 1) + dH : sOSx + dOSx,
      onToggle: (self) => (self.isActive ? v.play().catch(() => {}) : v.pause()),
    }));
    // "(click me)" takes clicks only while it shows
    if (wsLive) wsLive.kill();
    wsLive = ScrollTrigger.create({ start: sH(lastWs) + 0.62 * dH, end: sOSx + 0.3 * dOSx, toggleClass: { targets: '.ws-click', className: 'is-live' } });
    lineReveal(vh);
    drawLogo();                                // the logo block in its shape for this screen right away

    // the call-to-action video plays only from the moment its section starts rising into view
    if (ctaPlay) ctaPlay.kill();
    ctaPlay = ScrollTrigger.create({
      start: sCta, end: sLoc + dLeave,           // until it has scrolled away for "locations."
      onToggle: (self) => (self.isActive ? ctaVideo.play().catch(() => {}) : ctaVideo.pause()),
    });
    // the process videos play only while their step is showing (2026-11-20):
    // - the examination video (examine. and consult.): from just before "examine." rises in until
    //   "execute."'s video has faded in over it. The consult copy starts at the examine copy's
    //   time, so the cross-fade shows no jump;
    // - execution (execute.): from when it starts fading in until "manage."'s has replaced it;
    // - brand strategy (manage.): from when it starts fading in until it has left for the call to action.
    const swapAt = (k) => sSteps + k * (dWord + dSwap + hold) + dWord;   // video k+1 starts fading in
    const [vEx, vConsult, vExecute, vManage] = stepVideos;
    const plays = [
      [[vEx, vConsult], sEx1 - 200 * u, swapAt(1) + dSwap],
      [[vExecute], swapAt(1), swapAt(2) + dSwap],
      [[vManage], swapAt(2), sCta + dCta],
    ];
    // the featured projects' videos (2026-11-20): only the card in focus plays (the strips show
    // their poster frame), from when it starts opening into the big card until it has folded
    // away; the first from just before the cards rise in, the last until they leave the top.
    // the statement video (juma kaffee) plays from the moment the statement starts rising in until the
    // video box has left the top for the about section
    if (stPlay) stPlay.kill();
    // the workshops text plays in once the video fills the screen, and back out above it
    if (wsPlay) wsPlay.kill();
    wsPlay = ScrollTrigger.create({
      start: sFill + 0.85 * dFill,
      onEnter: () => wsIntro.play(),
      onLeaveBack: () => wsIntro.reverse(),
    });
    // the our. scope. video plays while that section shows
    if (osPlay) osPlay.kill();
    const osV = document.querySelector('.os-vid');
    osPlay = ScrollTrigger.create({
      start: sOS, end: sOSx + dOSx,
      onToggle: (self) => (self.isActive ? osV.play().catch(() => {}) : osV.pause()),
    });
    stPlay = ScrollTrigger.create({
      start: sSt, end: sAb + dAb,
      onToggle: (self) => (self.isActive ? stVid.play().catch(() => {}) : stVid.pause()),
    });
    projPlays.forEach((p) => p.kill());
    // (placeholder cards from "show more" have no video yet and are skipped)
    projPlays = projs.map((card, j) => [card.querySelector('.proj-video'), j]).filter(([v]) => v).map(([v, j]) => ScrollTrigger.create({
      start: j === 0 ? s6 - 200 * u : sP + (j - 1) * (dP + hold),
      end: j === steps ? sOut + dOut : sP + j * (dP + hold) + dP,
      onToggle: (self) => (self.isActive ? v.play().catch(() => {}) : v.pause()),
    }));
    stepPlays.forEach((p) => p.kill());
    stepPlays = plays.map(([vids, start, end]) => ScrollTrigger.create({
      start, end,
      onToggle: (self) => {
        if (!self.isActive) { vids.forEach((v) => v.pause()); return; }
        const t = vids[0].currentTime;
        vids.forEach((v) => { if (Math.abs(v.currentTime - t) > 0.1) v.currentTime = t; v.play().catch(() => {}); });
      },
    }));
    // the closing hero video plays only from the moment it starts rising into view
    if (endPlay) endPlay.kill();
    endPlay = ScrollTrigger.create({
      start: sEnd,                               // keeps playing to the end of the page
      onEnter: () => endVideo.play().catch(() => {}),
      onLeaveBack: () => endVideo.pause(),
    });
  }

  // Rebuild whenever the frame scale or the screen height really changes: the probe's own
  // size changes exactly then. Build once right away so "we" never flashes at its frame 23 spot.
  splitParagraphs();
  // ---- The workshops text's entrance (Figma 73:484, 2026-11-22), as the MTM site's hero text
  // (mtm-coiffure js/intro-motion.js): each line slides up into place from behind its own bottom edge
  // (its mask clips it), 0.9 s with power4.out, the next step 0.2 s later: "workshops", then the three
  // titles, then the lines under them (first frame only; the next frames come in sideways). Played forward once the
  // video fills the screen, backwards when scrolled back above that point.
  const wsIntro = gsap.timeline({ paused: true });
  [['.ws-word-0 .ws-in', 0], ['.ws-panel-0 .ws-mask:not(.ws-sub) .ws-in', 0], ['.ws-panel-0 .ws-sub .ws-in', 0]].forEach(([sel, each], i) => {
    gsap.set(sel, { yPercent: 105 });
    wsIntro.fromTo(sel, { yPercent: 105 }, { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: each }, i * 0.2);
  });

  // ---- "show more": more projects (Figma 208:6, 2026-11-22) ----
  // The rest of the portfolio. Each click adds the next three after the last card, and the scroll
  // carries on through them. To add a real project, fill in a line: name and tags as shown on the
  // card (tags may break with <br>), and video: the file name in /videos without its ending
  // (e.g. 'Scene-7' for Scene-7_mp4.mp4 / Scene-7_webm.webm / Scene-7_poster.0000000.jpg), or
  // null for a placeholder. The button disappears when the list is used up.
  const MORE_PROJECTS = [
    { name: 'project 7', tags: 'industry &amp;<br>category.', video: null },
    { name: 'project 8', tags: 'industry &amp;<br>category.', video: null },
    { name: 'project 9', tags: 'industry &amp;<br>category.', video: null },
  ];
  let moreShown = 0;
  function moreLeft() { return MORE_PROJECTS.length - moreShown; }
  const showMoreBtn = document.querySelector('.show-more');
  if (showMoreBtn) showMoreBtn.addEventListener('click', () => {
    const work = document.querySelector('.work');
    const before = document.querySelectorAll('.proj').length;
    MORE_PROJECTS.slice(moreShown, moreShown + 3).forEach((p, k) => {
      const i = before + k;
      const card = document.createElement('a');
      card.className = `proj proj-${i + 1}`;
      card.style.setProperty('--i', i);
      card.setAttribute('aria-label', `${p.name} project`);
      card.innerHTML = p.video
        ? `<video class="proj-video" muted loop playsinline preload="metadata" poster="../videos/${p.video}_poster.0000000.jpg"><source src="../videos/${p.video}_webm.webm" type="video/webm"><source src="../videos/${p.video}_mp4.mp4" type="video/mp4"></video>`
        : '<span class="project-placeholder">video placeholder</span>';
      const name = document.createElement('p'), tags = document.createElement('p');
      name.className = 'proj-name'; tags.className = 'proj-tags';
      name.style.setProperty('--i', i); tags.style.setProperty('--i', i);
      name.textContent = `${p.name}.`; tags.innerHTML = p.tags;
      work.append(card, name, tags);
      moreShown++;
    });
    build();
    ScrollTrigger.refresh();
    // carry on to the first new project
    const next = window.V2 && window.V2.frames['p' + (before + 1)];
    if (next !== undefined && window.WFM.lenis) window.WFM.lenis.scrollTo(next, { duration: 1.4 });
  });

  build();

  let rz;
  new ResizeObserver(() => {
    clearTimeout(rz);
    rz = setTimeout(() => { build(); ScrollTrigger.refresh(); }, 100);
  }).observe(probe);
})();
