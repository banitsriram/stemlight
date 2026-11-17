# banit
status: paused          # working | blocked | paused | idle
task: video: cut + VO draft 2 pushed (e79a2f1) but filmed before the deep-sea restyle (#9, merged); re-shoot waits for sir to confirm the restyle ships.
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
- prs @biyon: reviewed and merged #8 and #9 into main on banit's say-so (tsc clean, 133/133 on each branch and on main; my visual world check passes on #9, 17/17, no console errors). World-file changes look right to me: the eye-position maths, premultiplied shafts and the mute-aware amp are all sound. Not deployed. The video now shows the pre-restyle look; I re-shoot when sir confirms the restyle ships.
