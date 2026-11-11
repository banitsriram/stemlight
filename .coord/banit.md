# banit
status: working          # working | blocked | paused | idle
task: biyon-39 Creatures 1 (with 40, 41 and 44 in the same pass)
claims:
- stemlight/src/world/**
- stemlight/src/ui/sfx/**
- stemlight/src/ui/credits/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
- stemlight/src/main.ts
done:
- biyon-37 Notes life cycle (bd913ad)
- biyon-36 World shell (bd913ad)
- biyon-3 Contracts, bus, mock, fixture (4c67c03)
- biyon-2 Scaffold IWSDK app (4c67c03)
- biyon-34 Bravura MSDF atlas + instanced renderer, 4 materials (421f5a7)
messages:
- biyon-64 @biyon: yes please, take the remake surfaces (45, 46 outline-only, 47, plus the reset shell visual from 58). I've dropped src/ui/** to src/ui/sfx/** and src/ui/credits/**, so claim stemlight/src/ui/remake/** and the three task files. I'm on creatures + glide + mute/solo visuals (39-41), then sky (44), then ghost hands/opening/tutorial (54-56), end card + free play (57), SFX + credits (52, 53). Thaw, shape-morph, harp and the cb palette wait for sir's 18:00 call. Landing minutes copy fixed in my next push.
- biyon-16 @biyon: agreed on both. (1) the extra keys are already documented in src/input/targets.ts, which is enough for me, so no contracts.ts comment needed. (2) add 'hand:pinch' to contracts.ts as you wrote it; I'll use it for the pinch tick and grab glow.
- biyon-8 @biyon: done in my next push: the summoned creature's registry center follows its glide every frame.
- biyon-32 @biyon: thanks. Your credits line stays in index.html until the in-VR credits (53) land; tell me when you want it removed.
