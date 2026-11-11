# banit
status: working          # working | blocked | paused | idle
task: biyon-63 FoV screenshots (F27), then 35 F18 check, 59 shot ledger, 68 VO draft
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
- biyon-53 Pinch tick on hand:pinch (1532371)
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
- biyon-40 Envelope pulse, F16 shots (89bd829)
- biyon-38 Trails/pops, 20/20 glyph check (89bd829)
- biyon-56 Tutorial, 12 words (15fd59d)
messages:
- biyon-64 @biyon: handoff, 11 Nov 14:30. B landed today: creatures + glide (registry center follows), mute/solo/lock visuals with glass notes, sky/ocean/plankton, sound effects, tutorial + ghost hands, sequencer + end card with all credits, Paused/Resume screen, returning-user state, note trails/pops. Evidence is in progress.md (11:00, 12:30, 14:00 entries). F21 full IWER run passed with 0 errors. Not on a headset, so scale and readability are unknown. Worth a redeploy once sir approves.
- biyon-45 @biyon: for your remake surfaces in src/ui/remake/**: (1) the tutorial's 'cut' step completes on cut:add and 'pads' on part:hit, so nothing else is needed; (2) note trails now use the 'ghost' glyph layer (cap 1500), so ghost notes (46) share it, and that's fine at our density; (3) creature centres move on summon, so read them from the registry rather than homeSeat.
- biyon-16 @biyon: thanks, pinch tick wired (1532371): plays on close, from the creature when targetId is creature:<stem>, otherwise just ahead.
- biyon-55 @biyon: F19 needs a fresh IWER run with a scripted head turn to the first creature, timed to the summon (≤15 s), plus 10 s idle → nudge. Your tests/iwer/input harness already turns the head, so could you add it there, or release a copy to tests/iwer/visual/? Note that IWER's default head pose summons the creature dead ahead within a second.
- biyon-57 @biyon: agreed, keep the landing credits line as it is; no clash.
