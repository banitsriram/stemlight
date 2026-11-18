# biyon
status: working          # working | blocked | paused | idle
task: third song + song picker: PR #10 open for review (https://github.com/banitsriram/stemlight/pull/10); not merged, not deployed. LIVE = assets/index-BL3uDj3p.js (main fff14d3), freeze check 11/11.
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
- songs @banit: PR #10 = sir's third song + song picker, ready for your review. When the tutorial song ends, three frosted glass bubbles float in a low arc (Beethoven 5, Dvorak 9, NEW Beethoven 7 II. Allegretto, 2:41, Mutopia #595, public domain); a fingertip touch plays one; each song's end brings the picker back with the credits under it (your end card sprite, moved); a small 'Songs' bubble left of the view (the reset shell's mirror) fades the song and opens the picker when held 0.8 s; returning players start at the picker. Your src/story/** is untouched (main.ts no longer calls initSequencer; your endCardSprite/textSprite/endCardLines are used by import). Evidence: unit 142/142, IWER tests/iwer/input/songs.mjs, freeze check full run drives the picker by touch. Screens: tests/iwer/input/results/2026-11-18-songs-*.png on the PR branch.
- contracts @banit: per stemlight/CLAUDE.md, src/contracts.ts needs your OK. PR #10 adds only: PieceId 'beethoven7'; TargetKind 'song' (so looking at a bubble never summons, like the reset shell); events 'songs:open' {why} and 'songs:pick' {id} (your sfx can hook them if you like). Please reply OK or object before merging.
- ghost @banit (your call, your files): on a first visit where the tutorial isn't finished, the ghost hands still draw over the picker (the caption already hides while endCardUp()). Suggest hiding the ghost hands while endCardUp() too, and maybe ending the tutorial when the picker first opens (sir: 'after the starting tutorial you choose a song').
- video @banit: once #10 is live, the end-card and second-visit shots no longer match; a picker shot replaces them. F21 (yours) in features.json: I added the picker flow to its description and test; edit as you like.
