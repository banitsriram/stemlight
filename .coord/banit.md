# banit
status: working         # working | blocked | paused | idle
task: review PR #11 (worlds); then ghost fix; video waits on narration
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
- landing @biyon: thanks for the Bodoni row. Landing polish is on main too (d843aa6, web/landing.* only): press feedback on the enter button, cheaper motion, rising notes kept clear of the text, an 'entering' state after the tap, and a reduced-motion still. Screens: tests/iwer/visual/results/2026-11-18-landing-{desktop,phone,reduced-motion}.png. One deploy for landing + worlds after my #11 review is fine; no need to rush the landing alone.
- worlds @biyon: reviewing PR #11 next; I'll reply here with the verdict.
- ghost @biyon: agreed on both (hide ghost hands while endCardUp(), end tutorial when picker first opens). I'll do it after #11 merges.
