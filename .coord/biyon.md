# biyon
status: paused           # working | blocked | paused | idle
task: paused Sun 15 evening; PRs #1-#4 merged into main (24/41); next: redeploy on sir's OK, RC check, audit 3
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*
- stemlight/tests/browser/**
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/docs/DEVPOST.md
- stemlight/docs/features.json
- stemlight/docs/audits/**
- stemlight/docs/progress-pending-biyon.md
- stemlight/src/ui/remake/**
- stemlight/src/main.ts
- stemlight/tests/unit/remake*
- stemlight/index.html
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- polish: no stray summon while playing, plucked-string harp + piano-like keys, string shiver (99b006d, PR #4 merged)
- biyon-48/49 assist: playable harp, keyboard, drums as lit models + glow pass (cf288e1, PR #3 merged)
- PRs #1 and #2 merged into main by sir's go-ahead (6b03f2e, 812d67a)
- biyon-26, 27 harp + keyboard: logic and plain visuals, F12/F13 pass in IWER 25/25 (2dcdc84, on PR #2)
- biyon-29 F23 pause/resume 31/31 in IWER + F08 audible 7/7 in Chromium (fba9036, on PR #2)
messages:
- instruments @banit: done, both your 13 Nov asks, merged into main as PR #3 (f468f25), with sir's go-ahead to merge. (1) I used my own small builder in src/ui/remake/models.ts with your palette and your lighting model, so nothing in src/world changed: harp = gold column + maple neck/soundbox round the 8 strings, keyboard = ivory keys in a black lacquer case with a red felt rail, pads = two copper kettle drums whose heads are the strike surfaces. One mesh each, drawn only while used; key tops and heads sit exactly on their targets. Tasks 48 and 49 are covered; close them or restyle as you like. (2) Glow pass in view.ts: soft eye-facing glow on ribbon edges, region outlines, preview, playhead, strings, count-in. (3) perf-heaviest rerun: peak 64 calls, 101,780 tris (was 34,492 on 12 Nov; your instruments are 35,260 in all, my drums 2,760), under the caps. Shots: tests/iwer/input/results/2026-11-14-shot-*.png, -harp-pluck.png, -keys-press.png.
- merge @banit: PRs #1 and #2 are merged into main (sir okayed me merging). One fix first: your creatures.ts imports '../story/sequencer' and './instruments' without .ts, which the node test runner can't load, so my view no longer imports creatures.ts (index.ts passes ACCENT). If you add .ts to those two imports, any future test can load creatures.ts too. fov.mjs rerun with a flute cut is now unblocked.
- issues @banit: (a) your opaque timpani at the reach spot covers the right-hand pad drum when perc is summoned (tests/iwer/input/results/2026-11-14-shot-4-region-pads-countin.png): smaller, or moved while pads are up? (b) the cyan disc near the clarinet in your screenshots looks like a leftover from the old creatures. (c) done on my side, PR #4 merged: standing, looking down at the harp/keyboard used to summon the cello behind it; a string/key/drum nearer the gaze now blocks the summon. Also new: the harp is a modelled plucked string and the keys a piano-like tone (still code-made, no ASSETS rows), and plucked strings shiver. Good material for the video's remake shots.
