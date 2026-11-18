// The visual desk: a board with one column per stage, the desk's seats, and a log. As the day replays, cards move
// between the columns, seats show what each role is doing, and every line lands in the log.
// Replay is deterministic: everything on screen is a function of the playback position, so pause, seek and step
// always give the same picture.
(() => {
  const params = new URLSearchParams(location.search);
  const LIVE = params.has('live');
  const SERVED = location.protocol.startsWith('http');
  const DURATION = Math.max(20, Number(params.get('duration')) || 90);
  const INTRO = LIVE ? 0 : 3, OUTRO = 6;
  const $ = (id) => document.getElementById(id);

  // ---------- the desk ----------
  const ROLES = ['scout', 'designer', 'analyst', 'builder', 'verifier', 'quant', 'portfolio manager', 'prop strategist', 'head of desk'];
  const SHORT = { 'portfolio manager': 'portfolio', 'prop strategist': 'prop', 'head of desk': 'head' };
  const COLUMNS = [
    { id: 'research', label: 'Research', stages: ['research'], roles: ['scout', 'designer', 'analyst'] },
    { id: 'build', label: 'Build', stages: ['build'], roles: ['builder'] },
    { id: 'verify', label: 'Verify', stages: ['verify'], roles: ['verifier'] },
    { id: 'validate', label: 'Validate', stages: ['validate'], roles: ['quant'] },
    { id: 'holdout', label: 'Hold-out', stages: ['holdout'], roles: ['quant'] },
    { id: 'incubation', label: 'Incubation', stages: ['incubation'], roles: ['portfolio manager'] },
    { id: 'library', label: 'Library', stages: ['library', 'portfolios', 'prop'], roles: ['portfolio manager', 'prop strategist'] },
    { id: 'parked', label: 'Parked', stages: ['parked'], roles: [], side: true },
    { id: 'retired', label: 'Retired', stages: ['retired'], roles: [], side: true },
  ];
  const COL = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));
  const COL_OF_STAGE = {};
  for (const c of COLUMNS) for (const st of c.stages) COL_OF_STAGE[st] = c.id;
  const colOf = (loc) => COL_OF_STAGE[loc.split(':')[0]] ?? 'parked';
  const subOf = (loc) => loc.split(':')[1] ?? 'ready';

  const IMPORTANT = new Set(['pass', 'retire', 'sendback', 'defect', 'fail', 'park', 'unpark', 'lead', 'claim', 'pullback', 'ruling', 'news', 'ask']);
  const MARK = { pass: '▲', lead: '+', claim: '›', unpark: '▲', sendback: '▼', defect: '▼', pullback: '▼', fail: '▼', retire: '✕', park: '■' };
  const TONE = { pass: 'ok', unpark: 'ok', lead: 'acc', claim: 'acc', sendback: 'warn', defect: 'warn', pullback: 'warn', fail: 'bad', retire: 'bad', park: 'dim' };
  const GLYPH = { ready: '○', working: '●', waiting: '◌', done: '✓', retired: '✕', parked: '■' };
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  let TL = null, S = null, ACTS = [], PLAN = null, TEMPO = 1;
  const isPrivate = () => TL.mode === 'private';
  const startingRoles = () => {
    const newcomer = new Set((TL.newcomers ?? []).map((n) => `${n.role}#${n.seat}`));
    return ROLES.filter((role) => !newcomer.has(`${role}#1`));
  };

  // ---------- the replay plan ----------
  // A burst of routine lines (one seat, minutes apart, no move or verdict between; several cards when a session works
  // them side by side) is acted as one action: one line naming what was done. A claim carries the routine work that
  // follows it ("claimed · reading sources · writing the card"). Other moves and verdicts are always acted on their own.
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
  // and starts at the later of that base and the moment its seat has finished the action before and the card it moves
  // has landed. Seats overlap freely, but no action starts before every action more than HOLD real minutes older has
  // started, so nobody runs far ahead of a busy colleague. The clock is drawn through the points where actions start.
  const warp = (min) => (min <= 0 ? 0 : Math.min(min, 6) + 0.12 * Math.min(Math.max(0, min - 6), 120));
  const actorOf = (a) => (a.role === 'owner' ? 'head of desk#1' : `${a.role}#${a.seat}`);
  const MOVE = 1.1; // seconds a card takes to cross the board, before the tempo
  const SAY = (a) => (IMPORTANT.has(a.kind) ? 1.4 : 0.9); // seconds a line holds its seat, before the tempo
  const HOLD = 2 * 60_000, TEMPO_MAX = 4, RATE_MIN = 0.12;
  function plan(acts, rate, tempo) {
    const free = new Map(), cardFree = new Map(), rows = [];
    let base = INTRO, prevT = acts[0]?.t ?? 0, end = INTRO, k = 0, held = 0;
    for (const a of acts) {
      while (k < rows.length && rows[k].act.t < a.t - HOLD) held = Math.max(held, rows[k++].at);
      base = Math.max(base, held) + rate * warp((a.t - prevT) / 60_000); // a gap gets its time after the hold
      prevT = a.t;
      const key = actorOf(a), moves = !!(a.to && a.card);
      const t = Math.max(base, free.get(key) ?? 0, moves ? cardFree.get(a.card) ?? 0 : 0);
      const d = (moves ? MOVE : SAY(a)) / tempo;
      free.set(key, t + d);
      if (moves) cardFree.set(a.card, t + d);
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
  const total = () => PLAN.end + OUTRO; // the replay's length in seconds

  // ---------- state ----------
  function newState() {
    const s = {
      sim: 0, play: 0, next: 0, rev: 0, seq: 0, lines: 0, actors: new Map(), cards: new Map(), feed: [], queue: [], nextLive: 0,
      done: false, doneAt: 0, stats: { lead: 0, pass: 0, sendback: 0, retire: 0, park: 0 },
      shown: TL.events.length ? TL.events[0].t - 5 * 60_000 : Date.now(),
    };
    for (const role of startingRoles()) addActor(s, role, 1);
    for (const c of TL.cards) {
      const card = newCard(s, c.id, c.title);
      if (c.start) { card.loc = c.start; card.gone = c.start.startsWith('retired'); }
    }
    return s;
  }
  function newCard(s, id, title = '') {
    const card = { id, title, loc: null, gone: false, lastKind: null, touched: 0, by: null, move: null, flashAt: null, born: null };
    s.cards.set(id, card);
    return card;
  }
  function addActor(s, role, seat) {
    const a = { key: `${role}#${seat}`, role, seat, now: null, ping: -1 };
    s.actors.set(a.key, a);
    return a;
  }
  // a column's cards, in the order the board shows them: in hand first, then waiting, then ready; newest move first
  const RANK = { working: 0, waiting: 1, ready: 2 };
  function listOf(s, col) {
    const out = [];
    for (const c of s.cards.values()) {
      if (!c.loc || colOf(c.loc) !== col) continue;
      if (col === 'retired' && !c.lastKind) continue; // retired today only; the library lists every retired idea
      out.push(c);
    }
    const rank = (c) => (col === 'retired' || col === 'parked' ? 0 : RANK[subOf(c.loc)] ?? 2);
    return out.sort((a, b) => rank(a) - rank(b) || b.touched - a.touched || (a.id < b.id ? -1 : 1));
  }

  // ---------- events ----------
  const cardsOf = (ev) => (ev.cards?.length > 1 ? ev.cards.join(', ') : ev.card);
  const lineText = (ev) => (ev.cards?.length > 1 ? cardsOf(ev) + ' · ' : '') + (isPrivate() && ev.text ? ev.text : ev.say);

  // The log follows the board: a line appears when its seat acts on it.
  function tick(s, ev, at) {
    const many = ev.cards?.length > 1, text = lineText(ev), card = many ? null : ev.card, top = s.feed[0];
    if (top && top.role === ev.role && top.seat === ev.seat && top.card === card && top.text === text) { top.n++; top.t = ev.t; top.est = !!ev.est; }
    else s.feed.unshift({ id: ++s.lines, t: ev.t, est: !!ev.est, role: ev.role, seat: ev.seat, key: actorOf(ev), card, text, kind: ev.kind, moved: !!ev.to, born: at, n: 1 });
    s.feed.length = Math.min(s.feed.length, 24);
  }
  function handle(s, ev, at) {
    s.rev++;
    if (ev.to && ev.kind in s.stats) s.stats[ev.kind]++; // count card moves only, not the news of them
    const key = actorOf(ev);
    let a = s.actors.get(key);
    if (!a) { const [role, seat] = key.split('#'); a = addActor(s, role, Number(seat)); }
    for (const r of ev.dispatched ?? []) { const d = s.actors.get(`${r}#1`); if (d) d.ping = at + 2.4; }
    const card = ev.card ? s.cards.get(ev.card) ?? newCard(s, ev.card) : null;
    const moves = !!(ev.to && card);
    if (moves) {
      const from = card.loc ?? ev.from ?? null, fromCol = from ? colOf(from) : null, toCol = colOf(ev.to);
      const fromIdx = card.loc && fromCol !== toCol ? Math.max(0, listOf(s, fromCol).indexOf(card)) : 0;
      card.loc = ev.to; card.gone = ev.to.startsWith('retired'); card.lastKind = ev.kind; card.touched = ++s.seq; card.by = a.key;
      if (fromCol && fromCol !== toCol) {
        const dur = Math.max(0.55, MOVE / TEMPO);
        card.move = { from: fromCol, fromIdx, t0: at, dur, kind: ev.kind }; card.flashAt = at + dur;
      } else { card.move = null; card.flashAt = at; if (!from) card.born = at; }
    }
    const kind = ev.role === 'owner' ? 'ruling' : ev.kind;
    const hold = (moves ? MOVE : SAY({ kind })) / TEMPO;
    a.now = { text: lineText(ev), kind, card: ev.cards?.length > 1 ? null : ev.card, cards: ev.cards?.length ? ev.cards : ev.card ? [ev.card] : [],
      t: ev.t, est: !!ev.est, t0: at, until: at + Math.max(hold, 1.6) };
    tick(s, ev, at);
  }

  function update(s, dt) {
    s.sim += dt;
    if (LIVE) {
      s.shown = Date.now();
      while (s.queue.length && s.sim >= s.nextLive) { handle(s, s.queue.shift(), s.sim); s.nextLive = s.sim + (s.queue.length > 12 ? 0.12 : 0.5); }
      return;
    }
    s.sim = Math.min(s.sim, total());
    s.play = s.sim;
    while (s.next < ACTS.length && PLAN.at[s.next] <= s.play) { handle(s, ACTS[s.next], PLAN.at[s.next]); s.next++; }
    if (!s.done && s.next >= ACTS.length && s.sim >= PLAN.end + 0.5) { s.done = true; s.doneAt = PLAN.end + 0.5; s.rev++; }
    s.shown = clockAt(s.play); // the clock reads the plan, so it moves steadily with what is acted out (idle hours spin by)
  }

  // ---------- drawing: keyed elements, touched only when what they show changes ----------
  const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateOf = (t) => { const d = new Date(t); return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const seatName = (role, seat) => `${role}${seat > 1 ? ' ' + seat : ''}`;
  const shortName = (key) => { const [role, seat] = key.split('#'); return seatName(SHORT[role] ?? role, Number(seat)); };
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // put(el, slot, value): true when the value differs from what the element shows in that slot
  const put = (el, slot, v) => { const c = (el._c ??= {}); if (c[slot] === v) return false; c[slot] = v; return true; };
  const text = (el, v) => { if (put(el, 'text', v)) el.textContent = v; };
  const cls = (el, name, on) => { if (put(el, 'c:' + name, !!on)) el.classList.toggle(name, !!on); };
  const tone = (el, kind) => { const t = TONE[kind] ?? ''; if (put(el, 'tone', t)) { el.classList.remove('t-ok', 't-warn', 't-bad', 't-dim', 't-acc'); if (t) el.classList.add('t-' + t); } };
  function make(tag, className, parts = []) {
    const el = document.createElement(tag);
    el.className = className;
    for (const p of parts) { const child = document.createElement('span'); child.className = p; el.appendChild(child); el['$' + p] = child; }
    return el;
  }
  // make an element's children exactly `want`, in order, moving as little as possible
  function reconcile(parent, want) {
    want.forEach((el, i) => { if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] ?? null); });
    while (parent.children.length > want.length) parent.lastElementChild.remove();
  }

  const root = document.documentElement, body = document.body;
  let rem = 15, rowH = 45, rowGap = 4.5, layoutRev = 0;
  function measure() {
    const cs = getComputedStyle(root);
    rem = parseFloat(cs.fontSize) || 15;
    rowH = (parseFloat(cs.getPropertyValue('--row-h')) || 3) * rem;
    rowGap = (parseFloat(cs.getPropertyValue('--row-gap')) || 0.3) * rem;
    layoutRev++;
  }

  // the board
  const cardEls = new Map(), flyEls = new Map();
  function buildBoard() {
    const cols = $('cols');
    for (const c of COLUMNS) {
      const col = make('div', `col${c.side ? ' side' : ''}`);
      c.head = make('button', 'colh', ['lab', 'cnt']); c.head.dataset.open = `stage:${c.id}`; c.head.$lab.textContent = c.label;
      c.body = make('div', 'colb');
      c.more = make('button', 'more'); c.more.dataset.open = `stage:${c.id}`;
      col.append(c.head, c.body); cols.appendChild(col);
      c.shown = []; c.cap = 6;
    }
  }
  const capOf = (c) => { const h = c.body.clientHeight; return h > 0 ? Math.max(2, Math.floor((h - 0.45 * rem + rowGap) / (rowH + rowGap))) : 6; };
  function cardEl(id) {
    let el = cardEls.get(id);
    if (!el) {
      el = make('button', 'card', ['g', 'id', 'who', 'ti']);
      el.dataset.open = `card:${id}`;
      el.$idText = document.createTextNode(id); el.$mk = document.createElement('i'); el.$mk.className = 'mk';
      el.$id.append(el.$idText, el.$mk);
      cardEls.set(id, el);
    }
    return el;
  }
  function paintCard(el, c, col) {
    const state = col === 'retired' ? 'retired' : col === 'parked' ? 'parked' : col === 'library' ? 'done' : subOf(c.loc);
    if (put(el, 'state', state)) { el.classList.remove('s-ready', 's-working', 's-waiting', 's-done', 's-retired', 's-parked'); el.classList.add('s-' + state); }
    text(el.$g, GLYPH[state] ?? '○');
    const mark = state === 'retired' || state === 'parked' || c.lastKind === 'claim' || c.lastKind === 'lead' ? '' : MARK[c.lastKind] ?? ''; // how it got here: passed on, or sent back
    text(el.$mk, mark); tone(el.$mk, c.lastKind);
    text(el.$who, state === 'working' && c.by ? shortName(c.by) : '');
    text(el.$ti, c.title || '');
    if (put(el, 'tip', c.title)) el.title = c.title ? `${c.id} · ${c.title}` : c.id;
  }
  function syncBoard(s) {
    for (const c of COLUMNS) {
      const list = listOf(s, c.id);
      c.cap = capOf(c);
      c.shown = list.length > c.cap ? list.slice(0, Math.max(1, c.cap - 1)) : list;
      text(c.head.$cnt, String(list.length)); cls(c.head, 'zero', !list.length);
      const want = c.shown.map((card) => { const el = cardEl(card.id); paintCard(el, card, c.id); return el; });
      if (list.length > c.shown.length) { text(c.more, `+${list.length - c.shown.length} more`); want.push(c.more); }
      reconcile(c.body, want);
    }
  }

  // what moves: a card in flight between two columns, the mark it leaves on landing, the card a seat is on right now
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  function syncMotion(s) {
    const hot = new Set();
    for (const a of s.actors.values()) if (a.now && s.sim < a.now.until) for (const id of a.now.cards) hot.add(id);
    const flying = new Set();
    for (const c of s.cards.values()) {
      const el = cardEls.get(c.id);
      if (!el) continue;
      const mv = c.move && s.sim < c.move.t0 + c.move.dur ? c.move : null;
      cls(el, 'ghost', !!mv);
      cls(el, 'hot', hot.has(c.id));
      const f = c.flashAt != null && s.sim >= c.flashAt ? 1 - (s.sim - c.flashAt) / 1.4 : 0;
      cls(el, 'flash', f > 0);
      if (f > 0) { tone(el, c.lastKind); const v = f.toFixed(2); if (put(el, 'flashv', v)) el.style.setProperty('--flash', v); }
      const fade = c.born != null && s.sim - c.born < 0.6 ? Math.max(0, (s.sim - c.born) / 0.6).toFixed(2) : '';
      if (put(el, 'fade', fade)) el.style.opacity = fade;
      if (!mv) continue;
      flying.add(c.id);
      let fl = flyEls.get(c.id);
      if (!fl) { fl = make('div', 'card flying', ['g', 'id', 'who', 'ti']); flyEls.set(c.id, fl); $('fly').appendChild(fl); }
      text(fl.$g, MARK[mv.kind] ?? '●'); text(fl.$id, c.id); text(fl.$ti, c.title || ''); tone(fl, mv.kind);
      const src = COL[mv.from], sb = src.body.getBoundingClientRect(), pad = 0.45 * rem;
      const from = { x: sb.left + pad, y: sb.top + Math.min(mv.fromIdx, Math.max(0, src.cap - 1)) * (rowH + rowGap), w: sb.width - 2 * pad };
      const dst = COL[colOf(c.loc)], target = el.isConnected ? el : dst.more.isConnected ? dst.more : dst.body;
      const tr = target.getBoundingClientRect();
      const to = target === dst.body ? { x: tr.left + pad, y: tr.bottom - rowH - pad, w: tr.width - 2 * pad } : { x: tr.left, y: tr.top, w: tr.width };
      const raw = Math.min(1, Math.max(0, (s.sim - mv.t0) / mv.dur)), k = ease(raw);
      const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * raw) * 0.9 * rem;
      fl.style.width = `${(from.w + (to.w - from.w) * k).toFixed(1)}px`;
      fl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    for (const [id, fl] of flyEls) if (!flying.has(id)) { fl.remove(); flyEls.delete(id); }
  }

  // the seats
  const seatEls = new Map();
  function syncSeats(s) {
    const actors = [...s.actors.values()].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.seat - b.seat);
    const holding = new Set();
    for (const c of s.cards.values()) if (c.by && c.loc?.endsWith(':working')) holding.add(c.by);
    let active = 0;
    const want = actors.map((a) => {
      let el = seatEls.get(a.key);
      if (!el) { el = make('button', 'seat', ['g', 'nm', 'cd', 'tx', 'tm']); el.dataset.open = `actor:${a.key}`; el.$nm.textContent = seatName(a.role, a.seat); seatEls.set(a.key, el); }
      const on = !!a.now && s.sim < a.now.until, held = holding.has(a.key), ping = a.ping > s.sim;
      if (on) active++;
      cls(el, 'active', on); cls(el, 'holding', !on && held); cls(el, 'out', !a.now); cls(el, 'ping', ping);
      text(el.$g, on ? SPIN[Math.floor((s.sim - a.now.t0) * 12) % SPIN.length] : ping ? '▸' : held ? '●' : '·');
      text(el.$cd, a.now?.card ?? '');
      text(el.$tx, a.now ? a.now.text : ping ? 'dispatched by the head of desk' : '—');
      text(el.$tm, a.now ? `${a.now.est ? '~' : ''}${hhmm(a.now.t)}` : '');
      return el;
    });
    const rows = $('seat-rows');
    if (put(rows, 'keys', actors.map((a) => a.key).join('|'))) reconcile(rows, want);
    text($('seats-meta'), `${active} active · ${actors.length} seats`);
  }

  // the log: newest line at the bottom
  const lineEls = new Map();
  function syncFeed(s) {
    const want = [];
    for (let i = s.feed.length - 1; i >= 0; i--) {
      const f = s.feed[i];
      let el = lineEls.get(f.id);
      if (!el) { el = make('button', 'line', ['tm', 'nm', 'cd', 'mk', 'tx', 'n']); el.dataset.open = f.card ? `card:${f.card}` : `actor:${f.key}`; lineEls.set(f.id, el); }
      text(el.$tm, `${f.est ? '~' : ''}${hhmm(f.t)}`); cls(el.$tm, 'est', f.est);
      text(el.$nm, seatName(f.role, f.seat)); text(el.$cd, f.card ?? '');
      text(el.$mk, f.moved ? MARK[f.kind] ?? '' : ''); tone(el.$mk, f.moved ? f.kind : null);
      text(el.$tx, f.text); text(el.$n, f.n > 1 ? `×${f.n}` : '');
      cls(el, 'key', IMPORTANT.has(f.kind));
      want.push(el);
    }
    reconcile($('feed-rows'), want);
    const live = new Set(s.feed.map((f) => f.id));
    for (const id of lineEls.keys()) if (!live.has(id)) lineEls.delete(id);
    const n = LIVE ? TL.events.length : TL.events.filter((e) => e.t <= s.shown).length;
    text($('feed-meta'), `the day so far · ${n} line${n === 1 ? '' : 's'} →`);
  }

  function syncCounts(s) {
    const st = s.stats, floor = [...s.cards.values()].filter((c) => c.loc && !c.gone && !c.loc.startsWith('parked')).length;
    const rows = [['new leads', st.lead], ['passed on', st.pass], ['sent back', st.sendback], ['retired', st.retire], ['parked', st.park], ['on the board', floor]];
    const html = rows.map(([k, v]) => `<span>${k}<b${v ? '' : ' class="zero"'}>${v}</b></span>`).join('');
    if (put($('counts'), 'html', html)) $('counts').innerHTML = html;
  }

  let paused = false, speed = 1, showHelp = !params.has('clean'), errorText = '';
  function syncChrome(s) {
    text($('clock'), hhmm(s.shown)); text($('date'), dateOf(s.shown));
    const mode = $('mode');
    text(mode, LIVE ? '● LIVE' : `REPLAY${paused ? ' · PAUSED' : ''}`); cls(mode, 'live', LIVE);
    const badge = $('badge');
    text(badge, isPrivate() ? 'PRIVATE' : 'PUBLIC'); cls(badge, 'private', isPrivate()); cls(badge, 'public', !isPrivate());
    const ended = !LIVE && s.sim >= total();
    text($('play'), ended ? 'replay' : paused ? 'play' : 'pause'); text($('speed'), `${speed}×`);
    if (!LIVE) { const w = `${(Math.min(1, s.sim / total()) * 100).toFixed(2)}%`; if (put($('progress'), 'w', w)) $('progress').firstElementChild.style.width = w; }
    const help = showHelp ? (LIVE ? 'click anything to open it · B library · H hide help' : 'click anything to open it · B library · space pause · R restart · 1-4 speed · H hide help') : '';
    text($('help'), help);
    text($('board-meta'), '○ ready   ● in hand   ◌ waiting for the platform');
    // the opening and closing cards
    const cur = $('curtain');
    let alpha = 0, html = '';
    if (!LIVE && s.sim < INTRO + 0.8) {
      alpha = Math.min(1, INTRO + 0.8 - s.sim);
      html = `<div><div class="sub">A day on the desk</div><div class="big">${dateOf(s.shown)}</div><div class="rule"></div><div class="foot">AI agents · one real pipeline</div></div>`;
    } else if (s.done) {
      const st = s.stats;
      alpha = Math.min(1, (s.sim - s.doneAt) / 1.2);
      const parts = [[st.lead, 'new'], [st.pass, 'passed on'], [st.sendback, 'sent back'], [st.retire, 'retired'], ...(st.park ? [[st.park, 'parked']] : [])];
      html = `<div><div class="sub">That's the day</div><div class="big">${dateOf(s.shown)}</div><div class="rule"></div><div class="foot">${parts.map(([n, k]) => `<b>${n}</b> ${k}`).join(' · ')}</div></div>`;
    }
    if (put(cur, 'html', html)) cur.innerHTML = html;
    const a = alpha > 0 ? alpha.toFixed(2) : '';
    if (put(cur, 'a', a)) { cur.style.display = a ? 'flex' : 'none'; cur.style.opacity = a; }
    const note = $('notice');
    if (put(note, 'err', errorText)) { note.textContent = errorText; note.style.display = errorText ? 'block' : 'none'; }
  }

  let drawn = { s: null, rev: -1, layout: -1, sel: null };
  const selectedKey = () => { const h = window.DeskInspect?.selected?.(); return h ? `${h.kind}:${h.id}` : ''; };
  function render() {
    if (!S) return;
    const s = S, sel = selectedKey();
    const changed = drawn.s !== s || drawn.rev !== s.rev || drawn.layout !== layoutRev;
    if (changed) { syncBoard(s); syncFeed(s); syncCounts(s); }
    syncSeats(s);
    syncMotion(s);
    syncChrome(s);
    if (changed || drawn.sel !== sel) for (const el of document.querySelectorAll('[data-open]')) cls(el, 'sel', el.dataset.open === sel);
    drawn = { s, rev: s.rev, layout: layoutRev, sel };
  }

  // ---------- the loop, controls, data ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (S && !paused) update(S, dt * speed);
    render();
    requestAnimationFrame(frame);
  }
  function seek(p) { S = newState(); update(S, Math.max(0, p)); render(); return S.sim; }
  // step(seconds) advances the replay deterministically (for screenshots and tests, with the page paused)
  const step = (sec) => { update(S, sec); render(); return S.sim; };
  const restart = () => { if (!LIVE) { seek(0); paused = false; } };
  const toggle = () => { if (!LIVE && S && S.sim >= total()) restart(); else paused = !paused; };
  const SPEEDS = [0.5, 1, 2, 4];

  // everything that opens the side panel carries data-open="kind:id" (inspect.js)
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-open]') : null;
    if (!el || el.closest('#insp')) return;
    const i = el.dataset.open.indexOf(':');
    window.DeskInspect?.open({ kind: el.dataset.open.slice(0, i), id: el.dataset.open.slice(i + 1) });
  });
  $('play').onclick = toggle;
  $('restart').onclick = restart;
  $('speed').onclick = () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; };
  // the line under the header is the day: click or drag it to move through the replay
  const bar = $('progress');
  const scrub = (e) => { const r = bar.getBoundingClientRect(); if (S && !LIVE) seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * total()); };
  bar.addEventListener('pointerdown', (e) => { bar.setPointerCapture(e.pointerId); scrub(e); });
  bar.addEventListener('pointermove', (e) => { if (bar.hasPointerCapture(e.pointerId)) scrub(e); });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return; // typing in the panel's search
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { window.DeskInspect?.close(); return; }
    if (e.key === 'b' || e.key === 'B') { window.DeskInspect?.open({ kind: 'library', id: 'all' }); return; }
    if (e.key === ' ') { toggle(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'h' || e.key === 'H') showHelp = !showHelp;
    else if (['1', '2', '3', '4'].includes(e.key)) speed = SPEEDS[Number(e.key) - 1];
  });
  addEventListener('resize', measure);

  function start(tl) {
    TL = tl;
    PLAN = solvePlan(LIVE ? [] : buildActs(TL.events));
    ACTS = PLAN.acts; TEMPO = PLAN.tempo;
    S = newState();
    if (params.has('t')) seek(Number(params.get('t')));
    if (params.has('pause')) paused = true;
    // ?open=card:Q-0014 (or seat, stage, day:all, library:all) opens the side panel straight away
    const o = params.get('open'), i = o ? o.indexOf(':') : -1;
    if (i > 0 && !opened) {
      opened = true;
      const go = () => window.DeskInspect?.open({ kind: o.slice(0, i), id: o.slice(i + 1) });
      if (document.readyState === 'complete') go(); else addEventListener('load', go);
    }
  }
  let opened = false;

  async function load() {
    if (LIVE) {
      const es = new EventSource('/api/live');
      es.addEventListener('snapshot', (m) => { const snap = JSON.parse(m.data); errorText = ''; start({ mode: snap.mode, cards: snap.cards, events: [], newcomers: [] }); });
      es.addEventListener('desk', (m) => { if (!S) return; const ev = JSON.parse(m.data); TL.events.push(ev); S.queue.push(ev); }); // kept, so the panel can list the day so far
      es.onerror = () => { if (!S) { errorText = 'Live mode needs the server: node viz/server.mjs, then open /?live'; start({ mode: 'public', cards: [], events: [], newcomers: [] }); } };
      return;
    }
    if (SERVED) {
      const q = new URLSearchParams();
      for (const k of ['date', 'from', 'to']) if (params.get(k)) q.set(k, params.get(k));
      try {
        const r = await fetch(`/api/timeline?${q}`);
        if (r.ok) { start(await r.json()); return; }
      } catch { /* fall back to a generated file */ }
    }
    if (window.DESK_TIMELINE) { start(window.DESK_TIMELINE); return; }
    errorText = 'No timeline. Run: node viz/build-timeline.mjs --date YYYY-MM-DD   (writes viz/out/timeline.js), or serve with node viz/server.mjs';
    start({ mode: 'public', cards: [], events: [], newcomers: [] });
  }

  body.classList.toggle('live', LIVE);
  body.classList.toggle('clean', params.has('clean'));
  buildBoard();
  measure();
  window.DeskViz = { seek, step, get state() { return S; }, get timeline() { return TL; }, get acts() { return ACTS; }, get plan() { return PLAN; }, pause: (v = true) => { paused = v; },
    // for the side panel (inspect.js)
    headerCss: () => $('top').getBoundingClientRect().bottom + 1, // the panel opens below the header, so the badge stays visible
    live: LIVE, served: SERVED, columns: COLUMNS.map(({ id, label, stages, roles }) => ({ id, label, stages, roles })), colOf,
    // (for tests) what can be clicked, and where
    hits: () => [...document.querySelectorAll('[data-open]')].filter((el) => !el.closest('#insp') && el.getClientRects().length).map((el) => {
      const r = el.getBoundingClientRect(), i = el.dataset.open.indexOf(':');
      return { kind: el.dataset.open.slice(0, i), id: el.dataset.open.slice(i + 1), x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    }) };
  load();
  requestAnimationFrame(frame);
})();
