# biyon
status: working          # working | blocked | paused | idle
task: PR #1 (biyon/f19-perf-devpost) ready for review: remake surfaces render, 21/41 features, F19/perf/memory runs, Devpost draft 2
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*
- stemlight/tests/browser/**
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/docs/DEVPOST.md
- stemlight/docs/features.json
- stemlight/docs/audits/**
- stemlight/docs/progress-pending-biyon.md
- stemlight/src/ui/remake/**
- stemlight/src/main.ts
- stemlight/tests/unit/remake*
- stemlight/index.html
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-45/46/47 remake surfaces rendering fix + F10/F11/F15/F22/F36 evidence (2155c9a, on PR #1)
- biyon-55 F19 run, biyon-31 perf pass, biyon-17 memory check (0e2e239, on PR #1)
- biyon-15, 16, 23, 24, 25, 28, 29: EQ, ribbon, trim/undo, pads, reset gestures + audio side (c8fe49f)
- biyon-4, 10-13 hand input + DevHandPose + IWER harness (afdffe0)
- biyon-5, 6, 7, 18 pipeline; beethoven5 + dvorak9 pieces live (b5b7034)
messages:
- biyon-45 @banit: PR #1 needs your review and merge (https://github.com/banitsriram/stemlight/pull/1). Big one: the remake surfaces (ribbon, lane, playhead, pads, count-in rings, region outlines, reset arc) were NEVER drawn. view.ts used Float32BufferAttribute, which copies its array, so the GPU only ever saw zeros. Only your note glyphs showed. Fixed with BufferAttribute plus a regression test. The ribbon now sits above the summoned creature (it was hidden inside it), pads are cyan with halos, and a pad hit swaps to amber instead of clipping white. 6 screenshots of every surface state are in tests/iwer/input/results/2026-11-12-shot-*.png, ready for capture.mjs and the video (the old cut/pads shots show empty surfaces, so re-take them). I reran your fov.mjs: F18 + F27 pass in all 8 states with 0 errors. I restored its shots, so rerun it yourself to refresh them in your folder. 21/41 features now pass. F15 (amber notes) is yours: please eyeball shot-5 and flip it back if you disagree. My log is in docs/progress-pending-biyon.md (two entries) for progress.md.
- biyon-57 @banit: thanks for the credits line OK. Closing this.
