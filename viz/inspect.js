// The side panel: click a character, a card, a room, a ticker chip or a feed line (or press B) to open it.
// What it shows follows the server's privacy mode, decided on the server: a PUBLIC server sends only card ids, titles,
// stages and the day's public moves, plus the desk's own rules and playbooks; a PRIVATE server (--private) also sends
// every card's lead, card and log, the sources screened, the notions, the focus, the gaps and the reports.
(() => {
  const V = () => window.DeskViz;
  const HEAD = 'Bahnschrift, "DIN Alternate", "Segoe UI", system-ui, sans-serif';
  const MONO = '"Cascadia Mono", Consolas, ui-monospace, monospace';

  const STAGE = { research: 'Research', build: 'Build', verify: 'Verify', validate: 'Validate', holdout: 'Hold-out', incubation: 'Incubation', library: 'Library', portfolios: 'Portfolios', prop: 'Prop', parked: 'Parked', retired: 'Retired' };
  const SUB = { ready: 'waiting for its stage', working: 'being worked on', waiting: 'waiting for the platform' };
  const STAGE_ORDER = ['research', 'build', 'verify', 'validate', 'holdout', 'incubation', 'library', 'portfolios', 'prop', 'parked', 'retired'];
  const ROLE_INFO = {
    'scout': 'Finds sources worth reading: papers, books, documented market behaviour, the platform\'s strategy catalog.',
    'designer': 'Designs ideas from a stated mechanism, aimed at what the owner\'s book lacks.',
    'analyst': 'Turns a lead into an idea card (hypothesis, rationale, rules, parameters, costs) and decides gate R.',
    'builder': 'Writes the strategy on the platform exactly as the card says, with its data windows fixed.',
    'verifier': 'Checks the trades against the card\'s rules and the prices, trade by trade.',
    'quant': 'Runs the validation stages: baseline, optimization, robustness, walk-forward, hold-out.',
    'portfolio manager': 'Runs demo incubation and builds portfolios of strategies that work together.',
    'prop strategist': 'Finds the prop-firm plans with the best expected value net of fees.',
    'head of desk': 'Sets the research focus, dispatches the roles, chases stale cards, writes the weekly report.',
  };
  const ROOM_INFO = {
    library: ['research', 'Leads wait here for an analyst, who turns each into an idea card and decides gate R: build it, park it or retire it.'],
    studio: [null, 'The designer builds new ideas from a stated mechanism, before any test.'],
    workshop: ['build', 'The builder writes each card\'s strategy on the platform, as the card says, and makes one smoke run.'],
    bench: ['verify', 'The verifier checks every rule fires as written, trade by trade against the prices.'],
    lab: ['validate', 'The quant runs the validation stages on the development window. Cards that need a stage the platform can\'t run yet wait here.'],
    vault: ['holdout', 'The sealed hold-out: one run on the most recent years, the chosen variant only. Fail means retired.'],
    incubator: ['incubation', 'Demo trading, matched trade by trade against the backtest of the same days.'],
    trophy: ['library', 'Strategies that passed everything, and the portfolios and prop plans built from them.'],
    store: ['parked', 'Parked ideas wait for a platform capability; retired ones go through the shredder, with the reason in their log.'],
    office: [null, 'The head of desk sets the research focus, dispatches the roles and writes the weekly report.'],
  };

  // ---------- the panel ----------
  const css = `
  #insp { position: fixed; top: 0; right: 0; bottom: 0; width: min(580px, 46vw); z-index: 10; display: flex; flex-direction: column;
    background: rgba(6,9,18,0.94); border-left: 1px solid rgba(111,168,255,0.35); box-shadow: -20px 0 60px rgba(0,0,0,0.55);
    color: #dfe5f2; font: 15px/1.5 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; transform: translateX(105%);
    transition: transform .22s ease; backdrop-filter: blur(6px); }
  #insp.open { transform: none; }
  @media (max-width: 760px) { #insp { width: 100vw; } }
  #insp header { display: flex; align-items: center; gap: 10px; padding: 16px 18px 10px; border-bottom: 1px solid rgba(111,168,255,0.15); }
  #insp header h2 { margin: 0; flex: 1; font: 700 19px/1.25 ${HEAD}; letter-spacing: .5px; color: #fff; overflow-wrap: anywhere; }
  #insp .kind { font: 700 11px ${HEAD}; letter-spacing: 2.5px; color: var(--accent, #6fa8ff); text-transform: uppercase; white-space: nowrap; }
  #insp header button { background: none; border: 1px solid rgba(255,255,255,0.15); color: #cfd5e6; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-size: 15px; flex: none; }
  #insp header button:hover { border-color: #6fa8ff; color: #fff; }
  #insp nav { display: flex; gap: 4px; padding: 8px 18px 0; flex-wrap: wrap; }
  #insp nav button { background: none; border: none; color: #8b93a8; font: 700 12px ${HEAD}; letter-spacing: 2px; padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
  #insp nav button.on { color: #fff; border-bottom-color: var(--accent, #6fa8ff); }
  #insp nav button:disabled { opacity: .35; cursor: default; }
  #insp .body { flex: 1; overflow: auto; padding: 14px 18px 40px; }
  #insp .body::-webkit-scrollbar { width: 8px; } #insp .body::-webkit-scrollbar-thumb { background: rgba(111,168,255,0.25); border-radius: 4px; }
  #insp h3 { font: 700 12px ${HEAD}; letter-spacing: 2.5px; color: #6c7796; text-transform: uppercase; margin: 22px 0 8px; }
  #insp .pill { display: inline-block; padding: 2px 10px; border-radius: 99px; font: 700 12px ${HEAD}; letter-spacing: 1.5px; border: 1px solid currentColor; margin-right: 6px; }
  #insp .muted { color: #8b93a8; } #insp .small { font-size: 13px; }
  #insp .note { border: 1px dashed rgba(255,179,64,0.5); color: #ffcf85; border-radius: 8px; padding: 10px 12px; font-size: 13.5px; margin: 12px 0; }
  #insp a { color: #8fbaff; text-decoration: none; } #insp a:hover { text-decoration: underline; }
  #insp a.cid { font-family: ${MONO}; font-size: .92em; color: #fff; background: rgba(111,168,255,0.14); padding: 0 4px; border-radius: 4px; }
  #insp .row { display: grid; grid-template-columns: 56px 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
  #insp .row .t { font: 13px ${MONO}; color: #8b93a8; }
  #insp .who { font: 700 11px ${HEAD}; letter-spacing: 1.5px; text-transform: uppercase; }
  #insp .item { display: block; padding: 9px 10px; margin: 0 -10px; border-radius: 8px; cursor: pointer; color: inherit; }
  #insp .item:hover { background: rgba(111,168,255,0.1); text-decoration: none; }
  #insp .item .id { font: 700 13px ${MONO}; color: #fff; margin-right: 8px; }
  #insp .item .sub { display: block; font-size: 13px; color: #8b93a8; margin-top: 2px; }
  #insp input { width: 100%; box-sizing: border-box; background: rgba(16,22,40,0.9); border: 1px solid rgba(111,168,255,0.3); border-radius: 8px; color: #fff; padding: 9px 12px; font: 14px "Segoe UI", system-ui, sans-serif; margin: 4px 0 8px; }
  #insp .md h1, #insp .md h2, #insp .md h3, #insp .md h4 { font-family: ${HEAD}; color: #fff; letter-spacing: .3px; text-transform: none; margin: 20px 0 8px; }
  #insp .md h1 { font-size: 20px; } #insp .md h2 { font-size: 17px; } #insp .md h3 { font-size: 15px; color: #cfe0ff; } #insp .md h4 { font-size: 14px; color: #cfe0ff; }
  #insp .md p { margin: 8px 0; } #insp .md ul, #insp .md ol { margin: 6px 0; padding-left: 22px; } #insp .md li { margin: 3px 0; }
  #insp .md code { font: 12.5px ${MONO}; background: rgba(255,255,255,0.07); padding: 1px 5px; border-radius: 4px; }
  #insp .md pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px; overflow: auto; font: 12.5px/1.45 ${MONO}; }
  #insp .md table { border-collapse: collapse; margin: 10px 0; font-size: 13px; display: block; overflow: auto; }
  #insp .md th, #insp .md td { border: 1px solid rgba(255,255,255,0.1); padding: 5px 8px; text-align: left; vertical-align: top; }
  #insp .md th { background: rgba(111,168,255,0.1); color: #fff; }
  #insp .md blockquote { border-left: 3px solid rgba(111,168,255,0.5); margin: 8px 0; padding: 2px 12px; color: #b8c0d6; }
  #insp .md .meta { font-size: 13px; color: #8b93a8; margin-bottom: 10px; }
  #insp .result { border: 1px solid rgba(56,224,140,0.35); background: rgba(56,224,140,0.06); border-radius: 10px; padding: 4px 14px; }
  #insp .toc a { display: inline-block; margin: 2px 10px 2px 0; font-size: 13px; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const el = document.createElement('aside'); el.id = 'insp';
  el.innerHTML = '<header><button class="back" title="Back">←</button><div style="flex:1;min-width:0"><div class="kind"></div><h2></h2></div><button class="x" title="Close (Esc)">✕</button></header><nav></nav><div class="body"></div>';
  document.body.appendChild(el);
  const $ = (q) => el.querySelector(q);
  $('.x').onclick = () => close();
  $('.back').onclick = () => { const prev = stack.pop(); if (prev) show(prev, false); };

  let current = null; const stack = [];
  const close = () => { el.classList.remove('open'); current = null; stack.length = 0; };
  function show(view, push = true) {
    if (push && current && JSON.stringify(current) !== JSON.stringify(view)) stack.push(current);
    current = view;
    $('.back').style.visibility = stack.length ? 'visible' : 'hidden';
    el.style.top = `${Math.round(V()?.headerCss?.() ?? 0)}px`; // below the header: the PUBLIC / PRIVATE badge is never covered
    el.classList.add('open');
    const r = { actor: actorView, card: cardView, room: roomView, library: libraryView, doc: docView }[view.kind];
    if (r) r(view);
  }
  const open = (h) => show({ kind: h.kind, id: h.id, tab: h.tab });

  function frame(kind, title, accent, tabs, tab, onTab) {
    el.style.setProperty('--accent', accent || '#6fa8ff');
    $('.kind').textContent = kind; $('h2').textContent = title;
    const nav = $('nav'); nav.innerHTML = '';
    for (const [key, label, enabled = true] of tabs ?? []) {
      const b = document.createElement('button'); b.textContent = label; b.className = key === tab ? 'on' : ''; b.disabled = !enabled;
      b.onclick = () => onTab(key); nav.appendChild(b);
    }
    const body = $('.body'); body.scrollTop = 0; return body;
  }

  // ---------- data ----------
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
  const mode = () => V()?.timeline?.mode ?? 'public';
  let LIB = null, libAt = 0;
  async function lib() {
    if (!V()?.served) return null;
    if (LIB && performance.now() - libAt < 8000) return LIB;
    try { const r = await fetch('/api/library'); if (r.ok) { LIB = await r.json(); libAt = performance.now(); } } catch { /* offline */ }
    return LIB;
  }
  const docCache = new Map();
  async function doc(key) {
    if (!V()?.served) return null;
    const hit = docCache.get(key);
    if (hit && performance.now() - hit.at < 8000) return hit.doc;
    try { const r = await fetch(`/api/doc?key=${encodeURIComponent(key)}`); const d = r.ok ? await r.json() : null; docCache.set(key, { doc: d, at: performance.now() }); return d; } catch { return null; }
  }
  // the day's events so far (in a replay, up to the clock on screen)
  function eventsSoFar() {
    const v = V(), tl = v?.timeline, s = v?.state;
    if (!tl) return [];
    return v.live ? tl.events : tl.events.filter((e) => e.t <= (s?.shown ?? Infinity));
  }
  const actorKey = (e) => (e.role === 'owner' ? 'head of desk#1' : `${e.role}#${e.seat}`);
  const lineOf = (e) => (mode() === 'private' && e.text ? e.text : e.say);
  const roleColor = (role) => V()?.roleColor?.(role) ?? '#cfd5e6';
  const locText = (loc) => { if (!loc) return 'not on the floor'; const [st, sub] = loc.split(':'); return `${STAGE[st] ?? st}${SUB[sub] && !/^(parked|retired|library|portfolios|prop)$/.test(st) ? ' · ' + SUB[sub] : ''}`; };
  const privNote = () => (!V()?.served
    ? '<div class="note">Documents need the server: run <code>node viz/server.mjs --private</code> and open the page from it.</div>'
    : mode() !== 'private' ? '<div class="note">This server is PUBLIC, so the desk\'s private work (leads, cards, logs, sources, reports) stays hidden. Start it with <code>--private</code> to read it; never record a private screen for posting.</div>' : '');
  function wire(body) {
    body.querySelectorAll('[data-card]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); show({ kind: 'card', id: a.dataset.card }); }; });
    body.querySelectorAll('[data-actor]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); show({ kind: 'actor', id: a.dataset.actor }); }; });
    body.querySelectorAll('[data-doc]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); show({ kind: 'doc', id: a.dataset.doc }); }; });
    body.querySelectorAll('[data-room]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); show({ kind: 'room', id: a.dataset.room }); }; });
  }
  const cardLink = (id) => `<a href="#" class="cid" data-card="${esc(id)}">${esc(id)}</a>`;
  const actorLink = (key) => { const [role, seat] = key.split('#'); return `<a href="#" data-actor="${esc(key)}" class="who" style="color:${roleColor(role)}">${esc(role)}${seat > 1 ? ' ' + seat : ''}</a>`; };
  function eventRows(evs, { showCard = true, showWho = true } = {}) {
    if (!evs.length) return '<p class="muted small">Nothing yet.</p>';
    return evs.slice().reverse().slice(0, 80).map((e) => {
      const cards = showCard ? (e.cards?.length ? e.cards : e.card ? [e.card] : []).map(cardLink).join(' ') : '';
      return `<div class="row"><span class="t">${e.est ? '~' : ''}${hhmm(e.t)}</span><span>${showWho ? actorLink(actorKey(e)) + ' ' : ''}${cards} <span>${linkify(esc(lineOf(e)))}</span></span></div>`;
    }).join('');
  }
  const linkify = (h) => h.replace(/\b([QPF]-\d{4})\b/g, '<a href="#" class="cid" data-card="$1">$1</a>');

  // ---------- views ----------
  function actorView({ id }) {
    const s = V().state, a = s?.actors.get(id), [role, seat] = id.split('#');
    const body = frame('character', `${role}${seat > 1 ? ' ' + seat : ''}`, roleColor(role));
    const now = !a ? 'Not on the floor yet.'
      : a.held ? `Carrying ${cardLink(a.held.id)} ${a.held.plan ? 'to ' + esc(locText(a.held.plan)) : ''}`
      : a.bubble ? linkify(esc(a.bubble.text)) : 'At their desk.';
    const mine = eventsSoFar().filter((e) => actorKey(e) === id);
    const touched = [...new Set(mine.flatMap((e) => (e.cards?.length ? e.cards : e.card ? [e.card] : [])))];
    body.innerHTML = `
      <p class="muted">${esc(ROLE_INFO[role] ?? '')}</p>
      <p><a href="#" data-doc="role/${esc(role.replace(/ /g, '-'))}">Open the ${esc(role)}'s playbook →</a></p>
      <h3>Now</h3><p>${now}</p>
      ${touched.length ? `<h3>Cards today</h3><p>${touched.map(cardLink).join(' ')}</p>` : ''}
      <h3>Today so far</h3>${eventRows(mine, { showWho: false })}`;
    wire(body);
  }

  async function cardView(view) {
    const { id } = view, tab = view.tab ?? 'overview';
    const s = V().state, c = s?.cards.get(id), tl = V().timeline;
    const title = c?.title || tl?.cards.find((x) => x.id === id)?.title || '';
    const L = await lib(), lc = L?.cards.find((x) => x.id === id);
    const canRead = mode() === 'private' && lc?.docs?.length;
    const accent = c?.color ?? '#6fa8ff';
    const body = frame(`card ${id}`, title || id, accent,
      [['overview', 'OVERVIEW'], ['lead', 'LEAD', !!lc?.docs?.includes('lead')], ['card', 'CARD', !!lc?.docs?.includes('card')], ['log', 'LOG', !!lc?.docs?.includes('log')]],
      tab, (t) => show({ kind: 'card', id, tab: t }, false));
    current = { kind: 'card', id, tab };
    if (tab !== 'overview') {
      body.innerHTML = '<p class="muted">Loading…</p>';
      const d = await doc(`card/${id}/${tab}`);
      if (current?.id !== id || current?.tab !== tab) return;
      body.innerHTML = d ? `<p class="muted small">The file as it is now.</p>${tocOf(d.text)}<div class="md">${md(d.text)}</div>` : privNote() || '<p class="muted">Not available.</p>';
      wire(body); wireToc(body); return;
    }
    const evs = eventsSoFar().filter((e) => e.card === id || e.cards?.includes(id));
    const loc = c ? (c.heldBy ? c.plan ?? c.loc : c.loc) : lc?.loc;
    const holder = c?.heldBy ? actorLink(c.heldBy.key) : null;
    const last = [...evs].reverse().find((e) => e.role !== 'head of desk');
    body.innerHTML = `
      <p><span class="pill" style="color:${esc(accent)}">${esc(locText(loc))}</span></p>
      ${holder ? `<p>Being carried by ${holder} right now.</p>` : last ? `<p class="muted">Last touched by ${actorLink(actorKey(last))} at ${hhmm(last.t)}.</p>` : ''}
      ${lc?.source ? `<h3>Where the idea comes from</h3><p>${linkify(esc(lc.source))}</p>` : ''}
      ${lc?.last ? `<h3>Latest step in its log (now)</h3><p class="small">${linkify(esc(lc.last))}</p>` : ''}
      <div id="res"></div>
      ${canRead ? '' : privNote()}
      <h3>Its day so far</h3>${eventRows(evs, { showCard: false })}`;
    wire(body);
    if (canRead) {
      const d = await doc(`card/${id}/card`);
      if (!d || current?.id !== id || current?.tab !== 'overview') return;
      const res = latestResult(d.text);
      if (res) { const box = body.querySelector('#res'); box.innerHTML = `<h3>Latest result in the card (now)</h3><div class="result md">${md(res)}</div>`; wire(box); }
    }
  }
  // the card's last section about a result or verdict, so "how is it doing" is one click
  function latestResult(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let start = -1;
    lines.forEach((l, i) => { if (/^#{2,4}\s.*(result|verdict|gate r\b|outcome)/i.test(l)) start = i; });
    if (start < 0) return null;
    const level = /^(#+)/.exec(lines[start])[1].length;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { const m = /^(#+)\s/.exec(lines[i]); if (m && m[1].length <= level) { end = i; break; } }
    return lines.slice(start, Math.min(end, start + 40)).join('\n');
  }

  async function roomView({ id }) {
    const r = V().rooms[id], [stage, what] = ROOM_INFO[id] ?? [null, ''];
    const body = frame('room', r?.label ?? id, r?.accent);
    const s = V().state;
    const stages = id === 'store' ? ['parked', 'retired'] : id === 'trophy' ? ['library', 'portfolios', 'prop'] : stage ? [stage] : [];
    const here = [...(s?.cards.values() ?? [])].filter((c) => { const loc = c.heldBy ? c.plan ?? c.loc : c.loc; return loc && stages.includes(loc.split(':')[0]) && !(loc.startsWith('retired') && !c.lastKind); });
    const people = [...(s?.actors.values() ?? [])].filter((a) => V().roleRoom[a.role] === id);
    const L = await lib();
    const groups = {};
    for (const c of here) { const loc = c.heldBy ? c.plan ?? c.loc : c.loc; (groups[loc] ??= []).push(c); }
    const list = Object.keys(groups).sort().map((loc) => `<h3>${esc(locText(loc))}</h3>` + groups[loc].map((c) => cardItem(c.id, c.title, L)).join('')).join('');
    const officeDocs = id === 'office' ? `<h3>The desk's papers</h3>${(L?.docs ?? []).filter((d) => ['desk', 'reports'].includes(d.group)).map((d) => `<a class="item" href="#" data-doc="${esc(d.key)}">${esc(d.title)}</a>`).join('') || privNote() || '<p class="muted small">None.</p>'}` : '';
    body.innerHTML = `<p class="muted">${esc(what)}</p>
      ${people.length ? `<h3>Who works here</h3><p>${people.map((a) => actorLink(a.key)).join(' · ')}</p>` : ''}
      ${stages.length ? (list || '<h3>Cards</h3><p class="muted small">No cards here right now.</p>') : ''}
      ${id === 'store' ? '<p class="muted small">Retired today only; the library (B) lists every retired idea.</p>' : ''}
      ${officeDocs}`;
    wire(body);
  }
  function cardItem(id, title, L) {
    const lc = L?.cards.find((x) => x.id === id);
    const sub = lc?.source ?? (mode() === 'private' && lc?.last ? lc.last : '');
    return `<a class="item" href="#" data-card="${esc(id)}"><span class="id">${esc(id)}</span>${esc(title || lc?.title || '')}${sub ? `<span class="sub">${esc(sub.slice(0, 160))}</span>` : ''}</a>`;
  }

  async function libraryView(view) {
    const tab = view.tab ?? 'ideas';
    const body = frame('library', 'The desk\'s work', '#6fa8ff', [['ideas', 'IDEAS'], ['docs', 'DOCUMENTS']], tab, (t) => show({ kind: 'library', id: 'all', tab: t }, false));
    current = { kind: 'library', id: 'all', tab };
    const L = await lib();
    if (tab === 'docs') {
      const docs = L?.docs ?? [];
      const group = (g, title) => { const ds = docs.filter((d) => d.group === g); return ds.length ? `<h3>${title}</h3>` + ds.map((d) => `<a class="item" href="#" data-doc="${esc(d.key)}">${esc(d.title)}</a>`).join('') : ''; };
      body.innerHTML = privNote() + group('research', 'Research') + group('desk', 'The desk') + group('reports', 'Reports') + group('rules', 'The rules') + group('playbooks', 'Playbooks')
        + (docs.length ? '' : '<p class="muted">No documents: open the page from the server.</p>');
      wire(body); return;
    }
    // every idea, grouped by where it stands now (the library comes from the server; offline, from the replay)
    const s = V().state;
    const cards = L?.cards ?? [...(s?.cards.values() ?? [])].map((c) => ({ id: c.id, title: c.title, loc: c.loc }));
    body.innerHTML = `<input type="search" placeholder="Search ideas, titles, sources…">${privNote()}<p class="muted small">Where each idea stands now${V().live ? '' : ' (the replay shows the day as it went)'}.</p><div class="list"></div>`;
    const input = body.querySelector('input'), out = body.querySelector('.list');
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const hit = cards.filter((c) => !q || `${c.id} ${c.title} ${c.source ?? ''} ${c.last ?? ''}`.toLowerCase().includes(q));
      const by = {};
      for (const c of hit) { const st = (c.loc ?? 'unknown:').split(':')[0]; (by[st] ??= []).push(c); }
      const order = [...STAGE_ORDER, ...Object.keys(by).filter((k) => !STAGE_ORDER.includes(k))];
      out.innerHTML = order.filter((st) => by[st]).map((st) => `<h3>${esc(STAGE[st] ?? st)} · ${by[st].length}</h3>` +
        by[st].sort((a, b) => (a.loc?.endsWith('working') ? -1 : 0) - (b.loc?.endsWith('working') ? -1 : 0) || (a.id < b.id ? -1 : 1)).map((c) =>
          `<a class="item" href="#" data-card="${esc(c.id)}"><span class="id">${esc(c.id)}</span>${esc(c.title)}${c.loc?.endsWith('working') ? ' <span class="pill" style="color:#38e08c;font-size:10px">IN PROGRESS</span>' : ''}${c.source ? `<span class="sub">${esc(c.source.slice(0, 170))}</span>` : ''}</a>`).join('')).join('') || '<p class="muted">Nothing matches.</p>';
      wire(out);
    };
    input.oninput = render; render();
  }

  async function docView({ id }) {
    const body = frame('document', '…', '#6fa8ff');
    const d = await doc(id);
    if (current?.id !== id) return;
    $('h2').textContent = d?.title ?? id;
    body.innerHTML = d ? `${tocOf(d.text)}<div class="md">${md(d.text)}</div>` : privNote() || '<p class="muted">Not available.</p>';
    wire(body); wireToc(body);
  }
  function tocOf(text) {
    const hs = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
    return hs.length > 3 ? `<div class="toc small">${hs.map((h, i) => `<a href="#" data-sec="${i}">${esc(h)}</a>`).join('')}</div>` : '';
  }
  function wireToc(body) {
    body.querySelectorAll('[data-sec]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); body.querySelectorAll('.md h2')[Number(a.dataset.sec)]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
  }

  // ---------- a small, safe Markdown renderer: everything is escaped first; links only to http(s) or the desk's docs ----------
  function inline(raw) {
    return esc(raw).split(/(`[^`]+`)/).map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${part.slice(1, -1)}</code>`;
      let s = part;
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
        if (/^https?:\/\//.test(href)) return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        const role = /(?:^|\/)roles\/([a-z-]+)\.md/.exec(href), desk = /(?:^|\/)(charter|design|pipeline)\.md/.exec(href);
        if (role) return `<a href="#" data-doc="role/${role[1]}">${label}</a>`;
        if (desk) return `<a href="#" data-doc="desk/${desk[1]}">${label}</a>`;
        if (/AGENTS\.md/.test(href)) return '<a href="#" data-doc="desk/agents">' + label + '</a>';
        return label;
      });
      s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
      s = s.replace(/(^|[^\w/=">-])([QPF]-\d{4})\b/g, '$1<a href="#" class="cid" data-card="$2">$2</a>');
      return s;
    }).join('');
  }
  function md(text) {
    const lines = String(text).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    if (lines[0] === '---') { // front matter → a line of metadata
      const end = lines.indexOf('---', 1);
      if (end > 0) { out.push(`<div class="meta">${lines.slice(1, end).map((l) => inline(l)).join(' · ')}</div>`); i = end + 1; }
    }
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) { flush(); const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(esc(lines[i++])); i++; out.push(`<pre>${buf.join('\n')}</pre>`); continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) { flush(); const n = Math.min(4, h[1].length); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
      if (/^\s*\|/.test(l)) {
        flush(); const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
        out.push('<table>' + body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('') + '</table>');
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
        flush(); const items = [];
        while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (m) items.push({ depth: Math.floor(m[1].length / 2), text: m[3] }); else items[items.length - 1].text += ' ' + lines[i].trim();
          i++;
        }
        out.push('<ul>' + items.map((it) => `<li style="margin-left:${it.depth * 18}px">${inline(it.text)}</li>`).join('') + '</ul>');
        continue;
      }
      if (/^>\s?/.test(l)) { flush(); const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue; }
      if (!l.trim()) { flush(); i++; continue; }
      para.push(l.trim()); i++;
    }
    flush();
    return out.join('\n');
  }

  window.DeskInspect = {
    open: (h) => { if (h.kind === 'library' && current?.kind === 'library') { close(); return; } open(h); },
    close, selected: () => (current && current.kind !== 'library' && current.kind !== 'doc' ? { kind: current.kind, id: current.id } : current?.kind === 'library' ? { kind: 'library', id: 'all' } : null),
  };
})();
