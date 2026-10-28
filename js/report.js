// Builds the plain-text results packet that gets pasted back to the tutor.
import { D } from './data.js';
import { getState, attemptsFor } from './store.js';
import { ymd, daysSince } from './util.js';

const sign = n => (n > 0 ? `+${n}` : `${n}`);

function profileBlock(profile) {
  const lines = D.profile.fields
    .filter(f => f.key !== 'grammarStart')
    .map(f => [f.label.replace(/\s*\(.*\)$/, ''), (profile?.[f.key] ?? '').toString().trim()])
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v.replace(/\n+/g, '; ')}`);
  return ['## PROFILE', ...(lines.length ? lines : ['- (not filled in)'])].join('\n');
}

export function vocabLines(a, prev) {
  const r = a.result;
  const out = [`## VOCABULARY: Form ${a.form}, finished ${ymd(a.finishedAt)}`];
  if (r.meaning) {
    const m = r.meaning;
    const d = prev?.result.meaning ? ` (${sign(m.sizeEstimate - prev.result.meaning.sizeEstimate)} vs ${ymd(prev.finishedAt)})` : '';
    out.push(`- Estimated receptive vocabulary: ~${m.sizeEstimate.toLocaleString('en-US')} of the ${m.sizeMax.toLocaleString('en-US')} most frequent word forms${d}`);
    out.push(`- % known per frequency band (guess-corrected; right/wrong/No sé):`);
    m.bands.forEach(b => {
      const pb = prev?.result.meaning?.bands.find(x => x.id === b.id);
      out.push(`  - ${b.label}: ${b.knownPct}% (${b.correct}/${b.wrong}/${b.idk} of ${b.n})${pb ? ` [prev ${pb.knownPct}%]` : ''}`);
    });
    out.push(`- ${m.regional.label} everyday words: ${m.regional.correct}/${m.regional.n}`);
  }
  if (r.lextale) {
    const l = r.lextale;
    const pl = prev?.result.lextale;
    out.push(`- Word recognition (LexTALE-style yes/no): score ${l.score}/${l.words} (${l.scorePct}%) = ${l.hits}/${l.words} real words accepted − 2 × ${l.falseAlarms}/${l.pseudowords} fake words accepted${pl ? ` [prev ${pl.score}]` : ''}`);
  }
  if (r.production) {
    const p = r.production;
    const pp = prev?.result.production;
    out.push(`- Production (English → Spanish, typed): ${p.correct}/${p.n}${pp ? ` [prev ${pp.correct}/${pp.n}]` : ''}`);
    if (p.accentSlips.length) out.push(`  - Accent slips (counted correct): ${p.accentSlips.map(s => `${s.typed} → ${s.expected}`).join(', ')}`);
  }
  out.push('', '### Missed words');
  if (r.meaning?.missed.length) {
    out.push('- Meaning check (word: my answer → correct):');
    const order = [...D.config.vocab.bands.map(b => b.id), D.config.vocab.regionalBand.id];
    [...r.meaning.missed].sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band)).forEach(x => out.push(`  - [${x.band}] ${x.w}: ${x.chose} → ${x.answer}`));
  }
  if (r.production?.missed.length) {
    out.push('- Production (prompt: I typed → expected):');
    r.production.missed.forEach(x => out.push(`  - ${x.en}: ${x.typed || '(No sé)'} → ${x.expected}`));
  }
  if (r.lextale) {
    if (r.lextale.missedWords.length) out.push(`- Real words I didn't recognize: ${r.lextale.missedWords.join(', ')}`);
    if (r.lextale.acceptedPseudowords.length) out.push(`- Fake words I accepted as real: ${r.lextale.acceptedPseudowords.join(', ')}`);
  }
  return out.join('\n');
}

export function grammarLines(a, prev) {
  const r = a.result;
  const out = [`## GRAMMAR (adaptive), finished ${ymd(a.finishedAt)}`];
  const ip = r.inProgress ? `; working on ${r.inProgress.level} (${r.inProgress.correct}/${r.inProgress.n} correct there)` : '';
  out.push(`- Placement: ${r.placement}${r.ceiling ? ' (top of test, may be higher)' : ''}${ip}${prev ? ` [prev ${prev.result.placement}]` : ''}`);
  out.push(`- Started at ${r.startLevel}; ${r.total.correct}/${r.total.n} correct; ~${r.minutes} min`);
  out.push(`- By level: ${r.levels.map(l => l.n ? `${l.level} ${l.status} ${l.correct}/${l.n}` : `${l.level} ${l.status}`).join(' · ')}`);
  out.push('', '### By structure (correct/asked; assumed = below the tested range)');
  const prevS = prev ? Object.fromEntries(prev.result.structures.map(s => [s.key, s])) : {};
  for (const lvl of D.config.grammar.levels) {
    const rows = r.structures.filter(s => s.level === lvl);
    if (rows.every(s => !s.n)) { out.push(`- ${lvl}: all ${rows[0]?.status ?? 'not tested'}`); continue; }
    out.push(`- ${lvl}:`);
    rows.forEach(s => {
      const p = prevS[s.key];
      const change = p && p.status !== s.status ? ` (was ${p.status})` : '';
      out.push(`  - ${s.label}: ${s.status}${s.n ? ` ${s.correct}/${s.n}` : ''}${change}`);
    });
  }
  if (r.missed.length) {
    out.push('', '### Missed grammar items (my answer → correct)');
    r.missed.forEach(m => out.push(`- [${m.level} · ${m.structure}] ${m.q} | me: ${m.chose} → correct: ${m.answer}`));
  }
  return out.join('\n');
}

function historyBlock() {
  const out = ['## HISTORY (all finished attempts)'];
  const v = attemptsFor('vocab');
  const g = attemptsFor('grammar');
  if (!v.length && !g.length) return '';
  v.forEach(a => {
    const r = a.result;
    out.push(`- ${ymd(a.finishedAt)} Vocab Form ${a.form}: size ~${r.meaning?.sizeEstimate ?? '?'}; recognition ${r.lextale?.score ?? '?'}/${r.lextale?.words ?? '?'}; production ${r.production?.correct ?? '?'}/${r.production?.n ?? '?'}; MX/CA ${r.meaning?.regional.correct ?? '?'}/${r.meaning?.regional.n ?? '?'}`);
  });
  g.forEach(a => out.push(`- ${ymd(a.finishedAt)} Grammar: ${a.result.placement}${a.result.inProgress ? ` (+ ${a.result.inProgress.level} ${a.result.inProgress.correct}/${a.result.inProgress.n})` : ''}; ${a.result.total.correct}/${a.result.total.n}`));
  return out.join('\n');
}

const NOTES = `## HOW TO READ THIS (for the tutor)
- Vocabulary size = sum over bands of (guess-corrected % known × band size). Bands use subtitle-frequency ranks of word forms (hermitdave/FrequencyWords, OpenSubtitles 2018). 8 items per band, so treat it as ±25% and look at the band profile more than the total.
- Word recognition uses LexTALE-Esp scoring (words accepted − 2 × pseudowords accepted) on this app's own items, NOT the published LexTALE-Esp list, so don't compare to published norms.
- Grammar is multiple choice with a "No sé" option. A level passes at ≥75% on the first pass, or ≥65% after a second item for each missed structure. "Assumed" structures were below the starting level and not tested.
- Retests alternate vocabulary forms (A/B) and rotate grammar items toward unseen ones.`;

export function buildPacket() {
  const st = getState();
  const v = attemptsFor('vocab');
  const g = attemptsFor('grammar');
  const parts = [
    '# SPANISH PLACEMENT RESULTS PACKET',
    `Generated ${ymd(new Date().toISOString())} · app v${D.config.appVersion} · vocab attempts: ${v.length} · grammar attempts: ${g.length}`,
    '',
    profileBlock(st.profile),
    '',
    v.length ? vocabLines(v[v.length - 1], v[v.length - 2]) : '## VOCABULARY\n- Not taken yet.',
    '',
    g.length ? grammarLines(g[g.length - 1], g[g.length - 2]) : '## GRAMMAR\n- Not taken yet.'
  ];
  const inProg = Object.keys(st.sessions);
  if (inProg.length) parts.push('', `Note: unfinished attempt(s) in progress (not included): ${inProg.join(', ')}.`);
  const h = historyBlock();
  if (h && v.length + g.length > 2) parts.push('', h);
  parts.push('', NOTES);
  return parts.join('\n');
}

export function retestStatus(section) {
  const list = attemptsFor(section);
  const last = list[list.length - 1];
  if (!last) return { due: false, never: true };
  const days = daysSince(last.finishedAt);
  return { due: days >= D.config.retestIntervalDays, days, never: false };
}
