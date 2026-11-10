// What the visual desk lets a viewer open: the desk's own documents (its rules and playbooks, public like the rest of
// this repository) and, only when the server runs PRIVATE, the pipeline's documents: every card's lead, card and log,
// the sources screened, the notions, the focus, the platform gaps and the head of desk's reports.
// The page asks for a document by a KEY from the list this module made; it never names a file, so it can't reach
// anything else. A public server lists and serves the desk's documents only.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findCards, snapshot } from './pipeline.mjs';

const safeList = (dir) => { try { return readdirSync(dir).sort(); } catch { return []; } };
const safeRead = (file) => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

// The desk's own documents: public in every mode.
function deskDocs(repoDir) {
  const docs = [
    { key: 'desk/agents', title: 'What every agent reads first', group: 'rules', file: join(repoDir, 'AGENTS.md') },
    { key: 'desk/charter', title: 'Charter: the rules', group: 'rules', file: join(repoDir, 'docs', 'charter.md') },
    { key: 'desk/design', title: 'Design: teams and stages', group: 'rules', file: join(repoDir, 'docs', 'design.md') },
    { key: 'desk/pipeline', title: 'The pipeline protocol', group: 'rules', file: join(repoDir, 'docs', 'pipeline.md') },
  ];
  for (const f of safeList(join(repoDir, 'roles'))) {
    if (f.endsWith('.md')) docs.push({ key: `role/${f.slice(0, -3)}`, title: `Playbook: ${f.slice(0, -3).replace(/-/g, ' ')}`, group: 'playbooks', file: join(repoDir, 'roles', f) });
  }
  return docs.filter((d) => isFile(d.file));
}

// The pipeline's documents: private.
function pipelineDocs(root) {
  const docs = [
    { key: 'pipe/sources', title: 'Sources screened', group: 'research', file: join(root, 'sources.md') },
    { key: 'pipe/notions', title: 'Notions', group: 'research', file: join(root, 'notions.md') },
    { key: 'pipe/focus', title: 'Research focus', group: 'desk', file: join(root, 'focus.md') },
    { key: 'pipe/gaps', title: 'Platform gaps', group: 'desk', file: join(root, 'platform-gaps.md') },
  ];
  for (const f of safeList(join(root, 'reports')).reverse()) {
    if (!f.endsWith('.md')) continue;
    const name = f.slice(0, -3);
    const title = name === 'head-of-desk.log' ? 'Head of desk: its log' : /^\d{4}-W\d+$/.test(name) ? `Weekly report ${name}` : name.replace(/-/g, ' ');
    docs.push({ key: `report/${name}`, title, group: 'reports', file: join(root, 'reports', f) });
  }
  return docs.filter((d) => isFile(d.file));
}

const CARD_FILES = { lead: 'lead.md', card: 'card.md', log: 'log.md' };

// The source a lead names (its "**Source:**" line), shortened: what the scout read.
function sourceOf(dir) {
  const text = safeRead(join(dir, 'lead.md'));
  const m = text && /\*\*Source:\*\*\s*([\s\S]*?)(?:\r?\n\s*\r?\n|\r?\n\*\*|$)/.exec(text); // the paragraph, over its wrapped lines
  return m ? m[1].replace(/\s+/g, ' ').replace(/\s+—\s+https?:.*$/, '').replace(/\(?https?:\S+\)?/g, '').replace(/[\s—;,:]+$/, '').trim().slice(0, 260) : null;
}
// A card's latest log line (its last step, or why it was retired).
function lastStep(dir) {
  const lines = (safeRead(join(dir, 'log.md')) ?? '').split(/\r?\n/).filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
  return lines.length ? lines[lines.length - 1].slice(0, 300) : null;
}

export function library(root, repoDir, mode) {
  const priv = mode === 'private';
  const snap = snapshot(root, mode);
  const dirs = new Map(findCards(root).map((c) => [c.id, c.dir]));
  const cards = snap.cards.map((c) => {
    const out = { id: c.id, title: c.title, loc: c.start };
    if (priv) {
      const dir = dirs.get(c.id);
      out.docs = Object.keys(CARD_FILES).filter((k) => isFile(join(dir, CARD_FILES[k])));
      out.source = sourceOf(dir);
      out.last = lastStep(dir);
    }
    return out;
  });
  const docs = [...deskDocs(repoDir), ...(priv ? pipelineDocs(root) : [])].map(({ key, title, group }) => ({ key, title, group }));
  return { mode: priv ? 'private' : 'public', cards, docs };
}

// One document by its key → { key, title, text }, or null when the key isn't one this mode may serve.
export function readDoc(root, repoDir, mode, key) {
  const priv = mode === 'private';
  const card = /^card\/([QPF]-\d{4})\/(lead|card|log)$/.exec(String(key));
  if (card) {
    if (!priv) return null;
    const dir = findCards(root).find((c) => c.id === card[1])?.dir;
    const text = dir && safeRead(join(dir, CARD_FILES[card[2]]));
    return text == null ? null : { key, title: `${card[1]} · ${card[2]}`, text };
  }
  const doc = [...deskDocs(repoDir), ...(priv ? pipelineDocs(root) : [])].find((d) => d.key === key);
  const text = doc && safeRead(doc.file);
  return text == null ? null : { key, title: doc.title, text };
}
