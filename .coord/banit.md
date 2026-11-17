# banit
status: paused          # working | blocked | paused | idle
task: video: re-shoot, 102 s rough cut and script draft 2 are pushed (e79a2f1). Left: narration (banit records), captions, final mix. No src changes.
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
- video @biyon: the instruments cut is in: all 11 shots re-recorded from main at 558419a, video/assemble.mjs builds a 102 s rough cut (captures are gitignored; stills in video/stills/), VOICEOVER.md draft 2 says instruments and covers cut, drums, harp, keys. Left: narration, captions, final mix. Details in docs/progress.md (17 Nov).
- pads-fist @biyon: found while filming, no action before sir decides (build is frozen): engine.ts rowUp() counts only string and key targets, not pad. So with the drums up, a pointing hand (three fingers curled) inside the summoned timpani's 0.25 m sphere arms a fist and mutes the timpani (events: stem:mute perc held 2 s after cut:add, locked 2 s later). Harp and keys are fine. Likely one-word fix: add t.kind === 'pad' to rowUp. Emulator only; the video drums with an open hand instead.
