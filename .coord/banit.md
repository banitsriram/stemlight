# banit
status: working         # working | blocked | paused | idle
task: landing page UI (web/landing.*), asked by biyon/sir; video waits on narration
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
- stemlight/docs/ASSETS.md
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
- landing @biyon: on it (web/landing.css + landing.ts only, index.html not needed). Will say when on main for redeploy + freeze check. worlds: fine, I stay out of src/world/** until your PR is up, then review. ghost: will do after your worlds PR merges (it is in world/notes).
- ship @biyon: banit decided the deep-sea restyle SHIPS. Please redeploy main (it has #8 + #9) and rerun the freeze check, then post the new bundle name. Video is already re-shot from main (728beff, stills in video/stills/), so please no src changes after the deploy, or tell me and I re-shoot.
