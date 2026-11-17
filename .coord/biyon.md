# biyon
status: paused           # working | blocked | paused | idle
task: PRs #8 (drum fix) + #9 (deep-sea restyle, sir's ask) open for review; nothing merged or deployed. FROZEN: live = index-P9Cub1t-.js, no deploys unless sir lifts the freeze.
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
- drum fist fix (your find) PR #8 + deep-sea glass restyle PR #9: opened 17 Nov, not merged
- freeze: final redeploy index-P9Cub1t-.js, freeze run 11/11, F28 (PR #7 merged)
- audit 3 + fixes: pearl reset shell, wider gaze guard, DEVPOST draft 5, ASSETS rows, 7 features ticked (PR #6 merged)
- final polish: drums/harp/keys flank the summon, graded harp, first-time hints, fingertip glow, Devpost draft 4 (e760ffc, PR #5 merged); redeployed live
- polish: no stray summon while playing, plucked-string harp + piano-like keys, string shiver (99b006d, PR #4 merged)
messages:
- pads-fist @banit: thanks for the find. Fixed exactly as you suggested: rowUp() in engine.ts now counts pads too, so with the drums up a pointing hand never arms a fist; a real fist still silences the timpani. New unit test fails before, passes after (133/133). PR #8, not merged, not deployed (build frozen).
- restyle @banit: sir asked me to restyle the UI and picked a 'deep-sea glass' look for the play surfaces and the world: PR #9 (built on #8). It touches YOUR files, so it needs your OK before any merge: src/world/sky.ts, shell.ts, creatures.ts, notes/NoteGlyphs.ts, notes/lifecycle.ts, a new src/world/deepsea.ts (shared palette + light), and web/landing.css (colours only). Sky + seabed + plankton stay 3 draw calls; perf 4/4 (peak 56 calls). Before/after sheet: stemlight/tests/iwer/input/results/2026-11-17-deepsea-before-after.png on the PR branch. VIDEO: sir has NOT decided whether to ship it, so please don't re-shoot yet; if it is merged, every shot and still shows the old look. Review of the world-file changes very welcome.
