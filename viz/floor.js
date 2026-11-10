// The trading floor in 3D: glass-walled rooms on a dark floor, desks with monitors, video walls, holograms, the
// shredder and the vault. Every screen is decoration drawn from seeded noise: it never shows the desk's real data.
// DeskFloor.create(layout) takes the anchor points the simulation uses (trays, desks, the bin…) and builds around them.
(() => {
  const D = window.Desk3D;
  const { P, poly, box, quadTex, line, alpha, shade, noise, hash } = D;
  const HEAD = 'Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif';
  const MONO = '"Cascadia Mono", Consolas, ui-monospace, monospace';

  // ---------- screen textures (pure functions of time: deterministic) ----------
  function screenBase(g, w, h, accent, title) {
    g.fillStyle = '#04070f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = alpha(accent, 0.07); g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < w; x += 16) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += 16) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
    g.stroke();
    if (title) {
      g.fillStyle = alpha(accent, 0.9); g.font = `700 9px ${HEAD}`; g.textBaseline = 'top';
      g.letterSpacing = '1.5px'; g.fillText(title, 6, 5); g.letterSpacing = '0px';
    }
  }
  const series = (i, seed) => noise(i * 0.13, seed) * 0.55 + noise(i * 0.035, seed + 3) * 0.6 + noise(i * 0.6, seed + 5) * 0.12;

  function candles(g, x0, y0, w, h, t, seed, speed) {
    const n = 26, cw = w / n, pos = t * speed, base = Math.floor(pos), frac = pos - base;
    const vals = [];
    for (let i = 0; i <= n + 1; i++) vals.push(series(base + i, seed));
    const lo = Math.min(...vals) - 0.1, hi = Math.max(...vals) + 0.1, Y = (v) => y0 + h - ((v - lo) / (hi - lo)) * h;
    for (let i = 1; i <= n + 1; i++) {
      const o = vals[i - 1], c = vals[i], x = x0 + (i - 1 - frac) * cw;
      if (x < x0 - cw * 0.5 || x > x0 + w - cw * 0.5) continue;
      const up = c >= o, wick = Math.abs(noise((base + i) * 1.7, seed + 9)) * 0.08;
      g.strokeStyle = g.fillStyle = up ? '#38e08c' : '#ff4d6d';
      g.beginPath(); g.moveTo(x + cw / 2, Y(Math.max(o, c) + wick)); g.lineTo(x + cw / 2, Y(Math.min(o, c) - wick)); g.lineWidth = 1; g.stroke();
      g.fillRect(x + cw * 0.18, Y(Math.max(o, c)), cw * 0.64, Math.max(1, Math.abs(Y(o) - Y(c))));
    }
  }
  function curve(g, x0, y0, w, h, t, seed, color) {
    const n = 60, pts = [];
    for (let i = 0; i <= n; i++) pts.push(i / n * 0.9 + series(i + Math.floor(t * 2), seed) * 0.35);
    const lo = Math.min(...pts), hi = Math.max(...pts), Y = (v) => y0 + h - ((v - lo) / (hi - lo + 1e-6)) * h * 0.9;
    const grad = g.createLinearGradient(0, y0, 0, y0 + h);
    grad.addColorStop(0, alpha(color, 0.35)); grad.addColorStop(1, alpha(color, 0));
    g.beginPath(); g.moveTo(x0, y0 + h);
    pts.forEach((v, i) => g.lineTo(x0 + (i / n) * w, Y(v)));
    g.lineTo(x0 + w, y0 + h); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); pts.forEach((v, i) => (i ? g.lineTo : g.moveTo).call(g, x0 + (i / n) * w, Y(v)));
    g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
  }
  function montecarlo(g, x0, y0, w, h, t, accent, busy) {
    const paths = 34, steps = 40, reveal = ((t * (busy ? 0.5 : 0.18)) % 1.25);
    const shown = Math.min(steps, Math.floor(reveal * steps));
    const finals = [];
    for (let j = 0; j < paths; j++) {
      g.beginPath();
      let v = 0;
      for (let s = 0; s <= steps; s++) {
        v += 0.018 + noise(s * 0.7 + j * 31.3, j) * 0.09;
        const x = x0 + (s / steps) * w * 0.82, y = y0 + h * 0.75 - v * h * 0.55;
        if (s > shown) break;
        if (s) g.lineTo(x, y); else g.moveTo(x, y);
      }
      finals.push(v);
      g.strokeStyle = alpha(j % 9 === 0 ? '#ffffff' : accent, j % 9 === 0 ? 0.5 : 0.28); g.lineWidth = 1; g.stroke();
    }
    // the distribution of outcomes, on the right
    const bins = 9, cnt = new Array(bins).fill(0);
    for (const v of finals) cnt[Math.max(0, Math.min(bins - 1, Math.floor((v + 0.2) / 1.6 * bins)))]++;
    const full = shown >= steps;
    cnt.forEach((c, i) => {
      const bh = (h * 0.55) / bins, y = y0 + h * 0.75 - (i + 1) * bh;
      g.fillStyle = alpha(accent, full ? 0.75 : 0.25);
      g.fillRect(x0 + w * 0.85, y + 1, (c / 9) * w * 0.14, bh - 2);
    });
  }
  function code(g, x0, y0, w, h, t, seed, speed) {
    const lh = 8, off = t * speed, first = Math.floor(off), frac = off - first;
    const cols = ['#ff6fa5', '#e8ecf7', '#6fa8ff', '#4be38a', '#8b93a8', '#ffd166'];
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    for (let i = 0; i < Math.ceil(h / lh) + 1; i++) {
      const n = first + i, y = y0 + (i - frac) * lh;
      let x = x0 + 3 + Math.floor(hash(n * 3 + seed) * 4) * 7;
      const segs = 1 + Math.floor(hash(n * 7 + seed) * 4);
      for (let k = 0; k < segs; k++) {
        const sw = 6 + hash(n * 13 + k + seed) * 26;
        if (x + sw > x0 + w - 4) break;
        g.fillStyle = alpha(cols[Math.floor(hash(n * 17 + k * 5 + seed) * cols.length)], 0.85);
        g.fillRect(x, y + 2, sw, 3); x += sw + 4;
      }
    }
    g.restore();
  }
  function checks(g, x0, y0, w, h, t, accent, speed) {
    const rows = 7, rh = h / rows, cyc = (t * speed) % (rows + 3);
    for (let i = 0; i < rows; i++) {
      const y = y0 + i * rh;
      g.fillStyle = 'rgba(140,160,200,0.18)'; g.fillRect(x0, y + rh * 0.3, w * 0.3, rh * 0.35);
      g.fillStyle = 'rgba(140,160,200,0.12)'; g.fillRect(x0 + w * 0.36, y + rh * 0.3, w * 0.38, rh * 0.35);
      if (i < cyc) {
        const bad = hash(i * 7 + Math.floor(t * speed / (rows + 3)) * 31) < 0.14;
        g.fillStyle = bad ? '#ff4d6d' : accent;
        g.beginPath(); g.arc(x0 + w * 0.88, y + rh * 0.48, rh * 0.26, 0, Math.PI * 2); g.fill();
      }
    }
  }
  function heat(g, x0, y0, w, h, t, seed) {
    const cx = 8, cy = 5, cw = w / cx, ch = h / cy;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
      const v = noise(t * 0.4 + i * 1.3 + j * 2.1, seed + i * 3 + j);
      g.fillStyle = v > 0 ? `rgba(56,224,140,${0.15 + v * 0.7})` : `rgba(255,77,109,${0.15 - v * 0.7})`;
      g.fillRect(x0 + i * cw + 1, y0 + j * ch + 1, cw - 2, ch - 2);
    }
  }
  function globe(g, cx, cy, r, t, accent) {
    g.strokeStyle = alpha(accent, 0.55); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    for (let m = 0; m < 6; m++) {
      const a = t * 0.5 + (m * Math.PI) / 6, rx = Math.abs(Math.cos(a)) * r;
      g.beginPath(); g.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2); g.strokeStyle = alpha(accent, 0.25); g.stroke();
    }
    for (const lat of [-0.9, -0.45, 0, 0.45, 0.9]) {
      const y = cy + Math.sin(lat) * r, hw = Math.cos(lat) * r;
      g.beginPath(); g.ellipse(cx, y, hw, hw * 0.12, 0, 0, Math.PI * 2); g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const lon = hash(i * 11) * Math.PI * 2 + t * 0.5, lat = (hash(i * 5 + 2) - 0.5) * 2.2;
      if (Math.cos(lon) < 0) continue;
      const x = cx + Math.sin(lon) * Math.cos(lat) * r, y = cy + Math.sin(lat) * r;
      const p = 0.5 + 0.5 * Math.sin(t * 3 + i);
      g.fillStyle = alpha('#ffffff', 0.5 + p * 0.5); g.beginPath(); g.arc(x, y, 1.2 + p * 1.2, 0, Math.PI * 2); g.fill();
    }
  }
  function flow(g, x0, y0, w, h, t, accent) {
    const N = [[0.08, 0.3], [0.08, 0.72], [0.36, 0.5], [0.62, 0.28], [0.62, 0.72], [0.9, 0.5]];
    const E = [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]];
    const names = ['DATA', 'REGIME', 'SIGNAL', 'ENTRY', 'RISK', 'EXIT'];
    const at = ([u, v]) => [x0 + u * w, y0 + v * h];
    g.lineWidth = 1;
    E.forEach(([a, b], i) => {
      const [ax, ay] = at(N[a]), [bx, by] = at(N[b]);
      g.strokeStyle = alpha(accent, 0.45); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      const k = (t * 0.6 + i * 0.37) % 1;
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ax + (bx - ax) * k, ay + (by - ay) * k, 1.6, 0, Math.PI * 2); g.fill();
    });
    g.font = `700 8px ${HEAD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    N.forEach((n, i) => {
      const [x, y] = at(n);
      g.fillStyle = '#0a0f1e'; g.fillRect(x - 20, y - 7, 40, 14);
      g.strokeStyle = accent; g.strokeRect(x - 20 + 0.5, y - 7 + 0.5, 39, 13);
      g.fillStyle = '#e8ecf7'; g.fillText(names[i], x, y + 0.5);
    });
    g.textAlign = 'left';
  }
  function scatter(g, x0, y0, w, h, t, accent) {
    for (let i = 0; i < 40; i++) {
      const u = hash(i * 3 + 1), v = Math.max(0, Math.min(1, u * 0.7 + hash(i * 7 + 2) * 0.3));
      const born = (t * 4) % 50;
      if (i > born) continue;
      g.fillStyle = alpha(i % 7 === 0 ? '#ff4d6d' : accent, 0.8);
      g.beginPath(); g.arc(x0 + u * w, y0 + h - v * h, 1.6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(232,236,247,0.35)'; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x0, y0 + h); g.lineTo(x0 + w, y0 + h * 0.15); g.stroke(); g.setLineDash([]);
  }
  function bars(g, x0, y0, w, t, accent, labels, speed) {
    labels.forEach((lab, i) => {
      const y = y0 + i * 22, k = ((t * speed * (0.7 + i * 0.35)) % 1.2);
      g.fillStyle = 'rgba(232,236,247,0.7)'; g.font = `700 8px ${HEAD}`; g.textBaseline = 'top'; g.fillText(lab, x0, y);
      g.fillStyle = 'rgba(140,160,200,0.15)'; g.fillRect(x0, y + 11, w, 5);
      g.fillStyle = k >= 1 ? '#4be38a' : accent; g.fillRect(x0, y + 11, w * Math.min(1, k), 5);
    });
  }
  function lockScreen(g, w, h, t) {
    screenBase(g, w, h, '#ffb340', '');
    g.strokeStyle = '#ffb340'; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h * 0.42, 9, Math.PI, 0); g.stroke();
    g.fillStyle = '#ffb340'; g.fillRect(w / 2 - 13, h * 0.42, 26, 20);
    g.fillStyle = '#04070f'; g.fillRect(w / 2 - 1.5, h * 0.42 + 6, 3, 8);
    if (Math.sin(t * 3) > -0.3) { g.font = `700 10px ${HEAD}`; g.textAlign = 'center'; g.fillStyle = '#ffb340'; g.fillText('SEALED', w / 2, h * 0.86); g.textAlign = 'left'; }
  }

  function create(L) {
    const { ROOMS, TRAY, DESK, WAITING, BIN } = L;
    const items = [];
    const add = (ref, draw) => items.push({ ref, draw });
    const tex = [];
    function texture(w, h, paint) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; tex.push({ cv, paint, last: -1 }); return cv; }
    const busy = (room, s) => ROOMS[room].busyUntil > s.sim;
    let S = null; // the state being drawn (texture painters read it)

    // ---------- textures ----------
    const T = {
      researchWall: texture(344, 112, (g, w, h, t) => {
        screenBase(g, w, h, ROOMS.library.accent, 'MARKETS · SOURCES · IDEAS');
        globe(g, 64, 62, 40, t, ROOMS.library.accent);
        code(g, 128, 18, w - 136, h - 24, t, 77, S && busy('library', S) ? 6 : 1.5);
      }),
      designWall: texture(344, 112, (g, w, h, t) => {
        screenBase(g, w, h, ROOMS.studio.accent, 'STRATEGY DESIGN');
        flow(g, 24, 20, w - 48, h - 30, t, ROOMS.studio.accent);
      }),
      buildWall: texture(344, 112, (g, w, h, t) => {
        const b = S && busy('workshop', S);
        screenBase(g, w, h, ROOMS.workshop.accent, 'BUILD · STRATEGY TEXT');
        code(g, 6, 18, 200, h - 22, t, 11, b ? 9 : 2);
        bars(g, 220, 22, 112, t, ROOMS.workshop.accent, ['VALIDATE', 'BACKTEST', 'DIAGNOSTICS'], b ? 0.5 : 0.12);
      }),
      verifyWall: texture(344, 112, (g, w, h, t) => {
        const b = S && busy('bench', S);
        screenBase(g, w, h, ROOMS.bench.accent, 'VERIFY · TRADE BY TRADE');
        checks(g, 8, 20, 180, h - 26, t, ROOMS.bench.accent, b ? 4 : 1.2);
        scatter(g, 204, 22, 128, h - 32, t, ROOMS.bench.accent);
      }),
      labWall: texture(176, 112, (g, w, h, t) => {
        screenBase(g, w, h, ROOMS.lab.accent, 'MONTE CARLO');
        montecarlo(g, 6, 14, w - 10, h - 10, t, ROOMS.lab.accent, S && busy('lab', S));
      }),
      officeWall: texture(176, 112, (g, w, h, t) => { screenBase(g, w, h, '#e8ecf7', 'BOOK'); curve(g, 6, 20, w - 12, h - 26, t * 0.2, 41, '#8fb8ff'); }),
      incubatorWall: texture(176, 112, (g, w, h, t) => { screenBase(g, w, h, ROOMS.incubator.accent, 'DEMO · LIVE FEED'); candles(g, 4, 18, w - 8, h - 22, t, 23, 1.6); }),
      candles: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#6fa8ff'); candles(g, 3, 6, w - 6, h - 10, t, 5, 2); }),
      candles2: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#4be38a'); candles(g, 3, 6, w - 6, h - 10, t, 13, 3); }),
      curve: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#ffd166'); curve(g, 4, 8, w - 8, h - 14, t * 0.3, 7, '#ffd166'); }),
      heat: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#ff6fa5'); heat(g, 4, 6, w - 8, h - 12, t, 3); }),
      codeA: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#ff9f43'); code(g, 2, 4, w - 4, h - 6, t, 3, S && busy('workshop', S) ? 10 : 2); }),
      codeB: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#ff9f43'); code(g, 2, 4, w - 4, h - 6, t, 9, S && busy('workshop', S) ? 8 : 1.5); }),
      checks: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#2fe0c8'); checks(g, 6, 6, w - 12, h - 10, t, '#2fe0c8', S && busy('bench', S) ? 4 : 1); }),
      mc: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#4dd2ff'); montecarlo(g, 4, 4, w - 6, h - 2, t + 3, '#4dd2ff', S && busy('lab', S)); }),
      globe: texture(128, 80, (g, w, h, t) => { screenBase(g, w, h, '#6fa8ff'); globe(g, w / 2, h / 2, 30, t + 1, '#6fa8ff'); }),
      lock: texture(128, 80, (g, w, h, t) => lockScreen(g, w, h, t)),
    };
    function refresh(s) {
      S = s;
      const b = Math.floor(s.sim * 30);
      for (const x of tex) { if (x.last === b) continue; x.last = b; x.paint(x.cv.getContext('2d'), x.cv.width, x.cv.height, s.sim); }
    }

    // ---------- building blocks ----------
    const glassFill = 'rgba(120,160,255,0.045)';
    function glass(x0, z0, x1, z1, h, accent) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 22));
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        const xa = x0 + (x1 - x0) * a, za = z0 + (z1 - z0) * a, xb = x0 + (x1 - x0) * b, zb = z0 + (z1 - z0) * b;
        add([(xa + xb) / 2, 0, (za + zb) / 2], (g) => {
          poly(g, [[xa, 0, za], [xb, 0, zb], [xb, h, zb], [xa, h, za]], glassFill);
          line(g, [xa, h, za], [xb, h, zb], alpha(accent, 0.75), 1.4);
          line(g, [xa, 0.2, za], [xb, 0.2, zb], alpha(accent, 0.35), 1);
          if (i === 0) line(g, [xa, 0, za], [xa, h, za], alpha(accent, 0.3), 1);
          if (i === n - 1) line(g, [xb, 0, zb], [xb, h, zb], alpha(accent, 0.3), 1);
        });
      }
    }
    function deskWithMonitors(x0, x1, z0, z1, accent, screens, opts = {}) {
      const h = opts.h ?? 8.5;
      add([(x0 + x1) / 2, 0, z1], (g) => {
        box(g, { x0: x0 + 1, x1: x0 + 2.4, y0: 0, y1: h - 0.6, z0: z0 + 1, z1: z1 - 1 }, '#151b2b');
        box(g, { x0: x1 - 2.4, x1: x1 - 1, y0: 0, y1: h - 0.6, z0: z0 + 1, z1: z1 - 1 }, '#151b2b');
        box(g, { x0, x1, y0: h - 0.8, y1: h, z0, z1 }, '#1b2236', { edge: alpha(accent, 0.8), lw: 1.2 });
        const n = screens.length, mw = Math.min(14, (x1 - x0 - 4) / n - 1.5), mh = mw * 0.6;
        screens.forEach((tx, i) => {
          const cx = x0 + (x1 - x0) * ((i + 0.5) / n), zz = z0 + 1.2, y0 = h + 1.6;
          const tilt = (i - (n - 1) / 2) * 1.2; // the outer screens turn in a little
          box(g, { x0: cx - 0.5, x1: cx + 0.5, y0: h, y1: y0 + 1, z0: zz - 0.5, z1: zz + 0.3 }, '#0c101a');
          poly(g, [[cx - mw / 2 - 0.4, y0 - 0.4, zz - tilt], [cx + mw / 2 + 0.4, y0 - 0.4, zz + tilt], [cx + mw / 2 + 0.4, y0 + mh + 0.4, zz + tilt], [cx - mw / 2 - 0.4, y0 + mh + 0.4, zz - tilt]], '#0a0d16', alpha(accent, 0.5), 1);
          quadTex(g, tx, [cx - mw / 2, y0 + mh, zz - tilt + 0.05], [cx + mw / 2, y0 + mh, zz + tilt + 0.05], [cx - mw / 2, y0, zz - tilt + 0.05]);
        });
      });
    }
    function backWall(r, x0, x1, screen, accent, sx0 = x0, sx1 = x1) {
      add([(x0 + x1) / 2, 0, 12], (g) => {
        box(g, { x0, x1, y0: 0, y1: 44, z0: 6, z1: 14 }, '#0b1020', { top: '#111933', edge: alpha(accent, 0.55) });
        if (!screen) return;
        x0 = sx0; x1 = sx1;
        poly(g, [[x0 + 3, 7, 14.02], [x1 - 3, 7, 14.02], [x1 - 3, 39, 14.02], [x0 + 3, 39, 14.02]], '#05080f', alpha(accent, 0.9), 1.6);
        quadTex(g, screen, [x0 + 4, 38, 14.06], [x1 - 4, 38, 14.06], [x0 + 4, 8, 14.06]);
        g.save(); g.shadowColor = accent; g.shadowBlur = 14;
        line(g, [x0 + 3, 5.5, 14.1], [x1 - 3, 5.5, 14.1], accent, 2);
        g.restore();
      });
    }
    function freeScreen(x0, x1, z, y0, y1, screen, accent) {
      add([(x0 + x1) / 2, 0, z], (g) => {
        const cx = (x0 + x1) / 2;
        box(g, { x0: cx - 0.8, x1: cx + 0.8, y0: 0, y1: y0, z0: z - 0.8, z1: z + 0.8 }, '#121829');
        box(g, { x0: cx - 5, x1: cx + 5, y0: 0, y1: 0.6, z0: z - 3, z1: z + 3 }, '#121829');
        poly(g, [[x0 - 0.6, y0 - 0.6, z + 1], [x1 + 0.6, y0 - 0.6, z + 1], [x1 + 0.6, y1 + 0.6, z + 1], [x0 - 0.6, y1 + 0.6, z + 1]], '#05080f', alpha(accent, 0.85), 1.4);
        quadTex(g, screen, [x0, y1, z + 1.05], [x1, y1, z + 1.05], [x0, y0, z + 1.05]);
      });
    }
    function inbox(p, accent) {
      add([p.x + 3, 0, p.y + 10], (g) => {
        box(g, { x0: p.x - 4, x1: p.x + 10, y0: 0, y1: 8, z0: p.y + 2, z1: p.y + 10 }, '#131a2b', { edge: accent, glow: 8 });
        poly(g, [[p.x - 3, 8.02, p.y + 3], [p.x + 9, 8.02, p.y + 3], [p.x + 9, 8.02, p.y + 9], [p.x - 3, 8.02, p.y + 9]], alpha(accent, 0.16));
      });
    }
    function plant(x, z) {
      add([x, 0, z + 2], (g) => {
        box(g, { x0: x - 2.2, x1: x + 2.2, y0: 0, y1: 4, z0: z - 2.2, z1: z + 2.2 }, '#1d2233', { edge: 'rgba(255,255,255,0.15)' });
        const p = P(x, 9, z);
        g.fillStyle = '#1f5a3c';
        for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.beginPath(); g.ellipse(p.x + Math.cos(a) * 2.2 * p.k, p.y + Math.sin(a) * 1.6 * p.k, 2.4 * p.k, 1.3 * p.k, a, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#2f8a5a'; g.beginPath(); g.ellipse(p.x, p.y - 1.4 * p.k, 2.6 * p.k, 2 * p.k, 0, 0, Math.PI * 2); g.fill();
      });
    }

    // ---------- the rooms ----------
    const R = ROOMS;
    // row 0: a tall back wall with a video wall; glass between rooms; a low glass front with a door
    for (const [name, r] of Object.entries(R)) {
      if (r.row !== 0) continue;
      if (name === 'lab') backWall(r, r.x, r.x + r.w, T.labWall, r.accent, 430, 478);
      else backWall(r, r.x, r.x + r.w, { library: T.researchWall, studio: T.designWall, workshop: T.buildWall, bench: T.verifyWall }[name], r.accent);
      glass(r.x, 100, r.doorX - 11, 100, 7, r.accent);
      glass(r.doorX + 11, 100, r.x + r.w, 100, 7, r.accent);
    }
    for (let c = 0; c <= 5; c++) glass(c * 96, 14, c * 96, 100, c === 0 || c === 5 ? 30 : 20, c ? R[Object.keys(R)[Math.min(4, c - 1)]].accent : R.library.accent);
    // row 1: low glass toward the corridor (with a door) and between rooms
    for (const r of Object.values(R)) {
      if (r.row !== 1) continue;
      glass(r.x, 120, r.doorX - 11, 120, 7, r.accent);
      glass(r.doorX + 11, 120, r.x + r.w, 120, 7, r.accent);
    }
    for (let c = 0; c <= 5; c++) glass(c * 96, 120, c * 96, 206, c === 0 || c === 5 ? 10 : 6, '#3a4a78');

    // research: desk with screens, the holo globe
    deskWithMonitors(DESK.library.x - 6, DESK.library.x + 40, DESK.library.y - 2, DESK.library.y + 8, R.library.accent, [T.globe, T.candles]);
    inbox(TRAY.library, R.library.accent);
    add([84, 0, 40], (g, s) => {
      box(g, { x0: 80, x1: 88, y0: 0, y1: 5, z0: 32, z1: 40 }, '#131a2b', { edge: R.library.accent, glow: 10 });
      holoGlobe(g, 84, 15, 36, 7, s.sim, R.library.accent);
    });
    plant(8, 22);
    // design: the holo table with the strategy being drawn above it
    add([143, 0, 56], (g, s) => {
      box(g, { x0: 118, x1: 168, y0: 0, y1: 7.5, z0: 38, z1: 54 }, '#151b2e', { edge: R.studio.accent, glow: 12, top: '#1a1440' });
      for (let i = 1; i < 6; i++) line(g, [118 + i * 8.3, 7.55, 38], [118 + i * 8.3, 7.55, 54], alpha(R.studio.accent, 0.25), 1);
      for (let i = 1; i < 3; i++) line(g, [118, 7.55, 38 + i * 5.3], [168, 7.55, 38 + i * 5.3], alpha(R.studio.accent, 0.25), 1);
      holoFlow(g, 143, 46, s.sim, R.studio.accent);
    });
    plant(184, 24);
    // build
    deskWithMonitors(DESK.workshop.x - 6, DESK.workshop.x + 40, DESK.workshop.y - 2, DESK.workshop.y + 8, R.workshop.accent, [T.codeA, T.codeB, T.candles]);
    inbox(TRAY.workshop, R.workshop.accent);
    // verify
    deskWithMonitors(DESK.bench.x - 6, DESK.bench.x + 40, DESK.bench.y - 2, DESK.bench.y + 8, R.bench.accent, [T.checks, T.candles2]);
    inbox(TRAY.bench, R.bench.accent);
    // validate: server racks, a narrower video wall, the waiting shelf
    for (let i = 0; i < 3; i++) {
      const x0 = 388 + i * 13;
      add([x0 + 6, 0, 28], (g, s) => {
        box(g, { x0, x1: x0 + 11, y0: 0, y1: 30, z0: 16, z1: 28 }, '#0e1322', { edge: alpha(R.lab.accent, 0.5) });
        const b = busy('lab', s);
        for (let row = 0; row < 9; row++) for (let col = 0; col < 4; col++) {
          const on = hash(row * 13 + col * 7 + i * 101 + Math.floor(s.sim * (b ? 14 : 2))) < (b ? 0.55 : 0.3);
          if (!on) continue;
          const p = P(x0 + 2 + col * 2.4, 4 + row * 2.9, 28.05);
          g.fillStyle = (row + col + i) % 5 === 0 ? '#ffb340' : R.lab.accent;
          g.fillRect(p.x - p.k * 0.45, p.y - p.k * 0.35, p.k * 0.9, p.k * 0.7);
        }
      });
    }
    deskWithMonitors(DESK.lab.x - 6, Math.min(478, DESK.lab.x + 36), DESK.lab.y - 2, DESK.lab.y + 8, R.lab.accent, [T.mc, T.heat]);
    inbox(TRAY.lab, R.lab.accent);
    add([WAITING.x + 10, 0, WAITING.y + 9], (g) => {
      box(g, { x0: WAITING.x - 3, x1: WAITING.x + 23, y0: 0, y1: 7, z0: WAITING.y + 2, z1: WAITING.y + 9 }, '#121827', { edge: alpha('#ffb340', 0.8), glow: 6 });
    });

    // head of desk: the big desk, a screen wall, a plant
    deskWithMonitors(24, 74, 156, 167, R.office.accent, [T.candles, T.heat, T.curve], { h: 9 });
    freeScreen(6, 34, 126, 8, 25, T.officeWall, R.office.accent);
    plant(88, 130);
    plant(90, 198);
    // parked shelf and the shredder
    const ps = TRAY.store;
    add([ps.x + 14, 0, 128], (g) => {
      box(g, { x0: ps.x - 4, x1: ps.x + 30, y0: 0, y1: 19, z0: 121, z1: 122 }, '#121827');
      for (const y of [2, 10]) box(g, { x0: ps.x - 4, x1: ps.x + 30, y0: y, y1: y + 0.7, z0: 121, z1: 128 }, '#1a2133', { edge: alpha('#8b93a8', 0.7) });
      for (const x of [ps.x - 4, ps.x + 29]) box(g, { x0: x, x1: x + 1, y0: 0, y1: 19, z0: 121, z1: 128 }, '#1a2133');
    });
    add([BIN.x + 8, 0, BIN.y + 12], (g, s) => {
      box(g, { x0: BIN.x + 1, x1: BIN.x + 15, y0: 0, y1: 13, z0: BIN.y + 2, z1: BIN.y + 12 }, '#171b26', { edge: '#ff4d6d', glow: 10 });
      g.save(); g.shadowColor = '#ff4d6d'; g.shadowBlur = 12;
      poly(g, [[BIN.x + 3, 13.05, BIN.y + 6], [BIN.x + 13, 13.05, BIN.y + 6], [BIN.x + 13, 13.05, BIN.y + 8], [BIN.x + 3, 13.05, BIN.y + 8]], '#ff4d6d');
      g.restore();
      for (let i = 0; i < 5; i++) { const p = P(BIN.x + 3.5 + i * 2.2, 9, BIN.y + 12.05); g.fillStyle = i < 1 + (Math.floor(s.sim * 2) % 5) ? '#ff4d6d' : '#3a1d26'; g.fillRect(p.x - p.k * 0.6, p.y, p.k * 1.2, p.k * 0.8); }
    });
    for (const [x, z, w, h] of [[106, 186, 12, 8], [108, 178, 8, 6]]) add([x + w / 2, 0, z + w], (g) => box(g, { x0: x, x1: x + w, y0: 0, y1: h, z0: z, z1: z + w * 0.8 }, '#20283a', { edge: 'rgba(255,255,255,0.12)' }));
    // strategy library: pedestals with what passed
    for (let i = 0; i < 3; i++) {
      const cx = 206 + i * 22;
      add([cx, 0, 136], (g, s) => {
        box(g, { x0: cx - 4.5, x1: cx + 4.5, y0: 0, y1: 10, z0: 127, z1: 136 }, '#141a2b', { edge: R.trophy.accent, glow: 10 });
        crystal(g, cx, 16 + Math.sin(s.sim * 1.6 + i) * 0.8, 131.5, 3.4, s.sim * 0.9 + i, R.trophy.accent);
      });
    }
    deskWithMonitors(DESK.trophy.x - 6, DESK.trophy.x + 40, DESK.trophy.y - 3, DESK.trophy.y + 7, R.trophy.accent, [T.curve, T.heat]);
    inbox(TRAY.trophy, R.trophy.accent);
    // incubation: a live feed wall, a desk, three incubation tanks
    freeScreen(294, 330, 124, 7, 26, T.incubatorWall, R.incubator.accent);
    deskWithMonitors(DESK.incubator.x - 6, DESK.incubator.x + 40, DESK.incubator.y - 2, DESK.incubator.y + 8, R.incubator.accent, [T.candles2, T.candles]);
    inbox(TRAY.incubator, R.incubator.accent);
    for (let i = 0; i < 3; i++) {
      const cx = 346 + i * 13, cz = 134;
      add([cx, 0, cz + 4], (g, s) => tank(g, cx, cz, s.sim + i * 1.3, R.incubator.accent));
    }
    // the hold-out vault
    add([436, 0, 140], (g, s) => vaultDoor(g, 436, 132, s.sim));
    deskWithMonitors(DESK.vault.x - 6, DESK.vault.x + 40, DESK.vault.y - 3, DESK.vault.y + 7, R.vault.accent, [T.lock]);
    inbox(TRAY.vault, R.vault.accent);

    // ---------- moving pieces ----------
    function holoGlobe(g, cx, cy, cz, r, t, accent) {
      g.save(); g.shadowColor = accent; g.shadowBlur = 10;
      g.strokeStyle = alpha(accent, 0.8); g.lineWidth = 1;
      for (let m = 0; m < 5; m++) {
        const a = t * 0.6 + (m * Math.PI) / 5;
        g.beginPath();
        for (let i = 0; i <= 24; i++) { const th = (i / 24) * Math.PI * 2; const p = P(cx + Math.cos(a) * Math.cos(th) * r, cy + Math.sin(th) * r, cz + Math.sin(a) * Math.cos(th) * r); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
        g.stroke();
      }
      for (const lat of [-0.6, 0, 0.6]) {
        g.beginPath();
        for (let i = 0; i <= 24; i++) { const th = (i / 24) * Math.PI * 2; const p = P(cx + Math.cos(th) * Math.cos(lat) * r, cy + Math.sin(lat) * r, cz + Math.sin(th) * Math.cos(lat) * r); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
        g.stroke();
      }
      g.restore();
      // the beam from the pedestal
      const a = P(cx, 5, cz), b = P(cx, cy, cz);
      const grad = g.createLinearGradient(a.x, a.y, b.x, b.y); grad.addColorStop(0, alpha(accent, 0.35)); grad.addColorStop(1, alpha(accent, 0));
      g.fillStyle = grad; g.beginPath(); g.moveTo(a.x - 3 * a.k, a.y); g.lineTo(a.x + 3 * a.k, a.y); g.lineTo(b.x + r * b.k, b.y); g.lineTo(b.x - r * b.k, b.y); g.closePath(); g.fill();
    }
    function holoFlow(g, cx, cz, t, accent) {
      const nodes = [[-18, 12, -3], [-18, 18, 3], [-4, 15, 0], [9, 19, -3], [9, 11, 3], [20, 15, 0]];
      const edges = [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]];
      const rot = Math.sin(t * 0.3) * 0.35, c = Math.cos(rot), s = Math.sin(rot);
      const W = nodes.map(([x, y, z]) => [cx + x * c - z * s, y + Math.sin(t * 1.4 + x) * 0.4, cz + x * s + z * c]);
      g.save(); g.shadowColor = accent; g.shadowBlur = 10;
      edges.forEach(([a, b], i) => {
        line(g, W[a], W[b], alpha(accent, 0.7), 1.2);
        const k = (t * 0.7 + i * 0.29) % 1, p = P(W[a][0] + (W[b][0] - W[a][0]) * k, W[a][1] + (W[b][1] - W[a][1]) * k, W[a][2] + (W[b][2] - W[a][2]) * k);
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x, p.y, Math.max(1.5, p.k * 0.5), 0, Math.PI * 2); g.fill();
      });
      for (const [x, y, z] of W) { const p = P(x, y, z); g.fillStyle = alpha(accent, 0.9); g.fillRect(p.x - 1.6 * p.k, p.y - 1.1 * p.k, 3.2 * p.k, 2.2 * p.k); }
      g.restore();
      const a = P(cx, 7.6, cz), b = P(cx, 20, cz), grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, alpha(accent, 0.22)); grad.addColorStop(1, alpha(accent, 0));
      g.fillStyle = grad; g.beginPath(); g.moveTo(a.x - 22 * a.k, a.y); g.lineTo(a.x + 22 * a.k, a.y); g.lineTo(b.x + 24 * b.k, b.y); g.lineTo(b.x - 24 * b.k, b.y); g.closePath(); g.fill();
    }
    function crystal(g, x, y, z, r, a, color) {
      const top = [x, y + r * 1.5, z], bot = [x, y - r * 1.5, z];
      const ring = [0, 1, 2, 3].map((i) => { const th = a + (i * Math.PI) / 2; return [x + Math.cos(th) * r, y, z + Math.sin(th) * r]; });
      g.save(); g.shadowColor = color; g.shadowBlur = 16;
      for (let i = 0; i < 4; i++) {
        const p = ring[i], q = ring[(i + 1) % 4], lit = 0.25 + 0.5 * Math.max(0, Math.cos(a + (i + 0.5) * Math.PI / 2));
        poly(g, [top, p, q], shade(color, lit - 0.4));
        poly(g, [bot, p, q], shade(color, lit - 0.65));
      }
      g.restore();
    }
    function tank(g, x, z, t, accent) {
      box(g, { x0: x - 4.5, x1: x + 4.5, y0: 0, y1: 2.5, z0: z - 4.5, z1: z + 4.5 }, '#141a2b', { edge: accent });
      const b = P(x, 2.5, z), tp = P(x, 20, z), r = 3.6 * b.k;
      const grad = g.createLinearGradient(0, tp.y, 0, b.y); grad.addColorStop(0, alpha(accent, 0.08)); grad.addColorStop(1, alpha(accent, 0.3));
      g.fillStyle = grad; g.fillRect(b.x - r, tp.y, 2 * r, b.y - tp.y);
      g.strokeStyle = alpha(accent, 0.7); g.lineWidth = 1;
      g.beginPath(); g.moveTo(b.x - r, b.y); g.lineTo(tp.x - r, tp.y); g.moveTo(b.x + r, b.y); g.lineTo(tp.x + r, tp.y); g.stroke();
      g.beginPath(); g.ellipse(tp.x, tp.y, r, r * 0.35, 0, 0, Math.PI * 2); g.stroke();
      // a little live line inside, and bubbles
      g.save(); g.shadowColor = accent; g.shadowBlur = 8; g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.beginPath();
      for (let i = 0; i <= 10; i++) { const yy = b.y + (tp.y - b.y) * (0.2 + i * 0.06); const xx = b.x + noise(i * 0.8 + t * 1.5, 4) * r * 0.6; if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke(); g.restore();
      for (let i = 0; i < 4; i++) { const k = (t * 0.4 + i * 0.25) % 1; g.fillStyle = alpha(accent, 0.8 * (1 - k)); g.beginPath(); g.arc(b.x + (hash(i) - 0.5) * r, b.y + (tp.y - b.y) * k, 1.4, 0, Math.PI * 2); g.fill(); }
    }
    function vaultDoor(g, x, z, t) {
      box(g, { x0: x - 22, x1: x + 22, y0: 0, y1: 44, z0: z - 6, z1: z }, '#0f1320', { edge: alpha('#9aa6c8', 0.6) });
      const ring = (r, y = 22) => { const pts = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z + 0.2]); } return pts; };
      poly(g, ring(18), '#2a3044', '#c3cbe0', 1.5);
      poly(g, ring(15.5), '#3a4258', alpha('#ffb340', 0.6), 1);
      const a0 = Math.sin(t * 0.25) * 0.4;
      g.save(); g.shadowColor = '#ffb340'; g.shadowBlur = 8;
      for (let i = 0; i < 3; i++) { const a = a0 + (i * Math.PI) / 3; line(g, [x + Math.cos(a) * 11, 22 + Math.sin(a) * 11, z + 0.4], [x - Math.cos(a) * 11, 22 - Math.sin(a) * 11, z + 0.4], '#d6dcea', 2.2); }
      poly(g, ring(3.2).map(([px, py, pz]) => [px, py, pz + 0.3]), '#ffb340');
      g.restore();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const p = P(x + Math.cos(a) * 16.8, 22 + Math.sin(a) * 16.8, z + 0.3); g.fillStyle = '#8a92a8'; g.beginPath(); g.arc(p.x, p.y, p.k * 0.8, 0, Math.PI * 2); g.fill(); }
    }

    // ---------- floor (drawn before everything else) ----------
    const decals = {};
    for (const [name, r] of Object.entries(R)) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64;
      const g = cv.getContext('2d');
      g.font = `700 40px ${HEAD}`; g.letterSpacing = '6px'; g.textBaseline = 'middle';
      g.fillStyle = alpha(r.accent, 0.95); g.fillText(r.label, 6, 34);
      decals[name] = cv;
    }
    function drawFloor(g, s) {
      refresh(s);
      // the slab and its front edge
      poly(g, [[-14, 0, 4], [494, 0, 4], [494, 0, 214], [-14, 0, 214]], '#070a13');
      // corridor, with light strips and packets running along it
      poly(g, [[-14, 0, 100], [494, 0, 100], [494, 0, 120], [-14, 0, 120]], '#0a0f1e');
      line(g, [-14, 0, 103], [494, 0, 103], 'rgba(111,168,255,0.22)', 1);
      line(g, [-14, 0, 117], [494, 0, 117], 'rgba(111,168,255,0.22)', 1);
      const accents = Object.values(R).map((r) => r.accent);
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const dir = i % 3 === 0 ? -1 : 1, sp = 40 + hash(i * 3) * 70, lane = 105 + hash(i * 5) * 10;
        let x = ((hash(i * 7) * 520 + s.sim * sp * dir) % 520 + 520) % 520 - 20;
        const col = accents[i % accents.length];
        g.shadowColor = col; g.shadowBlur = 8;
        line(g, [x, 0.05, lane], [x - 9 * dir, 0.05, lane], alpha(col, 0.85), 2);
      }
      g.restore();
      // room floors: a faint grid, a neon outline, the name painted on the floor
      for (const [name, r] of Object.entries(R)) {
        const z0 = r.row === 0 ? 14 : 120, z1 = r.row === 0 ? 100 : 206;
        poly(g, [[r.x + 1, 0, z0], [r.x + r.w - 1, 0, z0], [r.x + r.w - 1, 0, z1], [r.x + 1, 0, z1]], '#0b1120');
        g.strokeStyle = alpha(r.accent, 0.07); g.lineWidth = 1; g.beginPath();
        for (let x = r.x + 12; x < r.x + r.w; x += 12) { const a = P(x, 0, z0), b = P(x, 0, z1); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
        for (let z = z0 + 12; z < z1; z += 12) { const a = P(r.x + 1, 0, z), b = P(r.x + r.w - 1, 0, z); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
        g.stroke();
        // a pool of light under the room's work area
        const c = P(r.x + r.w / 2, 0, (z0 + z1) / 2), rad = r.w * 0.55 * c.k;
        const pool = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, rad);
        pool.addColorStop(0, alpha(r.accent, 0.1)); pool.addColorStop(1, alpha(r.accent, 0));
        g.fillStyle = pool; g.beginPath(); g.ellipse(c.x, c.y, rad, rad * 0.6, 0, 0, Math.PI * 2); g.fill();
        g.save(); g.shadowColor = r.accent; g.shadowBlur = 10;
        poly(g, [[r.x + 1.5, 0.05, z0 + 0.5], [r.x + r.w - 1.5, 0.05, z0 + 0.5], [r.x + r.w - 1.5, 0.05, z1 - 0.5], [r.x + 1.5, 0.05, z1 - 0.5]], null, alpha(r.accent, 0.55), 1.4);
        g.restore();
        quadTex(g, decals[name], [r.x + 7, 0.1, z1 - 10.5], [r.x + 7 + 64, 0.1, z1 - 10.5], [r.x + 7, 0.1, z1 - 2.5], 0.9);
      }
      // the vault's hatched line
      g.save(); g.beginPath(); D.path(g, [[392, 0.1, 148], [480, 0.1, 148], [480, 0.1, 153], [392, 0.1, 153]]); g.clip();
      for (let x = 388; x < 484; x += 5) line(g, [x, 0.1, 148], [x + 5, 0.1, 153], 'rgba(255,179,64,0.55)', 2);
      g.restore();
      // the front edge of the floor
      g.save(); g.shadowColor = '#6fa8ff'; g.shadowBlur = 14;
      line(g, [-14, 0, 214], [494, 0, 214], 'rgba(111,168,255,0.6)', 1.5);
      g.restore();
    }

    return { drawFloor, items };
  }

  window.DeskFloor = { create };
})();
