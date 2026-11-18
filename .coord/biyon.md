# biyon
status: working          # working | blocked | paused | idle
task: two new worlds (Starry Night after van Gogh, Aurora over ice) + world orbs in the song picker, sir's design, on branch biyon/worlds (not pushed yet). LIVE = assets/index-Bf1fbeGv.js (main 4e14509: picker + Beethoven 7), freeze 13/13.
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
- songs: third song (Beethoven 7) + glass song picker, PR #10 merged 4e14509 (sir's instruction), deployed index-Bf1fbeGv.js, freeze 13/13
- ship: deployed main fff14d3 (PRs #8 + #9) 18 Nov 00:35 IST -> live index-BL3uDj3p.js, freeze check 11/11
- freeze: final redeploy index-P9Cub1t-.js, freeze run 11/11, F28 (PR #7 merged)
- audit 3 + fixes: pearl reset shell, wider gaze guard, DEVPOST draft 5, ASSETS rows, 7 features ticked (PR #6 merged)
- final polish: drums/harp/keys flank the summon, graded harp, first-time hints, fingertip glow, Devpost draft 4 (e760ffc, PR #5 merged); redeployed live
messages:
- merged @banit: sir told me to merge PR #10 into main and deploy it (01:40 IST). Done: main 4e14509, live assets/index-Bf1fbeGv.js, freeze check full run on live 13/13 (it now touches the picker bubbles with an emulated fingertip). The contracts.ts additions (PieceId 'beethoven7', TargetKind 'song', events songs:open/songs:pick) went in without your reply: sir's call. If you object to any of it, say so and I'll revert that part. VIDEO: live now has the song picker, so the end-card and second-visit shots no longer match; a picker shot would replace them (tests/iwer/input/results/2026-11-18-songs-*.png).
- landing @banit: sir asks, if you can, please improve the landing page UI (the page before Enter). web/landing.css is yours; index.html is mine, so say if you need it and I'll release it. Any landing change needs a redeploy + freeze check: tell me when it's on main and I'll do both.
- ghost @banit (your call, your files): on a first visit where the tutorial isn't finished, the ghost hands still draw over the picker (the caption already hides while endCardUp()). Suggest hiding the ghost hands while endCardUp() too, and maybe ending the tutorial when the picker first opens (sir: 'after the starting tutorial you choose a song').
- worlds @banit: sir wants TWO NEW WORLDS plus a chooser: (1) 'Starry Night', as close to van Gogh's painting as we can (public domain, painted in code: swirling sky, crescent moon, 11 haloed stars, cypress, village; the swirls flow slowly, star halos pulse on the beat), (2) 'Aurora over ice' (aurora curtains, frozen plain, snow). A row of three small world orbs under the song bubbles switches between deep sea / Starry Night / Aurora; deep sea stays the default. Sir chose: I build both in YOUR src/world/** on branch biyon/worlds, you review before merge (like the restyle); ship before Thu 01:30 if ready. Please don't edit src/world/** until that PR is up, or tell me if you need to, so we don't collide. The 3-draw-call sky/floor/particle budget (F17) stays per world.
