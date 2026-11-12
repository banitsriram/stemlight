# biyon
status: paused           # working | blocked | paused | idle
task: paused 00:20 IST Fri 13; PR #1 then PR #2 (stacked) waiting for banit's review; 24/41 features; harp + keyboard now on PR #2; RC check ready for Mon 16
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
- biyon-26, 27 harp + keyboard: logic and plain visuals, F12/F13 pass in IWER 25/25 (2dcdc84, on PR #2)
- biyon-29 F23 pause/resume 31/31 in IWER + F08 audible 7/7 in Chromium (fba9036, on PR #2)
- biyon-45/46/47 remake surfaces rendering fix + F10/F11/F15/F22/F36 evidence (2155c9a, on PR #1)
- biyon-55 F19 run, biyon-31 perf pass, biyon-17 memory check (0e2e239, on PR #1)
- biyon-15, 16, 23, 24, 25, 28, 29: EQ, ribbon, trim/undo, pads, reset gestures + audio side (c8fe49f)
messages:
- biyon-26 @banit: harp and keyboard are built and on PR #2 (2dcdc84); F12 and F13 pass, 24/41. Sir asked me to keep them. (1) A flute cut now gives an 8-string harp and a reed cut an 8-key keyboard: logic in src/input/engine.ts, plain line and quad visuals in src/ui/remake/. That meets the acceptance of your tasks 48 and 49 (screenshots tests/iwer/input/results/2026-11-13-harp-pluck.png and -keys-press.png, plus registry targets), so I left them open as optional polish: close them or restyle, and say if you want the claim. Known look issue: the harp stands in front of the summoned creature and overlaps it. (2) Both manifests now have replace = perc:pads, fl:harp, reeds:keys. So a flute or reed cut starts a take (count-in, loop) instead of a plain trim. If capture.mjs or a visual test cuts fl or reeds for a trim shot, use vln, vla_vc, cb, hn or brass. (3) Targets of kind 'string' and 'key' carry extra: pitch, nx/ny/nz (the row's right vector), halfLength, depthTol, halfW, halfD. contracts.ts is unchanged. (4) I did not run tests/iwer/visual/fov.mjs: it starts its own vite and writes into your docs/tests/fov. My unit test puts all 8 strings and 8 keys inside 70x66 degrees and 0.61 m (tests/unit/remake-instruments.test.mjs). Please rerun fov.mjs with a flute cut when you're back. (5) Audio engine: a frame stall longer than the 0.25 s wrap window used to end a take's loop silently; it now wraps late. New video shots available: harp and keyboard, via real gestures in tests/iwer/input/harp-keys.mjs.
- biyon-64 @banit: scoring audit 2 is on PR #2 (stemlight/docs/audits/2026-11-12-audit.md). Items for you: (1) web/landing.ts:26 says 'about 5 minutes', but the two pieces run about 4 (1:24 + 2:33); Devpost now says four. (2) The end card sits behind the summoned creature and the leftover 'Tap' caption stays up. Could the card hide the caption and sit clear of the reach spot? (3) I fixed the end-card credit bug on my side: main.ts loaded Beethoven before the sequencer subscribed, so its credit never showed. That makes F25 flippable once you've checked the card. (4) The audit lists evidence for F14, F16, F17, F21 and F24 (paths are in its 'B features' section). features.json is in my claims, so say which ones you want flipped and I'll do it, or I'll release the file to you. (5) Please rerun fov.mjs with the ribbon, lane, pads and shell showing and commit it, since Devpost cites it. (6) Shape-morph (43) is the audit's best value if you have 2-3 hours, because an EQ stretch has no visual feedback at all. It's sir's cut call. Also: tests/browser/release-check.mjs now runs a judge's fresh-browser visit on the deployed bundle. The live site passed a 4-minute full run 10/10.
- biyon-45 @banit: PR #1 needs your review and merge (https://github.com/banitsriram/stemlight/pull/1). Big one: the remake surfaces (ribbon, lane, playhead, pads, count-in rings, region outlines, reset arc) were NEVER drawn. view.ts used Float32BufferAttribute, which copies its array, so the GPU only ever saw zeros. Only your note glyphs showed. Fixed with BufferAttribute plus a regression test. The ribbon now sits above the summoned creature (it was hidden inside it), pads are cyan with halos, and a pad hit swaps to amber instead of clipping white. 6 screenshots of every surface state are in tests/iwer/input/results/2026-11-12-shot-*.png, ready for capture.mjs and the video (the old cut/pads shots show empty surfaces, so re-take them). I reran your fov.mjs: F18 + F27 pass in all 8 states with 0 errors. I restored its shots, so rerun it yourself to refresh them in your folder. 21/41 features now pass. F15 (amber notes) is yours: please eyeball shot-5 and flip it back if you disagree. My log is in docs/progress-pending-biyon.md (two entries) for progress.md.
- biyon-55 @banit: your F19 request is done, 4/4 in IWER (tests/iwer/input/f19-onboarding.mjs, on PR #1): one Enter click starts the music, a creature is summoned 0.4 s after it starts, the tutorial moves to 'Make a fist', and the idle nudge fires at about 10 s.
- biyon-29 @banit: PR #2 (https://github.com/banitsriram/stemlight/pull/2) is stacked on PR #1, so merge #1 first and #2 retargets to main. Tests and docs only. F23 passes: my half is 31/31 in IWER (headset hidden x5, system menu, page hidden, 3 session ends with a Resume click, reload restores the mix and continues the tutorial, a finished tutorial reloads into free play), and your Paused/Resume half from 11 Nov 14:00 completes it. F08: the tone change is now proven audible in a real browser (+10.96 dB below 120 Hz for a +12 bass stretch, -11.60 dB above 8 kHz for a -12 treble one). Its other half is your task 43 (shape-morph), which is on the cut list. If you and sir cut 43, flip F08 to true. Also, please flip F19 when you review, since it's your feature (4/4, biyon-55 above). 22/41 with F23.
