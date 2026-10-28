// Vocabulary section: (a) yes/no recognition, (b) banded meaning check, (c) production.
import { D } from './data.js';
import { getState, update, lastAttempt } from './store.js';
import { shuffle, esc, checkTyped, uid, cappedMs, pct, minutes, todayISO } from './util.js';
import { testHeader, undoButton, ACCENT_KEYS } from './ui.js';

export const PARTS = [
  { id: 'lextale', name: 'a. Word recognition', blurb: 'Real word or fake? ~3 min' },
  { id: 'meaning', name: 'b. Meaning check', blurb: 'Pick the English meaning. ~5 min' },
  { id: 'production', name: 'c. Type the Spanish', blurb: 'English → Spanish. ~3 min' }
];

// ---------- session setup ----------

export function suggestedForm() {
  const forms = D.config.forms;
  const last = lastAttempt('vocab');
  if (!last) return forms[0];
  return forms[(forms.indexOf(last.form) + 1) % forms.length];
}

function buildPart(partId, form) {
  if (partId === 'lextale') {
    const f = D.lextale.forms[form];
    const items = shuffle([
      ...f.words.map(x => ({ w: x.w, real: true, rank: x.rank })),
      ...f.pseudowords.map(w => ({ w, real: false }))
    ]);
    return { items, idx: 0, responses: [], done: false, ms: 0 };
  }
  if (partId === 'meaning') {
    const items = shuffle(D.meaning.forms[form]).map(x => ({
      w: x.w, band: x.band, rank: x.rank, answer: x.answer,
      options: shuffle([x.answer, ...x.distractors])
    }));
    return { items, idx: 0, responses: [], done: false, ms: 0 };
  }
  const items = shuffle(D.production.forms[form]);
  return { items, idx: 0, responses: [], done: false, ms: 0 };
}

export function startSession(form) {
  update(s => {
    s.sessions.vocab = { id: uid(), form, startedAt: todayISO(), parts: {} };
  });
}

export function discardSession() {
  update(s => { delete s.sessions.vocab; });
}

function session() {
  return getState().sessions.vocab;
}

// ---------- scoring ----------

export function scoreVocab(parts) {
  const res = {};
  const lx = parts.lextale;
  if (lx?.done) {
    const words = lx.responses.filter(r => r.real);
    const nons = lx.responses.filter(r => !r.real);
    const hits = words.filter(r => r.said === 'yes').length;
    const fa = nons.filter(r => r.said === 'yes').length;
    const score = hits - 2 * fa;
    res.lextale = {
      words: words.length, hits, pseudowords: nons.length, falseAlarms: fa,
      score, scorePct: pct(Math.max(0, score), words.length),
      missedWords: words.filter(r => r.said !== 'yes').map(r => r.w),
      acceptedPseudowords: nons.filter(r => r.said === 'yes').map(r => r.w),
      minutes: minutes(lx.ms)
    };
  }
  const mc = parts.meaning;
  if (mc?.done) {
    const k = D.config.vocab.mcOptionCount;
    const bands = D.config.vocab.bands.map(b => {
      const rs = mc.responses.filter(r => r.band === b.id);
      const c = rs.filter(r => r.correct).length;
      const w = rs.filter(r => !r.correct && !r.idk).length;
      const idk = rs.filter(r => r.idk).length;
      // Classic correction for guessing: known = right − wrong/(k−1). "No sé" costs nothing.
      const known = rs.length ? Math.max(0, (c - w / (k - 1)) / rs.length) : 0;
      return { id: b.id, label: b.label, size: b.size, n: rs.length, correct: c, wrong: w, idk, knownPct: Math.round(known * 100), est: Math.round(known * b.size) };
    });
    const rb = D.config.vocab.regionalBand;
    const reg = mc.responses.filter(r => r.band === rb.id);
    res.meaning = {
      bands,
      sizeEstimate: bands.reduce((a, b) => a + b.est, 0),
      sizeMax: bands.reduce((a, b) => a + b.size, 0),
      regional: { label: rb.label, n: reg.length, correct: reg.filter(r => r.correct).length },
      missed: mc.responses.filter(r => !r.correct).map(r => ({ w: r.w, band: r.band, chose: r.idk ? 'No sé' : r.chosen, answer: r.answer })),
      minutes: minutes(mc.ms)
    };
  }
  const pr = parts.production;
  if (pr?.done) {
    res.production = {
      n: pr.responses.length,
      correct: pr.responses.filter(r => r.correct).length,
      accentSlips: pr.responses.filter(r => r.accentSlip).map(r => ({ typed: r.typed, expected: r.accept[0] })),
      missed: pr.responses.filter(r => !r.correct).map(r => ({ en: r.en, typed: r.idk ? '' : r.typed, expected: r.accept.join(' / '), band: r.band })),
      minutes: minutes(pr.ms)
    };
  }
  return res;
}

function maybeFinish() {
  const s = session();
  if (!s || !PARTS.every(p => s.parts[p.id]?.done)) return false;
  update(st => {
    st.attempts.push({
      id: s.id, section: 'vocab', form: s.form, startedAt: s.startedAt, finishedAt: todayISO(),
      result: scoreVocab(s.parts),
      responses: Object.fromEntries(PARTS.map(p => [p.id, s.parts[p.id].responses]))
    });
    delete st.sessions.vocab;
  });
  return true;
}

// ---------- views ----------

export function renderVocabHome(el, go) {
  const s = session();
  const last = lastAttempt('vocab');
  const form = s?.form || suggestedForm();
  const forms = D.config.forms;

  el.innerHTML = `
    <section class="card">
      <h1>Vocabulary</h1>
      <p class="muted">Three short parts, about 10–11 minutes total. Do them in one sitting or one at a time. Progress saves after every answer.</p>
      ${last ? `<p class="muted small">Last finished: Form ${esc(last.form)}, ${new Date(last.finishedAt).toLocaleDateString()}.</p>` : ''}
      ${s ? `<p><span class="pill">In progress · Form ${esc(s.form)}</span></p>` : `
        <label class="field"><span>Test form</span>
          <select id="vform">${forms.map(f => `<option ${f === form ? 'selected' : ''}>${f}</option>`).join('')}</select>
          <small class="muted">Alternate forms for retests, so you don't remember the answers. Suggested: Form ${esc(suggestedForm())}.</small>
        </label>`}
    </section>
    <div class="part-list">
      ${PARTS.map(p => {
        const ps = s?.parts[p.id];
        const status = ps?.done ? '✓ Done' : ps ? `Resume (${ps.idx}/${ps.items.length})` : 'Start';
        return `<button class="part ${ps?.done ? 'done' : ''}" data-part="${p.id}" ${ps?.done ? 'disabled' : ''}>
          <span><strong>${esc(p.name)}</strong><br><small class="muted">${esc(p.blurb)}</small></span>
          <span class="part-status">${status}</span>
        </button>`;
      }).join('')}
    </div>
    ${s ? `<button class="btn btn-ghost danger" data-action="discard">Discard this in-progress attempt</button>` : ''}
  `;

  el.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => {
    if (!session()) startSession(el.querySelector('#vform')?.value || form);
    go(`#/vocab/${b.dataset.part}`);
  }));
  el.querySelector('[data-action=discard]')?.addEventListener('click', () => {
    if (confirm('Discard all answers in this unfinished vocabulary attempt?')) { discardSession(); renderVocabHome(el, go); }
  });
}

const INTRO = {
  lextale: `<p>You'll see Spanish words, one at a time. Some are real; some are made up but look Spanish.</p>
    <p>Tap <strong>Real word</strong> only if you're confident it exists (you don't need to know the meaning). Otherwise tap <strong>Not a word</strong>.</p>
    <p class="muted small">Saying “real” to fake words costs double points, so guessing doesn't help.</p>`,
  meaning: `<p>Pick the English meaning. If you don't know, tap <strong>No sé</strong>; guessing wrong is penalized, “No sé” is not.</p>`,
  production: `<p>Type the Spanish word for each English prompt. Accents are optional (they're noted, not penalized). Use the accent keys if your keyboard lacks them.</p>
    <p class="muted small">Tap <strong>No sé</strong> if it doesn't come to you within a few seconds.</p>`
};

export function renderPart(el, go, partId) {
  let s = session();
  if (!s) { go('#/vocab'); return; }
  if (!s.parts[partId]) {
    // Show intro once, before the part's items are built.
    const p = PARTS.find(x => x.id === partId);
    el.innerHTML = `<section class="card"><h1>${esc(p.name)}</h1>${INTRO[partId]}
      <button class="btn btn-primary" data-action="begin">Begin</button>
      <a class="btn btn-ghost" href="#/vocab">Back</a></section>`;
    el.querySelector('[data-action=begin]').addEventListener('click', () => {
      update(st => { st.sessions.vocab.parts[partId] = buildPart(partId, st.sessions.vocab.form); });
      renderPart(el, go, partId);
    });
    return;
  }

  const ps = s.parts[partId];
  if (ps.done || ps.idx >= ps.items.length) {
    update(st => { st.sessions.vocab.parts[partId].done = true; });
    const finished = maybeFinish();
    if (finished) { go('#/results'); return; }
    const remaining = PARTS.filter(p => !session().parts[p.id]?.done);
    el.innerHTML = `<section class="card center">
      <h1>Part done ✓</h1>
      <p>Saved. ${remaining.length} part${remaining.length === 1 ? '' : 's'} left in this section.</p>
      <button class="btn btn-primary" data-next="${remaining[0].id}">Continue: ${esc(remaining[0].name)}</button>
      <a class="btn btn-ghost" href="#/">Stop for today</a></section>`;
    el.querySelector('[data-next]').addEventListener('click', e => go(`#/vocab/${e.currentTarget.dataset.next}`));
    return;
  }

  const item = ps.items[ps.idx];
  const shownAt = Date.now();
  const name = PARTS.find(p => p.id === partId).name;

  const record = (resp) => {
    update(st => {
      const p = st.sessions.vocab.parts[partId];
      p.responses.push({ ...resp, ms: cappedMs(shownAt) });
      p.ms += cappedMs(shownAt);
      p.idx++;
    });
    renderPart(el, go, partId);
  };

  let body = '';
  if (partId === 'lextale') {
    body = `<div class="prompt-word" lang="es">${esc(item.w)}</div>
      <div class="choices two">
        <button class="btn btn-choice yes" data-say="yes">✓ Real word</button>
        <button class="btn btn-choice no" data-say="no">✗ Not a word</button>
      </div>`;
  } else if (partId === 'meaning') {
    body = `<div class="prompt-word" lang="es">${esc(item.w)}</div>
      <div class="choices">
        ${item.options.map((o, i) => `<button class="btn btn-choice" data-opt="${i}">${esc(o)}</button>`).join('')}
        <button class="btn btn-choice idk" data-opt="idk">No sé</button>
      </div>`;
  } else {
    body = `<div class="prompt-en">${esc(item.en)}</div>
      <form class="typed" autocomplete="off">
        <input id="typed" type="text" lang="es" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Spanish answer" placeholder="Escribe en español">
        <div class="accent-keys">${ACCENT_KEYS.map(k => `<button type="button" class="key" data-key="${k}">${k}</button>`).join('')}</div>
        <div class="choices two">
          <button type="submit" class="btn btn-primary">Submit</button>
          <button type="button" class="btn btn-choice idk" data-action="idk">No sé</button>
        </div>
      </form>`;
  }

  el.innerHTML = `${testHeader({ title: name, idx: ps.idx, total: ps.items.length, meta: `Form ${esc(s.form)}` })}
    <section class="test-body">${body}</section>
    ${undoButton(ps.idx > 0)}`;

  el.querySelector('[data-action=undo]')?.addEventListener('click', () => {
    update(st => {
      const p = st.sessions.vocab.parts[partId];
      const r = p.responses.pop();
      if (r) { p.idx--; p.ms -= r.ms; }
    });
    renderPart(el, go, partId);
  });

  if (partId === 'lextale') {
    el.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () =>
      record({ w: item.w, real: item.real, said: b.dataset.say })));
  } else if (partId === 'meaning') {
    el.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.opt;
      if (v === 'idk') return record({ w: item.w, band: item.band, answer: item.answer, chosen: null, idk: true, correct: false });
      const chosen = item.options[+v];
      record({ w: item.w, band: item.band, answer: item.answer, chosen, idk: false, correct: chosen === item.answer });
    }));
  } else {
    const input = el.querySelector('#typed');
    input.focus();
    el.querySelectorAll('[data-key]').forEach(k => k.addEventListener('click', () => {
      const st = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? st;
      input.value = input.value.slice(0, st) + k.dataset.key + input.value.slice(en);
      input.focus();
      input.setSelectionRange(st + 1, st + 1);
    }));
    el.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      if (!input.value.trim()) { input.focus(); return; }
      const { correct, accentSlip } = checkTyped(input.value, item.accept);
      record({ en: item.en, accept: item.accept, band: item.band, typed: input.value.trim(), correct, accentSlip, idk: false });
    });
    el.querySelector('[data-action=idk]').addEventListener('click', () =>
      record({ en: item.en, accept: item.accept, band: item.band, typed: '', correct: false, accentSlip: false, idk: true }));
  }
}
