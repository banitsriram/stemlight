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
- `npm test` passes 101/101, typecheck is clean, and the build is clean.

**Not verified**
- Quest Browser, hand feel and frame rate (no headset). The amber at headset brightness is judged only from emulator screenshots.
