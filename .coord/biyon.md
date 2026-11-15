# biyon
status: paused           # working | blocked | paused | idle
task: paused Mon 16; PRs #1-#5 merged; LIVE redeployed 16 Nov (index-D9PFYY4E.js, release check 10/10); next: audit 3 Tue 17, final Devpost
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
- final polish: drums/harp/keys flank the summon, graded harp, first-time hints, fingertip glow, Devpost draft 4 (e760ffc, PR #5 merged); redeployed live
- polish: no stray summon while playing, plucked-string harp + piano-like keys, string shiver (99b006d, PR #4 merged)
- biyon-48/49 assist: playable harp, keyboard, drums as lit models + glow pass (cf288e1, PR #3 merged)
- PRs #1 and #2 merged into main by sir's go-ahead (6b03f2e, 812d67a)
- biyon-26, 27 harp + keyboard: logic and plain visuals, F12/F13 pass in IWER 25/25 (2dcdc84, on PR #2)
messages:
- instruments @banit: done, both your 13 Nov asks, merged into main as PR #3 (f468f25), with sir's go-ahead to merge. (1) I used my own small builder in src/ui/remake/models.ts with your palette and your lighting model, so nothing in src/world changed: harp = gold column + maple neck/soundbox round the 8 strings, keyboard = ivory keys in a black lacquer case with a red felt rail, pads = two copper kettle drums whose heads are the strike surfaces. One mesh each, drawn only while used; key tops and heads sit exactly on their targets. Tasks 48 and 49 are covered; close them or restyle as you like. (2) Glow pass in view.ts: soft eye-facing glow on ribbon edges, region outlines, preview, playhead, strings, count-in. (3) perf-heaviest rerun: peak 64 calls, 101,780 tris (was 34,492 on 12 Nov; your instruments are 35,260 in all, my drums 2,760), under the caps. Shots: tests/iwer/input/results/2026-11-14-shot-*.png, -harp-pluck.png, -keys-press.png.
- merge @banit: PRs #1 and #2 are merged into main (sir okayed me merging). One fix first: your creatures.ts imports '../story/sequencer' and './instruments' without .ts, which the node test runner can't load, so my view no longer imports creatures.ts (index.ts passes ACCENT). If you add .ts to those two imports, any future test can load creatures.ts too. fov.mjs rerun with a flute cut is now unblocked.
- live @banit: sir approved, so the live link was redeployed twice on 16 Nov; it now serves main with your instruments and all my PRs (#1-#5): https://stemlight.vercel.app, bundle index-D9PFYY4E.js, fresh-browser release check 10/10. Changes you'll see: (a) the timpani-covers-the-drum issue is fixed on my side: the drums, harp and keyboard now use the summoned instrument's frame (like the ribbon), so they flank it wherever it was summoned; no change needed in your files. (b) The harp is graded (column, curved neck, sloping soundbox). (c) A one-line hint over each instrument the first time it appears (uses your textSprite from story/card.ts, unchanged). (d) A cyan fingertip glow near strings/keys/drums. I did not claim F30 (whole glowing hands, yours). (e) DEVPOST.md draft 4 says instruments, not sea creatures; your video script and PLAN still say creatures, and stills from before 13 Nov show the old look. Fresh shots for the video: tests/iwer/input/results/2026-11-16-*.png. Still open for you: the cyan disc near the clarinet (leftover?), fov.mjs rerun, video + VO.
