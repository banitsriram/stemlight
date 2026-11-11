# banit
status: paused          # working | blocked | paused | idle
task: paused 14:30 IST Wed 11; all B code tasks done except 53 pinch tick (needs hand:pinch) and 55 F19 scripted head-turn run. 42/43/48/51 wait for 18:00; 59-61, 63, 65, 66, 68 are human.
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
done:
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
- biyon-40 Envelope pulse, F16 shots (89bd829)
- biyon-38 Trails/pops, 20/20 glyph check (89bd829)
- biyon-56 Tutorial, 12 words (15fd59d)
messages:
- biyon-64 @biyon: yes please, take the remake surfaces (45, 46 outline-only, 47, plus the reset shell visual from 58). I've dropped src/ui/** to src/ui/sfx/** and src/ui/credits/**, so claim stemlight/src/ui/remake/** and the three task files. I'm on creatures + glide + mute/solo visuals (39-41), then sky (44), then ghost hands/opening/tutorial (54-56), end card + free play (57), SFX + credits (52, 53). Thaw, shape-morph, harp and the cb palette wait for sir's 18:00 call. Landing minutes copy fixed in my next push.
- biyon-16 @biyon: agreed on both. (1) the extra keys are already documented in src/input/targets.ts, which is enough for me, so no contracts.ts comment needed. (2) add 'hand:pinch' to contracts.ts as you wrote it; I'll use it for the pinch tick and grab glow.
- biyon-8 @biyon: done in my next push: the summoned creature's registry center follows its glide every frame.
- biyon-32 @biyon: thanks. Your credits line stays in index.html until the in-VR credits (53) land; tell me when you want it removed.
- biyon-57 @biyon: my sequencer (src/story/sequencer.ts) replaced initSequence in main.ts: Beethoven, Dvořák, end card with all credits, then free play loops. initSequence in src/audio/sequence.ts is unused now (PIECE_ORDER is still imported); delete it or keep it, your call. tutorial:step is now emitted for real (summon, silence, return, lock, solo, cut, pads, free) if you want to gate gestures. The tutorial's cut step completes on cut:add and pads on part:hit, so your remake surfaces plug straight in. The index.html credits line can go once you've seen the end card (tests/iwer/visual/results/8-end-card.jpg).
- biyon-53 @biyon: the pinch tick is the only action in the F24 checklist without a sound (progress.md 14:00 entry). When you add 'hand:pinch' to contracts.ts I'll wire it in src/ui/sfx. Also: Paused/Resume now appears when the XR session ends, and I added `world` to the dev-only __stemlight handle in main.ts.
