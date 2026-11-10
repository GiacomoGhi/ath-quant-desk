// Reads the desk's private pipeline/ folder and turns its log lines into a timeline of events for the visual desk.
// Redaction happens HERE, at the source: in public mode an event carries only fixed phrases, role names, card ids,
// card titles, stage names and verdict words. The original log text never leaves this module in public mode.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ROLES = ['scout', 'designer', 'analyst', 'builder', 'verifier', 'quant',
  'portfolio manager', 'prop strategist', 'head of desk', 'owner'];

// Stage folders → location keys (no digits, no paths reach the page).
const STAGE_DIRS = {
  '1-research': 'research', '2-build': 'build', '3-verify': 'verify', '4-validate': 'validate',
  '5-holdout': 'holdout', '6-incubation': 'incubation', '7-library': 'library',
};
export const STAGE_NAMES = {
  research: 'research', build: 'build', verify: 'verify', validate: 'validate', holdout: 'hold-out',
  incubation: 'incubation', library: 'library', parked: 'parked', retired: 'retired', portfolios: 'portfolios',
  prop: 'prop',
};
const ROLE_STAGE = {
  scout: 'research', designer: 'research', analyst: 'research', builder: 'build', verifier: 'verify',
  quant: 'validate', 'portfolio manager': 'incubation', 'prop strategist': 'prop',
};

const LINE = /^(\d{4}-\d{2}-\d{2})(?: (\d{2}):(\d{2}))? · ([^·]+?) · (.*)$/;
const ARROW = /→\s*(?:(\d-[a-z]+)\/(ready|working|waiting)|(retired|parked|portfolios|prop|7-library))/g;
const CARD_ID = /\b([QPF]-\d{4})\b/g;
const MIN = 60_000;

function locFromArrow(m) {
  if (m[1]) return `${STAGE_DIRS[m[1]] ?? m[1]}:${m[2]}`;
  return m[3] === '7-library' ? 'library:ready' : `${m[3]}:ready`;
}
function locFromFolder(rel) {
  const [top, sub] = rel.split('/');
  if (STAGE_DIRS[top]) return `${STAGE_DIRS[top]}:${sub && /^(ready|working|waiting)$/.test(sub) ? sub : 'ready'}`;
  return `${top}:ready`;
}

function safeList(dir) { try { return readdirSync(dir); } catch { return []; } }
function safeRead(file) { try { return readFileSync(file, 'utf8'); } catch { return null; } }
function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

// Every card folder (Q-/P-/F-NNNN-slug) wherever it sits, with its current location.
export function findCards(root) {
  const cards = [];
  const visit = (rel, depth) => {
    for (const name of safeList(join(root, rel))) {
      const relChild = rel ? `${rel}/${name}` : name;
      if (!isDir(join(root, relChild)) || name === 'ids' || name === 'reports') continue;
      const id = /^([QPF]-\d{4})(?:-|$)/.exec(name);
      if (id) cards.push({ id: id[1], dir: join(root, relChild), folderLoc: locFromFolder(rel) });
      else if (depth < 2) visit(relChild, depth + 1);
    }
  };
  visit('', 0);
  return cards;
}

export function readTitle(dir, id) {
  for (const file of ['card.md', 'lead.md']) {
    const text = safeRead(join(dir, file));
    if (!text) continue;
    const fm = /^title:\s*(.+)$/m.exec(text);
    if (fm) return fm[1].trim();
    const h = /^#\s+(.+)$/m.exec(text);
    if (h) return h[1].replace(id, '').replace(/^[\s·—:-]+/, '').trim();
  }
  return id;
}

function parseLines(text) {
  const out = [];
  (text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const m = LINE.exec(raw.trim());
    if (!m) return;
    const roleRaw = m[4].trim().toLowerCase();
    const seatM = /^(.*?)\s*\(seat (\d+)\)$/.exec(roleRaw);
    out.push({
      index, raw: raw.trim(), date: m[1], timed: m[2] != null,
      t: Date.parse(`${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}:00Z`),
      role: seatM ? seatM[1] : roleRaw, seat: seatM ? Number(seatM[2]) : 1, text: m[5].trim(),
    });
  });
  return out;
}

// Within one file the order of lines is the true order, but each agent session stamps lines with its own clock, and
// those clocks disagree by up to ~20 minutes (a builder working after the analyst may write an earlier time). Clamping
// every backward line to the one before it squeezed whole sessions onto a single minute. Instead each run of lines by
// one role (one session) keeps its own spacing, and every run's clock is shifted by the smallest amounts (least
// squares) that put the runs in file order: an isotonic fit, so the odd clock moves, not everything after it.
// Untimed lines take the time of the line before them. Lines whose time was guessed or moved carry est: true.
const GAP = MIN / 2;
function deskew(lines) {
  const runs = [];
  let prev = null;
  for (const l of lines) {
    l.stamped = l.timed ? l.t : prev && prev.date === l.date ? prev.stamped : Date.parse(`${l.date}T12:00:00Z`);
    l.t = l.stamped;
    const run = runs.at(-1);
    if (run && run.role === `${l.role}#${l.seat}` && run.date === l.date) run.lines.push(l);
    else runs.push({ role: `${l.role}#${l.seat}`, date: l.date, lines: [l] });
    prev = l;
  }
  for (const r of runs) { // a session's own small slips (14:40 then 14:39) are clamped inside the run
    let p = -Infinity;
    for (const l of r.lines) { l.t = Math.max(l.t, p); p = l.t; }
    r.s = r.lines[0].t; r.e = p;
  }
  // offsets o_k with o_{k+1} - o_k >= c_k = e_k - s_{k+1} + GAP; u_k = o_k - C_k is non-decreasing, fit to -C_k (PAV)
  let C = 0;
  const y = runs.map((r, k) => { if (k) C += runs[k - 1].e - r.s + GAP; r.C = C; return -C; });
  const blocks = [];
  for (let k = 0; k < y.length; k++) {
    blocks.push({ sum: y[k], n: 1, from: k });
    while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).n > blocks.at(-1).sum / blocks.at(-1).n) {
      const b = blocks.pop(); blocks.at(-1).sum += b.sum; blocks.at(-1).n += b.n;
    }
  }
  for (const b of blocks) for (let k = b.from; k < b.from + b.n; k++) {
    const o = Math.round((b.sum / b.n + runs[k].C) / 1000) * 1000;
    for (const l of runs[k].lines) { l.t += o; l.est = !l.timed || Math.abs(l.t - l.stamped) >= MIN; }
  }
}

// The head of desk's run log often omits the time, and its order is the order it heard of things, not quite the
// order they happened. A "<role> [seat] [round n] done|held: Q-NNNN …" line is placed just after the move it reports.
// Lines are matched last to first: each takes that role's latest move on the card not already reported by a later
// line, and never after a later report on the same card; the verdict written after each card id (→ 2-build,
// RETIRED, conforms, back to build) picks among the moves. So moves the head of desk never reported (a morning run
// by hand) stay unmatched. Other untimed lines follow the line placed before them in the log (or lead the next one).
// Timed lines keep their time. Every guessed time carries est: true.
const DONE = /^([a-z]+(?: [a-z]+)*?)(?: (\d+))?(?: round \d+)? (?:done|held)\b/;
const STAGE_OF_DIR = (d) => STAGE_DIRS[d] ?? d;
// The verdict a passage of a head-of-desk line names, as a test on a move; null when it names none (then it takes
// the next card's: "Q-0011 and Q-0013 RETIRED").
function segVerdict(seg) {
  const arrow = /→\s*(\d-[a-z]+)/.exec(seg);
  if (arrow) return (e) => e.move.to.split(':')[0] === STAGE_OF_DIR(arrow[1]);
  if (/RETIRED/.test(seg)) return (e) => e.move.to.startsWith('retired');
  if (/PARKED/.test(seg)) return (e) => e.move.to.startsWith('parked');
  if (/back to (?:build|the builder)|send-?back/i.test(seg)) return (e) => e.move.to.startsWith('build');
  if (/back to (?:research|the analyst)/i.test(seg)) return (e) => e.move.to.startsWith('research');
  if (/conforms/i.test(seg)) return (e) => /conforms/i.test(e.text);
  return null;
}
function placeHeadOfDesk(lines, cardEvents) {
  const reported = new Set(); // seq of moves already reported
  const ceiling = new Map(); // card → time of the earliest later report on it
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    l.est = !l.timed;
    if (l.timed) continue;
    l.t = null;
    const m = DONE.exec(l.text);
    const status = /^([QPF]-\d{4}) (?:PARKED|RETIRED|unparked)\b/.exec(l.text); // "Q-0014 PARKED on …": any role's move
    if (!(m && ROLES.includes(m[1])) && !status) continue;
    const role = m ? m[1] : null, seat = m?.[2] ? Number(m[2]) : null;
    const head = status ? l.text.slice(0, 30) : l.text.split(/\b(?:dispatch|pipeline now|census)/i)[0];
    // a card named in parentheses ("(short, Q-0015 variant)") is a side mention, not a report
    const depth = (at) => [...head.slice(0, at)].reduce((d, c) => d + (c === '(' ? 1 : c === ')' ? -1 : 0), 0);
    const ids = [...head.matchAll(CARD_ID)].filter((x) => depth(x.index) <= 0);
    let t = null;
    const hits = [];
    const verdicts = ids.map((x, k) => segVerdict(head.slice(x.index, ids[k + 1]?.index ?? head.length)));
    for (let k = verdicts.length - 2; k >= 0; k--) verdicts[k] ??= verdicts[k + 1];
    ids.forEach((x, k) => {
      const card = x[1];
      const fits = verdicts[k] ?? ((e) => !e.move.to.startsWith('retired'));
      const cap = ceiling.get(card) ?? Infinity;
      const open = cardEvents.filter((e) => e.card === card && (role == null || e.role === role) && e.date === l.date
        && e.move && e.move.kind !== 'claim' && !reported.has(e.seq) && e.t <= cap);
      // card logs rarely write "(seat 2)": prefer the seat the line names, else any seat of that role
      const seated = open.filter((e) => seat == null || e.seat === seat);
      const cands = seated.length ? seated : open;
      const fit = cands.filter(fits);
      const hit = (fit.length ? fit : cands).at(-1);
      if (!hit) return;
      reported.add(hit.seq);
      hits.push(hit);
      t = Math.max(t ?? -Infinity, hit.t + MIN / 2);
    });
    for (const h of hits) ceiling.set(h.card, Math.min(ceiling.get(h.card) ?? Infinity, h.t));
    l.t = t;
    l.matched = hits.map((h) => ({ card: h.card, word: moveWord(h) }));
  }
  // the rest: just after the line placed before them in the log, else just before the next placed one
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t != null) continue;
    let j = i; while (j < lines.length && lines[j].t == null) j++;
    const before = i > 0 && lines[i - 1].date === lines[i].date ? lines[i - 1].t : null;
    const after = j < lines.length && lines[j].date === lines[i].date ? lines[j].t : null;
    const n = j - i;
    for (let k = 0; k < n; k++) {
      lines[i + k].t = before != null
        ? (after != null && after > before ? before + Math.min(MIN, (after - before) / (n + 1)) * (k + 1) : before + MIN * (k + 1))
        : (after != null ? after - MIN * (n - k) : Date.parse(`${lines[i].date}T12:00:00Z`) + MIN * k);
    }
    i = j - 1;
  }
}

// ---------- classification: what happened, in fixed public words ----------

const stageWord = (loc) => STAGE_NAMES[loc?.split(':')[0]] ?? 'next stage';

// Research roles read, write and count; they never run backtests, so a run-like line of theirs is counting or writing.
const RESEARCH = new Set(['scout', 'designer', 'analyst']);
function classify(text, role, move) {
  const r = classifyLine(text, role, move);
  if (r[0] === 'run' && !move && RESEARCH.has(role)) return /trigger|count/i.test(text) ? ['check', 'counting trades'] : ['write', 'writing the card'];
  return r;
}

function classifyLine(text, role, move) {
  const s = text;
  if (role === 'owner') return /declin/i.test(s) ? ['ruling', 'the owner declined'] : ['ruling', "the owner's ruling"];
  if (move) {
    const to = move.to.split(':')[0];
    if (to === 'retired') {
      const v = /\bV(\d)\b/.exec(s);
      return ['retire', /gate R/i.test(s) ? 'retired at gate R' + (/cost/i.test(s) ? ' on cost' : '')
        : v ? `retired at V${v[1]}` : /cost/i.test(s) ? 'retired on cost' : 'retired'];
    }
    if (to === 'parked') return ['park', 'parked: waits for the platform'];
    if (move.kind === 'unpark') return ['unpark', 'unparked → build'];
    if (move.kind === 'claim') return ['claim', 'claimed'];
    if (/pulled back/i.test(s)) return ['pullback', 'pulled back for a re-check'];
    if (/verdict:\s*defect|defects?\s*\(|send-?back/i.test(s) && to !== 'verify') {
      return /verdict/i.test(s) ? ['sendback', 'sent back: defect'] : ['claim', 'claimed the send-back'];
    }
    if (/conforms/i.test(s)) return ['pass', `conforms → ${stageWord(move.to)}`];
    if (/gate R/i.test(s)) return ['pass', `gate R passed → ${stageWord(move.to)}`];
    if (/lead written|lead:/i.test(s) || role === 'scout' || role === 'designer') return ['lead', 'new lead → research'];
    if (move.to.endsWith(':working')) return ['claim', 'claimed'];
    return ['pass', `passed on → ${stageWord(move.to)}`];
  }
  if (/\bFAILED\b/.test(s)) {
    const v = /\bV(\d)\b/.exec(s);
    return ['fail', v ? `V${v[1]} failed` : /gate R/i.test(s) ? 'gate R failed' : 'failed'];
  }
  if (/out of memory/i.test(s)) return ['fail', 'a run ran out of memory'];
  if (/\bdefect\b|\bDEFECT\b/i.test(s) && !/defect gone/i.test(s)) return ['defect', 'found a defect'];
  if (/defect gone/i.test(s)) return ['check', 'defect gone ✓'];
  if (/^answer\b|answer to/i.test(s)) return ['ask', 'answering a question'];
  if (/question/i.test(s)) return ['ask', 'has a question'];
  if (/^(guides? read|read:|settings|platform(?: read)?:|AGENTS\.md|playbook)/i.test(s)) return ['read', 'reading up'];
  if (/^\d+ done\b/.test(s)) return ['run', 'backtest done'];
  if (/^(checks?|confirmations?|diagnostics)\b/i.test(s)) return ['check', 'checking trades'];
  if (/duplicate/i.test(s)) return ['check', 'checking for duplicates'];
  if (/^gate R passed/i.test(s)) return ['check', 'gate R passed'];
  if (/simulation|monte carlo|analy[sz]e_portfolio/i.test(s)) return ['run', 'running simulations'];
  if (/smoke run/i.test(s)) return ['run', 'smoke run'];
  if (/\bV(\d)\b[^.;]*\brun\b/.test(s)) return ['run', `V${/\bV(\d)\b/.exec(s)[1]} run`];
  if (/\bbacktests?\b|\bruns?\b \d|\brun of record\b|started/i.test(s)) return ['run', 'backtest running'];
  if (/stressed|desk copy/i.test(s)) return ['setup', 'setting up costs'];
  if (/\bwindows\b/i.test(s)) return ['setup', 'fixing the data windows'];
  if (/web search|sources?\b.*read|read in full|source read|later evidence|^sources?:/i.test(s)) return ['read', 'reading sources'];
  if (/guides? read|\bread:|text read|playbook|settings\.yaml|read\b/i.test(s)) return ['read', 'reading up'];
  if (/strategy created|rebuilt|\brevision\b|apply_source|edit_source|\bfix\b/i.test(s)) return ['build', 'building'];
  if (/trigger|tickets?|checked|exits?:|weekend flat|settled|recomputed/i.test(s)) return ['check', 'checking trades'];
  if (/card(\.md)? written|section|card written|decision|departure/i.test(s)) return ['write', 'writing the card'];
  if (/cost/i.test(s)) return ['cost', 'checking costs'];
  if (/platform-gaps|\bgap\b/i.test(s)) return ['gap', 'noting a platform gap'];
  if (/notions?/i.test(s)) return ['write', 'writing notions'];
  if (/focus/i.test(s)) return ['report', 'ranking the focus list'];
  if (/census|report|loop/i.test(s)) return ['report', 'daily census'];
  if (/ruling|ruled/i.test(s)) return ['ruling', "the owner's ruling"];
  if (/frequency|estimate/i.test(s)) return ['check', 'counting trades'];
  if (/created|portfolio/i.test(s)) return ['run', 'building portfolios'];
  return ['work', 'working'];
}

const VERDICTS = [
  [/\bRETIRED\b/, 'retired'], [/\bPARKED\b/, 'parked'], [/\bunparked\b/i, 'unparked'],
  [/back to build|send-?back/i, 'sent back'], [/\bconforms\b/i, 'conforms'], [/DECLINED|declined/, 'declined'],
  [/→\s*\d-[a-z]+/, 'passed on'], [/\bbuilt\b/, 'built'],
];
const roleList = (s) => ROLES.filter((r) => r !== 'owner' && r !== 'head of desk' && new RegExp(`\\b${r}\\b`).test(s));

// The verdict word for a move the head of desk reported (taken from the move itself, so a line that names several
// cards with different fates says each one right).
function moveWord(e) {
  const to = e.move.to.split(':')[0], from = e.move.from?.split(':')[0];
  if (to === 'retired') return 'retired';
  if (to === 'parked') return 'parked';
  if (/conforms/i.test(e.text)) return 'conforms';
  if (from === 'verify' && (to === 'build' || to === 'research')) return 'sent back';
  if (!from) return '';
  return 'passed on';
}

function classifyHeadOfDesk(text, publicIds, matched = []) {
  const s = text;
  const head = s.split(/;|—|\. /)[0];
  let refs = [...new Set([...head.matchAll(CARD_ID)].map((m) => m[1]))].filter((id) => publicIds.has(id));
  const parts = [];
  let kind = 'office';
  const done = DONE.exec(s);
  if (done && ROLES.includes(done[1])) {
    const verb = /^[a-z0-9 ]+? held\b/.test(s) ? 'held' : 'done';
    const shown = matched.filter((m) => publicIds.has(m.card));
    let what = '';
    if (shown.length) {
      refs = [...new Set(shown.map((m) => m.card))];
      const groups = [];
      for (const m of shown.slice(0, 4)) {
        const g = groups.find((x) => x.word === m.word);
        if (g) g.ids.push(m.card); else groups.push({ word: m.word, ids: [m.card] });
      }
      what = ': ' + groups.map((g) => `${g.ids.join(', ')}${g.word ? ' ' + g.word : ''}`).join(', ');
    } else if (refs.length) {
      const v = VERDICTS.find(([re]) => re.test(head));
      what = `: ${refs.slice(0, 3).join(', ')}${v ? ' ' + v[1] : ''}`;
    }
    parts.push(`${done[1]} ${verb}${what}`);
    kind = 'news';
  } else if (/^[QPF]-\d{4} PARKED\b/.test(s)) {
    parts.push(refs.length ? `${refs[0]} parked` : 'parked'); kind = 'park';
  } else if (/ruling|ruled|declined|owner's go|owner said|\bHOLD\b/i.test(s)) {
    parts.push("the owner's ruling"); kind = 'ruling';
  } else if (/census|report|loop/i.test(s)) {
    parts.push('daily census + report'); kind = 'report';
  } else if (/focus/i.test(s)) {
    parts.push('ranking the focus list'); kind = 'report';
  } else if (/\bparked\b/i.test(s)) {
    parts.push('parked'); kind = 'park';
  }
  const dispatchAt = s.search(/dispatch/i);
  const dispatched = dispatchAt >= 0 ? roleList(s.slice(dispatchAt)) : [];
  if (dispatched.length) parts.push(`dispatching the ${dispatched.join(', ')}`);
  if (!parts.length) parts.push('desk business');
  return { kind, say: parts.join(' · '), refs, dispatched };
}

// ---------- the timeline ----------

/**
 * @param {string} root  the pipeline folder
 * @param {{from?: string, to?: string, mode?: 'public'|'private'}} opts  dates are YYYY-MM-DD (inclusive)
 */
export function buildTimeline(root, { from, to, mode = 'public' } = {}) {
  if (!existsSync(root)) throw new Error(`pipeline folder not found: ${root}`);
  const isPublic = mode !== 'private';
  const cards = findCards(root);
  const titles = new Map(cards.map((c) => [c.id, readTitle(c.dir, c.id)]));
  const publicIds = new Set(cards.filter((c) => c.id.startsWith('Q-')).map((c) => c.id));

  // Card logs → events, tracking where each card is.
  const cardEvents = [];
  let seq = 0;
  for (const c of cards) {
    const lines = parseLines(safeRead(join(c.dir, 'log.md')));
    deskew(lines);
    for (const l of lines) cardEvents.push({ ...l, card: c.id, key: `${c.id}|${l.raw}`, seq: seq++ });
  }
  cardEvents.sort((a, b) => a.t - b.t || a.seq - b.seq);

  const where = new Map();
  const beforePark = new Map();
  for (const e of cardEvents) {
    const cur = where.get(e.card) ?? null;
    // "… asks the builder for a count run, then → 3-verify/ready" is an instruction, not a move
    const arrows = [...e.text.matchAll(ARROW)].filter((m) => !/\bthen\s*$/i.test(e.text.slice(Math.max(0, m.index - 8), m.index)));
    let move = null;
    const back = /^pulled back from \S+ to (\d-[a-z]+)\/(ready|working|waiting)/i.exec(e.text);
    if (arrows.length) move = { to: locFromArrow(arrows[arrows.length - 1]) };
    else if (back) move = { to: `${STAGE_DIRS[back[1]] ?? back[1]}:${back[2]}` };
    else if (/^unparked\b/i.test(e.text)) move = { kind: 'unpark', to: beforePark.get(e.card) ?? 'build:ready' };
    else if (/^parked\b/i.test(e.text)) move = { to: 'parked:ready' };
    else if (/^claimed\b/i.test(e.text)) {
      const stage = cur && cur.endsWith(':ready') && !cur.startsWith('parked') ? cur.split(':')[0] : ROLE_STAGE[e.role];
      if (stage) move = { kind: 'claim', to: `${stage}:working` };
    }
    if (move && move.to === cur) move = null;
    if (move) {
      if (/^claimed\b/i.test(e.text) || move.to.endsWith(':working') && cur?.split(':')[0] === move.to.split(':')[0]) move.kind ??= 'claim';
      if (move.to === 'parked:ready' && cur) beforePark.set(e.card, cur);
      move.from = cur;
      where.set(e.card, move.to);
    }
    e.move = move;
  }

  const hodLines = parseLines(safeRead(join(root, 'reports', 'head-of-desk.log.md')));
  placeHeadOfDesk(hodLines, cardEvents);
  const hodEvents = hodLines.map((l) => ({ ...l, card: null, key: `hod|${l.raw}`, seq: seq++, move: null }));

  const all = [...cardEvents, ...hodEvents].sort((a, b) => a.t - b.t || a.seq - b.seq);
  // Identical lines (rare) still get distinct keys, so live diffing never drops one.
  const seen = new Map();
  for (const e of all) { const n = seen.get(e.key) ?? 0; seen.set(e.key, n + 1); if (n) e.key += `#${n}`; }
  const inRange = (e) => (!from || e.date >= from) && (!to || e.date <= to);

  // Where every card stands when the range starts.
  const startLoc = new Map();
  for (const e of all) if (!inRange(e) && (!from || e.date < from) && e.move) startLoc.set(e.card, e.move.to);
  const lastLoc = new Map();
  for (const e of all) if ((!to || e.date <= to) && e.move) lastLoc.set(e.card, e.move.to);

  const shown = (id) => !isPublic || publicIds.has(id);
  const events = [];
  for (const e of all) {
    if (!inRange(e)) continue;
    const card = e.card && shown(e.card) ? e.card : null;
    let ev;
    if (e.role === 'head of desk' && !e.move) {
      const h = classifyHeadOfDesk(e.text, isPublic ? publicIds : new Set(cards.map((c) => c.id)), e.matched);
      ev = { t: e.t, role: e.role, seat: e.seat, card, kind: h.kind, say: h.say, refs: h.refs, dispatched: h.dispatched };
    } else {
      const [kind, say] = classify(e.text, e.role, e.move);
      ev = { t: e.t, role: ROLES.includes(e.role) ? e.role : 'head of desk', seat: e.seat, card, kind, say };
      if (e.move && card) { ev.to = e.move.to; ev.from = e.move.from; }
    }
    if (e.est) ev.est = true;
    if (!isPublic) { ev.text = e.text.slice(0, 400); ev.key = e.key; }
    events.push(ev);
  }

  // Roles whose first line ever falls in the range walk in as newcomers.
  const firstSeen = new Map();
  for (const e of all) { const k = `${e.role}#${e.seat}`; if (!firstSeen.has(k)) firstSeen.set(k, e.date); }
  const newcomers = [...firstSeen].filter(([k, d]) => ROLES.includes(k.split('#')[0]) && (!from || d >= from) && (!to || d <= to)).map(([k]) => ({ role: k.split('#')[0], seat: Number(k.split('#')[1]) }));

  const existsBy = (id) => !to || all.some((e) => e.card === id && e.date <= to) || !all.some((e) => e.card === id);
  const cardList = cards.filter((c) => shown(c.id) && existsBy(c.id)).map((c) => ({
    id: c.id,
    title: isPublic ? publicTitle(titles.get(c.id)) : titles.get(c.id),
    start: startLoc.get(c.id) ?? (events.some((e) => e.card === c.id) ? null : (lastLoc.get(c.id) ?? c.folderLoc)),
    now: c.folderLoc,
  }));

  return {
    version: 1, mode: isPublic ? 'public' : 'private',
    range: { from: from ?? null, to: to ?? null },
    newcomers, cards: cardList, events,
  };
}

// Titles are allowed in public mode; anything that looks like a figure, a path or money is cut out anyway.
function publicTitle(title) {
  return String(title)
    .replace(/[$€£%]|https?:\S+|\S+\.(md|yaml|json)\b|[\\/]/g, '')
    .replace(/(^|[^A-Za-z0-9])\d+(?:[.,]\d+)*(?![A-Za-z0-9-])/g, '$1')
    .replace(/\s{2,}/g, ' ').replace(/\(\s*\)/g, '').trim().slice(0, 80);
}

// The live snapshot: where every card stands now (its folder is the truth).
export function snapshot(root, mode = 'public') {
  const tl = buildTimeline(root, { mode });
  return { mode: tl.mode, cards: tl.cards.map((c) => ({ id: c.id, title: c.title, start: c.now })) };
}

// Stable keys for live diffing; never sent to a public page.
export function eventKeys(root, mode = 'public') {
  const tl = buildTimeline(root, { mode: 'private' });
  const pub = mode === 'private' ? tl : buildTimeline(root, { mode });
  return tl.events.map((e, i) => ({ key: e.key, event: pub.events[i] }));
}
