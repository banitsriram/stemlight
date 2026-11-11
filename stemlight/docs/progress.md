# Progress

Newest entry first. Each session reads this, then `PLAN.md`, then `features.json`. Strata's history is in `docs/archive/`.

## 11 Nov 2026 (16:00 IST): banit, video captures, shot ledger, rough cut, stills, voiceover draft (tasks 59; 60, 68 partly)

- **Captures (59):** `node video/capture.mjs [shot]` runs the real dev build in the IWER emulator on the Mac's GPU (about 55 fps at 1080p, headless).
  - Head turns go through IWER's remote control, and hands use `look_at`, `set_hand_pose` and `set_select_value`. So every summon, mute, lock and solo on screen comes from the app's own gesture engine, not from bus events.
  - It records the WebGL canvas (no emulator panels) plus everything sent to the speakers, then writes a 1080p60 H.264/AAC mp4 with an "Emulator footage · not a headset" label.
  - Clips go to `video/captures/`, which is gitignored.
- **Shot ledger:** `video/shots.json` lists every shot with its commit (0a9ee76, clean tree), length, and the gesture events that fired during it. There are 7 shots:
  - opening
  - fist to glass (summon → held → on → held → locked)
  - solo on and off
  - Beethoven field pan
  - Dvořák densest passage
  - end card (Dvořák ends on its own)
  - second visit ("Your mix is back", locked violins)
- **Gaze:** the pans keep the gaze above the creatures (summon needs 12° for 0.5 s), and the head starts tilted up before Enter, so no creature flies in unasked.
- **Rough cut (60, first pass):** `node video/assemble.mjs` builds a 67.5 s cut with 0.5 s crossfades and browser-rendered title and closing cards. The closing card carries the CC BY-SA 3.0 credit. The output is `video/captures/rough-cut.mp4`, and a contact sheet was checked at every cut.
- **Stills:** 7 stills in `video/stills/`, taken from the clips with the same treatment and the emulator label.
- **Voiceover (68, draft):** `video/VOICEOVER.md` is about 150 words timed to the rough cut, with no brand names and the pitch line word for word. Banit still needs to record the lines.
- **Not done:**
  - No cut-and-pads shots yet; they wait for the remake surfaces (45 to 47).
  - The narration mix, `.srt` and thumbnail are task 61.
  - The hook style and final length are banit's call.

## 11 Nov 2026 (15:00 IST): banit, pinch tick, F18 landing, F27 field of view (tasks 53, 35, 63)

- **Pinch tick (53, 1532371):** `hand:pinch` (biyon added it to contracts.ts) plays a short soft tick when a pinch closes. It sounds from the grabbed creature, otherwise just ahead of the seat. Unit test added; the F24 sound checklist now has no gaps.
- **Ghost hands for "Pinch both, pull":** the demo spread went from 52 cm to 36 cm because the old one reached 42° to each side, outside the field of view. The real gesture works at any width.

**F18 and F27 check:** `node tests/iwer/visual/fov.mjs` uses a fresh Chromium profile on the IWER dev server, with the dev 70×66° mask on (`?fov`). It printed all PASS with 0 console errors. Screenshots and the angle table are in `docs/tests/fov/`.
- **F18:** the landing page has exactly one button, "Enter", plus the pitch line, "No account" and the hand-tracking hint. One click starts the XR session and audio, and the landing page goes away. In the headset a pinch on the 2D page is a click, so the emulator gets that same click. **F18 passes.**
- **F27:** the opening was stepped through Look, fist, open, hold, pinch twice, pinch both and pull, tap, then the end card. At each step everything shown (the tutorial caption, ghost hands, end card) and every interaction target near you (the summoned creature) was measured against the head's forward view. All of it sits within ±35° by ±33°, and the summoned creature is 0.47 m away, inside 2 ft. Worst cases: ghost hands for "Pinch both, pull" reach ±31.8°, and the end card spans 8.9° below to 16.7° above eye level from a seated 1.2 m eye. **F27 passes** for the B surfaces.
- **Limits:**
  - IWER keeps its camera at 1.6 m when a page script moves the head. Things placed relative to the head (captions, ghost hands, the reach spot) keep the same angles at any eye height. World-fixed things (the end card, anything past 1.3 m) are measured from a 1.2 m seated eye in the script.
  - The remake surfaces (45–47) aren't in yet. The script measures every non-creature registry target, so rerun it once they land.
  - This is emulator only; real comfort is unverified.

## 11 Nov 2026 (14:00 IST): banit, pause/resume, return state, trails, F14 check, F16 shots, credits, sound checklist (tasks 38, 40, 58; 53 partly)

Commits 7ee5092, 89bd829, and the credits/click commit after them.

- **Pause/resume (58):** leaving VR (taking the headset off, the system menu, or ending the session) brings back the landing page as **Paused / Resume**. Resume re-enters where the music stopped.
- **Returning users:** the current tutorial step is kept on the device (localStorage), so a reload continues the tutorial instead of repeating it, and a finished tutorial never shows again. A saved mix shows "Your mix is back" for 5 s once the music plays. Locked creatures come back dimmed with glass notes.
- **Trails and pops (38):** notes of 1 s or longer leave three outline copies behind while they sound; notes under 0.25 s pop at birth.
- **Envelope pulse (40):** creatures scale 0.9–1.25 and glow 0.35–1.25 with their stem's envelope.
- **Credits (53):** the end card now credits the generated reverb impulse response too. A unit test checks it against both real manifests for every shipped ASSETS item: both scores and their Mutopia pieces, CC BY-SA 3.0 with the licence link, VSCO 2 CE (CC0), Bravura (OFL) and the IR.
- EQ reset now clicks. Also fixed: the first sweep or scrub tick in the 450 ms after page load was swallowed.

**Action / sound checklist (F24)**

| Action | Sound | Where it comes from |
|---|---|---|
| Summon | whoosh | the creature |
| Fist (silence held) | glassy chime | the creature |
| Lock (1.5 s) | clink | the creature |
| Return | warm bloom | the creature |
| Double-pinch solo / clear | rising / falling two-note chime | the creature / front |
| EQ stretch | filter sweep, once per stretch | the creature |
| EQ reset | click | the creature |
| Ribbon pause | tape-stop | front |
| Scrub | ticks, only while paused | front |
| Trim / undo trim | glass snip / reverse snip | cut stem's creature / front |
| Count-in | 4 soft ticks (A, `synth.ts`) | — |
| Pad strike | the hit (A, `synth.ts`) | fingertip |
| Quiet reset | reset chime | front |
| Pinch | soft tick on close (`hand:pinch`, 1532371) | grabbed creature, else front |

All synthesised at runtime, so there are no sound files; the one `ASSETS.md` row now lists the click too.

**Verified**
- `npm test` 82/82.
- `notes-real.html`: **20/20** random glyphs from the real beethoven5 data match `notes.json` (glyph, stem colour, exact `placeNote` position, height from pitch).
- F16 loud/quiet pair: `tests/iwer/visual/results/0-loud-37s.jpg` and `0-quiet-22s.jpg`.
- IWER (dev server) check on a fresh profile, 0 errors:
  - Enter starts XR, music and tutorial.
  - `session.end()` → Paused / Resume with transport paused at 2.9 s; Resume → playing from 3.x s.
  - Reload with a locked violin → violins dim and "Your mix is back" visible.
- In IWER the default head pose looks straight at a creature, so it auto-summons within a second of entering.

**F21 full timed run** (fresh Chromium profile, IWER dev server, Enter clicked, no skipping, 270 s wall time): 0 console errors.

| Time after Enter | Event |
|---|---|
| 4.1 s | music starts; tutorial "Look" |
| 87.8 s | `piece:end` beethoven5 |
| 89.1 s | dvorak9 ready and playing |
| 242.3 s | `piece:end` dvorak9 → end card |
| 257.6 s | free play: beethoven5 ready and playing again |

- Every tutorial step showed in order (the idle skip moved each on after 40 s, since no hands were scripted).
- **Bug found and fixed in this run:** IWER's head summoned the coral a moment *before* the tutorial started, so "Look" could never complete until the idle skip. The tutorial now counts steps done before the music starts (unit test added).
- Still to do for F19: the timed "first payoff ≤15 s" needs a scripted head turn on a fresh run; in this run the first summon came at 4.1 s, but from IWER's default head pose, not a deliberate look.

## 11 Nov 2026 (12:30 IST): banit, sound effects, tutorial, ghost hands, sequencer, end card (tasks 52, 54, 56; 55, 57 code done)

Commits cdf82d1 (sound effects) and 15fd59d (story).

- `src/ui/sfx/`: synthesised effects through `sfxOut`, each played from the creature it acts on:
  - whoosh on summon; glassy chime, clink and bloom for hold, lock and return;
  - rising and falling solo chimes; EQ sweep (one per stretch);
  - tape-stop on pause; scrub ticks only while paused, so loop wraps stay quiet;
  - snip and un-snip on cuts; a chime on reset.
  - Silent until audio is unlocked. `ASSETS.md` row added.
- `src/story/tutorial.ts`:
  - Steps: Look → Make a fist → Open → Hold → Pinch twice → Pinch both, pull → Tap. **12 words.**
  - Each step completes only on its own event. A 10 s idle pulses the ghost hands. After 3 nudges the step moves on, so nobody is stuck if cut or pads can't be reached.
  - Saves `tutorialDone`, and a returning user skips straight to free play.
  - **Ribbon and EQ steps are dropped** (audit MVP). F20 as written lists them, so sir decides whether F20 is re-scoped.
- `src/story/ghost.ts`: both ghost hands are one instanced draw call, looping each step's gesture at the reach spot under its caption. "Look" floats over the first creature.
- `src/story/sequencer.ts` replaces `initSequence` in `main.ts` (`src/audio/sequence.ts` is now unused by the app; its `PIECE_ORDER` is still imported). The order is Beethoven, Dvořák, then an **end card**:
  - "Thank you for listening" and "Your mix is saved for next time. Any song, coming soon."
  - Every manifest credit with its link (the full CC BY-SA 3.0 notice and licence URL), plus the Bravura OFL credit.
  - After 14 s, free play loops from the top.

**Verified**
- `npm test` 78/78 (5 sound-effect tests, 5 story tests incl. word count, nudge/skip, returning-user skip, sequence + end card + loop). `tsc` clean.
- Headless Chromium, real loader, transport seeked near each end:
  - Beethoven `piece:end` → Dvořák ready 0.6 s later.
  - Dvořák `piece:end` → end card → Beethoven ready 14.3 s later and playing. 0 console errors.
- Screenshots walking the tutorial: `tests/iwer/visual/results/1-field-look.jpg` … `8-end-card.jpg` (`node tests/iwer/visual/run.mjs world --shot`).

**Not verified**
- F19 (first payoff ≤15 s on a fresh run) and F21 (full timed 4-minute run) need a timed IWER run, so 55 and 57 stay open.
- No headset, so caption size and ghost-hand readability at arm's length are unjudged.

## 11 Nov 2026 (11:00 IST): banit, creatures, glide, mute/solo visuals, sky (tasks 39, 41, 44; 40 partly)

Commit 4231fe4. Biyon is taking the remake surfaces (45, 46 outline-only, 47, reset shell) in `src/ui/remake/`.

- `src/world/creatures.ts`: nine silhouettes from PLAN s8 (bell jellies, manta, bead chain, nautilus, ammonite, coral fan, anemone, comb jelly). Each is 2 draw calls and 160–1,080 triangles. Bodies pulse from `envelopes.json`, and the manta's wings beat.
- `gaze:summon` glides the creature to the reach spot in 0.6 s (eased) and the previous one drifts home. **The registry `center` follows every frame**, so the HRTF panner and the fist sphere move with it (biyon-8).
- Mute (held or locked) dims to 20 %, and a lock ring fills with `lockProgress`. That stem's notes **freeze to glass** at the moment of silence, and new ones are born still at its mouth. Solo dims the other creatures to 25 % and their notes to 25 %.
- Notes are born at the creature's live position, so they follow it to the reach spot.
- `src/world/sky.ts`: nebula sphere, ocean plane and 900 plankton points, 3 draw calls. The plankton keep drifting on wall-clock time while the music is paused.
- Landing copy: "about 5 minutes" (the music is about 4).

**Verified (headless Chromium, `node tests/iwer/visual/run.mjs world glyphs --shot`)**
- `world.html` 17/17 checks: glide reaches the reach spot and the previous creature returns home; registry centre follows; 20 % mute and 25 % solo brightness; lock ring at half for `lockProgress` 0.5; glass notes hold still across frames and thaw on `on`; budget per creature; plus the old notes checks.
- Found and fixed while testing: a frame landing after the glide window left the creature part-way. The glide now always finishes.
- Screenshots in `tests/iwer/visual/results/`: field, summon (F32 visual), held with glass notes and ring (F04, F33 visual), locked, solo (F16 solo half). 0 console errors.

**Not verified**
- F16 loud/quiet pair (task 40 stays open). F17's under-100 total is task 31. No headset, so scale and brightness at 0.45 m are unjudged. Thaw (42) waits for the 18:00 cut call.

## 11 Nov 2026 (10:15 IST): biyon, first deploy (task 32, sir approved in chat)

- **Live: https://stemlight.vercel.app** (Vercel free plan, sir's account, project `stemlight`).
- How: `npm run build` in `stemlight/`, copy `dist/` to `~/projects/stemlight-deploy/stemlight/` (outside the repo, `pieces/fixture` removed), then `npx vercel deploy --prod --yes` from there. It's a prebuilt static upload: no Git connection, so nothing auto-deploys.
- `index.html` now carries a visible credit line: Dvořák (Mutopia #1793, CC BY-SA 3.0, our stems and notes under the same licence), Beethoven (Mutopia #941, PD), VSCO 2 CE (CC0), Bravura (OFL). B's in-VR credits (task 53) still needed.

**Verified on 11 Nov (fresh Chromium profile, headless)**
- index, stems and manifests return 200. Every request goes to `stemlight.vercel.app` (self-hosted). 0 page errors.
- beethoven5 decodes (8 stems, 128.4 MB).
- Enter visible after 2.3, 3.4 and 4.1 s on three fresh visits. The very first visit took 25.6 s, most likely Vercel's CDN filling its cache. To recheck on the RC.

**Not verified**
- Quest Browser: not opened on a headset (none). XR entry was not exercised on the live link.

## 11 Nov 2026 (09:45 IST): biyon, F41 started

- Sir (Representative) has a Meta developer account: two-factor verification done, Developer NDA accepted, team **"Stemlight"** created in the VR Developer Dashboard.
- **Start application submitted** (country India, tool WebXR, Stemlight summary). Meta's page said "Application Successfully Submitted"; approval is pending by email.
- **Still needed for F41:** banit's own Meta account with Developer Access (2FA verification at developers.meta.com; banit can join the "Stemlight" team or make his own). If Start approval hasn't come by about Thu 12, file a support case.

## 11 Nov 2026 (00:00–04:00 IST): biyon, real audio, both pieces, all A gestures, saving

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
- **Scope:**
  - Trepak cut (19–21) because its Tue 10 gate never ran; 22 is permanent (pads on Dvořák's timpani).
  - Cuts 1–2 (glowing hands 50, keyboard 27/49) and the audit's extra cuts (thaw 42, shape-morph 43, harp 26/48, palette 51) are **proposals for the Wed 11 18:00 checkpoint**, for sir and banit to decide. A is now roughly on schedule; the risk is B's visuals.
- **Gestures, second batch (15, 16, 23, 24, 29; c8fe49f):** EQ stretch and reset, ribbon pause/scrub/tap, trim and pull-away undo, pad strikes into `parts.strike`, quiet reset hold. They fire against registry targets using the `extra` convention in `.coord/biyon.md` (biyon-16). B's playhead, lane, region, pad and reset colliders don't exist yet, so these are unreachable in the app until B registers them.
- **Cold start:** the landing page mounts before the first piece loads. The music waits for the piece after Enter. The fixture fallback is dev-only.

**Verified on 11 Nov (early hours)**
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
  - `targets` 15/15 on synthetic targets (EQ, ribbon, trim/undo, pad, reset).
- **IWER at full size** (`tests/iwer/input/acceptance.mjs`, logs in `tests/iwer/input/results/2026-11-11-*.txt`), with real engine gain and filter nodes read each time:
  - F32 summon 180/180 (9 creatures × 20).
  - F04/F33 audio: 20 fist/open cycles (gain 0 held, 1 after) and 20 lock cycles (0 after opening, 1 after a fist returns it).
  - F05: 20 solos set and 20 cleared, with gains matching; 20 gap-injected → 0 solos. → **F05 passes.**
  - F06: 120 gestures near and far, 0 cross-triggers. → **F06 passes.**
  - F07: 20 × 0.29 s gaps hold; 20 × 0.5 s gaps release quietly, never locking. → **F07 passes.**
  - F08 A side: 10 stretches, filter gains match the events within ±12 dB, 10 resets to 0.
  - F04, F08, F32 and F33 still need B's visual half.
- `npm test` 68/68. `tests/browser/cold-start.mjs`: Enter is visible before the piece finishes decoding.

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
1. A: 17 heap check, 26 harp only if it survives the checkpoint, 31 perf once B's visuals land, 32 deploy after sir's approval, 67 text pass at freeze.
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
