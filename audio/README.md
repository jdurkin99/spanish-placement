# Listening audio (PLACEHOLDER — no recordings yet)

Every clip in `data/listening.json` currently has a placeholder `audio.src`, so the app reads each
transcript aloud with the phone's built-in Spanish voice instead.

To use a real recording for a clip:

1. Record (or get) audio of a speaker, ideally Mexican or Central American, reading/performing the clip's `transcript`.
2. Save it here using the clip id, e.g. `audio/lA-a1.mp3` (.mp3 or .m4a work on all phones).
3. In `data/listening.json`, set that clip's audio to:
   `"audio": { "src": "audio/lA-a1.mp3", "placeholder": false }`
4. Run `node tools/validate.mjs`; the placeholder warning should list one fewer clip.

Expected files: lA-a1, lA-a2, lA-b1, lA-b2 (Form A) and lB-a1, lB-a2, lB-b1, lB-b2 (Form B).
If a file is missing or fails to load, the app falls back to the device voice automatically.
