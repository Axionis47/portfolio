/* ═══════════════════════════════════════════════════════════════
   cosmos.js — the gravity simulation, isolated as a module.
   Space, kept — but demoted and given depth. Three parallax star
   strata (far/mid/near) shift by depth against mouse + scroll, a
   far-haze layer and foreground bokeh add volume, and a vignette
   frames it so it recedes behind the text instead of competing.

   Public API (window.Cosmos):
     init(selector)   mount + start
     setProgress(p)   0..1 scroll progress → the field dims & settles

   Respects prefers-reduced-motion (renders one calm still frame) and
   pauses when the tab is hidden (battery). Physics preserved.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const Cosmos = {};
  let canvas, ctx, W, H, dpr;
  let progress = 0, pSmooth = 0;
  let raf = null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // parallax tuning
  const P = 84;            // star-field padding beyond viewport
  const MAXPAR = 22;       // px of mouse parallax at the nearest layer
  const SCROLLPAR = 34;    // px of scroll parallax at the nearest layer
  let mx = 0, my = 0, mxT = 0, myT = 0;   // smoothed + target mouse (-1..1)

  function chaos() { return 1 - 0.78 * pSmooth; }
  function parOff(f) { return { x: -mx * MAXPAR * f, y: -my * MAXPAR * f + pSmooth * SCROLLPAR * f }; }

  Cosmos.setProgress = function (p) { progress = Math.max(0, Math.min(1, p)); };

  Cosmos.init = function (selector) {
    canvas = document.querySelector(selector);
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    build();
    window.addEventListener('resize', () => { resize(); build(); });
    window.addEventListener('mousemove', (e) => {
      mxT = (e.clientX / W - 0.5) * 2;
      myT = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = null; } }
      else if (!raf && !reduced) { draw(); }
    });
    if (reduced) { renderStill(); return; }
    if (!raf) draw();
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ── Star strata ── */
  let farStars = [], midStars = [], nearStars = [];
  function genStars(n, rMin, rMax, bMin, bMax) {
    const a = [];
    for (let i = 0; i < n; i++) a.push({
      x: -P + Math.random() * (W + 2 * P), y: -P + Math.random() * (H + 2 * P),
      r: rMin + Math.random() * (rMax - rMin),
      bright: bMin + Math.random() * (bMax - bMin),
      flicker: Math.random() * Math.PI * 2, speed: 0.004 + Math.random() * 0.016
    });
    return a;
  }
  function makeStars() {
    const area = (W + 2 * P) * (H + 2 * P);
    farStars = genStars(Math.floor(area / 2500), 0.25, 0.7, 0.03, 0.13);
    midStars = genStars(Math.floor(area / 6800), 0.55, 1.15, 0.10, 0.26);
    nearStars = genStars(Math.floor(area / 18000), 1.0, 2.1, 0.22, 0.46);
  }
  function drawStars(arr, o, glow) {
    for (const s of arr) {
      s.flicker += s.speed;
      const b = Math.max(0, s.bright + Math.sin(s.flicker) * 0.05);
      const x = s.x + o.x, y = s.y + o.y;
      if (glow && s.r > 1.5) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 4.5);
        g.addColorStop(0, `rgba(205,205,215,${b * 0.3})`);
        g.addColorStop(1, 'rgba(205,205,215,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s.r * 4.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(203,199,191,${b})`;
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Far haze: vast, faint gas behind everything ── */
  let haze = [];
  function makeHaze() {
    haze = [];
    const cols = [{ r: 70, g: 110, b: 180 }, { r: 165, g: 95, b: 70 }, { r: 105, g: 120, b: 175 }];
    for (let i = 0; i < 3; i++) {
      const c = cols[i % cols.length];
      haze.push({
        x: Math.random() * W, y: Math.random() * H, rad: 240 + Math.random() * 260,
        a: 0.018 + Math.random() * 0.016, cr: c.r, cg: c.g, cb: c.b,
        ph: Math.random() * Math.PI * 2, dx: (Math.random() - 0.5) * 0.03, dy: (Math.random() - 0.5) * 0.03
      });
    }
  }
  function drawHaze(o) {
    for (const h of haze) {
      h.x += h.dx; h.y += h.dy;
      const x = h.x + o.x, y = h.y + o.y;
      const a = h.a * (0.8 + 0.2 * Math.sin(time * 0.004 + h.ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, h.rad);
      g.addColorStop(0, `rgba(${h.cr},${h.cg},${h.cb},${a})`);
      g.addColorStop(0.5, `rgba(${h.cr},${h.cg},${h.cb},${a * 0.35})`);
      g.addColorStop(1, `rgba(${h.cr},${h.cg},${h.cb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, h.rad, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Foreground bokeh: soft motes too close to focus on ── */
  let bokeh = [];
  function makeBokeh() {
    bokeh = [];
    const n = W < 768 ? 6 : 11;
    for (let i = 0; i < n; i++) bokeh.push({
      x: -P + Math.random() * (W + 2 * P), y: -P + Math.random() * (H + 2 * P),
      rad: 16 + Math.random() * 42, a: 0.012 + Math.random() * 0.028,
      amber: Math.random() < 0.3, ph: Math.random() * Math.PI * 2,
      dx: (Math.random() - 0.5) * 0.05, dy: (Math.random() - 0.5) * 0.05
    });
  }
  function drawBokeh(o) {
    for (const p of bokeh) {
      p.x += p.dx; p.y += p.dy;
      const x = p.x + o.x, y = p.y + o.y;
      const a = p.a * (0.7 + 0.3 * Math.sin(time * 0.012 + p.ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, p.rad);
      g.addColorStop(0, p.amber ? `rgba(216,150,80,${a})` : `rgba(150,170,210,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, p.rad, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.26, W / 2, H * 0.42, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(9,9,11,0)');
    g.addColorStop(0.7, 'rgba(9,9,11,0.28)');
    g.addColorStop(1, 'rgba(8,8,10,0.62)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  /* ── Massive bodies (physics preserved) ── */
  let bodies = [];
  function makeBodies() {
    bodies = [];
    const mobile = W < 768;
    const layout = mobile
      ? ['blackhole', 'blue_giant', 'amber_star', 'red_dwarf', 'planet', 'planet', 'planet', 'planet']
      : ['blackhole', 'blue_giant', 'amber_star', 'amber_star', 'red_dwarf', 'red_dwarf', 'planet', 'planet', 'planet', 'planet', 'planet', 'planet'];
    for (let i = 0; i < layout.length; i++) {
      const t = layout[i]; const m = 100;
      const b = {
        type: t, x: m + Math.random() * (W - m * 2), y: m + Math.random() * (H - m * 2),
        vx: (Math.random() - 0.5) * 0.07, vy: (Math.random() - 0.5) * 0.07,
        phase: Math.random() * Math.PI * 2, novaPhase: 'idle', novaTick: 0,
        novaTimer: -1, originalRadius: 0, originalMass: 0, pulsarAngle: 0, pulsarSpeed: 0, mass: 0, radius: 0
      };
      if (t === 'blackhole') { b.mass = 900 + Math.random() * 400; b.radius = 6; }
      else if (t === 'blue_giant') { b.mass = 600 + Math.random() * 300; b.radius = 6 + Math.random() * 2; b.novaTimer = 500 + Math.floor(Math.random() * 800); }
      else if (t === 'amber_star') { b.mass = 400 + Math.random() * 200; b.radius = 4 + Math.random() * 2; b.novaTimer = 700 + Math.floor(Math.random() * 1200); }
      else if (t === 'red_dwarf') { b.mass = 150 + Math.random() * 100; b.radius = 2.5 + Math.random() * 1; b.novaTimer = -1; }
      else { b.mass = 150 + Math.random() * 120; b.radius = 2.5 + Math.random() * 1.5; b.novaTimer = -1; }
      b.originalRadius = b.radius; b.originalMass = b.mass;
      bodies.push(b);
    }
  }

  let shockwaves = [], nebulae = [], comets = [], particles = [];
  function spawnComet() {
    const edge = Math.floor(Math.random() * 4); let x, y, vx, vy;
    const speed = 1.2 + Math.random() * 1.5;
    if (edge === 0) { x = -10; y = Math.random() * H; vx = speed; vy = (Math.random() - 0.5) * 0.8; }
    else if (edge === 1) { x = W + 10; y = Math.random() * H; vx = -speed; vy = (Math.random() - 0.5) * 0.8; }
    else if (edge === 2) { x = Math.random() * W; y = -10; vx = (Math.random() - 0.5) * 0.8; vy = speed; }
    else { x = Math.random() * W; y = H + 10; vx = (Math.random() - 0.5) * 0.8; vy = -speed; }
    return { x, y, vx, vy, trail: [], size: 1.5 + Math.random() * 1.5, age: 0 };
  }
  function makeParticles() {
    particles = [];
    const count = W < 768 ? 110 : 240;
    for (let i = 0; i < count; i++) particles.push(spawnP());
  }
  function spawnP() {
    const orb = Math.random() < 0.65 && bodies.length > 0;
    if (orb) {
      const b = bodies[Math.floor(Math.random() * bodies.length)];
      const dist = b.radius * 4 + Math.random() * 110, ang = Math.random() * Math.PI * 2;
      const os = Math.sqrt(b.mass * 0.0003 / Math.max(dist, 1)) * (Math.random() < 0.5 ? 1 : -1);
      return {
        x: b.x + Math.cos(ang) * dist, y: b.y + Math.sin(ang) * dist,
        vx: -Math.sin(ang) * os + (Math.random() - 0.5) * 0.1, vy: Math.cos(ang) * os + (Math.random() - 0.5) * 0.1,
        size: 0.3 + Math.random() * 1, trail: [], debris: false, debrisAge: 0
      };
    }
    return {
      x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      size: 0.2 + Math.random() * 0.8, trail: [], debris: false, debrisAge: 0
    };
  }
  function spawnDebris(x, y, color) {
    const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3.5;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 0.4 + Math.random() * 1.5, trail: [], debris: true, debrisAge: 0, debrisColor: color };
  }

  function build() {
    makeStars(); makeHaze(); makeBokeh(); makeBodies(); makeParticles();
    shockwaves = []; nebulae = [];
    const nebulaCount = W < 768 ? 2 : 4;
    for (let i = 0; i < nebulaCount; i++) {
      const colors = [{ r: 80, g: 140, b: 220 }, { r: 216, g: 140, b: 58 }, { r: 160, g: 80, b: 60 }, { r: 100, g: 120, b: 180 }];
      const c = colors[i % colors.length];
      nebulae.push({
        x: 60 + Math.random() * (W - 120), y: 60 + Math.random() * (H - 120), radius: 25 + Math.random() * 30,
        age: Math.floor(Math.random() * 300), lifetime: 2500 + Math.floor(Math.random() * 1000),
        maxAlpha: 0.03 + Math.random() * 0.02, r: c.r, g: c.g, b: c.b
      });
    }
    comets = []; if (W >= 768) comets.push(spawnComet());
    if (reduced) renderStill();
  }

  let time = 0;
  let cometTimer = 300 + Math.floor(Math.random() * 400);

  /* ── Reduced-motion: a single calm still frame ── */
  function renderStill() {
    ctx.fillStyle = '#0e0e10'; ctx.fillRect(0, 0, W, H);
    const z = { x: 0, y: 0 };
    drawHaze(z); drawStars(farStars, z); drawStars(midStars, z); drawStars(nearStars, z, true);
    drawVignette();
  }

  function draw() {
    raf = requestAnimationFrame(draw);
    time++;
    pSmooth += (progress - pSmooth) * 0.05;
    mx += (mxT - mx) * 0.045; my += (myT - my) * 0.045;
    // recede behind content as the reader descends (kept legible)
    canvas.style.opacity = (0.9 - 0.55 * pSmooth).toFixed(3);
    const ch = chaos();

    ctx.fillStyle = 'rgba(14,14,16,0.35)';
    ctx.fillRect(0, 0, W, H);

    drawHaze(parOff(0.06));
    drawStars(farStars, parOff(0.12));
    drawStars(midStars, parOff(0.4));

    // ── mid group: everything physical, parallaxed together ──
    const mo = parOff(0.26);
    ctx.save();
    ctx.translate(mo.x, mo.y);
    ctx.globalAlpha = 0.92;

    for (let i = nebulae.length - 1; i >= 0; i--) {
      const n = nebulae[i]; n.age++; n.radius += 0.18;
      const life = 1 - n.age / n.lifetime;
      const alpha = Math.max(0, n.maxAlpha * life);
      if (alpha <= 0) { nebulae.splice(i, 1); continue; }
      const R = n.radius, r = n.r, g = n.g, b = n.b;
      const g1 = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R * 1.2);
      g1.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.2})`);
      g1.addColorStop(0.3, `rgba(${r},${g},${b},${alpha * 0.1})`);
      g1.addColorStop(0.6, `rgba(${r},${g},${b},${alpha * 0.03})`);
      g1.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(n.x, n.y, R * 1.2, 0, Math.PI * 2); ctx.fill();
    }

    for (const b of bodies) {
      if (b.novaTimer < 0) continue;
      const isBlue = b.type === 'blue_giant';
      if (b.novaPhase === 'idle') { b.novaTimer--; if (b.novaTimer <= 0) { b.novaPhase = 'buildup'; b.novaTick = 0; } }
      else if (b.novaPhase === 'buildup') {
        b.novaTick++; const dur = isBlue ? 80 : 120; const p = b.novaTick / dur;
        b.radius = b.originalRadius * (1 + p * (isBlue ? 3 : 2.5)); b.mass = b.originalMass * (1 + p * 0.5);
        if (b.novaTick >= dur) {
          b.novaPhase = 'explode'; b.novaTick = 0; const sw_r = isBlue ? 280 : 200;
          shockwaves.push({ x: b.x, y: b.y, radius: 0, maxRadius: sw_r, alpha: isBlue ? 0.45 : 0.35, speed: isBlue ? 4 : 3 });
          if (isBlue) shockwaves.push({ x: b.x, y: b.y, radius: 0, maxRadius: sw_r * 0.6, alpha: 0.25, speed: 2.5 });
          const dc = W < 768 ? 20 : 45, col = isBlue ? 'blue' : 'amber';
          for (let j = 0; j < dc; j++) particles.push(spawnDebris(b.x, b.y, col));
          const blastR = isBlue ? 200 : 150, blastF = isBlue ? 5 : 4;
          for (const p of particles) { const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy); if (d < blastR && d > 0) { const f = (1 - d / blastR) * blastF; p.vx += (dx / d) * f; p.vy += (dy / d) * f; } }
          nebulae.push({ x: b.x, y: b.y, radius: 20, age: 0, lifetime: 2200, maxAlpha: isBlue ? 0.07 : 0.05, r: isBlue ? 80 : 216, g: isBlue ? 140 : 140, b: isBlue ? 220 : 58 });
        }
      } else if (b.novaPhase === 'explode') {
        b.novaTick++;
        if (b.novaTick < 15) b.radius = b.originalRadius * ((isBlue ? 4.5 : 3.5) - b.novaTick * 0.2);
        else { const sp = (b.novaTick - 15) / 65; b.radius = b.originalRadius * Math.max(0.25, (isBlue ? 4.5 : 3.5 - 15 * 0.2) * (1 - sp)); b.mass = b.originalMass * (0.2 + 0.8 * (1 - sp)); }
        if (b.novaTick >= 80) { b.novaPhase = 'pulsar'; b.novaTick = 0; b.radius = b.originalRadius * 0.3; b.mass = b.originalMass * 0.25; b.pulsarAngle = Math.random() * Math.PI * 2; b.pulsarSpeed = 0.06 + Math.random() * 0.04; }
      } else if (b.novaPhase === 'pulsar') {
        b.novaTick++; b.pulsarAngle += b.pulsarSpeed;
        if (b.novaTick > 500) { const regen = Math.min((b.novaTick - 500) / 400, 1); b.radius = b.originalRadius * (0.3 + regen * 0.7); b.mass = b.originalMass * (0.25 + regen * 0.75); if (regen >= 1) { b.novaPhase = 'idle'; b.novaTimer = (isBlue ? 500 : 700) + Math.floor(Math.random() * 1000); b.novaTick = 0; } }
      }
    }

    for (const b of bodies) {
      b.x += b.vx * (0.4 + 0.6 * ch); b.y += b.vy * (0.4 + 0.6 * ch);
      if (b.x < 60 || b.x > W - 60) b.vx *= -1; if (b.y < 60 || b.y > H - 60) b.vy *= -1;
      b.x = Math.max(30, Math.min(W - 30, b.x)); b.y = Math.max(30, Math.min(H - 30, b.y));
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]; s.radius += s.speed; s.alpha *= 0.974;
      if (s.alpha < 0.004 || s.radius > s.maxRadius) { shockwaves.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(216,170,90,${s.alpha})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.stroke();
    }

    for (const b of bodies) {
      if (b.type === 'blackhole') {
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 38);
        gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.25, 'rgba(5,5,8,0.5)');
        gr.addColorStop(0.5, 'rgba(216,140,58,0.025)'); gr.addColorStop(1, 'rgba(216,140,58,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, 38, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(216,140,58,0.055)'; ctx.lineWidth = 0.8;
        for (let r = 10; r < 32; r += 5) { ctx.beginPath(); ctx.arc(b.x, b.y, r + Math.sin(time * 0.02 + r) * 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
      } else if (b.type === 'blue_giant') {
        const resting = b.novaPhase === 'pulsar' && b.novaTick < 500, isPulsar = b.novaPhase === 'pulsar';
        const glowR = resting ? 12 : 50, glowA = resting ? 0.03 : 0.1;
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, glowR);
        gr.addColorStop(0, `rgba(100,160,235,${glowA})`); gr.addColorStop(0.4, `rgba(60,110,200,${glowA * 0.25})`); gr.addColorStop(1, 'rgba(60,110,200,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2); ctx.fill();
        const pulse = 1 + Math.sin(time * 0.035 + b.phase) * 0.12;
        ctx.fillStyle = `rgba(140,185,255,${resting ? 0.18 : 0.55})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * pulse, 0, Math.PI * 2); ctx.fill();
        if (isPulsar) {
          const beamLen = 60 + Math.sin(time * 0.05) * 10, ba = 0.12 + Math.sin(time * 0.08) * 0.04;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.pulsarAngle);
          const bg1 = ctx.createLinearGradient(0, 0, beamLen, 0); bg1.addColorStop(0, `rgba(140,185,255,${ba})`); bg1.addColorStop(1, 'rgba(140,185,255,0)');
          ctx.fillStyle = bg1; ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(beamLen, -0.3); ctx.lineTo(beamLen, 0.3); ctx.lineTo(0, 1.5); ctx.fill();
          const bg2 = ctx.createLinearGradient(0, 0, -beamLen, 0); bg2.addColorStop(0, `rgba(140,185,255,${ba})`); bg2.addColorStop(1, 'rgba(140,185,255,0)');
          ctx.fillStyle = bg2; ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(-beamLen, -0.3); ctx.lineTo(-beamLen, 0.3); ctx.lineTo(0, 1.5); ctx.fill();
          ctx.restore();
        }
      } else if (b.type === 'amber_star') {
        const resting = b.novaPhase === 'pulsar' && b.novaTick < 500;
        const glowR = resting ? 12 : 40, glowA = resting ? 0.03 : 0.11;
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, glowR);
        gr.addColorStop(0, `rgba(216,140,58,${glowA})`); gr.addColorStop(0.4, `rgba(216,140,58,${glowA * 0.25})`); gr.addColorStop(1, 'rgba(216,140,58,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2); ctx.fill();
        const pulse = 1 + Math.sin(time * 0.03 + b.phase) * 0.14;
        ctx.fillStyle = `rgba(216,150,70,${resting ? 0.18 : 0.5})`;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * pulse, 0, Math.PI * 2); ctx.fill();
      } else if (b.type === 'red_dwarf') {
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 22);
        gr.addColorStop(0, 'rgba(180,60,50,0.07)'); gr.addColorStop(1, 'rgba(180,60,50,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, 22, 0, Math.PI * 2); ctx.fill();
        const pulse = 1 + Math.sin(time * 0.02 + b.phase) * 0.08;
        ctx.fillStyle = 'rgba(180,75,60,0.4)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius * pulse, 0, Math.PI * 2); ctx.fill();
      } else {
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 22);
        gr.addColorStop(0, 'rgba(150,150,165,0.05)'); gr.addColorStop(1, 'rgba(150,150,165,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(130,130,145,0.32)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
      }
    }

    cometTimer--;
    if (cometTimer <= 0) { comets.push(spawnComet()); cometTimer = Math.floor((500 + Math.random() * 700) * (1 + (1 - ch) * 2)); }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      for (const b of bodies) { const dx = b.x - c.x, dy = b.y - c.y, distSq = dx * dx + dy * dy, dist = Math.sqrt(distSq); const f = Math.min(b.mass * 0.0002 / Math.max(distSq, 200), 0.05); c.vx += (dx / dist) * f; c.vy += (dy / dist) * f; }
      c.x += c.vx; c.y += c.vy; c.age++;
      c.trail.push({ x: c.x, y: c.y }); if (c.trail.length > 12) c.trail.shift();
      if (c.x < -60 || c.x > W + 60 || c.y < -60 || c.y > H + 60 || c.age > 800) { comets.splice(i, 1); continue; }
      if (c.trail.length > 2) { for (let t = 1; t < c.trail.length; t++) { ctx.strokeStyle = `rgba(200,190,170,${(t / c.trail.length) * 0.15})`; ctx.lineWidth = (t / c.trail.length) * c.size * 0.4; ctx.beginPath(); ctx.moveTo(c.trail[t - 1].x, c.trail[t - 1].y); ctx.lineTo(c.trail[t].x, c.trail[t].y); ctx.stroke(); } }
      ctx.fillStyle = 'rgba(230,225,210,0.55)'; ctx.beginPath(); ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2); ctx.fill();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.debris) { p.debrisAge++; p.vx *= 0.993; p.vy *= 0.993; if (p.debrisAge > 220) { particles.splice(i, 1); continue; } }
      for (const b of bodies) {
        const dx = b.x - p.x, dy = b.y - p.y, distSq = dx * dx + dy * dy, dist = Math.sqrt(distSq);
        if (b.type === 'blackhole' && dist < 8) { if (p.debris) particles.splice(i, 1); else particles[i] = spawnP(); continue; }
        const f = Math.min(b.mass * 0.00025 / Math.max(distSq, 100), 0.08); p.vx += (dx / dist) * f; p.vy += (dy / dist) * f;
      }
      const spd = Math.hypot(p.vx, p.vy), mxv = p.debris ? 4 : 2;
      if (spd > mxv) { p.vx = (p.vx / spd) * mxv; p.vy = (p.vy / spd) * mxv; }
      p.x += p.vx; p.y += p.vy;
      if (time % 2 === 0) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > (p.debris ? 6 : 4)) p.trail.shift(); }
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) { if (p.debris) particles.splice(i, 1); else particles[i] = spawnP(); continue; }
      let minD = 1e9, nearT = 'none';
      for (const b of bodies) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < minD) { minD = d; nearT = b.type; } }
      const nearBH = nearT === 'blackhole' && minD < 50;
      if (p.debris) { const da = Math.max(0, 1 - p.debrisAge / 220); ctx.fillStyle = p.debrisColor === 'blue' ? `rgba(100,150,220,${da * 0.3})` : `rgba(216,140,58,${da * 0.3})`; }
      else if (nearBH) { ctx.fillStyle = `rgba(216,140,58,${0.3 + (1 - minD / 50) * 0.3})`; }
      else { ctx.fillStyle = 'rgba(145,145,155,0.14)'; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (nearBH ? 0.6 + (1 - minD / 50) * 0.5 : 1), 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();  // end mid group

    drawStars(nearStars, parOff(0.85), true);
    drawBokeh(parOff(1.25));
    drawVignette();
  }

  window.Cosmos = Cosmos;
})();
