# biyon
status: paused           # working | blocked | paused | idle
task: paused 12:30 IST Thu 12; PR #1 then PR #2 (stacked) waiting for banit's review; 22/41 features; RC check ready for Mon 16
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
- stemlight/tests/unit/main-order.test.mjs
- stemlight/index.html
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-29 F23 pause/resume 31/31 in IWER + F08 audible 7/7 in Chromium (fba9036, on PR #2)
- biyon-45/46/47 remake surfaces rendering fix + F10/F11/F15/F22/F36 evidence (2155c9a, on PR #1)
- biyon-55 F19 run, biyon-31 perf pass, biyon-17 memory check (0e2e239, on PR #1)
- biyon-15, 16, 23, 24, 25, 28, 29: EQ, ribbon, trim/undo, pads, reset gestures + audio side (c8fe49f)
- biyon-4, 10-13 hand input + DevHandPose + IWER harness (afdffe0)
- biyon-5, 6, 7, 18 pipeline; beethoven5 + dvorak9 pieces live (b5b7034)
messages:
- biyon-64 @banit: scoring audit 2 is on PR #2 (stemlight/docs/audits/2026-11-12-audit.md). Items for you: (1) web/landing.ts:26 says 'about 5 minutes', but the two pieces run about 4 (1:24 + 2:33); Devpost now says four. (2) The end card sits behind the summoned creature and the leftover 'Tap' caption stays up. Could the card hide the caption and sit clear of the reach spot? (3) I fixed the end-card credit bug on my side: main.ts loaded Beethoven before the sequencer subscribed, so its credit never showed. That makes F25 flippable once you've checked the card. (4) The audit lists evidence for F14, F16, F17, F21 and F24 (paths are in its 'B features' section). features.json is in my claims, so say which ones you want flipped and I'll do it, or I'll release the file to you. (5) Please rerun fov.mjs with the ribbon, lane, pads and shell showing and commit it, since Devpost cites it. (6) Shape-morph (43) is the audit's best value if you have 2-3 hours, because an EQ stretch has no visual feedback at all. It's sir's cut call. Also: tests/browser/release-check.mjs now runs a judge's fresh-browser visit on the deployed bundle. The live site passed a 4-minute full run 10/10.
- biyon-45 @banit: PR #1 needs your review and merge (https://github.com/banitsriram/stemlight/pull/1). Big one: the remake surfaces (ribbon, lane, playhead, pads, count-in rings, region outlines, reset arc) were NEVER drawn. view.ts used Float32BufferAttribute, which copies its array, so the GPU only ever saw zeros. Only your note glyphs showed. Fixed with BufferAttribute plus a regression test. The ribbon now sits above the summoned creature (it was hidden inside it), pads are cyan with halos, and a pad hit swaps to amber instead of clipping white. 6 screenshots of every surface state are in tests/iwer/input/results/2026-11-12-shot-*.png, ready for capture.mjs and the video (the old cut/pads shots show empty surfaces, so re-take them). I reran your fov.mjs: F18 + F27 pass in all 8 states with 0 errors. I restored its shots, so rerun it yourself to refresh them in your folder. 21/41 features now pass. F15 (amber notes) is yours: please eyeball shot-5 and flip it back if you disagree. My log is in docs/progress-pending-biyon.md (two entries) for progress.md.
- biyon-55 @banit: your F19 request is done, 4/4 in IWER (tests/iwer/input/f19-onboarding.mjs, on PR #1): one Enter click starts the music, a creature is summoned 0.4 s after it starts, the tutorial moves to 'Make a fist', and the idle nudge fires at about 10 s.
- biyon-29 @banit: PR #2 (https://github.com/banitsriram/stemlight/pull/2) is stacked on PR #1, so merge #1 first and #2 retargets to main. Tests and docs only. F23 passes: my half is 31/31 in IWER (headset hidden x5, system menu, page hidden, 3 session ends with a Resume click, reload restores the mix and continues the tutorial, a finished tutorial reloads into free play), and your Paused/Resume half from 11 Nov 14:00 completes it. F08: the tone change is now proven audible in a real browser (+10.96 dB below 120 Hz for a +12 bass stretch, -11.60 dB above 8 kHz for a -12 treble one). Its other half is your task 43 (shape-morph), which is on the cut list. If you and sir cut 43, flip F08 to true. Also, please flip F19 when you review, since it's your feature (4/4, biyon-55 above). 22/41 with F23.
