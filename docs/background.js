/* ASEAN SmartCheck - interactive particle field, cursor spotlight,
   scroll reveal and metric feedback. Purely decorative; never touches app logic. */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('bgCanvas');
  const glow = document.getElementById('cursorGlow');
  const root = document.documentElement;

  /* ---------- particle field ---------- */

  const BASE_COLORS = [[63, 227, 201], [70, 200, 240], [246, 182, 74]];
  const RISK_COLORS = {
    blue: [76, 195, 245],
    yellow: [247, 205, 79],
    orange: [251, 139, 60],
    red: [255, 96, 112]
  };
  let riskRGB = [63, 227, 201];
  let ctx = null;
  let W = 0;
  let H = 0;
  let particles = [];
  let rafId = 0;
  let running = false;

  const pointer = { x: -9999, y: -9999, gx: -9999, gy: -9999, active: false };

  function rand(min, max) { return min + Math.random() * (max - min); }

  function countFor(w, h) {
    const target = Math.round((w * h) / 15000);
    return Math.max(34, Math.min(130, target));
  }

  function makeParticle() {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(0.12, 0.5);
    const useRisk = Math.random() < 0.28;
    const base = useRisk ? riskRGB : BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)];
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      bvx: Math.cos(angle) * speed,
      bvy: Math.sin(angle) * speed,
      r: rand(1.1, 2.6),
      color: base.slice(),
      isRisk: useRisk,
      a: rand(0.35, 0.85)
    };
  }

  function initParticles() {
    particles = [];
    const n = countFor(W, H);
    for (let i = 0; i < n; i += 1) particles.push(makeParticle());
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (!ctx) ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initParticles();
  }

  function step() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const linkDist = 132;
    const linkDistSq = linkDist * linkDist;
    const mouseDist = 168;
    const mouseDistSq = mouseDist * mouseDist;

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];

      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < mouseDistSq && dSq > 0.01) {
          const d = Math.sqrt(dSq);
          const force = (1 - d / mouseDist) * 0.9;
          p.vx += (dx / d) * force;
          p.vy += (dy / d) * force;
        }
      }

      p.vx += (p.bvx - p.vx) * 0.025;
      p.vy += (p.bvy - p.vy) * 0.025;

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
    }

    // constellation links
    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > linkDistSq) continue;
        const alpha = (1 - Math.sqrt(dSq) / linkDist) * 0.34;
        ctx.strokeStyle = 'rgba(125, 205, 214, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // links to the pointer
    if (pointer.active) {
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > mouseDistSq) continue;
        const alpha = (1 - Math.sqrt(dSq) / mouseDist) * 0.5;
        ctx.strokeStyle = 'rgba(63, 227, 201, ' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pointer.x, pointer.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // particles
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const c = p.color;
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + p.a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    step();
    rafId = window.requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    loop();
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ---------- pointer ---------- */

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;

    if (glow) {
      pointer.gx = event.clientX;
      pointer.gy = event.clientY;
      glow.style.transform = 'translate(' + pointer.gx + 'px,' + pointer.gy + 'px)';
      glow.classList.add('on');
    }
  }

  function onPointerLeave() {
    pointer.active = false;
    pointer.x = -9999;
    pointer.y = -9999;
    if (glow) glow.classList.remove('on');
  }

  /* ---------- risk tint ---------- */

  function applyRisk(level) {
    const key = RISK_COLORS[level] ? level : null;
    const rgb = key ? RISK_COLORS[key] : [63, 227, 201];
    riskRGB = rgb.slice();
    root.style.setProperty('--risk', 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')');

    particles.forEach(function (p) {
      if (!p.isRisk) return;
      const base = key ? RISK_COLORS[key] : BASE_COLORS[0];
      p.color = base.slice();
    });
    if (reduceMotion) step();
  }

  function watchResults() {
    const target = document.getElementById('resultContent');
    if (!target || !window.MutationObserver) return;
    const observer = new MutationObserver(function () {
      const banner = target.querySelector('.result-banner');
      if (!banner) { applyRisk(null); return; }
      const match = banner.className.match(/level-(blue|yellow|orange|red)/);
      applyRisk(match ? match[1] : null);
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  /* ---------- scroll reveal ---------- */

  function setupReveal() {
    const items = document.querySelectorAll('[data-reveal]');
    if (!items.length) return;

    if (reduceMotion || !window.IntersectionObserver) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    document.body.classList.add('reveal-ready');
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- metric feedback ---------- */

  function watchMetrics() {
    if (!window.MutationObserver) return;
    const seen = new Map();
    const cards = document.querySelectorAll('.metric-card');

    cards.forEach(function (card) {
      const value = card.querySelector('strong');
      if (!value) return;
      seen.set(value, value.textContent);
      const observer = new MutationObserver(function () {
        const next = value.textContent;
        if (seen.get(value) === next) return;
        seen.set(value, next);
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
      });
      observer.observe(value, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---------- hero parallax ---------- */

  function setupParallax() {
    if (reduceMotion) return;
    const heroCopy = document.querySelector('.hero-copy');
    const heroPanel = document.querySelector('.hero-principles');
    if (!heroCopy && !heroPanel) return;

    let px = 0;
    let py = 0;
    let ticking = false;

    function render() {
      ticking = false;
      if (heroCopy) heroCopy.style.transform = 'translate3d(' + (px * 10).toFixed(2) + 'px,' + (py * 8).toFixed(2) + 'px,0)';
      if (heroPanel) heroPanel.style.transform = 'translate3d(' + (px * -14).toFixed(2) + 'px,' + (py * -10).toFixed(2) + 'px,0)';
    }

    function queue() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(render);
    }

    window.addEventListener('pointermove', function (event) {
      px = (event.clientX / window.innerWidth - 0.5) * 2;
      py = (event.clientY / window.innerHeight - 0.5) * 2;
      queue();
    }, { passive: true });
  }

  /* ---------- boot ---------- */

  function boot() {
    resize();
    setupReveal();
    watchResults();
    watchMetrics();
    setupParallax();

    window.addEventListener('resize', function () {
      window.clearTimeout(boot._t);
      boot._t = window.setTimeout(function () { resize(); if (reduceMotion) step(); }, 160);
    });

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    if (reduceMotion) {
      step();
    } else {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
