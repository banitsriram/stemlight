# Pending progress entry (biyon)

`docs/progress.md` is claimed by banit, so this entry waits here. Banit: paste it at the top of progress.md (newest first) and delete this file, or release progress.md and biyon will.

## 11 Nov 2026 (16:00–23:55 IST): biyon, hand:pinch, remake surfaces, redeploy

**State**
- `hand:pinch { hand, down, targetId }` added to contracts.ts, as agreed with banit (biyon-16). The input engine fires it on every pinch close and open. The Target.extra keys are documented there (ec9272b).
- **Remake surfaces**, in `src/ui/remake/` (released by banit), commits 6f9e585 and 379d3ee:
  - **Ribbon and lane.** A ribbon shows ±8 s of music, with a 6 cm playhead. Below it runs one big capsule lane for the summoned stem.
  - **Cuts.** A cut leaves a hollow region with ghost-note outlines; pulling the region away undoes it.
  - **Pads.** Two timpani pads (tonic/dominant pair, e.g. 47/52 for Dvořák) sit either side of the summoned creature, outside its fist sphere. They have a count-in ring, and an amber note flies from the fingertip on `part:hit`.
  - **Reset shell** at eye level on the right.
- Stand-in `initSequence` removed; banit's story sequencer owns the piece order (6a0bff9).
- **Redeployed** to https://stemlight.vercel.app with all of banit's visuals plus the surfaces. The live bundle hash matches the local build.

**Verified on 11 Nov**
- `npm test` passes 97/97, typecheck is clean, and the build is clean. `dist/` grep finds no dev code.
- `tests/iwer/input/remake-real.mjs` (IWER headless, real surfaces, clean page start) passes 18/18. Log and screenshots are in `tests/iwer/input/results/2026-11-11-remake-*`. It covers:
  - summon perc → lane:perc registered;
  - two-hand cut → cut:preview + cut:add → `region:<id>` registered → pulled 13 cm → cut:remove;
  - second cut → 2 pads + pads take → a real pad strike;
  - playhead pinch pauses, a 6 cm drag moves +1.714 s (expected 1.71), release plays;
  - reset shell hold → app:reset.
- **Draw budget:** peak 68 draw calls / 32.6k triangles, within the 100 / 150k caps. Emulator numbers, not a device.
- **banit's `tests/iwer/visual/fov.mjs`:**
  - First run: F27 failed. The reset shell and pads were outside 70×66°.
  - After the layout fix, F27 passes in all 8 states and there are no console errors.
  - One F18 line ("no account + hand-tracking hint") failed on that rerun but passed on the run before, with no change to `web/`. It looks like a fade-in timing flake.
  - The refreshed fov screenshots were left for banit to commit (his folder).
- **Live link** (fresh Chromium profile): Enter visible in 1.5–4.9 s, 8 stems loaded, all requests to `stemlight.vercel.app`, 0 errors.

**Not verified**
- Quest Browser and hand feel (no headset).
- F19 onboarding run: the input agent stalled twice on a stream timeout before writing it.

**Local trap:** on this laptop PowerShell takes about 1.8 s to start, and `@iwsdk/vite-plugin-dev` gives it 1.5 s, so `iwsdk dev up` fails with "runtime ownership". The timeout in the local `node_modules` copy was raised to 10 s (not committed). If `npm install` reinstalls the plugin, patch it again. Start the session from PowerShell with `npx iwsdk dev up --ai-mode agent --headless --open --allow-browser-automation`, then `npx iwsdk dev open --headless` until `browserCommandReady` is true.

## 12 Nov 2026 (00:15–01:30 IST): biyon, F19 run, performance pass, memory check, Devpost draft 2 (branch `biyon/f19-perf-devpost`, PR)

**State**
- `tests/iwer/input/f19-onboarding.mjs` is banit's request biyon-55.
- `tests/iwer/input/perf-heaviest.mjs` is task 31.
- `tests/browser/memory-switch.mjs` is task 17.
- `docs/DEVPOST.md` draft 2 now matches the live build: real URL, real numbers, cut features removed, and [CHECK]s left only for open decisions.
- `story` was added to the dev-only `window.__stemlight` handle so tests can read the tutorial.

**Verified on 12 Nov**
- **F19, IWER headless, fresh first visit: 4/4.** One Enter click starts the music and unlocks the audio. A creature (brass, dead ahead in IWER's default seated pose) is summoned 0.4 s after the music starts, which is within 15 s. The tutorial moves to "Make a fist". After doing nothing, a nudge fires; it was measured at 12.0 s after the step began, which is the 10 s rule plus up to ~1.6 s of polling delay. Screenshots are `results/2026-11-12-f19-*.png`.
- **Performance pass, IWER: 4/4.** The test ran at Dvořák's densest 4 s (64.5 s, 357 notes), with the brass summoned and a perc cut so the pads, lane, region and ribbon all show. Peak 68 draw calls, 34.5k triangles and 380 live notes, against caps of 100 / 150k / 1,500. These are emulator numbers; Quest frame rate is unverified. → **F26 passes** (device frame rate stated as unverified, as its test allows).
- **Memory, headless Chromium with forced GC: 4/4.** Decoded size is logged per piece: beethoven5 128.4 MB, dvorak9 235 MB. After switching to Dvořák, 0 of 8 Beethoven AudioBuffers are still alive after GC. → **F39 passes** (Quest memory unverified).
- `npm test` passes 97/97 and typecheck is clean.

**Not verified**
- F19 with a head turned away first. IWER can't move the head before the session exists, and each CLI call takes ~1 s, longer than the 0.5 s summon dwell. A real first-timer facing forward also gets the summon at once.

## 12 Nov 2026 (01:30–04:30 IST): biyon, remake surfaces render, amber fix, 10 features pass (branch `biyon/f19-perf-devpost`, PR #1)

**State**
- **The remake surfaces never rendered until now.** Their drawing code wrote into arrays the GPU never read: `Float32BufferAttribute` copies its array, while `BufferAttribute` shares it. Affected: ribbon band, lane, playhead bead, hollow-region outlines, pads, count-in rings and reset arc. Only the note glyphs (banit's class) showed. Fixed in `src/ui/remake/view.ts`, with a regression test (`tests/unit/remake-view.test.mjs`).
- **Ribbon and playhead raised above the summoned creature**, which hid them at the old height. Unit test 14 keeps them outside the creature sphere, inside 70×66° and within 0.61 m.
- **Pad hit now reads amber, not white.** The flash used to add amber on top of the cyan pad and halo, which summed past 1 in every channel. The pad's cyan is now swapped for amber, with a regression test.
- **Pad and shell look.** Pads are cyan with a bright rim and an eye-facing halo, each with its own count-in ring. The reset shell is cyan.
- **DEVPOST.md.** The AI-tool line was checked against the live rules (read 12 Nov): no disclosure is required, and brand names are banned in the Project. It now says "an AI coding assistant" without the product name, with a [CHECK] for sir.

**Verified on 12 Nov**
- **`tests/iwer/input/remake-shots.mjs` (IWER, Dvořák): 6 screenshots** in `tests/iwer/input/results/2026-11-12-shot-*.png`:
  1. ribbon, playhead bead and the summoned stem's lane with its notes;
  2. playhead held;
  3. cut preview span between two pinching hands;
  4. hollow region with outlines, both pads and count-in rings;
  5. pad flash, an amber note leaving the fingertip, and ghost outlines;
  6. reset ring half full.
- **`tests/iwer/input/remake-real.mjs`: 18/18**, run after the ribbon move (log `2026-11-12-remake-real.txt`).
- **`tests/browser/take-save.mjs` (real Chromium audio clock, real IndexedDB): 11/11.**
  - Guide gain 0.1259 (−18 dB) on pass 0 and 0 on pass 1 → **F35 passes**.
  - It now prints when each strike actually fired. One earlier run failed when the page's polling loop stalled for 300 ms and a strike fired late; the next 3 runs passed.
- **`tests/browser/loops-mix.mjs` (new, real Chromium): 7/7.**
  - Off-grid strikes (±60 ms) land on the 1/8 grid.
  - 3 wraps, each exactly 2.000000 s apart.
  - Every earlier hit is re-scheduled on passes 1–3 at wrap + offset, 6/6 with 0 µs error.
  - A lock and an EQ change survive a reload, read back from the gain and filter nodes.
  - Log: `tests/browser/results/`.
  - → **F11 and F22 pass** (with the existing unit tests).
- **F36:** new unit test on the real Dvořák `notes.json`. The outlines equal exactly the notes in a perc region (15) and a violin region (60), and none of them is also drawn solid. With screenshot 4 → **F36 passes**.
- **Also passing on existing evidence:**
  - **F04, F32, F33:** the A halves were in the 11 Nov acceptance run (20 fist cycles, 180/180 summons, 20 locks), and banit's world screenshots supply the B halves.
  - **F09:** remake-real pause, scrub (+1.714 s within 50 ms) and resume, plus screenshots 1–2.
  - **F34:** 4 count-in events in the unit test and the browser run, plus screenshot 4.
  - **F40:** unit test of 10 resets, this piece only; the real reset-shell hold; screenshot 6.
- **banit's `tests/iwer/visual/fov.mjs`:** F18 and F27 pass in all 8 states with 0 console errors. The first attempt timed out on the landing fade while the machine was busy; the rerun passed. The refreshed fov screenshots were left unstaged (banit's folder).
- **`tests/iwer/input/trim-20.mjs` (new, IWER, real gestures on Dvořák's violins, no take or guide involved).** Log: `results/2026-11-12-trim-20.txt`.
  - 20/20 two-hand cuts: cut:preview, then cut:add, then a hollow region target.
  - The trim gain is 0 inside the region on playback (20/20) and 1 outside (20/20). Each reading is judged by the piece time it was actually taken at, because harness calls take about 1 s while the music runs.
  - 10/10 pull-away undos: cut:remove, the region is gone, and the gain is back to 1.
  - 10 cuts kept at the end.
  - → **F10 passes** (with the unit test of 20 trims and 10 undos, and screenshot 4).
- **F15:** after the amber fix, screenshot 5 shows the struck pad glowing amber-gold, with an amber note rising from the fingertip next to the cyan pad. → **F15 passes**. banit owns it, so please confirm the look.
- `npm test` passes 101/101, typecheck is clean, and the build is clean. **21/41 features pass.**

**Not verified**
- Quest Browser, hand feel and frame rate (no headset). The amber at headset brightness is judged only from emulator screenshots.

## 12 Nov 2026 (09:00–10:30 IST): biyon, F23 passes, F08 audible (branch `biyon/f08-f23-evidence`, PR stacked on PR #1)

**F23 (A side, task 29), IWER: `tests/iwer/input/pause-resume.mjs` passes 31/31.** Log: `tests/iwer/input/results/2026-11-12-pause-resume.txt`. No code changes were needed; `src/audio/lifecycle.ts` already handled every case.
- **Setup.** A fresh first visit on Dvořák: storage cleared, tutorial not skipped. The real gaze summon passes the first step. Then a mix is set over the bus: violins locked, flutes EQ +6/−6, a cut on the cellos.
- **5 headset-hidden cycles and 1 system-menu cycle.** These go through IWER's own `XRDevice.updateVisibilityState` ('hidden' and 'visible-blurred'), the real session `visibilitychange`. Each one:
  - fires `app:pause`;
  - stops the music with the clock frozen to the millisecond;
  - on 'visible', fires `app:resume`, and the music runs on from where it stopped;
  - leaves the audio context running, the mix intact and the tutorial step kept (7/7 each).
- **Page-hidden cycle.** A simulated document `visibilitychange`, because headless Chromium never hides the page. Same checks, all pass.
- **3 session ends** (`iwsdk xr exit`). Each one pauses with the clock frozen, and the page offers **Resume**. A real click re-enters, and the music carries on from the paused time with the mix intact (3/3 × 3).
- **Reload.**
  - The saved mix (lock, EQ, cut) is back from IndexedDB before Enter.
  - The tutorial continues at its saved step ('solo'), not from 'summon'.
  - Music plays after Enter.
  - The tutorial is then finished. A second reload, with the localStorage step cleared, starts in free play from IndexedDB `tutorialDone` alone.
- **Together with banit's B half** (Paused/Resume screen and returning-user caption, progress.md 11 Nov 14:00), **F23 now passes**: features.json is 22/41.
- The tutorial advanced a step or two during the run by its own 3-nudge skip. That is expected and is never a restart.

**F08 audible (A side), real browser: `tests/browser/eq-audible.mjs` passes 7/7.** Log: `tests/browser/results/2026-11-12-eq-audible.txt`.
- **Method.** The real Dvořák stems play in headless Chromium. Two analysers sit on one stem (brass, picked automatically as the loudest in both bands): one before its EQ, one after. That way the music's own changes cancel out.
- **Results, measured below 120 Hz / above 8 kHz:**
  - Flat: −0.01 / 0.00 dB.
  - Bass stretch (+12 low): **+10.96** / 0.00 dB.
  - Treble stretch (−12 high): 0.00 / **−11.60** dB.
  - Mixed (+6/−6): +5.54 / −5.82 dB.
  - Reset: 0.00 / 0.00 dB.
- **Status.** With the 11 Nov gesture run (10 stretches + 10 resets, acceptance.mjs f08), the A side of F08 is complete. F08 stays false until the B half: task 43 (shape-morph before/after) is on the cut list. **If sir and banit cut 43, F08 passes on this evidence.**

## 12 Nov 2026 (10:30–12:30 IST): biyon, release check, scoring audit 2, end-card credit fix, Devpost draft 3 (branch `biyon/f08-f23-evidence`, PR #2)

- **Fresh-browser release check (task 69 prep, F28): `tests/browser/release-check.mjs`.**
  - **How it runs.** A brand-new Chromium profile loads the real deployed bundle, with the emulator injected as a Quest 3 in hand mode. No dev code is involved.
  - **What it checks:**
    - page and request errors;
    - which bundle is live (`--expect` pins it), and that no dev code shipped;
    - Enter starts XR and the music;
    - leaving VR shows Resume, and Resume carries the music on;
    - a reload comes back clean with the save in IndexedDB;
    - with `--full`, the whole sequence plays.
  - **Results:**
    - Live site, on the 11 Nov build `index-rJ-CFtJ-.js`: **9/9**, and **10/10 with `--full`** (Beethoven, then Dvořák at 85 s, 286 s in all, 0 errors).
    - This branch's production build through `vite preview`: **9/9**.
  - **Logs:** `tests/browser/results/2026-11-12-release-check-*.txt`.
  - **Monday's RC run:** `node tests/browser/release-check.mjs https://stemlight.vercel.app/ --expect assets/index-<hash>.js --full`.
- **Scoring audit 2 (task 64, second of three, run early):** `docs/audits/2026-11-12-audit.md`, written by a fresh-session reviewer.
  - **Weakest lines:** video and images (3/4), 60 fps (3, no device), intuitive and onboarding (4/5, no uncoached tester), habit and repeat use (4/5, end card), reliability and sound (6, stale judge link, renders not listened to).
- **End-card credit bug, fixed.** `main.ts` loaded the first piece before the sequencer subscribed to `piece:ready`, so Beethoven's credit never reached the end card. The sequencer is now set up first.
  - Regression test: `tests/unit/audio-load-order.test.mjs` fails on the old order and passes on the new one.
  - `npm test` 102/102, `tsc` clean.
- **Devpost draft 3,** from the audit:
  - running times 1:24 and 2:33, and "about four minutes" (was five);
  - "Nothing on screen is decoration" replaced, because the sky and ocean are decoration;
  - company names dropped (sampler, font foundry, sample studio, Three.js, TypeScript);
  - comfort and brightness added to the unverified list;
  - the field-of-view sentence flagged until banit's rerun is committed;
  - remake roles and remake still candidates added;
  - a top note that the live link still runs the 11 Nov build until the merge and redeploy.

## 12–13 Nov 2026 (to 00:15 IST): biyon, harp and keyboard, logic and plain visuals (tasks 26, 27; F12, F13; branch `biyon/f08-f23-evidence`, PR #2)

- **What it is.** Cutting the flutes gives an 8-string harp; cutting the reeds gives an 8-key keyboard. Both sit just below eye line, inside the 70×66° view and 0.61 m reach, tuned to one octave of the piece's scale inside the replaced stem's range (Dvořák: 76–88 and 52–64; Beethoven: 72–84 and 60–72). Notes record into the take, snap to the 1/8 grid and loop, exactly as the pads do.
  - **Harp:** the index tip crossing a string sideways, at 0.1 m/s or faster, within the string's length.
  - **Keyboard:** the index tip moving down through a key top, at 0.15 m/s or faster, inside the key.
  - Both share the pads' 90 ms lockout. Speed sets loudness.
  - Manifests: `replace` is now `perc:pads`, `fl:harp`, `reeds:keys` for both pieces.
- **Guards, each with a unit test:**
  - a tip resting on a string or key and wobbling 1.5 mm plays nothing (4 mm hysteresis);
  - a tracking gap, or a tip that jumps more than 12 cm in one sample, plays nothing;
  - a pointing hand inside the summoned creature no longer counts as a fist while the row is up (it used to mute and lock the stem);
  - the count-in shows only on the instrument being recorded.
- **Audio engine fix found on the way.** A take's loop wrap was only scheduled inside a 0.25 s window before the loop end. A frame stall longer than that skipped the window: the loop never wrapped, the take hung and the music ran on to the end of the piece. The engine now wraps late instead (a short glitch, the loop carries on). Unit test: a 0.9 s frame across the loop end.
- **Evidence:**
  - **Real gestures in the emulator: `tests/iwer/input/harp-keys.mjs`, 25/25.** On Dvořák: a two-hand cut on the flute lane starts a harp take and registers 8 strings; a sweep up and back at 0.5 m/s gives 16 plucks in string order, all in E minor, 16 hits recorded; the loop goes round and the part keeps them. Then the same on the reeds: 8 presses, one per key, in order, 8 hits recorded. Jumping the hand to and from the row plays nothing. No console errors. Log and two screenshots: `tests/iwer/input/results/2026-11-13-harp-keys.txt`, `-harp-pluck.png`, `-keys-press.png`.
  - **Loop timing in a real browser: `tests/browser/harp-keys-loop.mjs`, all pass.** Off-grid strikes snap to the 1/8 grid; three wraps, each exactly one region apart; replays 6/6 at 0.00 µs from wrap + offset, for both instruments. Log: `tests/browser/results/2026-11-13-harp-keys-loop.txt`.
  - **Pause/resume rerun after the engine change:** all 12 groups pass (`tests/iwer/input/results/2026-11-13-pause-resume.txt`). Its second cut moved from the reeds to the basses, because a reed cut now starts a keyboard take.
  - `npm test` 115/115, `tsc` clean.
- **F12 and F13 pass: 24/41.**
- **Not verified:** how plucking and pressing feel on a real hand, and the look on a headset. The visuals are plain lines and quads in `src/ui/remake/`; in the harp screenshot the strings stand in front of the summoned creature and overlap it.
- **Why the emulator run took several tries.** The test moved the hand with one CLI call per position, seconds each on a loaded laptop, while the music kept playing: the piece ended and the next one loaded mid-test. The hand moves now run inside the page in real time, one call per sweep.

## 14–15 Nov 2026: biyon, PR #1 and #2 merged; playable instruments as models; glow pass (branch `biyon/playable-instruments`)

- **PR #1 and #2 merged into main** on sir's go-ahead (14 Nov 10:38 IST). banit had reviewed both (tsc, 115/115, build). Before merging: one fix on PR #2, because banit's `creatures.ts` now imports `../story/sequencer` without `.ts`, which the node test runner can't resolve. `view.ts` no longer imports `creatures.ts`; `index.ts` passes the section colours in. Then main plus both PRs: `npm test` 115/115, `tsc` clean, build OK, and `harp-keys.mjs` 25/25 in IWER with banit's new instruments. Main now has 24/41 features.
- **Playable instruments as real objects (banit's ask, 13 Nov), in `src/ui/remake/models.ts`.** Same lit wood, brass and ivory look as banit's nine instruments, built in code, no assets:
  - **harp:** gold column and crown, maple neck and soundbox, gold tuning pins, framing the 8 strings;
  - **keyboard:** 8 ivory keys in a black lacquer case with cheek blocks, a red felt rail and a gold line;
  - **pads:** two small copper kettle drums with skin heads, silver hoops, tension rods and tripods.
  - Each is one merged mesh (one draw call), drawn only while its instrument is up. The key tops and drum heads sit exactly on their input targets. A strike turns the struck key or head amber, and a key dips 6 mm. Playable parts have a soft cyan rim.
  - Input logic and targets are unchanged.
- **Glow pass in `view.ts` (banit's ask).** Every bright line now has a soft glow either side, facing the eye: ribbon edges, region outlines, cut preview, playhead, strings, count-in bar. The lane is brighter along its middle. The strings are cream (the two tonic strings red, as a real harp marks its Cs) with a cyan glow; a pluck turns one amber, wider and flaring.
- **Evidence:**
  - `npm test` 120/120 (new `tests/unit/remake-models.test.mjs`: key tops and drum heads on their targets on a turned seat, the harp frame clear of the sweep zone, models shown only with their instrument, flash and dip on the struck part only). `tsc` clean.
  - IWER `harp-keys.mjs` 25/25 with the new models; screenshots `tests/iwer/input/results/2026-11-14-harp-pluck.png` and `-keys-press.png`.
  - IWER `remake-shots.mjs`: 6 shots, `2026-11-14-shot-*.png` (ribbon and lane, playhead held, cut preview, region with drums and count-in, drum hit in amber, reset ring).
  - IWER `perf-heaviest.mjs` (`2026-11-15-perf-heaviest.txt`): peak 64 draw calls (cap 100), 101,780 triangles (cap 150k, was 34,492 on 12 Nov), 380 live notes. Of the rise, the drums add 2,760 triangles; banit's nine instruments are 35,260 in all. Emulator numbers only: no device frame rate claimed.
- **Found, not fixed here (no behaviour change in this PR):**
  - Looking down at the harp or keyboard re-summons the cello, whose seat sits right behind the row, so it glides in behind the instrument you're playing. This shows in the IWER input log on main before this change too. A fix belongs in the gaze summon (`src/input/engine.ts`).
  - With the timpani summoned, banit's opaque timpani at the reach spot covers the right-hand pad drum (shot 4). Before, the creatures were see-through glow.
- **Not verified:** how the models look and read on a headset.

## 15 Nov 2026 (evening): biyon, no stray summon while playing; real harp and piano sounds; strings shiver (branch `biyon/play-polish`)

- **Looking at your instrument no longer summons the one behind it.** Standing (eye 1.4 m and up; IWER uses 1.6 m), the cello, flute, violin and clarinet seats all sit within the 12° summon cone behind the harp and keyboard. Each time the player looked down to play, the cello glided in (IWER input log, 14 Nov). Seated at 1.2 m nothing lines up. Now, when a string, key or drum head is nearer the line of sight than any creature, nothing is summoned (`src/input/engine.ts`). A unit test reproduces the standing case for the cello and the flute, fails without the fix, and still summons the cello when looked at directly or with no instrument up. In the IWER rerun, no summon happens after either cut; before, `vla_vc` followed both.
- **Harp and keyboard voices (`src/audio/synth.ts`).** Before, both were a few plain sine partials. Now:
  - **harp:** a modelled plucked string (Karplus-Strong, tuned to the cent with an allpass), excited by soft noise as if by a fingertip and plucked 1/7 along; low strings ring longer and every note darkens as it rings;
  - **keys:** piano-like: overtones stretched by string stiffness, two strings per note a fraction of a cent apart so the tone blooms, a quick first decay then a long tail, and a felt-hammer thump.
  - Each note renders once per audio context and is cached. The remake state renders all 8 notes of the instrument during the count-in (`warmVoices`), so no strike waits on a render. A softer strike is darker (lowpass) as well as quieter.
  - Still no sample files, so no new ASSETS rows.
- **A plucked string shivers** (`view.ts`): it blurs into a lens 4 mm wide at its middle and still at its ends, flickering and narrowing as the 0.25 s flash fades.
- **Evidence:**
  - `npm test` 127/127, `tsc` clean. New `tests/unit/audio-voices.test.mjs`: every harp note of both pieces (72–88) and every key (52–72) within 3 cents, dying away, never clipping, no DC; low strings ring longer and darken; each note renders inside the per-note budget (harp under 25 ms, keys under 40 ms).
  - IWER `harp-keys.mjs` 25/25 (`tests/iwer/input/results/2026-11-15-harp-keys.txt` and shots).
  - Real browser `tests/browser/harp-keys-loop.mjs` all pass: replays of the new buffer voices land sample-exact, 6/6 per instrument (`tests/browser/results/2026-11-15-harp-keys-loop.txt`).
- **Not verified:** how the new voices sound to a person. Two short scales were rendered for sir to listen to (local only, not committed). The shiver isn't caught in a screenshot, because it lasts a quarter of a second after a pluck; the unit test measures it.

## 16 Nov 2026: biyon, redeploy; drums flank the creature; a harp that looks like one; first-time hints; fingertip glow; Devpost draft 4 (branch `biyon/final-polish`)

- **Redeployed** main (PRs #1–#4) to https://stemlight.vercel.app on sir's go-ahead: bundle `assets/index-BXnk8qrq.js`. The fresh-browser release check against the live site passes 10/10 (`tests/browser/release-check.mjs ... --expect assets/index-BXnk8qrq.js`). Before this, the live link still ran the 11 Nov build.
- **The drums no longer collide with the summoned instrument.** A summoned instrument comes to wherever the head points, so the timpani (seat on the right) landed on the right-hand drum (shot, 14 Nov). The drums, harp and keyboard now use the summoned instrument's frame, like the ribbon, so they always flank it. They move only on a summon, gliding with the ribbon, never as the head looks around. The reset shell keeps the seat. The unit test now covers this: looking around moves nothing, a summon glides the pads into place, the shell stays. IWER shot `2026-11-16-shot-4-region-pads-countin.png`: both drums clear either side of the timpani.
- **A harp that looks like a harp.** Graded strings: bass 15 cm, treble 8 cm, all centred on one 8 cm band 14 cm below the eye (1 cm higher than before, so every string bottom stays inside the 33° lower edge of the view). The frame now has a gold column, a neck curving down to the treble shoulder and a soundbox sloping up. A unit test keeps every frame vertex out of the sweep band and checks the grading. Shot `2026-11-16-harp-pluck.png`.
- **First-time hints.** The first time the drums, harp or keyboard appear in a session, a one-line caption floats above them ("Strike a drum head", "Sweep a finger across the strings", "Press each key down with one finger"). It goes on the first hit or after 8 s. It uses banit's text sprite, unchanged. Shot `2026-11-16-keys-hint.png`.
- **Fingertip glow.** A soft cyan light on an index fingertip within 6 cm of a string, key top or drum head: brighter and larger as it closes in, a slight pulse on the beat, dimmer when tracking confidence is low, gone when the hand is lost. With no controller to buzz, this is the "about to touch" cue. Visible in the keyboard and harp shots.
  - Not claimed as F30: that feature is whole glowing hands, owner B.
- **Devpost draft 4** (sir approved the wording): sea creatures replaced by the nine modelled instruments, the drums, harp and keyboard in the gestures table, their code-made sounds, hints, roles, the perf line, and a warning that pre-13 Nov stills show the old creatures.
- **Evidence:**
  - `npm test` 129/129, `tsc` clean.
  - IWER `harp-keys.mjs` 25/25 (`2026-11-16-harp-keys.txt`), `remake-shots.mjs` 6 shots (`2026-11-16-shot-*.png`).
  - `perf-heaviest.mjs`: peak 66 draw calls, 101,632 triangles, 380 live notes (`2026-11-16-perf-heaviest.txt`; caps 100 / 150k / 1,500). Emulator only.
- **Not verified:** how any of it looks or feels on a headset, and whether the 30 cm hint text is comfortable to read on a Quest.

## 17 Nov 2026 (00:30–03:00 IST): biyon, re-runs, scoring audit 3 and its fixes, 31/41 (branch `biyon/audit3-fixes`)

- **Re-runs on main after this week's changes, all pass:**
  - pause/resume 36/36 (`tests/iwer/input/results/2026-11-16-pause-resume.txt`);
  - onboarding 4/4: one Enter starts the music, first summon 0.4 s in, nudge at 11.7 s (`2026-11-16-f19-onboarding.txt` + shots);
  - full play-through on the **live** build `index-D9PFYY4E.js`: Beethoven then Dvořák, 285 s, Resume, clean reload, 0 errors, 61 responses (`tests/browser/results/2026-11-16-release-check-stemlight.vercel.app-full.txt`, 11/11);
  - banit's `tests/iwer/visual/fov.mjs`: F18 4/4 and F27 every state, drums included (`2026-11-16-fov-rerun.txt` + `-results.json`). His `docs/tests/fov/` outputs were restored, not committed.
- **Scoring audit 3** by a fresh read-only reviewer: `docs/audits/2026-11-17-audit.md`. Its scores: Innovation 7.0, Experience 6.4, Technical 6.6, Polish 5.7. The video is the gate (2/4: the only cut shows the old sea creatures).
- **Fixed from the audit (A side):**
  - **DEVPOST draft 5:**
    - "nine instruments" became **eight**, since each piece has eight parts and the harp appears only when you play it;
    - the amber notes are now named as yours;
    - the screenshot list points only at current-look shots;
    - the internal header is marked "delete before pasting";
    - the field-of-view line is backed by the rerun and the layout tests;
    - the palette bracket is gone.
    - Left for sir: the AI line, emails and roles, the final stills.
  - **The reset shell reads as a shell.** It was a flat additive cyan shape: the audit called it an unexplained blob, and I had wrongly asked banit whether it was his leftover. It's now a lit pearl scallop with shaded ribs (`models.ts` `resetShell`) that glows cyan only while pinched. A first-time hint ("Pinch and hold to reset the mix") shows when a fingertip first comes within 10 cm, gone once a pinch starts or after 6 s.
  - **The shell also follows the summoned instrument,** like the drums: looking towards it used to summon the timpani onto it (IWER, 17 Nov).
  - **Gaze guard widened:** looking at the reset shell, the playhead or the score lane, as well as a string, key or drum head, never summons the creature behind it. Unit test included.
  - **ASSETS.md:** rows for the code-made playable voices (`synth.ts`) and models (`models.ts`); the VCSL row no longer says the harp was cut.
  - **features.json:** F14, F16, F17, F19, F21, F24 and F25 ticked on the evidence the audit lists (banit's runs plus tonight's reruns). **31/41.** Still false: F01/F02 (sir listens), F08 (sir decides on cutting task 43), F20 (re-scope), F28 (ticks at the freeze run), F29 (tester), F30/F31/F37 (cut), F41 (sir).
- **Evidence:** `npm test` 132/132, `tsc` clean; IWER `harp-keys.mjs` 25/25 after the guard change; `remake-shots.mjs` (`2026-11-16-shot-*.png`, shot 6 shows the new shell); `2026-11-16-reset-shell.png`.
- **Not shown in a screenshot:** the shell's hint. The emulator's default right-hand pose rests within 10 cm of the shell, so the hint fires at session start and has gone before a script can reach in. Its unit test covers it, and it renders through the same caption as the keyboard hint (`2026-11-16-keys-hint.png`).
- **Not deployed yet:** the live link still runs `index-D9PFYY4E.js` (before these fixes). It needs sir's OK to redeploy, then the freeze run ticks F28.

## 17 Nov 2026 (~03:30 IST): biyon, final redeploy and FREEZE (F28)

- On sir's go-ahead, main (PRs #1–#6) was built and deployed: **https://stemlight.vercel.app now serves `assets/index-P9Cub1t-.js`**. This is the judge build.
- **Freeze run, 11/11:** `node tests/browser/release-check.mjs https://stemlight.vercel.app/ --expect assets/index-P9Cub1t-.js --full`. A fresh Chromium profile with the emulated Quest 3 in hand mode:
  - the pinned bundle is live and no dev code shipped;
  - Enter starts XR and the music;
  - both pieces play in order (Beethoven, then Dvořák), 286 s;
  - leaving VR shows Resume, and Resume carries on;
  - a reload comes back clean;
  - 0 page errors, 0 console errors, 69 responses, none failed.
  - Log: `tests/browser/results/2026-11-17-FREEZE-release-check-full.txt`.
- **F28 passes: 32/41.**
- **Freeze rule:** no deploy after this unless sir lifts it. Any change after the freeze means a new deploy, a new freeze run and an updated bundle name here and in DEVPOST.md.
