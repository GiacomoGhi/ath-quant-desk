// The visual desk: rooms are stages, cards are carried between them, log lines become speech bubbles.
// Replay is deterministic: a fixed 60 Hz simulation driven by the playback clock, seeded randomness only.
(() => {
  const A = window.DeskArt;
  const STEP = 1 / 60;
  const CORRIDOR_Y = 110;
  const params = new URLSearchParams(location.search);
  const LIVE = params.has('live');
  const DURATION = Math.max(20, Number(params.get('duration')) || 90);
  const INTRO = LIVE ? 0 : 3, OUTRO = 6;

  // ---------- the floor ----------
  const ROOMS = {
    library:   { col: 0, row: 0, label: 'RESEARCH', accent: '#6fa8ff' },
    studio:    { col: 1, row: 0, label: 'DESIGN', accent: '#b98cff' },
    workshop:  { col: 2, row: 0, label: 'BUILD', accent: '#ff9f43' },
    bench:     { col: 3, row: 0, label: 'VERIFY', accent: '#2fe0c8' },
    lab:       { col: 4, row: 0, label: 'VALIDATE', accent: '#4dd2ff' },
    office:    { col: 0, row: 1, label: 'HEAD OF DESK', accent: '#e8ecf7' },
    store:     { col: 1, row: 1, label: 'PARKED · SHRED', accent: '#ff4d6d' },
    trophy:    { col: 2, row: 1, label: 'LIBRARY', accent: '#ffd166' },
    incubator: { col: 3, row: 1, label: 'INCUBATION', accent: '#4be38a' },
    vault:     { col: 4, row: 1, label: 'HOLD-OUT', accent: '#9aa6c8' },
  };
  for (const r of Object.values(ROOMS)) {
    r.x = r.col * 96; r.y = r.row === 0 ? 14 : 120; r.w = 96; r.h = 86;
    r.doorX = r.x + 48;
    r.inside = { x: r.doorX, y: r.row === 0 ? r.y + 80 : r.y + 26 };
    r.busyUntil = -1;
  }
  const at = (room, dx, dy) => ({ x: ROOMS[room].x + dx, y: ROOMS[room].y + dy });

  const STAGE_ROOM = {
    research: 'library', build: 'workshop', verify: 'bench', validate: 'lab', holdout: 'vault',
    incubation: 'incubator', library: 'trophy', portfolios: 'trophy', prop: 'trophy', parked: 'store', retired: 'store',
  };
  const TRAY = {
    library: at('library', 74, 58), workshop: at('workshop', 76, 58), bench: at('bench', 76, 58), lab: at('lab', 78, 58),
    vault: at('vault', 76, 60), incubator: at('incubator', 80, 62), trophy: at('trophy', 78, 34), store: at('store', 7, 3),
  };
  const DESK = {
    library: at('library', 32, 33), workshop: at('workshop', 24, 31), bench: at('bench', 20, 31), lab: at('lab', 60, 39),
    vault: at('vault', 30, 60), incubator: at('incubator', 14, 30), trophy: at('trophy', 24, 51),
  };
  const WAITING = at('lab', 9, 63);
  const BIN = at('store', 72, 56);

  const HOMES = {
    'scout#1': at('library', 16, 64), 'analyst#1': at('library', 40, 56), 'analyst#2': at('library', 58, 56),
    'analyst#3': at('library', 30, 76), 'designer#1': at('studio', 46, 62), 'builder#1': at('workshop', 38, 58),
    'builder#2': at('workshop', 56, 64), 'verifier#1': at('bench', 40, 58), 'verifier#2': at('bench', 56, 64),
    'quant#1': at('lab', 50, 66), 'quant#2': at('lab', 30, 74), 'portfolio manager#1': at('trophy', 30, 72),
    'prop strategist#1': at('trophy', 64, 74), 'head of desk#1': at('office', 48, 66),
  };
  const ROLE_ROOM = {
    scout: 'library', designer: 'studio', analyst: 'library', builder: 'workshop', verifier: 'bench', quant: 'lab',
    'portfolio manager': 'trophy', 'prop strategist': 'trophy', 'head of desk': 'office',
  };
  function homeOf(role, seat) {
    const h = HOMES[`${role}#${seat}`];
    if (h) return { ...h };
    const r = ROOMS[ROLE_ROOM[role] ?? 'office'];
    return { x: r.x + 20 + ((seat * 23) % 60), y: r.y + 70 };
  }

  function roomAt(p) {
    for (const r of Object.values(ROOMS)) if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return r;
    return null;
  }
  function route(from, to) {
    const ra = roomAt(from), rb = roomAt(to);
    if (ra && ra === rb) return [to];
    const pts = [];
    if (ra) pts.push(ra.inside, { x: ra.doorX, y: CORRIDOR_Y });
    else pts.push({ x: from.x, y: CORRIDOR_Y });
    if (rb) pts.push({ x: rb.doorX, y: CORRIDOR_Y }, rb.inside, to);
    else pts.push(to);
    return pts.map((p) => ({ ...p }));
  }

  // ---------- seeded randomness ----------
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 90% 64%)`; };

  // ---------- state ----------
  let TL = null, S = null, ACTS = [], PLAN = null;
  const WALK = 125; // px per second, before the tempo
  let TEMPO = 1; // the replay's pace: above 1 when the busiest character needs it to fit the day in DURATION

  const startingActors = () => {
    const newcomer = new Set((TL.newcomers ?? []).map((n) => `${n.role}#${n.seat}`));
    return Object.keys(A.ROLE_STYLE).filter((role) => !newcomer.has(`${role}#1`));
  };

  function newState() {
    const s = {
      sim: 0, play: 0, next: 0, actors: new Map(), cards: new Map(), locs: new Map(), effects: [], ticker: [],
      bin: 0, done: false, cam: { x: 240, z: 112, w: 0 }, focus: null, stats: { lead: 0, pass: 0, sendback: 0, retire: 0, park: 0 }, R: rng(42),
      shown: TL.events.length ? TL.events[0].t - 5 * 60_000 : Date.now(),
    };
    for (const role of startingActors()) addActor(s, role, 1, homeOf(role, 1));
    for (const c of TL.cards) {
      const card = newCard(s, c.id, c.title);
      if (c.start) place(s, card, c.start);
    }
    return s;
  }

  // ---------- the replay plan ----------
  // A burst of routine lines (one character, minutes apart, no move or verdict between; several cards when a session
  // works them side by side) is acted as one action: one bubble naming what was done, one ticker line. A claim carries the routine work that follows it
  // ("claimed · reading sources · writing the card"). Other moves and verdicts are always acted on their own.
  const GROUP_GAP = 10 * 60_000, GROUP_MAX = 8;
  function buildActs(events) {
    const acts = [], open = new Map();
    for (const e of events) {
      const key = `${e.role}#${e.seat}`;
      const routine = !e.to && !IMPORTANT.has(e.kind) && e.role !== 'owner' && !e.dispatched?.length;
      const opens = routine || (e.kind === 'claim' && e.to?.endsWith(':working'));
      const g = open.get(key);
      const joins = g && (g.card === e.card || (g.kind !== 'claim' && g.cards.length < 3));
      if (routine && joins && e.t - g.tLast <= GROUP_GAP && g.n < GROUP_MAX) {
        g.n++; g.tLast = e.t;
        if (e.card && !g.cards.includes(e.card)) g.cards.push(e.card);
        if (!g.says.includes(e.say)) {
          g.says.push(e.say);
          const real = g.says.filter((x) => x !== 'working'); // "working" is filler beside a real phrase
          g.say = (real.length ? real : g.says).slice(0, 3).join(' · ');
        }
        if (e.text) g.text = `${g.first}  (+${g.n - 1})`;
        continue;
      }
      const act = { ...e, n: 1, says: [e.say], tLast: e.t, first: e.text, cards: e.card ? [e.card] : [] };
      acts.push(act);
      if (opens) open.set(key, act); else open.delete(key);
    }
    return acts;
  }

  // Each action, taken in real-time order, has a base position (a compressed copy of real time: long idle gaps shrink)
  // and starts at the later of that base and the moment its character has finished the action before (walking +
  // speaking) and the card it moves has been put down. Characters overlap freely, but no action starts before every
  // action more than HOLD real minutes older has started, so nobody runs far ahead of a busy colleague. The clock is
  // drawn through the points where actions start (it holds while someone is behind). Actions play in start order.
  function pathLen(from, to) {
    const ra = roomAt(from), rb = roomAt(to);
    if (ra && ra === rb) return Math.hypot(to.x - from.x, to.y - from.y);
    let d = 0, p = from;
    for (const q of route(from, to)) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
    return d;
  }
  const warp = (min) => (min <= 0 ? 0 : Math.min(min, 6) + 0.12 * Math.min(Math.max(0, min - 6), 120));
  const actorOf = (a) => (a.role === 'owner' ? 'head of desk#1' : `${a.role}#${a.seat}`);
  const SAY = (a) => (IMPORTANT.has(a.kind) ? 1.4 : 0.9); // seconds a character holds still to speak, before the tempo
  const HOLD = 2 * 60_000, TEMPO_MAX = 4, RATE_MIN = 0.12;
  function plan(acts, rate, tempo) {
    const pos = new Map(), cardLoc = new Map(), free = new Map(), cardFree = new Map();
    for (const role of startingActors()) pos.set(`${role}#1`, homeOf(role, 1));
    for (const c of TL.cards) if (c.start) cardLoc.set(c.id, c.start);
    const rows = [];
    let base = INTRO, prevT = acts[0]?.t ?? 0, end = INTRO, k = 0, held = 0;
    for (const a of acts) {
      while (k < rows.length && rows[k].act.t < a.t - HOLD) held = Math.max(held, rows[k++].at);
      base = Math.max(base, held) + rate * warp((a.t - prevT) / 60_000); // a gap gets its time after the hold
      prevT = a.t;
      const key = actorOf(a), role = key.split('#')[0], seat = Number(key.split('#')[1]);
      const home = homeOf(role, seat);
      let here = pos.get(key), d = 0;
      if (!here) { here = { x: -8, y: CORRIDOR_Y }; d += pathLen(here, home) / WALK + 1.4; here = home; }
      let t = Math.max(base, free.get(key) ?? 0, a.to && a.card ? cardFree.get(a.card) ?? 0 : 0);
      if (a.to && a.card) {
        const from = cardLoc.get(a.card) ?? a.from;
        if (from) { d += pathLen(here, standFor(from)) / WALK; here = standFor(from); }
        d += pathLen(here, standFor(a.to)) / WALK + 0.6;
        here = standFor(a.to);
        d /= tempo;
        cardLoc.set(a.card, a.to);
        cardFree.set(a.card, t + d);
      } else {
        if (roomAt(here) !== roomAt(home)) { d += pathLen(here, home) / WALK; here = home; }
        d = (d + SAY(a)) / tempo;
      }
      pos.set(key, here); free.set(key, t + d);
      rows.push({ act: a, base, at: t, d });
      end = Math.max(end, t + d);
    }
    const played = [...rows].sort((x, y) => x.at - y.at || x.base - y.base);
    let m = -Infinity;
    const knot = rows.map((r) => (m = Math.max(m, r.at)));
    return { acts: played.map((r) => r.act), at: played.map((r) => r.at), knot, t: rows.map((r) => r.act.t),
      end, rate, tempo, late: Math.max(0, ...rows.map((r) => r.at - r.base)) };
  }
  // The slowest pace that fits the day in DURATION (keeping some time for the clock to move through idle stretches),
  // then the clock rate that ends it on time. Deterministic. If even TEMPO_MAX doesn't fit, the replay runs longer.
  function solvePlan(acts) {
    const want = DURATION - OUTRO;
    const search = (lo, hi, fits, n = 30) => { for (let i = 0; i < n; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } return hi; };
    let tempo = 1;
    if (plan(acts, RATE_MIN, 1).end > want) {
      tempo = plan(acts, RATE_MIN, TEMPO_MAX).end > want ? TEMPO_MAX : search(1, TEMPO_MAX, (x) => plan(acts, RATE_MIN, x).end <= want);
    }
    const rate = plan(acts, RATE_MIN, tempo).end > want ? RATE_MIN
      : search(RATE_MIN, 20, (r) => plan(acts, r, tempo).end > want) - 1e-6;
    return plan(acts, Math.max(RATE_MIN, rate * 0.999), tempo);
  }
  // The on-screen clock: real time as a monotone function of the playback position, through the plan's knots.
  function clockAt(play) {
    const { knot: base, t } = PLAN;
    if (!base.length) return Date.now();
    if (play <= base[0]) return t[0] - (base[0] - play) * 60_000;
    let i = base.length - 1;
    while (i > 0 && base[i] > play) i--;
    if (i === base.length - 1) return t[i];
    const span = base[i + 1] - base[i];
    return span > 0 ? t[i] + (t[i + 1] - t[i]) * Math.min(1, (play - base[i]) / span) : t[i + 1];
  }

  function newCard(s, id, title = '') {
    const card = { id, title, color: hue(id), loc: null, heldBy: null, x: 0, y: 0, moves: [] };
    s.cards.set(id, card);
    return card;
  }

  function addActor(s, role, seat, pos) {
    const a = { key: `${role}#${seat}`, role, seat, x: pos.x, y: pos.y, home: homeOf(role, seat), queue: [], task: null,
      pose: 'idle', ft: 0, facing: 1, held: null, bubble: null, emote: null, path: null };
    s.actors.set(a.key, a);
    return a;
  }

  function locList(s, loc) { if (!s.locs.has(loc)) s.locs.set(loc, []); return s.locs.get(loc); }
  function slot(loc, i) {
    const [stage, sub] = loc.split(':');
    const room = STAGE_ROOM[stage] ?? 'store';
    if (stage === 'retired') return { x: BIN.x + 4, y: BIN.y };
    if (stage === 'parked') return { x: TRAY.store.x + (i % 4) * 7, y: TRAY.store.y + (i % 8 >= 4 ? 8 : 0) };
    if (sub === 'waiting') return { x: WAITING.x + (i % 3) * 7, y: WAITING.y };
    if (sub === 'working' && DESK[room]) return { x: DESK[room].x + (i % 5) * 7, y: DESK[room].y - Math.floor(i / 5) * 3 };
    const t = TRAY[room] ?? TRAY.library;
    return { x: t.x + (i % 5) * 1, y: t.y - i * 2 };
  }
  // where a character stands to reach a card at a location
  function standFor(loc) {
    const p = slot(loc, 0);
    const [stage, sub] = loc.split(':');
    if (stage === 'retired') return { x: BIN.x - 4, y: BIN.y + 22 };
    if (stage === 'parked') return { x: ROOMS.store.x + 22, y: ROOMS.store.y + 34 };
    if (sub === 'waiting') return { x: p.x + 8, y: p.y + 20 };
    return { x: p.x + 3, y: p.y + (sub === 'working' ? 22 : 18) };
  }
  function place(s, card, loc) {
    if (card.loc) { const l = locList(s, card.loc); const i = l.indexOf(card); if (i >= 0) l.splice(i, 1); relayout(s, card.loc); }
    card.loc = loc;
    if (loc.startsWith('retired')) { s.bin++; card.gone = true; return; }
    card.gone = false;
    locList(s, loc).push(card);
    relayout(s, loc);
  }
  function relayout(s, loc) { locList(s, loc).forEach((c, i) => { const p = slot(loc, i); c.x = p.x; c.y = p.y; }); }

  // ---------- events → tasks ----------
  const IMPORTANT = new Set(['pass', 'retire', 'sendback', 'defect', 'fail', 'park', 'unpark', 'lead', 'claim', 'pullback', 'ruling', 'news', 'ask']);
  const RING = { pass: '#38e08c', lead: '#ffe066', unpark: '#38e08c', sendback: '#ffb340', defect: '#ffb340', fail: '#ff4d6d', retire: '#ff4d6d', park: '#8b93a8' };
  // the camera drifts toward where something important happens (it stays on one spot at least 3 s)
  function focusOn(s, x, z) { if (!s.focus || s.sim - s.focus.since > 3) s.focus = { x, z, since: s.sim, until: s.sim + 5 }; }
  const EMOTE_OF = { pass: 'tick', retire: 'cross', fail: 'cross', defect: 'bang', sendback: 'bang', ask: 'ask', lead: 'bulb', ruling: 'note' };
  const roleColor = (role) => A.ROLE_STYLE[role]?.c ?? '#cfd3dc';
  const tagColor = (role) => (role === 'head of desk' ? '#c3cbe0' : roleColor(role));
  const isPrivate = () => TL.mode === 'private';
  const cardsOf = (ev) => (ev.cards?.length > 1 ? ev.cards.join(', ') : ev.card);
  const bubbleText = (ev) => (isPrivate() && ev.text ? ev.text : `${ev.card && !ev.say.includes(ev.card) ? cardsOf(ev) + ' · ' : ''}${ev.say}`);

  // The ticker follows the animation: a line appears when its character acts on it.
  function tick(s, ev) {
    if (!ev) return;
    const many = ev.cards?.length > 1;
    const text = (many ? cardsOf(ev) + ' · ' : '') + (isPrivate() && ev.text ? ev.text : ev.say), top = s.ticker[0];
    const card = many ? null : ev.card;
    if (top && top.role === ev.role && top.seat === ev.seat && top.card === card && top.text === text) { top.n++; top.t = ev.t; top.est = !!ev.est; }
    else s.ticker.unshift({ t: ev.t, est: !!ev.est, role: ev.role, seat: ev.seat, card, text, born: s.sim, n: 1 });
    s.ticker.length = Math.min(s.ticker.length, 6);
    s.tickT = Math.max(s.tickT ?? 0, ev.t);
  }
  function enq(s, a, ...tasks) { for (const t of tasks) { t.at = s.sim; a.queue.push(t); } }
  function handle(s, ev) {
    if (ev.to && ev.kind in s.stats) s.stats[ev.kind]++; // count card moves only, not the news of them
    if (ev.role === 'owner') {
      const hod = s.actors.get('head of desk#1');
      s.effects.push({ type: 'letter', x: hod.x, z: hod.y, t0: s.sim, until: s.sim + 2.2 });
      focusOn(s, hod.x, hod.y);
      enq(s, hod, { type: 'say', ev, text: bubbleText(ev), kind: 'ruling', dur: SAY({ kind: 'ruling' }) });
      return;
    }
    let a = s.actors.get(`${ev.role}#${ev.seat}`);
    if (!a) {
      a = addActor(s, ev.role, ev.seat, { x: -8, y: CORRIDOR_Y });
      enq(s, a, { type: 'walk', to: a.home }, { type: 'emote', name: 'bulb' });
    }
    if (ev.to || IMPORTANT.has(ev.kind)) focusOn(s, a.x, a.y);
    for (const r of ev.dispatched ?? []) {
      const d = s.actors.get(`${r}#1`);
      if (d) d.emote = { name: 'bang', until: s.sim + 1.5 };
    }
    const card = ev.card ? s.cards.get(ev.card) ?? newCard(s, ev.card) : null;
    if (ev.to && card) {
      const fromLoc = card.plan ?? card.loc ?? ev.from;
      card.plan = ev.to;
      if (!fromLoc && !card.loc && !card.heldBy) {
        if (ev.kind === 'lead') { enq(s, a, { type: 'spawn', card }); }
        else place(s, card, `${ev.to.split(':')[0]}:ready`);
      }
      // a card's moves happen in log order: this one waits for the moves queued before it by others
      const token = { a }, after = card.moves.filter((m) => m.a !== a);
      card.moves.push(token);
      const startLoc = fromLoc ?? card.loc;
      if (startLoc) enq(s, a, { type: 'walk', toLoc: startLoc, card, after });
      enq(s, a, { type: 'pick', card, after, ev, text: bubbleText(ev), kind: ev.kind });
      enq(s, a, { type: 'walk', toLoc: ev.to });
      enq(s, a, { type: 'drop', card, loc: ev.to, kind: ev.kind, token });
      return;
    }
    // A busy character skips routine chatter (the ticker still shows it) so it keeps up with the clock.
    if (!IMPORTANT.has(ev.kind) && a.queue.length > 4) {
      if (!a.task && !a.queue.length) a.bubble = { text: bubbleText(ev), kind: ev.kind, born: s.sim, until: s.sim + 1.2 };
      tick(s, ev);
      return;
    }
    const after = card ? card.moves.filter((m) => m.a !== a) : null;
    enq(s, a, { type: 'home' }, { type: 'say', card, after, ev, text: bubbleText(ev), kind: ev.kind, dur: SAY(ev) });
  }

  function lag(a) { const n = a.queue.length; return n > 10 ? 0.25 : n > 5 ? 0.4 : n > 2 ? 0.65 : 1; }

  function startTask(s, a, t) {
    if (t.type === 'walk' || t.type === 'home') {
      if (t.type === 'home' && a.queue[0]?.type === 'say' && roomAt(a) === roomAt(a.home)) return true;
      const to = t.type === 'home' ? a.home : t.toLoc ? standFor(t.toLoc) : t.to;
      if (Math.hypot(to.x - a.x, to.y - a.y) < 1) { a.path = null; return true; }
      a.path = route(a, to);
      return false;
    }
    if (t.type === 'spawn') { t.card.heldBy = a; a.held = t.card; s.effects.push({ type: 'ring', x: a.x, z: a.y, color: RING.lead, t0: s.sim, until: s.sim + 1.3 }); return true; }
    if (t.type === 'emote') { a.emote = { name: t.name, until: s.sim + 1.4 }; return true; }
    if (t.type === 'pick') { t.wait = 0; return false; }
    if (t.type === 'drop') {
      const card = t.card;
      if (a.held === card) { a.held = null; card.heldBy = null; }
      place(s, card, t.loc);
      if (t.loc.startsWith('retired')) s.effects.push({ type: 'puff', x: BIN.x + 8, z: BIN.y + 7, t0: s.sim, until: s.sim + 1.1 });
      if (RING[t.kind]) s.effects.push({ type: 'ring', x: a.x, z: a.y, color: RING[t.kind], t0: s.sim, until: s.sim + 1.3 });
      card.lastKind = t.kind;
      const em = EMOTE_OF[t.kind];
      if (em) a.emote = { name: em, until: s.sim + 1.4 };
      if (card.plan === t.loc) card.plan = null;
      card.moves = card.moves.filter((m) => m !== t.token);
      return true;
    }
    if (t.type === 'say') {
      const routine = !IMPORTANT.has(t.kind);
      const nextSay = a.queue.find((q) => q.type === 'say');
      t.left = routine && nextSay && !IMPORTANT.has(nextSay.kind) && a.queue.length > 3 ? 0.25 : (t.dur / TEMPO) * lag(a);
      a.bubble = { text: t.text, kind: t.kind, born: s.sim, until: s.sim + Math.max(t.left, 2) };
      tick(s, t.ev);
      const em = EMOTE_OF[t.kind];
      if (em) a.emote = { name: em, until: s.sim + 1.4 };
      if (t.kind === 'run') { const r = roomAt(a) ?? ROOMS[ROLE_ROOM[a.role]]; if (r) r.busyUntil = Math.max(r.busyUntil, s.sim + 5); }
      a.pose = 'work';
      return false;
    }
    return true;
  }

  function updateActor(s, a, dt) {
    a.ft += dt;
    if (a.emote && a.emote.until < s.sim) a.emote = null;
    if (a.bubble && a.bubble.until < s.sim) a.bubble = null;
    for (let guard = 0; guard < 8; guard++) {
      if (!a.task) {
        const nxt = a.queue[0];
        if (nxt?.after?.some((m) => nxt.card.moves.includes(m)) && (nxt.wait = (nxt.wait ?? 0) + dt) < 2.5) { a.pose = 'idle'; return; }
        a.task = a.queue.shift() ?? null;
        if (!a.task) break;
        if (startTask(s, a, a.task)) { a.task = null; continue; }
      }
      break;
    }
    const t = a.task;
    if (!t) {
      if (Math.hypot(a.home.x - a.x, a.home.y - a.y) > 2) { a.queue.push({ type: 'home' }); }
      a.pose = 'idle';
      return;
    }
    if (t.type === 'walk' || t.type === 'home') {
      const speed = (WALK * TEMPO) / lag(a);
      let step = speed * dt;
      while (step > 0 && a.path && a.path.length) {
        const p = a.path[0];
        const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.3) a.facing = dx > 0 ? 1 : -1;
        if (d <= step) { a.x = p.x; a.y = p.y; a.path.shift(); step -= d; } else { a.x += (dx / d) * step; a.y += (dy / d) * step; step = 0; }
      }
      a.pose = a.held ? 'carry' : 'walk';
      if (!a.path || !a.path.length) a.task = null;
      return;
    }
    if (t.type === 'pick') {
      const card = t.card;
      t.wait += dt;
      if (card.heldBy && card.heldBy !== a && t.wait < 2.5) { a.pose = 'idle'; return; }
      if (card.heldBy && card.heldBy !== a) card.heldBy.held = null;
      if (card.loc && !card.gone) { const l = locList(s, card.loc); const i = l.indexOf(card); if (i >= 0) { l.splice(i, 1); relayout(s, card.loc); } }
      card.heldBy = a; a.held = card;
      a.bubble = { text: t.text, kind: t.kind, born: s.sim, until: s.sim + 2.4 };
      tick(s, t.ev);
      a.task = null;
      return;
    }
    if (t.type === 'say') {
      t.left -= dt;
      if (t.left <= 0) a.task = null;
    }
  }

  function update(s, dt) {
    s.sim += dt;
    if (!LIVE) {
      // the timeline waits a little for characters who are behind, so cause and effect stay in order on screen
      let behind = 0;
      for (const a of s.actors.values()) {
        const at = a.task?.at ?? a.queue.find((t) => t.at != null)?.at;
        if (at != null) behind = Math.max(behind, s.sim - at);
      }
      // (a safety net: the plan leaves each character time for its actions, so this should rarely slow anything)
      s.play += s.sim < INTRO ? dt : dt * (behind > 3 ? 0.25 : behind > 1.8 ? 0.6 : 1);
      while (s.next < ACTS.length && PLAN.at[s.next] <= s.play) handle(s, ACTS[s.next++]);
      if (s.next >= ACTS.length && !s.done) {
        const busy = [...s.actors.values()].some((a) => a.queue.length || (a.task && a.task.type !== 'home'));
        if (!busy || s.play > PLAN.end + 6) { s.done = true; s.doneAt = s.sim; }
      }
      // the clock reads the plan, so it moves steadily with what is acted out (idle hours spin by)
      s.shown = clockAt(s.play);
    } else s.shown = Date.now();
    for (const a of s.actors.values()) updateActor(s, a, dt);
    const on = s.focus && s.focus.until > s.sim && !s.done, k = 1 - Math.exp(-dt / 2.4);
    if (on) { s.cam.x += (s.focus.x - s.cam.x) * k; s.cam.z += (s.focus.z - s.cam.z) * k; }
    s.cam.w += ((on ? 0.18 : 0) - s.cam.w) * k;
    s.effects = s.effects.filter((e) => e.until > s.sim);
  }

  // ---------- drawing ----------
  // The scene is 3D (engine.js, floor.js, people.js); the HUD is flat, laid out on a 1920×1080 grid scaled by U.
  const canvas = document.getElementById('desk');
  const ctx = canvas.getContext('2d');
  const D3 = window.Desk3D;
  const FLOOR = window.DeskFloor.create({ ROOMS, TRAY, DESK, WAITING, BIN });
  const HEAD = 'Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif';
  const BODY = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
  const MONO = '"Cascadia Mono", Consolas, ui-monospace, monospace';
  let CW = 1920, CH = 1080, U = 1;
  const font = (px, w = 700, fam = HEAD) => `${w} ${Math.round(px * U * 10) / 10}px ${fam}`;
  const spacing = (g, px) => { g.letterSpacing = `${(px * U).toFixed(1)}px`; };
  // The canvas fills the window at any size. U is the HUD's unit (1 on a 1920×1080 screen, smaller when the window is
  // short or narrow); the scene shows between the header + tape (TOP) and the feed panel (BOTTOM), in U.
  const TOP = 98, PANEL = 212;
  let BOTTOM = 868;
  const PS = 1.3; // people are drawn a little larger than life, so they read on a phone
  // What can be clicked: filled while drawing, front-most first (z: smaller wins; the HUD is in front of the scene).
  let HITS = [], HOVER = null;
  const hitRect = (kind, id, x0, y0, x1, y1, z) => HITS.push({ kind, id, x0, y0, x1, y1, z });
  const selected = () => window.DeskInspect?.selected?.() ?? null;
  const isOn = (h, kind, id) => h && h.kind === kind && h.id === id;
  const lit = (kind, id) => isOn(HOVER, kind, id) || isOn(selected(), kind, id);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    CW = canvas.width; CH = canvas.height; U = Math.min(CH / 1080, CW / 1500);
    BOTTOM = CH / U - PANEL;
  }
  addEventListener('resize', resize);

  // The camera: a slow drift around the floor, a drone shot in at the start, a pull back at the end, and a lean
  // toward where something important is happening (s.cam, smoothed in update(), so seeking replays it exactly).
  const ease = (x) => x * x * (3 - 2 * x);
  function camera(s) {
    const t = s.sim, TAU = Math.PI * 2;
    let yaw = 0.075 * Math.sin((t * TAU) / 43), pitch = 47 + 2.5 * Math.sin((t * TAU) / 59), dist = 590 * (1 + 0.02 * Math.sin((t * TAU) / 31));
    const tx = 240 + (s.cam.x - 240) * s.cam.w, tz = 112 + (s.cam.z - 112) * s.cam.w;
    dist *= 1 - s.cam.w * 0.3;
    if (!LIVE) { const e = ease(Math.min(1, t / (INTRO + 1.5))); pitch += (78 - pitch) * (1 - e); dist *= 1 + 1.1 * (1 - e); yaw -= 0.55 * (1 - e); }
    if (s.done) { const e = ease(Math.min(1, (t - s.doneAt) / 6)); dist *= 1 + 0.16 * e; pitch += 7 * e; yaw += 0.06 * e; }
    const p = (pitch * Math.PI) / 180;
    return { pos: [tx + Math.sin(yaw) * Math.cos(p) * dist, Math.sin(p) * dist, tz + Math.cos(yaw) * Math.cos(p) * dist], target: [tx, 0, tz], fov: 30 };
  }

  // the city behind the floor: seeded towers with lit windows, drifting a little with the camera
  const TOWERS = (() => { const R = rng(99), out = []; let x = -400; while (x < 4200) { const w = 40 + R() * 90; out.push({ x, w, h: 90 + R() * 260, seed: Math.floor(R() * 1e6), far: R() < 0.5 }); x += w + 4 + R() * 30; } return out; })();
  // [hour UTC, sky top, horizon, how many windows are lit]
  const SKY = [[0, '#02030a', '#0a0f24', 0.3], [6, '#0a1030', '#3a3a6a', 0.22], [8, '#0e2350', '#4a6aa8', 0.08], [15, '#0e2350', '#4a6aa8', 0.08],
    [16.5, '#1a1840', '#d0606a', 0.14], [17.5, '#120c2a', '#ff7b54', 0.22], [19, '#05061a', '#2a1f4a', 0.3], [24, '#02030a', '#0a0f24', 0.3]];
  const lerpHex = (a, b, k) => { const x = D3.hex(a), y = D3.hex(b); return D3.rgb(x.map((v, i) => v + (y[i] - v) * k)); };
  function skyAt(t) {
    const d = new Date(t), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    let i = 0; while (i < SKY.length - 2 && SKY[i + 1][0] <= h) i++;
    const [h0, t0, z0, l0] = SKY[i], [h1, t1, z1, l1] = SKY[i + 1], k = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
    return { top: lerpHex(t0, t1, k), horizon: lerpHex(z0, z1, k), lit: l0 + (l1 - l0) * k };
  }
  function drawSky(g, s, cam) {
    const base = D3.P(240, 44, 6).y + 30 * U, drift = (cam.pos[0] - 240) * 0.9 * U;
    const sk = skyAt(s.shown);
    g.fillStyle = '#04060c'; g.fillRect(0, 0, CW, CH);
    const sky = g.createLinearGradient(0, TOP * U, 0, base);
    sky.addColorStop(0, sk.top); sky.addColorStop(1, sk.horizon);
    g.fillStyle = sky; g.fillRect(0, 0, CW, base);
    for (const pass of [true, false]) for (const b of TOWERS) {
      if (b.far !== pass) continue;
      const k = pass ? 0.55 : 1, x = b.x * U - drift * k, w = b.w * U * (pass ? 0.8 : 1), h = b.h * U * (pass ? 1.25 : 1), top = base - h;
      if (x > CW || x + w < 0) continue;
      g.fillStyle = pass ? 'rgba(8,12,28,0.9)' : '#080c1a'; g.fillRect(x, top, w, h);
      const R = rng(b.seed);
      for (let wy = top + 8 * U; wy < base - 6 * U; wy += 9 * U) for (let wx = x + 5 * U; wx < x + w - 6 * U; wx += 8 * U) {
        const r = R();
        if (r > sk.lit * (pass ? 0.7 : 1)) continue;
        g.fillStyle = r < 0.06 ? 'rgba(255,214,150,0.55)' : pass ? 'rgba(140,175,255,0.18)' : 'rgba(160,190,255,0.32)';
        g.fillRect(wx, wy, 3 * U, 4 * U);
      }
      if (!pass && b.h > 260 && Math.sin(s.sim * 3 + b.seed) > 0.6) { g.fillStyle = '#ff4d6d'; g.fillRect(x + w / 2 - 2 * U, top - 4 * U, 4 * U, 4 * U); }
    }
    const haze = g.createLinearGradient(0, base - 160 * U, 0, base);
    haze.addColorStop(0, 'rgba(60,90,200,0)'); haze.addColorStop(1, 'rgba(60,90,200,0.14)');
    g.fillStyle = haze; g.fillRect(0, base - 160 * U, CW, 160 * U);
  }

  // where a card sits in the world, from the slot the simulation gave it
  function cardWorld(c) {
    const [stage, sub] = c.loc.split(':');
    if (stage === 'parked') return { x: c.x + 3, y: c.y <= TRAY.store.y ? 10.7 : 2.7, z: 124.5 };
    if (sub === 'waiting') return { x: c.x + 3, y: 7, z: WAITING.y + 5.5 };
    const room = STAGE_ROOM[stage] ?? 'store';
    if (sub === 'working' && DESK[room]) return { x: c.x + 3, y: room === 'trophy' ? 8.5 : 8.5, z: c.y + 4 };
    const t = TRAY[room];
    if (t) { const i = Math.max(0, Math.round((t.y - c.y) / 2)); return { x: t.x + 0.5 + i * 1.3, y: 8 + i * 0.9, z: t.y + 6 }; }
    return { x: c.x + 3, y: 8, z: c.y + 6 };
  }

  function drawFloorEffects(g, s) {
    for (const [name, r] of Object.entries(ROOMS)) {
      const z0 = r.row === 0 ? 14 : 120, z1 = r.row === 0 ? 100 : 206;
      const poly = [[r.x, 0, z0], [r.x + r.w, 0, z0], [r.x + r.w, 0, z1], [r.x, 0, z1]].map((q) => D3.P(...q));
      HITS.push({ kind: 'room', id: name, poly, z: Infinity });
      if (lit('room', name)) { g.save(); g.shadowColor = r.accent; g.shadowBlur = 24 * U; D3.poly(g, [[r.x + 1, 0.06, z0 + 1], [r.x + r.w - 1, 0.06, z0 + 1], [r.x + r.w - 1, 0.06, z1 - 1], [r.x + 1, 0.06, z1 - 1]], D3.alpha(r.accent, 0.1), r.accent, 2.5 * U); g.restore(); }
    }
    for (const a of s.actors.values()) {
      const c = roleColor(a.role);
      if (lit('actor', a.key)) { g.save(); g.shadowColor = '#ffffff'; g.shadowBlur = 18 * U; D3.floorEllipse(g, a.x, a.y, 7.5, null, '#ffffff', 2.5 * U, 0.06); g.restore(); }
      D3.floorEllipse(g, a.x, a.y, 5.4, 'rgba(0,0,0,0.45)');
      g.save(); g.shadowColor = c; g.shadowBlur = 10 * U;
      D3.floorEllipse(g, a.x, a.y, 5, D3.alpha(c, 0.12), D3.alpha(c, 0.85), 1.4 * U, 0.05);
      g.restore();
    }
    for (const e of s.effects) if (e.type === 'ring') {
      const k = (s.sim - e.t0) / (e.until - e.t0);
      g.save(); g.shadowColor = e.color; g.shadowBlur = 16 * U;
      D3.floorEllipse(g, e.x, e.z, 4 + k * 16, null, D3.alpha(e.color, 1 - k), (3 - 2 * k) * U, 0.1);
      g.restore();
    }
  }
  function drawEffect(g, s, e) {
    const k = (s.sim - e.t0) / (e.until - e.t0);
    if (e.type === 'puff') {
      g.save(); g.shadowColor = '#ff4d6d'; g.shadowBlur = 8 * U;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, r = 2 + k * (6 + D3.hash(i) * 6);
        const p = D3.P(e.x + Math.cos(a) * r, 13 + k * (8 + D3.hash(i + 9) * 10) - k * k * 6, e.z + Math.sin(a) * r * 0.6);
        g.fillStyle = i % 3 ? D3.alpha('#ff4d6d', 1 - k) : `rgba(255,255,255,${1 - k})`;
        g.fillRect(p.x - p.k * 0.6, p.y - p.k * 0.6, p.k * 1.2, p.k * (i % 2 ? 1.6 : 0.8));
      }
      g.restore();
    } else if (e.type === 'letter') {
      const y = 70 - 46 * ease(Math.min(1, k * 1.5)), p = D3.P(e.x, y, e.z), w = 6 * p.k, h = 4 * p.k;
      g.save(); g.globalAlpha = Math.min(1, (1 - k) * 4); g.shadowColor = '#6fa8ff'; g.shadowBlur = 16 * U;
      g.fillStyle = '#e8ecf7'; g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      g.shadowBlur = 0; g.strokeStyle = '#6fa8ff'; g.lineWidth = Math.max(1, p.k * 0.35);
      g.beginPath(); g.moveTo(p.x - w / 2, p.y - h / 2); g.lineTo(p.x, p.y + h * 0.1); g.lineTo(p.x + w / 2, p.y - h / 2); g.stroke();
      g.restore();
    }
  }

  function drawScene(g, s) {
    const cam = camera(s);
    const fit = Math.min(CW / 1920, ((BOTTOM - TOP) * U) / 770);
    const spare = (BOTTOM - TOP) * U - 770 * fit; // height the floor doesn't need (a tall window): most goes to the sky
    D3.setView(cam, 1080 * fit, CW / 2, ((TOP + BOTTOM) / 2) * U + 22 * fit + spare * 0.4);
    drawSky(g, s, cam);
    FLOOR.drawFloor(g, s);
    drawFloorEffects(g, s);
    // everything that stands up, far to near
    const list = FLOOR.items.map((it) => ({ d: D3.depth(...it.ref), draw: it.draw }));
    for (const c of s.cards.values()) if (!c.gone && !c.heldBy && c.loc) {
      const w = cardWorld(c);
      list.push({ d: D3.depth(w.x, 0, w.z + 6), draw: (gg) => {
        const p = D3.P(w.x, w.y, w.z);
        A.drawCard(gg, p.x, p.y, p.k, c.color, lit('card', c.id) ? 2.4 : 1);
        if (lit('card', c.id)) { gg.strokeStyle = '#ffffff'; gg.lineWidth = 2 * U; gg.strokeRect(p.x - 3.4 * p.k, p.y - 8 * p.k, 6.8 * p.k, 9 * p.k); }
        hitRect('card', c.id, p.x - 2.8 * p.k, p.y - 7 * p.k, p.x + 2.8 * p.k, p.y + 0.5 * p.k, p.z - 2);
      } });
    }
    for (const a of s.actors.values()) list.push({ d: D3.depth(a.x, 0, a.y), draw: (gg) => drawActor(gg, s, a) });
    for (const e of s.effects) if (e.type !== 'ring') list.push({ d: D3.depth(e.x, 0, e.z + 8), draw: (gg) => drawEffect(gg, s, e) });
    list.sort((p, q) => q.d - p.d);
    for (const it of list) it.draw(g, s);
  }
  function drawActor(g, s, a) {
    const p = D3.P(a.x, 0, a.y), k = p.k * PS;
    A.drawPerson(g, a.role, a.seat, a.pose, a.ft, p.x, p.y, k, a.facing);
    hitRect('actor', a.key, p.x - 5 * k, p.y - 21 * k, p.x + 5 * k, p.y + 2 * k, p.z);
    if (a.held) {
      const cx = p.x + A.HAND.x * k * a.facing, cy = p.y - (A.HAND.y - 4.6) * k, ck = p.k * 1.15;
      A.drawCard(g, cx, cy, ck, a.held.color, 1.6);
      hitRect('card', a.held.id, cx - 2.6 * ck, cy - 6.8 * ck, cx + 2.6 * ck, cy, p.z - 1);
    }
  }

  function rrect(g, x, y, w, h, r) { A.rr(g, x, y, w, h, r); }
  function wrap(g, text, maxW, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && cur) lines.push(cur);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + 1) {
      let last = lines[maxLines - 1];
      while (g.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  const nameOf = (a) => (a.seat > 1 ? `${a.role} ${a.seat}` : a.role).toUpperCase();
  const pill = (g, x, y, w, h, fill, stroke, lw = 1) => { rrect(g, x, y, w, h, h / 2); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };

  // name tags, the ids of carried cards, labels on the floor's objects, emotes
  function drawLabels(g, s) {
    g.textBaseline = 'middle';
    g.font = font(11.5, 700); spacing(g, 1.2);
    for (const a of s.actors.values()) {
      const p = D3.P(a.x, 0, a.y + 5.5), name = nameOf(a), tw = g.measureText(name).width, c = tagColor(a.role);
      pill(g, p.x - tw / 2 - 8 * U, p.y - 9 * U, tw + 16 * U, 18 * U, 'rgba(6,9,18,0.82)', lit('actor', a.key) ? '#ffffff' : D3.alpha(c.startsWith('#') ? c : '#e8ecf7', 0.5), U);
      hitRect('actor', a.key, p.x - tw / 2 - 8 * U, p.y - 9 * U, p.x + tw / 2 + 8 * U, p.y + 9 * U, -1);
      g.fillStyle = c; g.fillText(name, p.x - tw / 2 + 0.6 * U, p.y + 0.5 * U);
    }
    g.font = font(12.5, 700, MONO); spacing(g, 0);
    for (const a of s.actors.values()) if (a.held) {
      const p = D3.P(a.x, 0, a.y), x = p.x + A.HAND.x * PS * p.k * a.facing, y = p.y - (A.HAND.y - 4.6) * PS * p.k - 9.6 * p.k;
      const tw = g.measureText(a.held.id).width;
      pill(g, x - tw / 2 - 7 * U, y - 10 * U, tw + 14 * U, 20 * U, 'rgba(6,9,18,0.9)', a.held.color, 1.5 * U);
      g.fillStyle = '#ffffff'; g.fillText(a.held.id, x - tw / 2, y + 0.5 * U);
    }
    g.font = font(11, 700); spacing(g, 2);
    const tag = (text, x, y, z, color) => { const p = D3.P(x, y, z), tw = g.measureText(text).width; g.fillStyle = 'rgba(6,9,18,0.7)'; g.fillRect(p.x - tw / 2 - 6 * U, p.y - 9 * U, tw + 12 * U, 18 * U); g.fillStyle = color; g.fillText(text, p.x - tw / 2 + U, p.y + 0.5 * U); };
    tag('WAITING', WAITING.x + 10, 13, WAITING.y + 6, '#ffb340');
    tag('PARKED', TRAY.store.x + 13, 23, 124, '#8b93a8');
    tag(s.stats.retire ? `SHREDDED  ${s.stats.retire}` : 'SHREDDER', BIN.x + 8, 21, BIN.y + 7, '#ff4d6d');
    tag('SEALED', 436, 46, 132, '#ffb340');
    spacing(g, 0);
    for (const a of s.actors.values()) if (a.emote) {
      const p = D3.P(a.x, 22.5 * PS, a.y);
      A.drawEmote(g, a.emote.name, p.x - 6 * p.k * (a.facing > 0 ? 1 : -1), p.y + Math.sin(s.sim * 6) * 2 * U, 13 * U); // opposite the carried card
    }
  }

  const ACCENT = { retire: '#ff4d6d', fail: '#ff4d6d', defect: '#ffb340', sendback: '#ffb340', pass: '#38e08c', lead: '#ffe066', ruling: '#6fa8ff', news: '#6fa8ff' };
  function drawBubbles(g, s) {
    const placed = [];
    const list = [...s.actors.values()].filter((a) => a.bubble).sort((p, q) => q.y - p.y);
    for (const a of list) {
      const b = a.bubble, head = D3.P(a.x, 23 * PS, a.y);
      const al = Math.max(0, Math.min(1, (s.sim - (b.born ?? 0)) / 0.15, (b.until - s.sim) / 0.25));
      if (al <= 0) continue;
      const accent = ACCENT[b.kind] ?? roleColor(a.role);
      g.font = font(18, 600, BODY); spacing(g, 0);
      const lines = wrap(g, b.text, (isPrivate() ? 420 : 340) * U, isPrivate() ? 3 : 2);
      const lw = Math.max(...lines.map((l) => g.measureText(l).width));
      g.font = font(11, 700); spacing(g, 1.6);
      const who = nameOf(a), ww = g.measureText(who).width;
      const bw = Math.max(lw, ww) + 34 * U, bh = 34 * U + lines.length * 23 * U;
      let bx = Math.min(Math.max(head.x - bw / 2, 14 * U), CW - bw - 14 * U);
      let by = head.y - 26 * U - bh;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((p) => bx < p.x + p.w && bx + bw > p.x && by < p.y + p.h && by + bh > p.y);
        if (!hit) break;
        by = hit.y - bh - 6 * U;
      }
      by = Math.max((TOP + 8) * U, by);
      placed.push({ x: bx, y: by, w: bw, h: bh });
      hitRect('actor', a.key, bx, by, bx + bw, by + bh, -2);
      const lift = (1 - al) * 8 * U;
      g.save(); g.globalAlpha = al; g.translate(0, lift);
      // the leader line from the panel to the speaker
      const tx = Math.min(Math.max(head.x, bx + 18 * U), bx + bw - 18 * U);
      g.strokeStyle = D3.alpha(accent, 0.8); g.lineWidth = 1.5 * U;
      g.beginPath(); g.moveTo(tx, by + bh); g.lineTo(head.x, head.y - 6 * U); g.stroke();
      g.fillStyle = accent; g.beginPath(); g.arc(head.x, head.y - 6 * U, 3 * U, 0, Math.PI * 2); g.fill();
      g.shadowColor = accent; g.shadowBlur = 18 * U;
      rrect(g, bx, by, bw, bh, 6 * U); g.fillStyle = 'rgba(7,10,20,0.92)'; g.fill();
      g.shadowBlur = 0; g.strokeStyle = D3.alpha(accent, 0.9); g.lineWidth = 1.5 * U; g.stroke();
      g.fillStyle = accent; g.fillRect(bx, by + 6 * U, 4 * U, bh - 12 * U);
      g.textBaseline = 'top';
      g.fillStyle = accent; g.fillText(who, bx + 17 * U, by + 10 * U);
      g.font = font(18, 600, BODY); spacing(g, 0);
      g.fillStyle = '#f2f4fa';
      lines.forEach((l, i) => g.fillText(l, bx + 17 * U, by + 27 * U + i * 23 * U));
      g.restore();
    }
  }

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
  const dateOf = (t) => { const d = new Date(t); return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const STAGE_LABEL = { research: 'RESEARCH', build: 'BUILD', verify: 'VERIFY', validate: 'VALIDATE', holdout: 'HOLD-OUT', incubation: 'INCUBATION', library: 'LIBRARY', portfolios: 'PORTFOLIOS', prop: 'PROP', parked: 'PARKED', retired: 'RETIRED' };
  const MARK = { pass: ['▲', '#38e08c'], lead: ['▲', '#38e08c'], claim: ['▲', '#38e08c'], unpark: ['▲', '#38e08c'], sendback: ['▼', '#ffb340'], defect: ['▼', '#ffb340'], pullback: ['▼', '#ffb340'], fail: ['▼', '#ff4d6d'], retire: ['✕', '#ff4d6d'], park: ['■', '#8b93a8'] };

  // the ticker tape: every card on the desk, where it is and which way it last moved
  function drawTape(g, s) {
    const y0 = 64 * U, h = 34 * U, mid = y0 + h / 2;
    g.fillStyle = '#05080f'; g.fillRect(0, y0, CW, h);
    g.fillStyle = 'rgba(111,168,255,0.16)'; g.fillRect(0, y0, CW, U); g.fillRect(0, y0 + h - U, CW, U);
    const out = (c) => (c.heldBy ? 0 : /^(retired|parked)/.test(c.loc) ? 1 : 0); // cards in play first, then the ones out today
    const cards = [...s.cards.values()].filter((c) => c.heldBy || (c.loc && !(c.loc.startsWith('retired') && !c.lastKind))).sort((p, q) => out(p) - out(q) || (p.id < q.id ? -1 : 1));
    g.textBaseline = 'middle';
    if (cards.length) {
      const chips = cards.map((c) => {
        const where = (c.heldBy ? c.plan ?? c.loc : c.loc) ?? '';
        const [stage, sub] = where.split(':');
        const mark = MARK[c.lastKind] ?? (stage === 'parked' ? MARK.park : ['•', '#5d6680']);
        return { id: c.id, stage: (STAGE_LABEL[stage] ?? stage.toUpperCase()) + (sub === 'working' ? '·WIP' : sub === 'waiting' ? '·WAIT' : ''), mark, moving: !!c.heldBy };
      });
      g.font = font(15, 700, MONO); spacing(g, 0);
      const idW = g.measureText('Q-0000').width;
      g.font = font(13, 700); spacing(g, 1.5);
      for (const c of chips) c.w = idW + 12 * U + g.measureText(c.stage).width + 30 * U + 44 * U;
      const total = chips.reduce((n, c) => n + c.w, 0);
      let x = -((s.sim * 70 * U) % total);
      while (x < CW) {
        for (const c of chips) {
          if (x > CW) break;
          if (x + c.w > 0) {
            g.font = font(15, 700, MONO); spacing(g, 0); g.fillStyle = c.moving || lit('card', c.id) ? '#ffffff' : '#dfe5f2'; g.fillText(c.id, x, mid);
            hitRect('card', c.id, x - 6 * U, y0, x + c.w - 30 * U, y0 + h, -10);
            g.font = font(13, 700); spacing(g, 1.5); g.fillStyle = '#8b93a8'; g.fillText(c.stage, x + idW + 12 * U, mid);
            spacing(g, 0); g.font = font(14, 800, BODY); g.fillStyle = c.mark[1];
            g.fillText(c.mark[0], x + idW + 12 * U + g.measureText(c.stage).width + 14 * U, mid);
          }
          x += c.w;
        }
      }
      spacing(g, 0);
    }
    // the label on the left, over a fade
    const fade = g.createLinearGradient(0, 0, 190 * U, 0);
    fade.addColorStop(0, '#05080f'); fade.addColorStop(0.7, '#05080f'); fade.addColorStop(1, 'rgba(5,8,15,0)');
    g.fillStyle = fade; g.fillRect(0, y0 + U, 190 * U, h - 2 * U);
    g.fillStyle = '#6fa8ff'; g.fillRect(24 * U, mid - 8 * U, 3 * U, 16 * U);
    g.font = font(12, 700); spacing(g, 3); g.fillStyle = '#6fa8ff'; g.fillText('PIPELINE', 36 * U, mid + 0.5 * U);
    spacing(g, 0);
  }

  function kpis(s) {
    let floor = 0;
    for (const c of s.cards.values()) if (c.loc && !c.gone && !c.loc.startsWith('parked')) floor++;
    const st = s.stats;
    return [['NEW LEADS', st.lead, '#ffe066'], ['PASSED ON', st.pass, '#38e08c'], ['SENT BACK', st.sendback, '#ffb340'],
      ['RETIRED', st.retire, '#ff4d6d'], ['PARKED', st.park, '#8b93a8'], ['ON THE FLOOR', floor, '#6fa8ff']];
  }

  function drawHeader(g, s) {
    const hg = g.createLinearGradient(0, 0, 0, 64 * U);
    hg.addColorStop(0, '#04060c'); hg.addColorStop(1, '#070b16');
    g.fillStyle = hg; g.fillRect(0, 0, CW, 64 * U);
    // the mark: a glowing diamond
    g.save(); g.translate(36 * U, 32 * U); g.rotate(Math.PI / 4);
    g.shadowColor = '#6fa8ff'; g.shadowBlur = 14 * U;
    g.strokeStyle = '#6fa8ff'; g.lineWidth = 2.5 * U; g.strokeRect(-10 * U, -10 * U, 20 * U, 20 * U);
    g.fillStyle = '#ffd166'; g.fillRect(-4 * U, -4 * U, 8 * U, 8 * U);
    g.restore();
    g.textBaseline = 'alphabetic';
    g.font = font(25, 700); spacing(g, 5); g.fillStyle = '#f2f4fa'; g.fillText('ATH QUANT DESK', 64 * U, 34 * U);
    g.font = font(10.5, 600); spacing(g, 3.2); g.fillStyle = '#6c7796'; g.fillText('AI-RUN SYSTEMATIC TRADING DESK', 65 * U, 52 * U);
    // the clock
    const clock = hhmm(s.shown);
    g.font = font(34, 700); spacing(g, 2);
    const cw = g.measureText(clock).width;
    g.fillStyle = '#ffffff'; g.fillText(clock, CW / 2 - cw / 2, 38 * U);
    g.font = font(10.5, 700); spacing(g, 3.5);
    const date = `${dateOf(s.shown)} · UTC`, dw = g.measureText(date).width;
    g.fillStyle = '#6fa8ff'; g.fillText(date, CW / 2 - dw / 2, 55 * U);
    // the privacy badge (always on screen) and the mode
    const badge = TL.mode === 'private' ? 'PRIVATE' : 'PUBLIC';
    g.font = font(14, 800); spacing(g, 2.5);
    const bw = g.measureText(badge).width + 30 * U, bx = CW - bw - 24 * U;
    pill(g, bx, 16 * U, bw, 32 * U, badge === 'PUBLIC' ? '#14824f' : '#b3263a', badge === 'PUBLIC' ? '#38e08c' : '#ff4d6d', 1.5 * U);
    g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; g.fillText(badge, bx + 15 * U, 32.5 * U);
    const mode = LIVE ? '● LIVE' : `REPLAY${speed !== 1 ? ' ×' + speed : ''}${paused ? ' · PAUSED' : ''}`;
    g.font = font(12, 700); spacing(g, 2.5);
    g.fillStyle = LIVE ? (Math.floor(performance.now() / 600) % 2 ? '#ff4d6d' : '#a33') : '#8b93a8';
    const mw = g.measureText(mode).width;
    g.fillText(mode, bx - 18 * U - mw, 32.5 * U);
    if (!params.has('clean')) {
      const lab = 'LIBRARY', lw = g.measureText(lab).width + 46 * U, lx = bx - 40 * U - mw - lw;
      pill(g, lx, 17 * U, lw, 30 * U, lit('library', 'all') ? 'rgba(111,168,255,0.25)' : 'rgba(111,168,255,0.08)', D3.alpha('#6fa8ff', 0.6), 1.2 * U);
      g.fillStyle = '#cfe0ff'; g.fillText(lab, lx + 30 * U, 32.5 * U);
      g.strokeStyle = '#cfe0ff'; g.lineWidth = 1.6 * U;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(lx + 13 * U, (26 + i * 6) * U); g.lineTo(lx + 23 * U, (26 + i * 6) * U); g.stroke(); }
      hitRect('library', 'all', lx, 17 * U, lx + lw, 47 * U, -20);
    }
    spacing(g, 0);
  }

  function drawPanel(g, s) {
    const y0 = BOTTOM * U;
    const pg = g.createLinearGradient(0, y0, 0, CH);
    pg.addColorStop(0, 'rgba(5,7,14,0.97)'); pg.addColorStop(1, '#03050a');
    g.fillStyle = pg; g.fillRect(0, y0, CW, CH - y0);
    g.fillStyle = 'rgba(111,168,255,0.22)'; g.fillRect(0, y0, CW, U);
    // the replay's progress along the top edge
    if (!LIVE && PLAN?.end) {
      const k = Math.min(1, Math.max(0, s.play / PLAN.end));
      g.save(); g.shadowColor = '#6fa8ff'; g.shadowBlur = 10 * U;
      g.fillStyle = '#6fa8ff'; g.fillRect(0, y0 - U, CW * k, 3 * U); g.restore();
    }
    g.textBaseline = 'alphabetic';
    g.font = font(11, 700); spacing(g, 3); g.fillStyle = '#6c7796';
    g.fillText('DESK FEED', 28 * U, y0 + 28 * U);
    const kx = CW / U - 586, showK = kx > 900;
    if (showK) g.fillText('TODAY', kx * U, y0 + 28 * U);
    spacing(g, 0);
    // the feed: the last lines acted out
    s.ticker.slice(0, 5).forEach((e, i) => {
      const y = y0 + (60 + i * 33) * U;
      g.globalAlpha = Math.max(0.2, Math.min(1, (s.sim - e.born) * 4) * (1 - i * 0.16));
      let x = 28 * U;
      // a time the log didn't stamp (or a session clock that was corrected) is shown as an estimate: ~15:21
      g.font = font(16, 500, MONO); g.fillStyle = e.est ? '#4f5872' : '#8b93a8';
      g.fillText((e.est ? '~' : ' ') + hhmm(e.t), x, y); x += 86 * U;
      const c = tagColor(e.role);
      g.fillStyle = c; g.beginPath(); g.arc(x + 4 * U, y - 6 * U, 4 * U, 0, Math.PI * 2); g.fill();
      g.font = font(13, 700); spacing(g, 1.4);
      g.fillText((e.seat > 1 ? `${e.role} ${e.seat}` : e.role).toUpperCase(), x + 16 * U, y); spacing(g, 0);
      x += 236 * U;
      if (e.card) { g.font = font(16, 700, MONO); g.fillStyle = '#ffffff'; g.fillText(e.card, x, y); }
      hitRect(e.card ? 'card' : 'actor', e.card ?? `${e.role === 'owner' ? 'head of desk' : e.role}#${e.role === 'owner' ? 1 : e.seat}`, 20 * U, y - 22 * U, (showK ? kx - 30 : CW / U - 20) * U, y + 9 * U, -10);
      x += 96 * U;
      g.font = font(18, 500, BODY); g.fillStyle = '#cdd4e6';
      const [line] = wrap(g, e.n > 1 ? `${e.text}  ×${e.n}` : e.text, (showK ? kx - 42 : CW / U - 28) * U - x, 1);
      g.fillText(line ?? '', x, y);
    });
    g.globalAlpha = 1;
    // today's counts: real card moves so far
    if (showK) kpis(s).forEach(([label, v, color], i) => {
      const x = (kx + (i % 3) * 186) * U, y = y0 + (44 + Math.floor(i / 3) * 80) * U;
      rrect(g, x, y, 172 * U, 70 * U, 6 * U); g.fillStyle = 'rgba(16,22,40,0.75)'; g.fill();
      g.strokeStyle = D3.alpha(color, 0.25); g.lineWidth = U; g.stroke();
      g.fillStyle = color; g.fillRect(x, y + 12 * U, 3 * U, 46 * U);
      g.font = font(10.5, 700); spacing(g, 2); g.fillStyle = '#8b93a8'; g.fillText(label, x + 16 * U, y + 22 * U);
      spacing(g, 0); g.font = font(34, 700); g.fillStyle = v ? color : '#3d465e'; g.fillText(String(v), x + 15 * U, y + 59 * U);
    });
  }

  function curtain(g, s, alpha, title, sub, foot) {
    if (alpha <= 0) return;
    const y0 = TOP * U, y1 = BOTTOM * U;
    g.save();
    g.globalAlpha = alpha;
    const cg = g.createLinearGradient(0, y0, 0, y1);
    cg.addColorStop(0, 'rgba(3,5,10,0.55)'); cg.addColorStop(0.5, 'rgba(3,5,10,0.88)'); cg.addColorStop(1, 'rgba(3,5,10,0.55)');
    g.fillStyle = cg; g.fillRect(0, y0, CW, y1 - y0);
    g.textBaseline = 'alphabetic';
    const cy = (y0 + y1) / 2;
    g.font = font(15, 700); spacing(g, 7);
    let w = g.measureText(sub).width; g.fillStyle = '#6fa8ff'; g.fillText(sub, (CW - w) / 2, cy - 66 * U);
    g.font = font(88, 700); spacing(g, 14);
    w = g.measureText(title).width;
    g.shadowColor = '#6fa8ff'; g.shadowBlur = 30 * U; g.fillStyle = '#ffffff'; g.fillText(title, (CW - w) / 2, cy + 22 * U);
    g.shadowBlur = 0;
    g.fillStyle = '#ffd166'; g.fillRect(CW / 2 - 60 * U, cy + 48 * U, 120 * U, 3 * U);
    g.font = font(17, 600); spacing(g, 4);
    w = g.measureText(foot).width; g.fillStyle = '#b8c0d6'; g.fillText(foot, (CW - w) / 2, cy + 92 * U);
    spacing(g, 0);
    g.restore();
  }

  function vignette(g) {
    const v = g.createRadialGradient(CW / 2, CH * 0.48, CH * 0.35, CW / 2, CH * 0.48, CH * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v; g.fillRect(0, 0, CW, CH);
  }

  function render() {
    if (!S) return;
    const g = ctx, s = S;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.textAlign = 'left';
    HITS = [];
    drawScene(g, s);
    D3.bloom(g, 0.55);
    vignette(g);
    drawLabels(g, s);
    drawBubbles(g, s);
    drawHeader(g, s);
    drawTape(g, s);
    drawPanel(g, s);
    if (!LIVE && s.sim < INTRO + 0.8) curtain(g, s, Math.min(1, (INTRO + 0.8 - s.sim) / 1.0), 'A DAY ON THE DESK', dateOf(s.shown), 'AI AGENTS  ·  ONE REAL PIPELINE');
    if (s.done) {
      const st = s.stats;
      curtain(g, s, Math.min(1, (s.sim - s.doneAt) / 1.2), "THAT'S THE DAY", dateOf(s.shown),
        `${st.lead} NEW · ${st.pass} PASSED ON · ${st.sendback} SENT BACK · ${st.retire} RETIRED${st.park ? ' · ' + st.park + ' PARKED' : ''}`);
    }
    if (showHelp) {
      g.font = font(11, 600); spacing(g, 1.5); g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(200,210,235,0.45)';
      const help = LIVE ? 'CLICK ANYTHING TO OPEN IT · B LIBRARY · H HIDE HELP' : 'CLICK ANYTHING TO OPEN IT · B LIBRARY · SPACE PAUSE · R RESTART · 1-4 SPEED · H HIDE HELP';
      g.fillText(help, CW - g.measureText(help).width - 22 * U, (BOTTOM - 12) * U);
      spacing(g, 0);
    }
    if (errorText) {
      g.font = font(20, 700, BODY); g.fillStyle = '#ff4d6d'; g.textBaseline = 'top';
      wrap(g, errorText, CW - 200 * U, 4).forEach((l, i) => g.fillText(l, 100 * U, (300 + i * 30) * U));
    }
  }

  // ---------- the loop, controls, data ----------
  let paused = false, speed = 1, acc = 0, last = performance.now(), showHelp = !params.has('clean'), errorText = '';
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (S && !paused) { acc += dt * speed; while (acc >= STEP) { update(S, STEP); acc -= STEP; } }
    render();
    requestAnimationFrame(frame);
  }
  function seek(p) { S = newState(); acc = 0; while (S.sim < p) update(S, STEP); render(); return S.sim; }
  // pointing and clicking: the front-most thing under the pointer opens in the side panel (inspect.js)
  function hitAt(e) {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * (CW / r.width), y = (e.clientY - r.top) * (CH / r.height);
    let best = null;
    for (const h of HITS) {
      const inside = h.poly ? inPoly(x, y, h.poly) : x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1;
      if (inside && (!best || h.z < best.z)) best = h;
    }
    return best && { kind: best.kind, id: best.id };
  }
  function inPoly(x, y, p) {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].y > y) !== (p[j].y > y) && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) c = !c;
    return c;
  }
  canvas.addEventListener('mousemove', (e) => { HOVER = hitAt(e); canvas.style.cursor = HOVER ? 'pointer' : 'default'; });
  canvas.addEventListener('mouseleave', () => { HOVER = null; });
  canvas.addEventListener('click', (e) => { const h = hitAt(e); if (h) window.DeskInspect?.open(h); });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return; // typing in the panel's search
    if (e.key === 'Escape') { window.DeskInspect?.close(); return; }
    if (e.key === 'b' || e.key === 'B') { window.DeskInspect?.open({ kind: 'library', id: 'all' }); return; }
    if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { if (!LIVE) seek(0); }
    else if (e.key === 'h' || e.key === 'H') showHelp = !showHelp;
    else if (['1', '2', '3', '4'].includes(e.key)) speed = [0.5, 1, 2, 4][Number(e.key) - 1];
  });

  function start(tl) {
    TL = tl;
    resize();
    PLAN = solvePlan(LIVE ? [] : buildActs(TL.events));
    ACTS = PLAN.acts; TEMPO = PLAN.tempo;
    S = newState();
    if (params.has('t')) seek(Number(params.get('t')));
    if (params.has('pause')) paused = true;
  }

  async function load() {
    resize();
    if (LIVE) {
      const es = new EventSource('/api/live');
      es.addEventListener('snapshot', (m) => { const snap = JSON.parse(m.data); start({ mode: snap.mode, cards: snap.cards, events: [], newcomers: [] }); });
      es.addEventListener('desk', (m) => { if (!S) return; const ev = JSON.parse(m.data); TL.events.push(ev); handle(S, ev); }); // kept, so the panel can list the day so far
      es.onerror = () => { if (!S) errorText = 'Live mode needs the server: node viz/server.mjs, then open /?live'; };
      return;
    }
    if (location.protocol.startsWith('http')) {
      const q = new URLSearchParams();
      for (const k of ['date', 'from', 'to']) if (params.get(k)) q.set(k, params.get(k));
      try {
        const r = await fetch(`/api/timeline?${q}`);
        if (r.ok) { start(await r.json()); return; }
      } catch { /* fall back to a generated file */ }
    }
    if (window.DESK_TIMELINE) { start(window.DESK_TIMELINE); return; }
    errorText = 'No timeline. Run: node viz/build-timeline.mjs --date YYYY-MM-DD   (writes viz/out/timeline.js), or serve with node viz/server.mjs';
    TL = { mode: 'public', cards: [], events: [], newcomers: [] };
    PLAN = solvePlan([]); ACTS = PLAN.acts; TEMPO = PLAN.tempo;
    S = newState();
  }

  // step(seconds) advances the simulation deterministically (for screenshots and tests, with the page paused)
  const step = (sec) => { const end = S.sim + sec; while (S.sim < end - 1e-9) update(S, STEP); render(); return S.sim; };
  window.DeskViz = { seek, step, get state() { return S; }, get timeline() { return TL; }, get acts() { return ACTS; }, get plan() { return PLAN; }, pause: (v = true) => { paused = v; },
    // for the side panel (inspect.js)
    headerCss: () => (64 * U) / (window.devicePixelRatio || 1), // the header's height in CSS px: the panel opens below it, so the badge stays visible
    live: LIVE, rooms: ROOMS, stageRoom: STAGE_ROOM, roleRoom: ROLE_ROOM, roleColor, served: location.protocol.startsWith('http'),
    hits: () => HITS.map(({ kind, id, x0, y0, x1, y1, z }) => ({ kind, id, x0, y0, x1, y1, z })) }; // (for tests)
  load();
  requestAnimationFrame(frame);
})();
