// The desk's people, drawn as vector figures (no images): one outfit and one prop per role, an accent colour that
// lights their floor ring and name tag. Drawn in world units (a figure is about 20 tall) at a screen point and scale.
(() => {
  const D = window.Desk3D;

  // c: accent; top/vest/pants: clothes; outfit and acc pick the shapes below
  const ROLE_STYLE = {
    'scout':             { c: '#4fe08f', top: '#2c4a3b', pants: '#262b36', outfit: 'jacket', acc: 'headphones', hair: 'short' },
    'designer':          { c: '#b98cff', top: '#1b1a22', pants: '#24232c', outfit: 'turtleneck', acc: 'tablet', hair: 'bun' },
    'analyst':           { c: '#6fa8ff', top: '#e9eef6', vest: '#22314d', pants: '#2b3448', outfit: 'vest', acc: 'glasses', hair: 'side' },
    'builder':           { c: '#ff9f43', top: '#2b2d35', pants: '#1e2027', outfit: 'hoodie', acc: 'laptop', hair: 'messy' },
    'verifier':          { c: '#2fe0c8', top: '#dde8ee', pants: '#2b3240', outfit: 'shirt', acc: 'clipboard', hair: 'short' },
    'quant':             { c: '#ff6fa5', top: '#cddcf5', vest: '#5a606e', pants: '#2b2f3a', outfit: 'vest', acc: 'glasses', hair: 'curly' },
    'portfolio manager': { c: '#ffd166', top: '#1a2340', pants: '#1a2340', tie: '#ffd166', outfit: 'suit', acc: 'watch', hair: 'slick' },
    'prop strategist':   { c: '#ff5d5d', top: '#3b1d22', pants: '#22232b', outfit: 'bomber', acc: 'headset', hair: 'cap' },
    'head of desk':      { c: '#e8ecf7', top: '#272b35', pants: '#272b35', outfit: 'open', acc: 'mug', hair: 'silver' },
  };
  const SKINS = ['#f1c7a3', '#e0ac85', '#c98e66', '#a86f4c', '#8a5a3c', '#6b4530', '#f6d5bd'];
  const HAIRS = ['#1d1a1f', '#3b2a20', '#5a3a22', '#7a4a2a', '#c4552f', '#d9b36c', '#2a2430'];

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function limb(g, x0, y0, x1, y1, w, color) {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  function dot(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

  // (x, y): the feet on screen; k: pixels per world unit; facing: 1 right, -1 left; t: seconds (for the gait);
  // held: true when carrying a card (the card itself is drawn by the caller at handPoint()).
  function drawPerson(g, role, seat, pose, t, x, y, k, facing) {
    const st = ROLE_STYLE[role] ?? ROLE_STYLE['head of desk'];
    const seed = D.hashStr(`${role}#${seat}`);
    const skin = role === 'head of desk' ? SKINS[0] : SKINS[seed % SKINS.length];
    const hairC = st.hair === 'silver' ? '#c9ccd6' : HAIRS[(seed >>> 4) % HAIRS.length];
    const walking = pose === 'walk' || pose === 'carry';
    const ph = t * 10;
    const sw = walking ? Math.sin(ph) : 0;
    const bob = walking ? -Math.abs(Math.cos(ph)) * 0.45 : pose === 'idle' ? Math.sin(t * 2.2 + seed) * 0.12 : 0;
    const sleeve = st.outfit === 'vest' ? st.top : st.top;
    const body = st.outfit === 'vest' ? st.vest : st.top;

    g.save();
    g.translate(x, y);
    g.scale(k * facing, k);
    g.translate(0, bob);

    // legs (far, then near), shoes
    const hip = -8.2;
    const legs = [[-0.9, -sw * 0.5, D.shade(st.pants, -0.25)], [0.9, sw * 0.5, st.pants]];
    for (const [ox, a, c] of legs) {
      const fx = ox + Math.sin(a) * 8, fy = hip + Math.cos(a) * 8;
      limb(g, ox, hip, fx, fy - 0.4, 1.9, c);
      g.fillStyle = '#0d0f15'; rr(g, fx - 0.9, fy - 1.0, 2.6, 1.1, 0.5); g.fill();
    }

    // far arm
    const armSw = walking && pose !== 'carry' ? sw * 0.55 : 0;
    const farHand = pose === 'carry' ? [3.6, -12.4] : [-0.6 - Math.sin(armSw) * 4.6, -9.6 + Math.abs(Math.sin(armSw)) * 0.6];
    limb(g, -1.6, -14.2, farHand[0], farHand[1], 1.5, D.shade(sleeve, -0.3));
    dot(g, farHand[0], farHand[1], 0.7, D.shade(skin, -0.2));

    // torso
    g.beginPath();
    g.moveTo(-3.1, -14.6); g.quadraticCurveTo(-3.3, -15.6, -2.2, -15.7);
    g.lineTo(2.4, -15.7); g.quadraticCurveTo(3.4, -15.6, 3.2, -14.4);
    g.lineTo(2.7, -7.6); g.lineTo(-2.6, -7.6); g.closePath();
    g.fillStyle = body; g.fill();
    g.strokeStyle = D.alpha(st.c, 0.55); g.lineWidth = 0.3; g.stroke(); // rim light in the role's colour
    outfit(g, st);

    // head
    const hx = 0.35, hy = -18.2;
    g.fillStyle = skin; g.fillRect(-0.55, -16.8, 1.3, 1.4);
    dot(g, hx, hy, 2.45, skin);
    hair(g, st.hair, hx, hy, hairC, st.c);
    dot(g, hx + 0.95, hy + 0.05, 0.27, '#14121a');
    dot(g, hx + 2.0, hy + 0.05, 0.25, '#14121a');
    accessory(g, st, hx, hy, pose, t);

    // near arm and what it holds
    let hand;
    if (pose === 'carry') hand = [4.2, -12.0];
    else if (pose === 'work') { const w = Math.sin(t * 7 + seed); hand = [3.9 + w * 0.5, -12.6 - Math.max(0, w) * 1.6]; }
    else hand = [1.2 + Math.sin(armSw) * 4.6, -9.6 + Math.abs(Math.sin(armSw)) * 0.6];
    limb(g, 1.9, -14.2, hand[0], hand[1], 1.6, sleeve === body ? D.shade(sleeve, 0.06) : sleeve);
    if (st.acc === 'watch') { g.fillStyle = st.c; g.fillRect(hand[0] - 0.9, hand[1] - 0.9, 0.9, 0.7); }
    dot(g, hand[0], hand[1], 0.72, skin);
    if (pose !== 'carry') prop(g, st, hand, pose, t);

    g.restore();
  }
  // where a carried card sits, relative to the feet, in world units (before facing)
  const HAND = { x: 4.6, y: 14.2 };

  function outfit(g, st) {
    const o = st.outfit;
    if (o === 'vest') {
      // the shirt shows at the collar and down the middle; the fleece vest around it
      g.fillStyle = st.top;
      g.beginPath(); g.moveTo(-1.0, -15.7); g.lineTo(1.4, -15.7); g.lineTo(0.3, -11.6); g.closePath(); g.fill();
      g.strokeStyle = D.shade(st.vest, -0.35); g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(0.3, -11.6); g.lineTo(0.3, -7.8); g.stroke();
      g.fillStyle = D.shade(st.vest, 0.25); g.fillRect(1.1, -13.2, 0.9, 0.5); // the logo patch
    } else if (o === 'suit' || o === 'open') {
      g.fillStyle = '#eef1f6';
      g.beginPath(); g.moveTo(-1.1, -15.7); g.lineTo(1.5, -15.7); g.lineTo(0.3, -11.2); g.closePath(); g.fill();
      if (o === 'suit') { g.fillStyle = st.tie; g.beginPath(); g.moveTo(0.0, -15.4); g.lineTo(0.6, -15.4); g.lineTo(0.75, -12.2); g.lineTo(0.3, -11.6); g.lineTo(-0.15, -12.2); g.closePath(); g.fill(); }
      g.strokeStyle = D.shade(st.top, -0.4); g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(-1.1, -15.7); g.lineTo(0.3, -11.2); g.lineTo(1.5, -15.7); g.stroke();
      g.fillStyle = D.shade(st.top, 0.25); g.fillRect(1.6, -13.6, 1.0, 0.35); // pocket square line
    } else if (o === 'hoodie') {
      g.fillStyle = D.shade(st.top, -0.25);
      g.beginPath(); g.ellipse(-0.6, -15.6, 2.6, 1.1, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = st.c; g.lineWidth = 0.28;
      g.beginPath(); g.moveTo(-0.2, -15.0); g.lineTo(-0.3, -12.8); g.moveTo(1.0, -15.0); g.lineTo(1.1, -12.6); g.stroke();
      g.strokeStyle = D.shade(st.top, -0.35); g.beginPath(); g.moveTo(-1.8, -9.9); g.lineTo(2.2, -9.9); g.stroke();
    } else if (o === 'turtleneck') {
      g.fillStyle = D.shade(st.top, 0.12); rr(g, -1.0, -16.6, 2.6, 1.3, 0.5); g.fill();
    } else if (o === 'shirt') {
      g.strokeStyle = st.c; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(-0.9, -15.6); g.lineTo(0.3, -12.6); g.lineTo(1.3, -15.6); g.stroke();
      g.fillStyle = st.c; g.fillRect(-0.3, -12.7, 1.3, 1.6);
      g.fillStyle = '#ffffff'; g.fillRect(-0.1, -12.4, 0.9, 0.35);
    } else if (o === 'jacket') {
      g.strokeStyle = D.shade(st.top, 0.3); g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(0.3, -15.6); g.lineTo(0.3, -7.8); g.stroke();
      g.fillStyle = D.shade(st.top, 0.15); g.fillRect(-1.6, -16.2, 3.8, 0.9);
    } else if (o === 'bomber') {
      g.fillStyle = st.c; g.fillRect(-2.6, -8.6, 5.3, 0.9);
      g.fillStyle = D.shade(st.top, 0.2); g.fillRect(-1.6, -16.2, 3.8, 0.9);
      g.strokeStyle = '#c9ccd6'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(0.3, -15.4); g.lineTo(0.3, -8.6); g.stroke();
    }
  }

  function hair(g, kind, x, y, c, accent) {
    g.fillStyle = c;
    if (kind === 'cap') {
      g.fillStyle = accent; g.beginPath(); g.arc(x, y - 0.4, 2.55, Math.PI, 0); g.fill();
      g.fillRect(x, y - 0.9, 3.6, 0.6);
      return;
    }
    g.beginPath();
    if (kind === 'bun') { g.arc(x, y - 0.3, 2.6, Math.PI * 0.95, Math.PI * 2.05); g.fill(); dot(g, x - 1.6, y - 2.6, 1.1, c); return; }
    if (kind === 'curly') { for (let i = 0; i < 6; i++) dot(g, x - 2.2 + i * 0.85, y - 1.9 - Math.sin(i * 1.3) * 0.5, 0.95, c); dot(g, x - 2.0, y - 0.6, 0.9, c); return; }
    if (kind === 'messy') { g.arc(x, y - 0.4, 2.6, Math.PI * 0.9, Math.PI * 2.02); g.fill(); for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x - 1.8 + i * 1.2, y - 2.3); g.lineTo(x - 1.2 + i * 1.2, y - 3.3); g.lineTo(x - 0.6 + i * 1.2, y - 2.3); g.fill(); } return; }
    if (kind === 'slick') { g.arc(x, y - 0.3, 2.6, Math.PI * 0.92, Math.PI * 1.98); g.fill(); g.strokeStyle = D.shade(c, 0.35); g.lineWidth = 0.2; g.beginPath(); g.moveTo(x - 1.6, y - 2.0); g.quadraticCurveTo(x, y - 2.8, x + 1.8, y - 1.8); g.stroke(); return; }
    if (kind === 'side') { g.arc(x, y - 0.3, 2.6, Math.PI * 0.9, Math.PI * 2.0); g.fill(); g.beginPath(); g.moveTo(x - 0.5, y - 2.6); g.quadraticCurveTo(x + 2.4, y - 2.2, x + 2.6, y - 0.6); g.lineTo(x + 1.0, y - 1.6); g.fill(); return; }
    if (kind === 'silver') { g.arc(x, y - 0.2, 2.6, Math.PI * 0.88, Math.PI * 1.96); g.fill(); return; }
    g.arc(x, y - 0.3, 2.6, Math.PI * 0.9, Math.PI * 2.0); g.fill();
  }

  function accessory(g, st, x, y, pose, t) {
    if (st.acc === 'glasses') {
      g.strokeStyle = '#101018'; g.lineWidth = 0.22;
      g.strokeRect(x + 0.45, y - 0.45, 0.95, 0.85); g.strokeRect(x + 1.6, y - 0.45, 0.85, 0.85);
      g.beginPath(); g.moveTo(x + 0.45, y - 0.1); g.lineTo(x - 1.2, y - 0.3); g.stroke();
    } else if (st.acc === 'headphones' || st.acc === 'headset') {
      g.strokeStyle = '#15161d'; g.lineWidth = 0.55;
      g.beginPath(); g.arc(x - 0.2, y - 0.2, 2.75, Math.PI * 1.05, Math.PI * 1.85); g.stroke();
      g.fillStyle = '#15161d'; rr(g, x - 1.4, y - 0.8, 1.3, 1.9, 0.5); g.fill();
      g.fillStyle = st.c; g.fillRect(x - 1.1, y - 0.3, 0.5, 0.9);
      if (st.acc === 'headset') { g.strokeStyle = '#15161d'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(x - 0.6, y + 0.9); g.quadraticCurveTo(x + 0.6, y + 2.0, x + 1.8, y + 1.4); g.stroke(); dot(g, x + 1.8, y + 1.4, 0.3, st.c); }
    }
  }

  function prop(g, st, [hx, hy], pose, t) {
    const a = st.acc;
    if (a === 'tablet' || a === 'clipboard' || a === 'glasses') {
      // a glowing tablet, held up while working
      const lift = pose === 'work' ? -1.2 : 0.6;
      g.save(); g.translate(hx + 0.2, hy + lift); g.rotate(-0.25);
      g.fillStyle = '#0d0f17'; rr(g, -0.2, -2.6, 2.6, 3.4, 0.35); g.fill();
      g.fillStyle = D.alpha(st.c, pose === 'work' ? 0.95 : 0.6); g.fillRect(0.1, -2.3, 2.0, 2.8);
      if (a === 'clipboard') { g.strokeStyle = '#0d0f17'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(0.5, -1.0); g.lineTo(1.0, -0.4); g.lineTo(1.8, -1.8); g.stroke(); }
      g.restore();
    } else if (a === 'laptop') {
      g.save(); g.translate(hx - 0.6, hy - 0.2);
      g.fillStyle = '#9aa1b2'; rr(g, -1.4, -0.6, 3.6, 2.4, 0.3); g.fill();
      g.fillStyle = st.c; dot(g, 0.4, 0.6, 0.35, st.c);
      g.restore();
    } else if (a === 'mug') {
      g.fillStyle = '#f2f3f7'; rr(g, hx - 0.5, hy - 1.8, 1.6, 1.9, 0.3); g.fill();
      g.strokeStyle = '#f2f3f7'; g.lineWidth = 0.3; g.beginPath(); g.arc(hx + 1.2, hy - 0.9, 0.5, -1.3, 1.3); g.stroke();
      if (Math.sin(t * 1.5) > -0.2) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(hx + 0.2, hy - 2.1); g.quadraticCurveTo(hx + 0.8, hy - 2.9, hx + 0.2, hy - 3.6); g.stroke(); }
    } else if (a === 'headphones') {
      g.fillStyle = '#0d0f17'; rr(g, hx - 0.5, hy - 1.2, 1.2, 2.0, 0.3); g.fill();
      g.fillStyle = D.alpha(st.c, 0.8); g.fillRect(hx - 0.3, hy - 1.0, 0.8, 1.4);
    } else if (a === 'headset') {
      g.fillStyle = '#0d0f17'; rr(g, hx - 0.4, hy - 1.4, 1.1, 1.8, 0.3); g.fill();
    } else if (a === 'watch' && pose === 'work') {
      g.fillStyle = '#0d0f17'; rr(g, hx - 0.4, hy - 2.2, 2.0, 2.6, 0.3); g.fill();
      g.fillStyle = D.alpha(st.c, 0.85); g.fillRect(hx - 0.2, hy - 2.0, 1.6, 2.0);
    }
  }

  // A strategy card: a small glowing tile. (x, y) is its bottom centre on screen; k pixels per world unit.
  function drawCard(g, x, y, k, color, bright = 1) {
    const w = 5.2 * k, h = 6.8 * k;
    g.save();
    g.shadowColor = color; g.shadowBlur = 3 * k * bright;
    g.fillStyle = 'rgba(12,16,28,0.92)'; rr(g, x - w / 2, y - h, w, h, 0.7 * k); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = color; g.lineWidth = Math.max(1, 0.35 * k); g.stroke();
    g.fillStyle = color; g.fillRect(x - w / 2 + 0.6 * k, y - h + 0.6 * k, w - 1.2 * k, 1.2 * k);
    g.fillStyle = 'rgba(220,230,255,0.55)';
    for (let i = 0; i < 3; i++) g.fillRect(x - w / 2 + 0.9 * k, y - h + (2.8 + i * 1.2) * k, (i === 2 ? 2.2 : 3.4) * k, 0.4 * k);
    g.restore();
  }

  const GLYPH = { tick: ['✓', '#4be38a'], cross: ['✕', '#ff4d6d'], bang: ['!', '#ffb340'], ask: ['?', '#6fa8ff'], bulb: ['✦', '#ffe066'], note: ['✉', '#e8ecf7'] };
  function drawEmote(g, name, x, y, r) {
    const e = GLYPH[name];
    if (!e) return;
    g.save();
    g.shadowColor = e[1]; g.shadowBlur = r * 1.2;
    g.fillStyle = 'rgba(10,13,24,0.92)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = e[1]; g.lineWidth = Math.max(1.5, r * 0.14); g.stroke();
    g.fillStyle = e[1]; g.font = `800 ${Math.round(r * 1.25)}px "Segoe UI Symbol", "Segoe UI", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e[0], x, y + r * 0.06);
    g.restore();
  }

  window.DeskArt = { ROLE_STYLE, drawPerson, drawCard, drawEmote, HAND, rr };
})();
