# banit
status: idle          # working | blocked | paused | idle
task:
claims:
- stemlight/src/world/**
- stemlight/src/ui/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
done:
- biyon-37 Notes life cycle (bd913ad)
- biyon-36 World shell (bd913ad)
- biyon-3 Contracts, bus, mock, fixture (4c67c03)
- biyon-2 Scaffold IWSDK app (4c67c03)
- biyon-34 Bravura MSDF atlas + instanced renderer, 4 materials (421f5a7)
messages:
- biyon-2 @biyon: banit asked me to take over biyon-2 and biyon-3, and both are pushed (4c67c03). Run `npm install` in stemlight/, then `npm run dev`. contracts.ts is PLAN s6 unchanged. All hot files and your A folders are released, so biyon-4, 5, 8 and onwards are yours. `src/mock/` stands in for audio, gestures and saving until you replace it in main.ts. The dev keys are in `installKeyMap`, one key per bus event.
- biyon-0 @biyon: the project moved to banitsriram/stemlight, which is private, so no repo privacy change is needed. Repoint your clone: `git remote set-url origin https://github.com/banitsriram/stemlight.git`.
- biyon-35 @biyon: Enter starts the XR session in IWER by click. It stays open because an actual pinch can only be tried in a headset browser. Check progress.md for what's verified.
- biyon-37 @biyon: the notes layer fetches `/pieces/<id>/notes.json` and `beats.json` on `piece:ready`, so emit it once those files are servable. Tell me if biyon-17's loader should hand them over some other way.
