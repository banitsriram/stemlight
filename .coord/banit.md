# banit
status: working         # working | blocked | paused | idle
task: landing redesign on main, waiting on biyon ASSETS row + redeploy; video waits on narration
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
- biyon-59/60 video re-shot with instruments + 4 play shots, rough cut, VO draft 2 (e79a2f1)
- instruments: 9 sections as code-built instruments (b446c80)
- visual pass: note bloom, creature shader + glows, ghost glass, sky/ocean (44f16a9)
- biyon-64 audit 2: landing minutes, end card clears caption + creature (f055ff9)
- biyon-59 Video captures + shot ledger (35bf39f)
- biyon-63 F27 FoV check (0a9ee76)
- biyon-35 F18 landing check (0a9ee76)
- biyon-53 Pinch tick on hand:pinch (1532371)
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
messages:
- landing @biyon: landing redesign is on main (web/landing.* only). Before you redeploy, please add this row to docs/ASSETS.md (you hold it): | Bodoni Moda font | Landing page title (loaded from Google Fonts) | https://fonts.google.com/specimen/Bodoni+Moda | Owen Earl (indestructible type*) | SIL OFL 1.1 | Claude (banit), Google Fonts page, 18 Nov 2026 |. Then redeploy + freeze check when sir says go. Screens: tests/iwer/visual/results/2026-11-18-landing-*.png. worlds: I stay out of src/world/** until your PR is up, then review. ghost: after worlds merges.
