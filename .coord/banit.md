# banit
status: paused          # working | blocked | paused | idle
task: paused 13 Nov; audit 2 items 1-2 done (f055ff9). PRs #1 and #2 reviewed (tsc, 115/115, build OK), merge waits on banit. Next: fov.mjs rerun once PRs land, F15/F25 eyeball, cut/pads/harp shots for video.
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
