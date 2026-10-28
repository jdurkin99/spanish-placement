// Adaptive grammar test.
//
// Routing: start at the profile's level (default A2). Each level = one item per
// structure. Score >= pass → level passed; < fail → failed; in between → one
// follow-up item for each missed structure, then re-score. Passing moves up,
// failing at the start moves down; the test stops at the first boundary found.
import { D } from './data.js';
import { getState, update } from './store.js';
import { shuffle, esc, uid, cappedMs, todayISO, minutes } from './util.js';
import { testHeader, undoButton } from './ui.js';

const levels = () => D.config.grammar.levels;
const structuresAt = lvl => Object.entries(D.grammar.structures).filter(([, s]) => s.level === lvl).map(([k]) => k);
const levelOf = item => D.grammar.structures[item.structure].level;

function session() {
  return getState().sessions.grammar;
}

// Least-seen unused item for a structure; random among ties.
function pickItem(structure, used) {
  const seen = getState().seen;
  const cands = shuffle(D.grammar.items.filter(it => it.structure === structure && !used.has(it.id)));
  if (!cands.length) return null;
  cands.sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0));
  return cands[0];
}

function queueFor(level, structures, sess) {
  const used = new Set(sess.responses.map(r => r.id));
  return shuffle(structures.map(st => pickItem(st, used)).filter(Boolean))
    .map(it => ({ id: it.id, options: shuffle([it.answer, ...it.distractors]) }));
}

export function startSession(startLevel) {
  const lvl = levels().includes(startLevel) ? startLevel : D.config.grammar.defaultStartLevel;
  update(s => {
    const sess = { id: uid(), startedAt: todayISO(), startLevel: lvl, levelIdx: levels().indexOf(lvl), direction: null, phase: 'main', queue: [], idx: 0, responses: [], outcomes: {}, ms: 0 };
    sess.queue = queueFor(lvl, structuresAt(lvl), sess);
    s.sessions.grammar = sess;
  });
}

export function discardSession() {
  update(s => { delete s.sessions.grammar; });
}

function levelScore(sess, lvl) {
  const rs = sess.responses.filter(r => r.level === lvl);
  const c = rs.filter(r => r.correct).length;
  return { n: rs.length, correct: c, p: rs.length ? c / rs.length : 0 };
}

// Called when the current queue is exhausted. Mutates the session in place.
function advance(sess) {
  const cfg = D.config.grammar;
  const lvl = levels()[sess.levelIdx];
  const sc = levelScore(sess, lvl);
  let verdict;
  if (sess.phase === 'main') {
    if (sc.p >= cfg.passThreshold) verdict = 'pass';
    else if (sc.p < cfg.failThreshold) verdict = 'fail';
    else {
      const missed = [...new Set(sess.responses.filter(r => r.level === lvl && !r.correct).map(r => r.structure))];
      const q = queueFor(lvl, missed, sess);
      if (q.length) {
        sess.phase = 'followup'; sess.queue = q; sess.idx = 0;
        return;
      }
      verdict = sc.p >= cfg.passAfterFollowupThreshold ? 'pass' : 'fail';
    }
  } else {
    verdict = sc.p >= cfg.passAfterFollowupThreshold ? 'pass' : 'fail';
  }
  sess.outcomes[lvl] = { status: verdict, correct: sc.correct, n: sc.n };

  let next = null;
  if (verdict === 'pass' && sess.direction !== 'down' && sess.levelIdx < levels().length - 1) {
    next = sess.levelIdx + 1; sess.direction = 'up';
  } else if (verdict === 'fail' && sess.direction !== 'up' && sess.levelIdx > 0) {
    next = sess.levelIdx - 1; sess.direction = 'down';
  }
  if (next === null) { sess.done = true; return; }
  sess.levelIdx = next;
  sess.phase = 'main';
  sess.queue = queueFor(levels()[next], structuresAt(levels()[next]), sess);
  sess.idx = 0;
}

export function scoreGrammar(sess) {
  const L = levels();
  const outcomes = sess.outcomes;
  const passedIdx = L.map((l, i) => (outcomes[l]?.status === 'pass' ? i : -1)).filter(i => i >= 0);
  const top = passedIdx.length ? Math.max(...passedIdx) : -1;
  const placement = top >= 0 ? L[top] : 'Pre-A1';
  const nextLevel = L[top + 1] || null;
  const nextOutcome = nextLevel && outcomes[nextLevel];
  const lowestTested = L.findIndex(l => outcomes[l]);

  const levelRows = L.map((l, i) => {
    const o = outcomes[l];
    if (o) return { level: l, status: o.status, correct: o.correct, n: o.n };
    if (i < lowestTested) return { level: l, status: 'assumed' };
    return { level: l, status: 'not tested' };
  });

  const structures = Object.entries(D.grammar.structures).map(([key, s]) => {
    const rs = sess.responses.filter(r => r.structure === key);
    const c = rs.filter(r => r.correct).length;
    let status;
    if (rs.length) status = c === rs.length ? 'solid' : c === 0 ? 'not yet' : 'shaky';
    else status = L.indexOf(s.level) < lowestTested ? 'assumed' : 'not tested';
    return { key, label: s.label, level: s.level, correct: c, n: rs.length, status };
  });

  const missed = sess.responses.filter(r => !r.correct).map(r => {
    const it = D.grammarById[r.id];
    return { id: r.id, level: r.level, structure: D.grammar.structures[r.structure].label, q: it.q, chose: r.idk ? 'No sé' : r.chosen, answer: it.answer, why: it.why || '' };
  });

  return {
    placement,
    inProgress: nextOutcome ? { level: nextLevel, correct: nextOutcome.correct, n: nextOutcome.n } : null,
    ceiling: top === L.length - 1,
    startLevel: sess.startLevel,
    levels: levelRows,
    structures,
    missed,
    total: { n: sess.responses.length, correct: sess.responses.filter(r => r.correct).length },
    minutes: minutes(sess.ms)
  };
}

function finish() {
  const sess = session();
  update(st => {
    st.attempts.push({
      id: sess.id, section: 'grammar', form: 'adaptive', startedAt: sess.startedAt, finishedAt: todayISO(),
      result: scoreGrammar(sess), responses: sess.responses
    });
    delete st.sessions.grammar;
  });
}

// ---------- views ----------

export function renderGrammar(el, go) {
  const sess = session();
  if (!sess) return renderIntro(el, go);
  if (sess.done) { finish(); go('#/results'); return; }
  if (sess.idx >= sess.queue.length) {
    update(st => advance(st.sessions.grammar));
    return renderGrammar(el, go);
  }

  const q = sess.queue[sess.idx];
  const item = D.grammarById[q.id];
  const lvl = levelOf(item);
  const shownAt = Date.now();
  const n = sess.responses.length;

  el.innerHTML = `${testHeader({ title: 'Grammar', idx: sess.idx, total: sess.queue.length,
      meta: `Question ${n + 1} · ${sess.phase === 'followup' ? 'double-checking' : 'level'} ${esc(lvl)} · ${minutes(sess.ms)} min so far` })}
    <section class="test-body">
      <div class="prompt-sentence" lang="es">${esc(item.q).replace('___', '<span class="gap">_____</span>')}</div>
      ${item.en ? `<div class="prompt-gloss">${esc(item.en)}</div>` : ''}
      <div class="choices">
        ${q.options.map((o, i) => `<button class="btn btn-choice" lang="es" data-opt="${i}">${esc(o)}</button>`).join('')}
        <button class="btn btn-choice idk" data-opt="idk">No sé</button>
      </div>
    </section>
    ${undoButton(sess.idx > 0)}`;

  el.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
    const idk = b.dataset.opt === 'idk';
    const chosen = idk ? null : q.options[+b.dataset.opt];
    update(st => {
      const s = st.sessions.grammar;
      const ms = cappedMs(shownAt);
      s.responses.push({ id: item.id, level: lvl, structure: item.structure, phase: s.phase, chosen, idk, correct: chosen === item.answer, ms });
      s.ms += ms;
      s.idx++;
      st.seen[item.id] = (st.seen[item.id] || 0) + 1;
    });
    renderGrammar(el, go);
  }));

  el.querySelector('[data-action=undo]')?.addEventListener('click', () => {
    update(st => {
      const s = st.sessions.grammar;
      const r = s.responses.pop();
      if (r) { s.idx--; s.ms -= r.ms; st.seen[r.id] = Math.max(0, (st.seen[r.id] || 1) - 1); }
    });
    renderGrammar(el, go);
  });
}

function renderIntro(el, go) {
  const start = getState().profile?.grammarStart || D.config.grammar.defaultStartLevel;
  el.innerHTML = `<section class="card">
    <h1>Grammar</h1>
    <p>Fill in the gap. The test adapts: it starts at <strong>${esc(start)}</strong> and moves up or down until it finds your level. Usually 20–35 questions, about ${D.config.grammar.targetMinutes} minutes.</p>
    <p>Tap <strong>No sé</strong> instead of guessing. Guesses make the placement less accurate.</p>
    <p class="muted small">You can pause anytime; you'll resume on the same question. Starting level can be changed in your Profile.</p>
    <button class="btn btn-primary" data-action="start">Start</button>
    <a class="btn btn-ghost" href="#/">Back</a>
  </section>`;
  el.querySelector('[data-action=start]').addEventListener('click', () => { startSession(start); renderGrammar(el, go); });
}
