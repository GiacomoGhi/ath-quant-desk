// A tiny 3D layer for a 2D canvas: a perspective camera, projected polygons and boxes, textured quads (screens), floor
// shapes and a bloom pass. World axes: x along the floor plan, y up, z toward the viewer (the plan's y). No libraries.
(() => {
  const V = { pos: [0, 0, 0], f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0], focal: 1, cx: 0, cy: 0 };

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // cam: { pos: [x,y,z], target: [x,y,z], fov: vertical degrees }; (cx, cy) is where the target lands on the canvas
  function setView(cam, h, cx, cy) {
    const f = norm(sub(cam.target, cam.pos));
    const r = norm(cross(f, [0, 1, 0]));
    Object.assign(V, { pos: cam.pos, f, r, u: cross(r, f), focal: h / 2 / Math.tan((cam.fov * Math.PI) / 360), cx, cy });
  }
  // → screen point, its depth along the view, and k: pixels per world unit at that depth
  function P(x, y, z) {
    const dx = x - V.pos[0], dy = y - V.pos[1], dz = z - V.pos[2];
    const cz = Math.max(1, dx * V.f[0] + dy * V.f[1] + dz * V.f[2]);
    const k = V.focal / cz;
    return { x: V.cx + (dx * V.r[0] + dy * V.r[1] + dz * V.r[2]) * k, y: V.cy - (dx * V.u[0] + dy * V.u[1] + dz * V.u[2]) * k, z: cz, k };
  }
  const depth = (x, y, z) => (x - V.pos[0]) * V.f[0] + (y - V.pos[1]) * V.f[1] + (z - V.pos[2]) * V.f[2];

  function path(g, pts) {
    g.beginPath();
    pts.forEach((p, i) => { const q = P(p[0], p[1], p[2]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
    g.closePath();
  }
  function poly(g, pts, fill, stroke, lw = 1) {
    path(g, pts);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }
  function line(g, a, b, color, lw = 1) {
    const p = P(a[0], a[1], a[2]), q = P(b[0], b[1], b[2]);
    g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  }

  // ---------- colour ----------
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const shade = (h, f, a = 1) => rgb(hex(h).map((v) => (f >= 0 ? v + (255 - v) * f : v * (1 + f))), a);
  const alpha = (h, a) => rgb(hex(h), a);

  // A box (x0..x1, y0..y1, z0..z1): the faces that face the camera, lit from above-left. opts.edge outlines the top
  // in a light colour (a neon trim); opts.top overrides the top colour; opts.a makes it translucent.
  function box(g, b, color, opts = {}) {
    const { x0, x1, y0, y1, z0, z1 } = b, a = opts.a ?? 1;
    const faces = [];
    if (V.pos[1] > y1) faces.push([[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], opts.top ?? shade(color, 0.12, a)]);
    if (V.pos[2] > z1) faces.push([[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], shade(color, -0.12, a)]);
    if (V.pos[2] < z0) faces.push([[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], shade(color, -0.3, a)]);
    if (V.pos[0] < x0) faces.push([[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], shade(color, -0.32, a)]);
    if (V.pos[0] > x1) faces.push([[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], shade(color, -0.4, a)]);
    for (const [pts, c] of faces) poly(g, pts, c);
    if (opts.edge) {
      g.save();
      if (opts.glow) { g.shadowColor = opts.edge; g.shadowBlur = opts.glow; }
      poly(g, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], null, opts.edge, opts.lw ?? 1.2);
      g.restore();
    }
  }

  // Draws a texture onto the quad whose corners are tl, tr, bl (3D); an affine map, fine for screens seen near head-on.
  function quadTex(g, tex, tl, tr, bl, a = 1) {
    const p = P(...tl), q = P(...tr), r = P(...bl);
    g.save();
    g.globalAlpha = a;
    g.setTransform((q.x - p.x) / tex.width, (q.y - p.y) / tex.width, (r.x - p.x) / tex.height, (r.y - p.y) / tex.height, p.x, p.y);
    g.drawImage(tex, 0, 0);
    g.restore();
  }

  // a circle or ring lying on the floor (y = h)
  function floorEllipse(g, x, z, r, fill, stroke, lw = 1, h = 0) {
    const pts = [];
    for (let i = 0; i < 28; i++) { const t = (i / 28) * Math.PI * 2; pts.push([x + Math.cos(t) * r, h, z + Math.sin(t) * r]); }
    poly(g, pts, fill, stroke, lw);
  }

  // Bloom: a blurred, darkened copy of the frame added on top, so bright things (screens, neon) glow.
  const small = document.createElement('canvas');
  function bloom(g, strength = 0.7) {
    const w = g.canvas.width, h = g.canvas.height;
    small.width = Math.max(1, (w / 4) | 0); small.height = Math.max(1, (h / 4) | 0);
    const s = small.getContext('2d');
    s.filter = 'brightness(0.9) contrast(2.6) saturate(1.5) blur(5px)';
    s.drawImage(g.canvas, 0, 0, small.width, small.height);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = strength;
    g.imageSmoothingEnabled = true;
    g.drawImage(small, 0, 0, w, h);
    g.restore();
  }

  // ---------- determinism helpers ----------
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hash = (n) => { let t = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); t ^= t >>> 13; t = Math.imul(t, 0xc2b2ae35); t ^= t >>> 16; return (t >>> 0) / 4294967296; };
  // smooth noise in [-1, 1]
  const noise = (x, seed = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i + seed * 7919) * (1 - u) + hash(i + 1 + seed * 7919) * u) * 2 - 1; };
  const hashStr = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

  window.Desk3D = { V, setView, P, depth, path, poly, line, box, quadTex, floorEllipse, bloom, hex, rgb, shade, alpha, rng, hash, noise, hashStr };
})();
