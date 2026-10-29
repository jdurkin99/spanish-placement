// App shell: hash router, home, profile, results, data (backup) views.
import { D, loadData } from './data.js';
import { getState, update, exportJSON, importJSON, resetAll, attemptsFor, lastAttempt } from './store.js';
import { esc, fmtDate, downloadFile, copyText, ymd } from './util.js';
import { toast, runLeaveHooks } from './ui.js';
import * as vocab from './vocab.js';
import * as grammar from './grammar.js';
import { renderComprehension } from './comprehension.js';
import { renderWriting } from './writing.js';
import { renderSpeakingHome, renderSpeakingPart } from './speaking.js';
import { buildPacket, retestStatus } from './report.js';

const app = document.getElementById('app');

// Render right away. Waiting for the async hashchange would leave the old screen
// tappable for a moment after a section's session has already been cleared.
function go(hash) {
  if (location.hash !== hash) history.pushState(null, '', hash);
  route();
}

function ensureProfile() {
  if (getState().profile) return;
  update(s => { s.profile = Object.fromEntries(D.profile.fields.map(f => [f.key, f.value])); });
}

// ---------- home ----------

function sectionStatus(id) {
  const s = getState().sessions[id];
  const r = retestStatus(id);
  if (s) return `<span class="pill warn">In progress: resume</span>`;
  if (r.never) return `<span class="pill">Not taken</span>`;
  if (r.due) return `<span class="pill warn">Retest due (${r.days} days)</span>`;
  return `<span class="pill ok">Taken ${r.days === 0 ? 'today' : `${r.days}d ago`}</span>`;
}

function renderHome() {
  const p = getState().profile;
  const vLast = lastAttempt('vocab'), gLast = lastAttempt('grammar');
  app.innerHTML = `
    <section class="hero">
      <h1>Spanish Placement</h1>
      <p class="muted">Measure your level, then paste the results packet to your tutor. Retest every ${D.config.retestIntervalDays / 7} weeks or so to track progress.</p>
    </section>
    <nav class="sections">
      <a class="section-card" href="#/profile">
        <span class="sc-title">1 · Profile</span>
        <span class="sc-sub">${p?.interests ? 'Edit your details' : 'Add your interests'}</span>
      </a>
      <a class="section-card" href="#/vocab">
        <span class="sc-title">2 · Vocabulary <small>~10 min</small></span>
        <span class="sc-sub">${vLast?.result.meaning ? `Last: ~${vLast.result.meaning.sizeEstimate.toLocaleString()} words` : 'Recognition, meaning, production'}</span>
        ${sectionStatus('vocab')}
      </a>
      <a class="section-card" href="#/grammar">
        <span class="sc-title">3 · Grammar <small>~15 min, adaptive</small></span>
        <span class="sc-sub">${gLast ? `Last: ${esc(gLast.result.placement)}` : 'A1 → B2 structures'}</span>
        ${sectionStatus('grammar')}
      </a>
      ${[
        ['reading', '4 · Reading', `~${D.config.comprehension.targetMinutes.reading} min`, 'Short texts, A1 → B2', a => `Last: ${esc(a.result.placement)}`],
        ['listening', '5 · Listening', `~${D.config.comprehension.targetMinutes.listening} min`, 'Short clips, A1 → B2', a => `Last: ${esc(a.result.placement)}`],
        ['writing', '6 · Writing', `~${D.config.writing.targetMinutes} min`, '3 short texts for your tutor to grade', a => `Last: ${a.result.done} text(s) written`],
        ['speaking', '7 · Speaking', `~${D.config.speaking.targetMinutes} min`, 'Can-do checklist + speak aloud', a => `Last: self-assessed ${esc(a.result.selfLevel)}`]
      ].map(([id, title, time, sub, last]) => {
        const a = lastAttempt(id);
        return `<a class="section-card" href="#/${id}">
          <span class="sc-title">${title} <small>${time}</small></span>
          <span class="sc-sub">${a ? last(a) : sub}</span>
          ${sectionStatus(id)}
        </a>`;
      }).join('')}
      <a class="section-card accent" href="#/results">
        <span class="sc-title">Results packet →</span>
        <span class="sc-sub">Copy for your tutor · progress history</span>
      </a>
    </nav>
    <p class="center"><a class="btn-link" href="#/data">Backup / restore data</a></p>`;
}

// ---------- profile ----------

function renderProfile() {
  const p = getState().profile;
  const field = f => {
    const v = p[f.key] ?? '';
    const help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '';
    if (f.type === 'textarea') return `<label class="field"><span>${esc(f.label)}</span><textarea name="${f.key}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>${help}</label>`;
    if (f.type === 'select') {
      const opts = f.options.includes(v) ? f.options : [v, ...f.options];
      return `<label class="field"><span>${esc(f.label)}</span><select name="${f.key}">${opts.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>${help}</label>`;
    }
    return `<label class="field"><span>${esc(f.label)}</span><input name="${f.key}" type="text" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">${help}</label>`;
  };
  app.innerHTML = `<section class="card">
    <h1>Profile</h1>
    <p class="muted small">Saved automatically as you type. Included at the top of the results packet.</p>
    <form id="pf">${D.profile.fields.map(field).join('')}</form>
    <a class="btn btn-primary" href="#/">Done</a>
  </section>`;
  const form = app.querySelector('#pf');
  const saveField = e => {
    if (!e.target.name) return;
    update(s => { s.profile[e.target.name] = e.target.value; });
  };
  form.addEventListener('input', saveField);
  form.addEventListener('change', saveField);
}

// ---------- results ----------

function vocabSummary(a) {
  const r = a.result;
  const m = r.meaning, l = r.lextale, p = r.production;
  return `<section class="card">
    <h2>Vocabulary <small class="muted">Form ${esc(a.form)} · ${fmtDate(a.finishedAt)}</small></h2>
    <div class="stats">
      <div class="stat"><b>~${m.sizeEstimate.toLocaleString()}</b><span>est. words known (of ${m.sizeMax.toLocaleString()})</span></div>
      <div class="stat"><b>${l.score}/${l.words}</b><span>recognition score</span></div>
      <div class="stat"><b>${p.correct}/${p.n}</b><span>typed correctly</span></div>
      <div class="stat"><b>${m.regional.correct}/${m.regional.n}</b><span>Mexican/CA words</span></div>
    </div>
    <h3>Known per band</h3>
    <div class="bars">${m.bands.map(b => `<div class="bar-row"><span class="bar-label">${esc(b.label)}</span><span class="bar"><span style="width:${b.knownPct}%"></span></span><span class="bar-val">${b.knownPct}%</span></div>`).join('')}</div>
    <details><summary>Missed words (${m.missed.length + p.missed.length + l.missedWords.length})</summary>
      <ul class="misses">
        ${m.missed.map(x => `<li><b lang="es">${esc(x.w)}</b> = ${esc(x.answer)} <span class="muted">(you: ${esc(x.chose)})</span></li>`).join('')}
        ${p.missed.map(x => `<li>${esc(x.en)} = <b lang="es">${esc(x.expected)}</b> <span class="muted">(you: ${esc(x.typed || 'No sé')})</span></li>`).join('')}
      </ul>
      ${l.missedWords.length ? `<p class="small"><b>Real words not recognized:</b> <span lang="es">${esc(l.missedWords.join(', '))}</span></p>` : ''}
      ${l.acceptedPseudowords.length ? `<p class="small"><b>Fake words accepted:</b> ${esc(l.acceptedPseudowords.join(', '))}</p>` : ''}
    </details>
  </section>`;
}

function grammarSummary(a) {
  const r = a.result;
  const byStatus = s => r.structures.filter(x => x.status === s);
  const list = (title, rows) => rows.length ? `<p class="small"><b>${title}:</b> ${rows.map(x => `${esc(x.label)} <span class="muted">(${x.level})</span>`).join(', ')}</p>` : '';
  return `<section class="card">
    <h2>Grammar <small class="muted">${fmtDate(a.finishedAt)}</small></h2>
    <div class="stats">
      <div class="stat"><b>${esc(r.placement)}</b><span>placement${r.ceiling ? ' (test ceiling)' : ''}</span></div>
      ${r.inProgress ? `<div class="stat"><b>${r.inProgress.correct}/${r.inProgress.n}</b><span>at ${esc(r.inProgress.level)} (next level)</span></div>` : ''}
      <div class="stat"><b>${r.total.correct}/${r.total.n}</b><span>correct overall</span></div>
    </div>
    <p class="small">${r.levels.map(l => `<span class="pill ${l.status === 'pass' ? 'ok' : l.status === 'fail' ? 'warn' : ''}">${l.level}: ${l.status}${l.n ? ` ${l.correct}/${l.n}` : ''}</span>`).join(' ')}</p>
    ${list('Not yet', byStatus('not yet'))}
    ${list('Shaky', byStatus('shaky'))}
    <details><summary>Missed items (${r.missed.length})</summary>
      <ul class="misses">${r.missed.map(m => `<li><span lang="es">${esc(m.q.replace('___', `[${m.answer}]`))}</span><br><span class="muted">you: ${esc(m.chose)} · ${esc(m.why)}</span></li>`).join('')}</ul>
    </details>
  </section>`;
}

function comprehensionSummary(kind, a) {
  const r = a.result;
  const title = kind === 'reading' ? 'Reading' : 'Listening';
  return `<section class="card">
    <h2>${title} <small class="muted">Form ${esc(a.form)} · ${fmtDate(a.finishedAt)}</small></h2>
    <div class="stats">
      <div class="stat"><b>${esc(r.placement)}</b><span>level${r.ceiling ? ' (test ceiling)' : ''}</span></div>
      <div class="stat"><b>${r.total.correct}/${r.total.n}</b><span>questions correct</span></div>
    </div>
    <p class="small">${r.levels.map(l => `<span class="pill ${l.status === 'pass' ? 'ok' : l.status === 'fail' ? 'warn' : ''}">${l.level}: ${l.n ? `${l.correct}/${l.n}` : l.status}</span>`).join(' ')}</p>
    ${r.usedTTS ? '<p class="small muted">Played with the device voice (no recordings yet).</p>' : ''}
    ${r.missed.length ? `<details><summary>Missed questions (${r.missed.length})</summary><ul class="misses">${r.missed.map(m => `<li>[${m.level}] ${esc(m.q)}<br><span class="muted">you: ${esc(m.chose)} · correct: ${esc(m.answer)}</span></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

function writingSummary(a) {
  return `<section class="card">
    <h2>Writing <small class="muted">Form ${esc(a.form)} · ${fmtDate(a.finishedAt)}</small></h2>
    <p class="small muted">Not auto-scored: your tutor grades these from the packet.</p>
    ${a.result.tasks.map(t => `<details><summary>${t.level}: ${t.skipped ? 'skipped' : `${t.words} words`}</summary>
      <p class="small muted">${esc(t.prompt)}</p>${t.skipped ? '' : `<p lang="es" class="quote">${esc(t.text)}</p>`}</details>`).join('')}
  </section>`;
}

function speakingSummary(a) {
  const r = a.result;
  return `<section class="card">
    <h2>Speaking <small class="muted">Form ${esc(a.form)} · ${fmtDate(a.finishedAt)}</small></h2>
    <div class="stats">
      <div class="stat"><b>${esc(r.selfLevel)}</b><span>self-assessed level</span></div>
      <div class="stat"><b>${r.tasks.filter(t => t.method !== 'skipped').length}/${r.tasks.length}</b><span>prompts answered</span></div>
    </div>
    <div class="bars">${r.canDo.levels.map(l => `<div class="bar-row"><span class="bar-label">${l.level}</span><span class="bar"><span style="width:${l.avg}%"></span></span><span class="bar-val">${l.avg}%</span></div>`).join('')}</div>
    ${r.tasks.map(t => `<details><summary>${t.level}: ${t.method === 'skipped' ? 'skipped' : `${t.seconds}s`}</summary>
      <p class="small muted">${esc(t.prompt)}</p>${t.transcript ? `<p lang="es" class="quote">${esc(t.transcript)}</p>` : ''}</details>`).join('')}
  </section>`;
}

function historyTable() {
  const v = attemptsFor('vocab'), g = attemptsFor('grammar');
  const others = ['reading', 'listening', 'speaking'].flatMap(k => attemptsFor(k).map(a => ({ k, a })))
    .sort((x, y) => x.a.finishedAt.localeCompare(y.a.finishedAt));
  if (v.length + g.length + others.length < 2) return '';
  return `<section class="card"><h2>Progress</h2>
    ${v.length ? `<table class="hist"><thead><tr><th>Date</th><th>Form</th><th>Words</th><th>Recog.</th><th>Typed</th></tr></thead><tbody>
      ${v.map(a => `<tr><td>${ymd(a.finishedAt)}</td><td>${a.form}</td><td>${a.result.meaning.sizeEstimate}</td><td>${a.result.lextale.score}</td><td>${a.result.production.correct}/${a.result.production.n}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${g.length ? `<table class="hist"><thead><tr><th>Date</th><th>Grammar</th><th>Correct</th></tr></thead><tbody>
      ${g.map(a => `<tr><td>${ymd(a.finishedAt)}</td><td>${esc(a.result.placement)}${a.result.inProgress ? ` → ${a.result.inProgress.level} ${a.result.inProgress.correct}/${a.result.inProgress.n}` : ''}</td><td>${a.result.total.correct}/${a.result.total.n}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${others.length ? `<table class="hist"><thead><tr><th>Date</th><th>Section</th><th>Level</th></tr></thead><tbody>
      ${others.map(({ k, a }) => `<tr><td>${ymd(a.finishedAt)}</td><td>${k}</td><td>${esc(k === 'speaking' ? `${a.result.selfLevel} (self)` : `${a.result.placement} · ${a.result.total.correct}/${a.result.total.n}`)}</td></tr>`).join('')}
    </tbody></table>` : ''}
  </section>`;
}

const notTaken = (title, href) => `<section class="card"><h2>${title}</h2><p class="muted">Not taken yet. <a href="${href}">Start →</a></p></section>`;

function renderResults() {
  const v = lastAttempt('vocab'), g = lastAttempt('grammar');
  const rd = lastAttempt('reading'), li = lastAttempt('listening'), w = lastAttempt('writing'), sp = lastAttempt('speaking');
  const packet = buildPacket();
  app.innerHTML = `
    <section class="card">
      <h1>Results packet</h1>
      <p class="muted small">Copy this and paste it into your tutor chat. It includes your profile, latest results, missed items, and changes since last time.</p>
      <div class="choices two">
        <button class="btn btn-primary" data-action="copy">📋 Copy</button>
        <button class="btn btn-ghost" data-action="dl">⬇ Save .txt</button>
      </div>
      <details><summary>Preview packet</summary><pre class="packet">${esc(packet)}</pre></details>
    </section>
    ${v ? vocabSummary(v) : '<section class="card"><h2>Vocabulary</h2><p class="muted">Not taken yet. <a href="#/vocab">Start →</a></p></section>'}
    ${g ? grammarSummary(g) : notTaken('Grammar', '#/grammar')}
    ${rd ? comprehensionSummary('reading', rd) : notTaken('Reading', '#/reading')}
    ${li ? comprehensionSummary('listening', li) : notTaken('Listening', '#/listening')}
    ${w ? writingSummary(w) : notTaken('Writing', '#/writing')}
    ${sp ? speakingSummary(sp) : notTaken('Speaking', '#/speaking')}
    ${historyTable()}
    <a class="btn btn-ghost" href="#/">Home</a>`;
  app.querySelector('[data-action=copy]').addEventListener('click', async () => {
    toast((await copyText(packet)) ? 'Copied! Paste it into your tutor chat.' : 'Copy blocked. Use Download or select the preview text.');
  });
  app.querySelector('[data-action=dl]').addEventListener('click', () =>
    downloadFile(`spanish-results-${ymd(new Date().toISOString())}.txt`, packet, 'text/plain'));
}

// ---------- data / backup ----------

function renderData() {
  const st = getState();
  app.innerHTML = `<section class="card">
    <h1>Backup &amp; restore</h1>
    <p class="muted small">Everything is stored only in this browser. Clearing site data, or switching browser/phone, loses it, so download a backup after each test.</p>
    <p class="small">${st.attempts.length} finished attempt(s) · ${Object.keys(st.sessions).length} in progress</p>
    <button class="btn btn-primary" data-action="export">⬇ Download backup (.json)</button>
    <label class="btn btn-ghost file-btn">⬆ Restore from backup…<input type="file" accept="application/json,.json" hidden></label>
    <hr>
    <button class="btn btn-ghost danger" data-action="reset">Erase all data on this device</button>
  </section>
  <a class="btn btn-ghost" href="#/">Home</a>`;
  app.querySelector('[data-action=export]').addEventListener('click', () =>
    downloadFile(`spanish-placement-backup-${ymd(new Date().toISOString())}.json`, exportJSON()));
  app.querySelector('input[type=file]').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!confirm('Replace ALL data on this device with this backup?')) return;
      importJSON(text);
      ensureProfile();
      toast('Backup restored.');
      renderData();
    } catch (err) {
      alert(`Could not restore: ${err.message}`);
    }
  });
  app.querySelector('[data-action=reset]').addEventListener('click', () => {
    if (confirm('Erase your profile, all results and in-progress tests on this device? This cannot be undone.') && confirm('Really erase everything?')) {
      resetAll(); ensureProfile(); toast('All data erased.'); go('#/');
    }
  });
}

// ---------- router ----------

function route() {
  const [, section, sub] = (location.hash || '#/').split('/');
  runLeaveHooks();
  window.scrollTo(0, 0);
  document.body.dataset.view = section || 'home';
  switch (section) {
    case 'profile': return renderProfile();
    case 'vocab': return sub ? vocab.renderPart(app, go, sub) : vocab.renderVocabHome(app, go);
    case 'grammar': return grammar.renderGrammar(app, go);
    case 'reading': return renderComprehension('reading', app, go);
    case 'listening': return renderComprehension('listening', app, go);
    case 'writing': return renderWriting(app, go);
    case 'speaking': return sub ? renderSpeakingPart(app, go, sub) : renderSpeakingHome(app, go);
    case 'results': return renderResults();
    case 'data': return renderData();
    default: return renderHome();
  }
}

(async function init() {
  try {
    await loadData();
  } catch (e) {
    app.innerHTML = `<section class="card"><h1>Couldn't load test data</h1><p>${esc(e.message)}</p>
      <p class="muted small">If you opened index.html directly from a file, serve the folder instead (see README), or use the hosted URL.</p></section>`;
    return;
  }
  ensureProfile();
  window.addEventListener('hashchange', route);
  route();
})();
