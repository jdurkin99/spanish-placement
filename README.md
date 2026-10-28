# Spanish Placement

A phone-first, static placement test for an AI-tutored Spanish course. Take the sections, tap **Results packet → Copy**, and paste the packet into your tutor chat. Retest every ~3 weeks; the packet shows changes since last time.

- No backend, login, or paid APIs. Everything is stored in your browser (`localStorage`).
- Progress saves after every answer. Pause anytime and resume on the same question.
- **Backup / restore** (link at the bottom of the home screen) downloads all your data as JSON, and restores it on another phone or browser.

## Sections

| Section | Time | What it measures |
|---|---|---|
| Profile | 2 min | Prefilled background, editable, plus interests and goals |
| Vocabulary a: word recognition | ~3 min | 40 real + 20 fake words, yes/no. Score = real words accepted − 2 × fake words accepted (LexTALE-Esp scoring) |
| Vocabulary b: meaning check | ~5 min | 8 words per frequency band (1k, 2k, 3k, 5k, 10k) plus 8 Mexican/Central American words. 4 options plus “No sé”, scored with a correction for guessing. Gives an estimated vocabulary size and % known per band |
| Vocabulary c: production | ~3 min | 12 English → Spanish typed answers. Accents are optional but flagged |
| Grammar (adaptive) | ≤15 min | 33 structures, A1–B2, 101 items. Starts at A2 (set in Profile), then moves up or down level by level |

Vocabulary has Forms **A** and **B**, and retests alternate between them. Grammar retests prefer items you haven't seen before.

### How the grammar test adapts
1. One item per structure at the current level.
2. ≥75% correct: the level passes. <50%: the level fails. Anything in between: one extra item for each missed structure, and the level passes at ≥65% overall.
3. A pass moves up a level. A fail at the starting level moves down. The test stops at the first boundary it finds.
4. Placement = highest level passed. The packet also gives your score on the next level up and marks each structure as *solid / shaky / not yet / assumed / not tested*.

### About the word-recognition items
The published LexTALE-Esp item list (Izura, Cuetos & Brysbaert, 2014) couldn't be retrieved here, so this part uses an **equivalent set built for this app**. The real words span frequency ranks ~600 to ~50,000 in the [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) Spanish list (OpenSubtitles 2018). Every fake word was checked to be absent from that list's 1.2 million word forms. The scoring formula is LexTALE-Esp's, but the scores aren't comparable to published LexTALE-Esp norms. If you get the official items, put them in `data/vocab-lextale.json` (same format).

## Editing test content

All content is in `data/`. You never need to touch `js/`.

| File | Contents |
|---|---|
| `config.json` | Retest interval, band sizes, grammar thresholds, default start level |
| `profile-default.json` | Profile fields and their prefilled values |
| `vocab-lextale.json` | Yes/no words and pseudowords, per form |
| `vocab-meaning.json` | Meaning-check items: `w`, `band`, `answer`, 3 `distractors` |
| `vocab-production.json` | `en` prompt and `accept` list of Spanish answers |
| `grammar.json` | `structures` (each tagged with a CEFR level) and `items` (`q` with `___`, `answer`, 3 `distractors`, optional `en` and `why`) |

To add a grammar item, copy an existing one, give it a new unique `id`, and set its `structure`. To add a new structure, add it under `structures` with a `level` and `label`, then add 2 or more items for it. 3 or more lets retests rotate.

After editing, run the checker (needs Node.js):

```sh
node tools/validate.mjs
```

It catches duplicate IDs, a wrong number of distractors, an answer that's also a distractor, structures with too few items, and missing required Form A words.

> Note: if you edit a form's items while a test is in progress, that attempt keeps the items it started with. Finished results are stored with your answers, so old results stay readable.

## Run locally

The app loads its data with `fetch`, so open it through a local web server, not by double-clicking `index.html`:

```sh
cd spanish-placement
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy free on GitHub Pages (recommended)

GitHub Pages is free and serves over HTTPS. Your site URL stays the same across updates, which matters because your saved data is tied to that URL. Updating means pushing a change.

### Option A: from a computer, with git
1. Create a free account at <https://github.com>.
2. Create a new **public** repository called `spanish-placement`, with no README (free Pages needs a public repo; only the test content is public, your results stay on your phone).
3. In this folder:
   ```sh
   git remote add origin https://github.com/YOUR-USERNAME/spanish-placement.git
   git push -u origin main
   ```
4. On GitHub, open the repo, then **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then **Save**.
5. Wait 1–2 minutes. Your site is at `https://YOUR-USERNAME.github.io/spanish-placement/`.

### Option B: no git, using the browser
1. Create the repo as above. On its page, click **Add file → Upload files**.
2. Drag in the *contents* of this folder (`index.html`, `.nojekyll`, and the `css`, `js`, `data`, `tools` folders), then **Commit changes**.
3. Turn on Pages as in step 4 above.

### On your phone
- Open the URL in your phone's browser and add it to your home screen (iPhone Safari: Share → *Add to Home Screen*; Android Chrome: ⋮ → *Add to Home screen*).
- **Use the same browser every time.** Data stored in Safari isn't visible in Chrome, or in an in-app browser.
- Download a backup after each test. iOS Safari can delete site data for sites you haven't opened in a few weeks.

### Updating content later
Edit files in `data/`, run `node tools/validate.mjs`, then commit and push (or upload the changed file on GitHub). Pages redeploys in about a minute. Your saved results aren't affected.

Alternatives: Netlify, which has drag-and-drop deploys at <https://app.netlify.com/drop>, and Cloudflare Pages are also free and work well. GitHub Pages is the simplest choice because the content lives in a repo you can edit.

## Project layout

```
index.html          app shell
css/styles.css      mobile-first styles (light/dark)
js/app.js           router, home, profile, results, backup views
js/vocab.js         vocabulary parts and scoring
js/grammar.js       adaptive grammar engine and scoring
js/report.js        results packet text
js/store.js         localStorage state, import/export
data/*.json         all test content and settings
tools/validate.mjs  data checker
```
