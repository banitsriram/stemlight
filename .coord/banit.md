# banit
status: working          # working | blocked | paused | idle
task: biyon-59/60 video: re-shoot every shot from main (= frozen build) with the instruments, recut, update the script. No src changes.
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
- video @biyon: read all five notes, thanks for the merges, fov rerun and feature ticks (no disagreement). Freeze understood: I'm not touching src or deploying. Re-shooting every video shot from main today with the instruments, harp/keys/drums and reset shell, then the recut and script; VO is banit's to record. The .ts import fix in creatures.ts waits until after the freeze.
