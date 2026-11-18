# biyon
status: working          # working | blocked | paused | idle
task: LIVE = assets/index-CwPwIwlo.js (main d8a4cce: worlds + passthrough + lobby + ghost fix), freeze check 14/14. Idle unless sir asks.
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
- ghost @banit: done and live (d8a4cce, src/story/index.ts + tutorial.ts on sir's instruction): the song picker ends the tutorial (tutorial.finish(), saved as done) and the ghost hands hide while it's up. LIVE = assets/index-CwPwIwlo.js, freeze check 14/14. Your ghost task is off your list; please pull before touching src/story.
- shipped @banit: on sir's explicit instruction I merged #11 (worlds) and #12 (passthrough + landing button + blank picker lobby) and deployed main with your landing redesign: LIVE = assets/index-b9bydckm.js, full freeze check 14/14 (backup of the previous deploy kept). Sir also said to commit past your src/world claim (creatures.ts/shell.ts/worlds.ts got small hide() hooks for the lobby); no clash: you had no new commits on main. New in the picker: a blank slate-teal lobby (world, seat, creatures, notes hidden), songs near eye level, orbs below. Please pull before your ghost-hands fix; if you re-shoot, the picker looks different now.
- worlds-pr @banit: PR #11 is up: the two new worlds sir asked for plus world orbs in the song picker. It touches your src/world/** (deepsea.ts palette -> shared uniforms SEA_UNIFORMS, sky.ts as the sea world, new worldList.ts, worlds.ts, starry.ts, aurora.ts; shell.ts/creatures.ts spread the uniforms), so your review decides the merge. contracts.ts unchanged. Starry Night was rebuilt twice on sir's feedback: final look = stylised cartoon after the reference he chose (comma-stroke sky, pale teal cottages 9-16 m round you, open ahead). A review agent's 5 important findings are fixed. Evidence: unit 159/159, shaders 36/36 (normal+multiview), IWER songs 10/10, orbs 7/7, perf 5/5 in every world (peak 64 calls), local freeze check all pass. Stills: tests/iwer/input/results/2026-11-18-world-*.png on the branch. The deep sea stays the default, so the video's look is unchanged; a short orb shot would show the worlds.
- landing @banit: thanks for the redesign. The Bodoni Moda row is in docs/ASSETS.md on the worlds branch (PR #11). I plan one deploy for your landing + the worlds once you've reviewed #11, on sir's go; if you want the landing live sooner, tell me and I'll ask sir.
- ghost @banit (your call, your files): on a first visit where the tutorial isn't finished, the ghost hands still draw over the picker (the caption already hides while endCardUp()). Suggest hiding the ghost hands while endCardUp() too, and maybe ending the tutorial when the picker first opens (sir: 'after the starting tutorial you choose a song').
