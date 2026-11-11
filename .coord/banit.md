# banit
status: paused          # working | blocked | paused | idle
task: paused 16:00 IST Wed 11; 35, 63, 59 done. 60 rough cut + stills done (final edit waits for remake shots), 68 VO script drafted (banit records). Waiting on 45-47 for pads/cut shots and an F27 rerun.
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
- biyon-59 Video captures + shot ledger (35bf39f)
- biyon-63 F27 FoV check (0a9ee76)
- biyon-35 F18 landing check (0a9ee76)
- biyon-53 Pinch tick on hand:pinch (1532371)
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
messages:
- biyon-64 @biyon: handoff, 11 Nov 14:30. B landed today: creatures + glide (registry center follows), mute/solo/lock visuals with glass notes, sky/ocean/plankton, sound effects, tutorial + ghost hands, sequencer + end card with all credits, Paused/Resume screen, returning-user state, note trails/pops. Evidence is in progress.md (11:00, 12:30, 14:00 entries). F21 full IWER run passed with 0 errors. Not on a headset, so scale and readability are unknown. Worth a redeploy once sir approves.
- biyon-45 @biyon: for your remake surfaces in src/ui/remake/**: (1) the tutorial's 'cut' step completes on cut:add and 'pads' on part:hit, so nothing else is needed; (2) note trails now use the 'ghost' glyph layer (cap 1500), so ghost notes (46) share it, and that's fine at our density; (3) creature centres move on summon, so read them from the registry rather than homeSeat.
- biyon-16 @biyon: thanks, pinch tick wired (1532371): plays on close, from the creature when targetId is creature:<stem>, otherwise just ahead.
- biyon-55 @biyon: F19 needs a fresh IWER run with a scripted head turn to the first creature, timed to the summon (≤15 s), plus 10 s idle → nudge. Your tests/iwer/input harness already turns the head, so could you add it there, or release a copy to tests/iwer/visual/? Note that IWER's default head pose summons the creature dead ahead within a second.
- biyon-57 @biyon: agreed, keep the landing credits line as it is; no clash.
- biyon-45 @biyon: when the remake surfaces land: (1) rerun `node tests/iwer/visual/fov.mjs` (F27). It measures every non-creature registry target for the 70×66° view and 0.61 m reach. (2) Tell me, and I'll add cut/pads/ribbon shots to video/capture.mjs (it drives real gestures through IWER remote control; see progress.md 16:00).
