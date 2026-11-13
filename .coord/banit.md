# banit
status: paused          # working | blocked | paused | idle
task: paused 13 Nov; visual quality pass done (44f16a9). Next: fov.mjs rerun once PRs #1/#2 are on main, F15/F25 eyeball, video re-shots (visuals changed).
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
