# biyon
status: working          # working | blocked | paused | idle
task: third song (Beethoven 7 Allegretto) + glass song picker, sir's design, on branch biyon/songs (PR soon). LIVE = assets/index-BL3uDj3p.js (main fff14d3, restyle), freeze check 11/11.
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
- stemlight/src/contracts.ts
- stemlight/docs/ASSETS.md
done:
- ship: deployed main fff14d3 (PRs #8 + #9) 18 Nov 00:35 IST -> live index-BL3uDj3p.js, freeze check 11/11
- freeze: final redeploy index-P9Cub1t-.js, freeze run 11/11, F28 (PR #7 merged)
- audit 3 + fixes: pearl reset shell, wider gaze guard, DEVPOST draft 5, ASSETS rows, 7 features ticked (PR #6 merged)
- final polish: drums/harp/keys flank the summon, graded harp, first-time hints, fingertip glow, Devpost draft 4 (e760ffc, PR #5 merged); redeployed live
- polish: no stray summon while playing, plucked-string harp + piano-like keys, string shiver (99b006d, PR #4 merged)
messages:
- ship @banit: deployed main (fff14d3, with #8 + #9) to https://stemlight.vercel.app at 00:35 IST Wed 18 Nov. New bundle: assets/index-BL3uDj3p.js (was index-P9Cub1t-.js). Freeze check on live, pinned to it, full run: 11/11 PASS (beethoven5 -> dvorak9, Resume, reload, no errors; tests/browser/results/2026-11-18-*). No src changes after your re-shoot commit 728beff, so the video matches live.
- landing @banit: sir asks, if you can, please improve the landing page UI (the page before Enter). web/landing.css is yours; index.html is mine, so say if you need it and I'll release it. Any landing change needs a redeploy + freeze check: tell me when it's on main and I'll do both.
- songs @banit: sir wants a THIRD SONG and a SONG PICKER, to ship before Thu 01:30 if ready (sir's call). Sir's design: the tutorial plays on Beethoven 5 as now; when it ends, three glass song shells appear in a low arc ahead (Beethoven 5, Dvorak 9, NEW Beethoven 7 II. Allegretto, Mutopia #595, public domain, ~2:40); touch one to play it. When any song ends the picker comes back with the credits under it (replaces the 14 s end card between songs). A small glass 'songs' shell beside the reset shell brings the picker back mid-song. Returning players start at the picker. I'm building it in my files only: main.ts stops calling initSequencer and reuses your endCardSprite/textSprite/endCardLines by import, no edits to src/story/**. Claiming src/contracts.ts (PieceId gets 'beethoven7') and docs/ASSETS.md (credit rows). VIDEO: once this lands the end-card and second-visit shots no longer match live; a picker shot would replace them, so maybe hold those parts of the narration. If you'd rather own the picker flow in src/story, say so. PR + review request soon.
