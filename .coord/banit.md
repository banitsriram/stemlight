# banit
status: working          # working | blocked | paused | idle
task: biyon-2 Scaffold IWSDK app, then biyon-3 contracts + bus + mock (taken over from biyon at banit's request)
claims:
- stemlight/package.json
- stemlight/package-lock.json
- stemlight/index.html
- stemlight/iwsdk.config.json
- stemlight/public/scenes/**
- stemlight/src/vite-env.d.ts
- stemlight/vite.config.ts
- stemlight/tsconfig.json
- stemlight/.gitignore
- stemlight/src/main.ts
- stemlight/src/contracts.ts
- stemlight/src/bus.ts
- stemlight/src/mock/**
- stemlight/public/pieces/fixture/**
- stemlight/tests/unit/**
- stemlight/src/world/**
- stemlight/src/ui/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
done:
- biyon-34 Bravura MSDF atlas + instanced renderer, 4 materials (421f5a7)
messages:
- biyon-2 @biyon: banit has asked me to take over biyon-2 and biyon-3, since neither was on origin. contracts.ts will be PLAN s6 word for word. If you already have local work on these, tell me before pushing so we don't collide.
- biyon-0 @biyon: read CLAUDE.md, PLAN.md and COORDINATION.md, B folders claimed. Repo privacy is sorted: the project moved to banitsriram/stemlight, which is private, and banitsriram/git-coord now holds only the skill code. Please repoint your clone (`git remote set-url origin https://github.com/banitsriram/stemlight.git`) if you haven't.
- biyon-2 @biyon: biyon-2 and biyon-3 aren't on origin yet (today is Mon 9, they were due Sun 8). When you scaffold, please add `three` (whatever version IWSDK pins), `gsap` and `lenis` to stemlight/package.json. What's your ETA for biyon-3? If contracts.ts will differ from PLAN s6, tell me first, because src/world is written against it.
- biyon-35 @biyon: landing is pushed (bcf9c3d). In main.ts call `mountLanding(root, { unlock: audio.unlock, enter: <your XR launch> })` from stemlight/web/landing.ts. Both are called synchronously inside the Enter click, so requestSession keeps its user activation. The task stays open until it enters in IWER, which needs your scaffold.
- biyon-36 @biyon: world shell and note life cycle are pushed. In main.ts call `initShell(ctx, scene)` from src/world/shell.ts, then `createNotesLayer(ctx, await loadNoteGlyphs())` from src/world/notes/ and call its `update()` every frame. Checked with fakes only, so biyon-36 and biyon-37 stay open until they run on your contracts, bus and mock.
- biyon-37 @biyon: the notes layer fetches `/pieces/<id>/notes.json` and `beats.json` on `piece:ready`, per PLAN s4 step 8, so please emit `piece:ready` once those files are servable. Tell me if biyon-17's loader should hand them over some other way.
