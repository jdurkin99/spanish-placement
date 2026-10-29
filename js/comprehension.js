// Reading and listening: one passage/clip per level, A1 → B2, all questions on one screen.
// A passage passes at ≥ passThreshold; the section stops early after one scored below stopBelow.
import { D } from './data.js';
import { getState, update, nextForm } from './store.js';
import { shuffle, esc, uid, cappedMs, todayISO, minutes } from './util.js';
import { testHeader, formPicker, onLeave, toast } from './ui.js';

const TITLES = { reading: 'Reading', listening: 'Listening' };

const passagesFor = (kind, form) => D[kind].forms[form];
const session = kind => getState().sessions[kind];

export function suggestedForm(kind) {
  return nextForm(kind, Object.keys(D[kind].forms));
}

export function startSession(kind, form) {
  update(s => {
    s.sessions[kind] = {
      id: uid(), form, startedAt: todayISO(), pIdx: 0, draft: {}, responses: [], plays: {}, mode: {}, ms: 0,
      // Shuffle every question's options once so a resume shows the same order.
      options: Object.fromEntries(passagesFor(kind, form).map(p => [p.id, p.questions.map(q => shuffle([q.answer, ...q.distractors]))]))
    };
  });
}

export function discardSession(kind) {
  update(s => { delete s.sessions[kind]; });
}

// ---------- scoring ----------

export function scoreComprehension(kind, sess) {
  const cfg = D.config.comprehension;
  const passages = passagesFor(kind, sess.form);
  let placement = 'Below A1', chainIntact = true;
  const levels = passages.map(p => {
    const rs = sess.responses.filter(r => r.pid === p.id);
    if (!rs.length) return { level: p.level, title: p.title, status: 'not reached' };
    const c = rs.filter(r => r.correct).length;
    const pass = c / rs.length >= cfg.passThreshold;
    if (pass && chainIntact) placement = p.level;
    if (!pass) chainIntact = false;
    const row = { level: p.level, title: p.title, correct: c, n: rs.length, status: pass ? 'pass' : 'fail' };
    if (kind === 'listening') { row.plays = sess.plays[p.id] || 0; row.mode = sess.mode[p.id] || 'none'; }
    return row;
  });
  const missed = sess.responses.filter(r => !r.correct).map(r => {
    const p = passages.find(x => x.id === r.pid);
    return { level: p.level, title: p.title, q: p.questions[r.qi].q, chose: r.idk ? 'No sé' : r.chosen, answer: p.questions[r.qi].answer };
  });
  const top = levels[levels.length - 1];
  return {
    placement,
    ceiling: top.status === 'pass' && placement === top.level,
    levels,
    missed,
    total: { n: sess.responses.length, correct: sess.responses.filter(r => r.correct).length },
    usedTTS: kind === 'listening' ? Object.values(sess.mode).includes('tts') : undefined,
    minutes: minutes(sess.ms)
  };
}

function finish(kind) {
  const sess = session(kind);
  update(st => {
    st.attempts.push({ id: sess.id, section: kind, form: sess.form, startedAt: sess.startedAt, finishedAt: todayISO(), result: scoreComprehension(kind, sess), responses: sess.responses });
    delete st.sessions[kind];
  });
}

// ---------- audio (listening) ----------

function pickVoice() {
  const t = D.listening.tts;
  const voices = window.speechSynthesis?.getVoices() || [];
  const norm = v => v.lang.replace('_', '-').toLowerCase();
  for (const lang of [t.lang, ...t.fallbackLangs].map(l => l.toLowerCase())) {
    const v = voices.find(x => norm(x) === lang) || voices.find(x => norm(x).startsWith(lang + '-'));
    if (v) return v;
  }
  return null;
}

function speak(text, level, onEnd) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang || D.listening.tts.lang;
  u.rate = D.listening.tts.rate[level] || 0.9;
  u.onend = u.onerror = onEnd;
  synth.speak(u);
  return true;
}

// Plays the clip's recording, or falls back to text-to-speech. Returns the mode used.
function playClip(clip, onEnd) {
  const a = clip.audio || {};
  const useFile = a.src && !a.placeholder;
  if (useFile) {
    const audio = new Audio(a.src);
    let fellBack = false;
    audio.onended = onEnd;
    audio.onerror = () => { fellBack = true; speak(clip.transcript, clip.level, onEnd); toast('Audio file missing; using the device voice.'); };
    audio.play().catch(() => { if (!fellBack) { fellBack = true; speak(clip.transcript, clip.level, onEnd); } });
    onLeave(() => audio.pause());
    return { mode: 'audio', stop: () => audio.pause() };
  }
  if (!speak(clip.transcript, clip.level, onEnd)) return { mode: 'none' };
  onLeave(() => window.speechSynthesis.cancel());
  return { mode: 'tts', stop: () => window.speechSynthesis.cancel() };
}

// ---------- views ----------

const INTRO = {
  reading: () => `<p>Up to 4 short texts, from easy (A1) to hard (B2), with 4 questions each. Read the text, then answer. You can scroll back up to reread.</p>
    <p>If a text is too hard, the section ends there, so you won't waste time on even harder ones.</p>
    <p class="muted small">About ${D.config.comprehension.targetMinutes.reading} minutes. Tap <strong>No sé</strong> rather than guessing.</p>`,
  listening: () => {
    const placeholder = Object.values(D.listening.forms).flat().some(c => c.audio?.placeholder);
    return `<p>Up to 4 short clips, from easy (A1) to hard (B2), with 3 questions each. Read the questions first, then tap Play. Each clip can be played <strong>${D.listening.maxPlays} times</strong>.</p>
    <p>Turn your volume up, or use headphones.</p>
    ${placeholder ? `<p class="muted small">Recordings haven't been added yet, so clips are read aloud by your phone's built-in Spanish voice. It sounds robotic, but it works for a first measure.</p>` : ''}
    <p class="muted small">About ${D.config.comprehension.targetMinutes.listening} minutes.</p>`;
  }
};

export function renderComprehension(kind, el, go) {
  const sess = session(kind);
  if (!sess) {
    const sug = suggestedForm(kind);
    el.innerHTML = `<section class="card"><h1>${TITLES[kind]}</h1>${INTRO[kind]()}
      ${formPicker('cform', Object.keys(D[kind].forms), sug, sug)}
      <button class="btn btn-primary" data-action="start">Start</button>
      <a class="btn btn-ghost" href="#/">Back</a></section>`;
    el.querySelector('[data-action=start]').addEventListener('click', () => {
      startSession(kind, el.querySelector('#cform').value);
      renderComprehension(kind, el, go);
    });
    return;
  }
  if (sess.done) { finish(kind); go('#/results'); return; }

  const passages = passagesFor(kind, sess.form);
  const p = passages[sess.pIdx];
  const opts = sess.options[p.id];
  const shownAt = Date.now();
  const maxPlays = D.listening?.maxPlays ?? 2;

  const qHTML = p.questions.map((q, qi) => `
    <fieldset class="mcq" data-q="${qi}">
      <legend>${qi + 1}. ${esc(q.q)}</legend>
      ${opts[qi].map((o, oi) => `<button type="button" class="btn btn-choice opt ${sess.draft[qi] === o ? 'sel' : ''}" data-oi="${oi}" aria-pressed="${sess.draft[qi] === o}">${esc(o)}</button>`).join('')}
      <button type="button" class="btn btn-choice idk opt ${sess.draft[qi] === 'idk' ? 'sel' : ''}" data-oi="idk" aria-pressed="${sess.draft[qi] === 'idk'}">No sé</button>
    </fieldset>`).join('');

  const plays = sess.plays[p.id] || 0;
  const stimulus = kind === 'reading'
    ? `<article class="passage" lang="es"><h2>${esc(p.title)}</h2>${p.text.split('\n').map(t => `<p>${esc(t)}</p>`).join('')}</article>`
    : `<div class="player card">
        <h2>${esc(p.title)}</h2>
        <button class="btn btn-primary" data-action="play" ${plays >= maxPlays ? 'disabled' : ''}>▶ Play <span class="muted-inv">(${maxPlays - plays} left)</span></button>
        <p class="small muted" id="pstatus">${plays ? `Played ${plays}×.` : 'Read the questions below first.'}</p>
      </div>`;

  el.innerHTML = `${testHeader({ title: TITLES[kind], idx: sess.pIdx, total: passages.length, meta: `Level ${esc(p.level)} · Form ${esc(sess.form)}` })}
    <section class="test-body">
      ${stimulus}
      ${qHTML}
      <button class="btn btn-primary" data-action="submit" disabled>Submit answers</button>
    </section>`;

  const submit = el.querySelector('[data-action=submit]');
  const refresh = () => { submit.disabled = p.questions.some((_, qi) => session(kind).draft[qi] === undefined); };
  refresh();

  el.querySelectorAll('.mcq').forEach(fs => fs.addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b) return;
    const qi = +fs.dataset.q;
    const val = b.dataset.oi === 'idk' ? 'idk' : opts[qi][+b.dataset.oi];
    update(st => { st.sessions[kind].draft[qi] = val; });
    fs.querySelectorAll('.opt').forEach(x => { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', x === b); });
    refresh();
  }));

  el.querySelector('[data-action=play]')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    const status = el.querySelector('#pstatus');
    btn.disabled = true;
    const n = (session(kind).plays[p.id] || 0) + 1;
    const done = () => {
      status.textContent = `Played ${n}×.`;
      btn.disabled = n >= maxPlays;
      btn.innerHTML = `▶ Play <span class="muted-inv">(${maxPlays - n} left)</span>`;
    };
    const res = playClip(p, done);
    if (res.mode === 'none') {
      btn.disabled = false;
      status.textContent = 'This browser can\'t play speech. Try Safari or Chrome, or add audio files (see data/listening.json).';
      return;
    }
    status.textContent = res.mode === 'tts' ? 'Playing (device voice)…' : 'Playing…';
    update(st => {
      const s = st.sessions[kind];
      s.plays[p.id] = n;
      s.mode[p.id] = res.mode;
    });
  });

  submit.addEventListener('click', () => {
    const ms = cappedMs(shownAt, 10 * 60000);
    let correct = 0;
    update(st => {
      const s = st.sessions[kind];
      p.questions.forEach((q, qi) => {
        const v = s.draft[qi];
        const ok = v === q.answer;
        if (ok) correct++;
        s.responses.push({ pid: p.id, level: p.level, qi, chosen: v === 'idk' ? null : v, idk: v === 'idk', correct: ok });
      });
      s.ms += ms;
      s.draft = {};
      const tooHard = correct / p.questions.length < D.config.comprehension.stopBelow;
      if (tooHard || s.pIdx >= passages.length - 1) s.done = true;
      else s.pIdx++;
    });
    renderComprehension(kind, el, go);
  });
}
