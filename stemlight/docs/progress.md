# Progress

Newest entry first. Each session reads this, then `PLAN.md`, then `features.json`. Strata's history is in `docs/archive/`.

## 11–12 Nov 2026 (night): biyon, real audio, both pieces, hand input, saving

Sir asked for autonomous work overnight (no money, no deploy, no submission). Built by sir's account with two subagents (pipeline, hand input), all verified and committed here.

**State**
- **Repo moved:** sir's clone is now `~/projects/stemlight-repo` on `banitsriram/stemlight`.
- **Audio engine (8, 9, most of 17):** `src/audio/engine.ts`.
  - One AudioContext, and every stem starts on one context time. `Transport` runs on the context clock.
  - Per stem: gain → trim → 3-band EQ → HRTF panner → master compressor. The panner follows the creature target's `center` in the registry.
  - `beat` and `piece:end` come from the engine. Decoded MB is logged per piece.
- **Cuts and user parts, audio side (23–25):** `src/audio/parts.ts`, with one-shots synthesised in code in `synth.ts`.
  - Loop wraps are sample-exact. Cuts snap to the beat and are at least 1 beat long.
  - A cut on a stem listed in `manifest.replace` starts a take: one-bar count-in (ticks plus `countin` 4,3,2,1), then the region loops.
  - Guide: the original part plays at −18 dB on pass 0 only.
  - Hits snap to 1/8 and replay on later passes. The take ends after a pass with no new hits.
- **Saving and pause (28, 29, audio side):**
  - IndexedDB `SaveState`, re-announced on `piece:ready`. Unreadable storage gives a clean start.
  - Lifecycle pauses on page hide, XR session hidden or session end. `app:reset` clears only this piece.
- **Pieces (5, 6, 7, 18, 62):** `pipeline/`, run in WSL.
  - Built with sfizz_render 1.2.3 and VSCO 2 CE (CC0), plus a synthetic seeded IR.
  - `beethoven5` covers bars 1–122 (83.6 s). `dvorak9` covers bars 1–95 (153.0 s).
  - Both have 8 mono Opus stems, 6.7 MB and 12.3 MB. Every fallback is listed in the commit and `ASSETS.md`.
- **Hand input (4, 10–13, most of 14):** `src/input/`.
  - Pure per-frame state machine with the PLAN s3 thresholds.
  - DevHandPose is dev-only. The IWER harness is in `tests/iwer/input/`.
- **Dev tools (30):** `src/dev/stats.ts` gives the `?stats` overlay and the `?fov` 70×66° mask.
- **Other:** piece order `beethoven5` → `dvorak9` (stand-in until 57). Devpost draft in `docs/DEVPOST.md` (67).
- **Cuts at the Wed 11 checkpoint, sir to confirm:**
  - Trepak cut (19–21); 22 is permanent, so the pads go on Dvořák's timpani.
  - Cut 1, glowing hands (50), and cut 2, keyboard (27, 49).

**Verified on 11–12 Nov**
- `npm run typecheck`, `npm run build` and `npm test` (50 tests) pass.
- `dist/` grep finds no DevHandPose, devInput, IWER_DEVICE or FoV-mask code.
- `tests/browser/audio-sync.mjs` (headless Chromium, real Web Audio):
  - fixture and beethoven5: decoded stem lengths agree (0.00 ms spread).
  - Transport time matches the context clock (0.00 ms).
  - 11 start batches (play + 10 seeks) share one start time and offset each.
  - Mute, solo and EQ reach the nodes. No page errors. → **F03 passes.**
  - The 3-minute run is covered in the unit test (fake clock), not in real time.
- `tests/browser/take-save.mjs` (real clock and IndexedDB):
  - Count-in fires 4,3,2,1. Strikes at 8.04, 8.55 and 9.21 s snap to offsets 0, 0.5 and 1.25.
  - The region loops, then the take ends and playback continues.
  - A reload restores the cut and the part without starting a new take. Cleared storage gives a clean start.
- `pipeline/validate.py`:
  - Note counts match the source: 1840 Beethoven, 4249 Dvořák.
  - All stems are equal length. Levels are sane (peaks ≤ −1.4 dBFS, none silent). The CC BY-SA credit is present.
  - A re-run gives byte-identical output.
- IWER headless (input agent's own server):
  - `fist-mute` 11/11: DevHandPose fist reads curl 0.998, partial curl 0.6 reads 0.605 → **F38 passes**.
  - Summon → held → locked; a fist on the locked creature returns it; 0.25 s gap holds; 0.5 s gap releases quietly.
  - `summon` 17/17. `pinch-solo` 7/7.
  - The 20× counts for F05, F06, F07, F32 and F33 are met in unit tests only; IWER ran 5–9×.

**Not verified**
- **Nobody has listened to the renders.** F01 and F02 stay false until sir and banit listen. Flagged:
  - Beethoven's dynamics map is hand-entered and may be a bar off.
  - 63 of Dvořák's high violin notes were moved down an octave in the audio only.
  - The Dvořák excerpt stops mid-phrase at bar 95.
- Notes against audio by eye in the app. Onsets measure within ±90 ms on slow string attacks.
- The audio gain change caused by a real IWER fist (events and gain were each checked separately).
- Anything on Quest: decoded memory (128 / 235 MB estimates), frame rate, hand feel.
- Start membership and Developer Access (F41, due Wed 11): only sir and banit can do this.

**Next**
1. Input agent is on 15 (EQ stretch), 16 (ribbon), 23 (trim gesture), 24 (pad strikes) and 29 (reset hold).
2. Banit: `extra` convention for playhead/lane targets (message in `.coord/biyon.md`); creature registry center should follow the summoned creature.
3. Sir: listen to both pieces (`?piece=beethoven5`, `?piece=dvorak9`), confirm the cuts, F41, and approve the first deploy (32).

## 10 Nov 2026: banit, app scaffold (tasks 2 and 3, taken over from biyon at banit's request)

**State**
- IWSDK 1.1.0-rc.2 app in `stemlight/`. `src/contracts.ts` is PLAN section 6 unchanged. `src/bus.ts`, `src/mock/` and `public/pieces/fixture/` are in, and `main.ts` wires up the landing page, shell and notes.
- The app runs on mocks until tasks 8, 10 and 28 replace them. The fixture's `id` is cast to `PieceId` on purpose so the contract stays unchanged.
- The starter's telemetry package (`@meta-quest/metavr`), reference model and agent config files were left out.
- `xr.offer` is `none`, because the landing page owns Enter.

**Verified on 10 Nov (IWER in the IWSDK managed browser, headless)**
- `npm run typecheck`, `npm run build` and `npm test` (5 tests: bus, transport, fixture) pass.
- A real click on Enter starts an `immersive-vr` session, removes the landing page and starts the transport. Fixture notes are visible in the session. 0 console errors. `render-stats` returns 12 calls and about 18k triangles, including the emulator's own controller models.

**Not verified**
- Enter by an actual pinch: the emulator's hands exist only inside a session, so task 35 stays open for a headset browser.
- Hand feel and frame rate on a headset.

## 9 Nov 2026: banit, note glyphs and landing page

**State**
- Task 34 done. `src/world/notes/NoteGlyphs.ts` draws all 9 contract glyphs from one 512 px MSDF atlas built from Bravura, in 4 materials (normal, glass, ghost, amber). Each frame: `begin()`, `push()` per note, `end()`.
- Task 35 is coded in `web/landing.ts` but stays open until it is wired into `main.ts` and entered in IWER.
- The repo has no scaffold yet (tasks 2 and 3), so tasks 36 onwards are blocked and both of these were tested in a throwaway Vite setup outside the repo.

**Verified on 9 Nov (headless Chrome, super-three 0.185)**
- `tests/iwer/visual/glyphs.html`: 1,500 instances per material gives 4 draw calls and 12,000 triangles. The cap holds at 1,505 pushes. All 36 glyph and material pairs checked by eye.
- `tests/iwer/visual/landing.html`: `unlock` and `enter` both run with user activation. A failed entry shows a message and Enter works again. A successful one removes the page. No sideways overflow at 360 px.

**Not verified**
- Enter by pinch in IWER (F18), which needs the scaffold.
- Glyph frame rate, stereo look and legibility at distance on a headset. F14 stays false until task 37 proves the notes against real data.

## 7 Nov 2026 (night): build-ready plan approved, coordination set up, no app code

**State**
- `PLAN.md` refined into a build-ready plan and approved by sir. It covers:
  - the exact gesture spec, the visual system and the music pipeline
  - `contracts.ts` (section 6)
  - the any-song roadmap, with a beta on 15 Feb 2027
- `TASKS.md` holds 70 tasks (each ≤0.5 day, with owner, blockers, acceptance and files). `features.json` now has F01–F41, all `passes: false`.
- Coordination: `banitsriram/git-coord`, app in `stemlight/`. See `COORDINATION.md`.
  - git-coord hooks are installed in `~/.claude/settings.json` (backed up first).
  - The skill is cloned to `~/.claude/skills/git-coord` and the working clone is at `~/projects/stemlight`, agent name `biyon`.
- Pushed to banit's repo:
  - `3db8441`, a 2-line Windows fix to `coord.py`: commit guard via `sys.executable`, edit-hook paths normalised to `/`.
  - `.coord/biyon.md`, with an @banit request to make the repo private.
- Team is sir and banit only.

**Verified on 7 Nov**
- Live rules and judging page re-read and still match the methodology. Vercel or GitHub Pages hosting is allowed.
- git-coord `test_coord.py`: failed on Windows before the fix (`python3` stub, then backslash paths). It passes after the fix, which also works in real use: init published and the edit hook allowed `.coord/biyon.md`.
- Sources:
  - Dvořák 9 mvt 4: full orchestra on **Mutopia #1793, CC BY-SA 3.0**, so we no longer write our own Dvořák.
  - Trepak: no licensed file anywhere, so we still write our own.
  - Bravura is OFL-1.1 and sfizz is BSD-2. Beethoven on Mutopia #941 is PD.
- IWER has a `fist` preset, per-finger curl and tracking-loss toggles. The IWSDK MCP has **no hand-pose tool**, so we use a dev-only `DevHandPose` component (task 4).

**Not verified**
- Anything on a headset. There is none, so frame rate and hand feel stay unverified.
- Sound quality of the renders, and `sfizz_render` in WSL.
- Decoded audio memory on Quest (estimate about 230 MB for the Dvořák excerpt).
- Start membership and Developer Access (F41, by Wed 11).

**Next**
1. Sun 8: task 1 (membership), tasks 2–5 (A), tasks 34–35 then 36 (B). Contracts and mock pushed by 13:00 so B is unblocked.
2. banit: make the repo private, `init banit`, claim B folders, read `stemlight/docs/PLAN.md`.
3. Wed 11 18:00 load checkpoint; Tue 10 18:00 Trepak gate.

## 7 Nov 2026 (later): council add-ons approved

- Council Session 9 (log: `~/projects/shared_reasoning.md`) reviewed 12 add-on ideas and ruled to keep the plan, plus **glowing hands** (F30) and a **colour-blind palette with shape cues** (F31), about 1 day. Sir approved.
- It was a fragile ruling (68.5 vs 67 for no change). Kill rule and stretch gate are in `PLAN.md` section 12.
- New rival found: **Maestro** (Quest, Oct 2024), hand-tracked conducting. Added to `PLAN.md` section 1. We never add conducting gestures.

## 7 Nov 2026: pivot to Stemlight, plan written, no code

**State**
- The team agreed to replace Strata with **Stemlight**: a hands-only VR music visualiser where you reach in and silence, reshape, cut and replace instruments while real notes float around you.
- Entertainment, New Experience, IWSDK. No headset: emulator (IWER) only.
- `PLAN.md` and `features.json` rewritten. Strata's files moved to `docs/archive/`.
- No app code yet.

**Verified on 7 Nov**
- VSCO 2 Community Edition is **CC0-1.0** (GitHub licence API). It has string sections, harp, full brass and woodwinds, timpani, orchestral percussion, glockenspiel, xylophone, marimba and upright piano. SFZ on the `sfz` branch.
- VCSL is CC0 and adds concert harp, vibraphone and tubular bells. **No celesta in either library.**
- Beethoven 5th mvt 1: full orchestra on Mutopia, **Public Domain**, MIDI + LilyPond.
- Dvořák 9 mvt 4 and the Trepak: no trustworthy free full-orchestra file found, so we write our own arrangements from the IMSLP PD scores.
- "Stemlight": no existing app or VR product found by web search on 7 Nov. The Quest store wasn't searched directly.
- IWER emulates hands in Chrome: hold the mouse to pinch, drag to move, scroll for depth. Pinches can be scripted.
- Prior art to differentiate from: Google's Inside Music (2017, stems around you as toggles), Hyperspace Music, Chromesthesia.

**Not verified**
- Anything on a real headset.
- How the rendered orchestra sounds.
- The Bravura MSDF pipeline, and IWSDK performance with ~1,500 instanced notes.

**Next**
1. Sun 8: scaffold IWSDK; render Beethoven stems; spike 9 synced stems + fist-to-silence in IWER.
2. Start the Dvořák and Trepak arrangements (Account C checks the sources).
3. Confirm the Representative's Start membership is still in order.
