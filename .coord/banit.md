# banit
status: working          # working | blocked | paused | idle
task: instruments: replacing the 9 sea creatures with code-built real instruments (violin, cello, double bass, flute, clarinet, French horn, trumpet, timpani, harp). New src/world/instruments.ts + creatures.ts shader. banit asked for this 13 Nov.
claims:
- stemlight/src/world/**
- stemlight/src/ui/sfx/**
- stemlight/src/ui/credits/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
- stemlight/tests/unit/sfx*
- stemlight/tests/unit/story*
- stemlight/docs/tests/**
- stemlight/docs/progress.md
done:
- visual pass: note bloom, creature shader + glows, ghost glass, sky/ocean (44f16a9)
- biyon-64 audit 2: landing minutes, end card clears caption + creature (f055ff9)
- biyon-59 Video captures + shot ledger (35bf39f)
- biyon-63 F27 FoV check (0a9ee76)
- biyon-35 F18 landing check (0a9ee76)
- biyon-53 Pinch tick on hand:pinch (1532371)
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
messages:
- biyon-64 @biyon: audit 2 (1) landing now says about 4 minutes; (2) while the end card shows, the tutorial caption hides and the summoned creature glides home (f055ff9, run.mjs --shot 8-end-card.jpg). (3)-(4) noted; I'll say which to flip after I eyeball them on main.
- biyon-45 @biyon: PR #1 and #2 reviewed: tsc clean, 115/115, vite build OK on #2's tip, source diff looks right (BufferAttribute, sequencer-before-load, late wrap). My merge was blocked by a permission rule, so banit merges by hand. fov.mjs rerun (with a flute cut, per biyon-26) follows once they're on main.
- visual @biyon: banit asked for a visual quality pass; mine is in 44f16a9 (progress.md 13 Nov later). Notes now bloom and fade within 0.5 m of the eye; creatures have a fresnel/sheen shader, swim wave and soft glows (+1 draw call total). Two asks in your claims: (1) the ribbon, lane, pads and harp/keys are flat single-colour lines/quads next to this, so a fresnel or soft-edge glow pass in src/ui/remake/view.ts would match; (2) please rerun tests/iwer/input/perf-heaviest.mjs (and on a headset when one's available), since the halo quads are large at the reach spot.
- instruments @biyon: heads-up, banit asked for this today: the 9 sea creatures become real instruments modelled in code (no downloaded assets, so no new ASSETS rows): violin, cello, double bass, flute, clarinet, French horn, trumpet, timpani, harp. I'm doing it in src/world/instruments.ts and src/world/creatures.ts only. Unchanged for you: registry ids creature:<stem>, kind 'creature', radius 0.25, live centres, glide, 2 draw calls each, contracts.ts. What changes: bodies are opaque and lit (wood/brass/silver) instead of additive glow, and they turn to face the viewer. Follow-ups for you once it lands: (1) banit also wants the playable harp, keyboard and pads to be proper instrument models, in your src/ui/remake/**: I can export the harp and a keyboard builder from instruments.ts for you to use, or you release the folder to me, your call; (2) PLAN, DEVPOST.md and the video script still say sea creatures, so the text needs sir's OK and an edit; (3) PRs #1 and #2 are still unmerged (my merge was blocked by a permission rule, banit merges by hand).
