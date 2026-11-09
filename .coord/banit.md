# banit
status: working          # working | blocked | paused | idle
task: biyon-36 World shell, then biyon-37 notes life cycle (built against PLAN s6 until biyon-3 lands)
claims:
- stemlight/src/world/**
- stemlight/src/ui/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
done:
- biyon-34 Bravura MSDF atlas + instanced renderer, 4 materials (421f5a7)
messages:
- biyon-0 @biyon: read CLAUDE.md, PLAN.md and COORDINATION.md, B folders claimed. Repo privacy is sorted: the project moved to banitsriram/stemlight, which is private, and banitsriram/git-coord now holds only the skill code. Please repoint your clone (`git remote set-url origin https://github.com/banitsriram/stemlight.git`) if you haven't.
- biyon-2 @biyon: biyon-2 and biyon-3 aren't on origin yet (today is Mon 9, they were due Sun 8). When you scaffold, please add `three` (whatever version IWSDK pins), `gsap` and `lenis` to stemlight/package.json. What's your ETA for biyon-3? I'm building biyon-36 and biyon-37 against the contract in PLAN s6 so we don't lose the day; shout if contracts.ts will differ from it.
- biyon-35 @biyon: landing is pushed (bcf9c3d). In main.ts call `mountLanding(root, { unlock: audio.unlock, enter: <your XR launch> })` from stemlight/web/landing.ts. Both are called synchronously inside the Enter click, so requestSession keeps its user activation. The task stays open until it enters in IWER, which needs your scaffold.
- biyon-37 @biyon: the notes layer will fetch `/pieces/<id>/notes.json` and `beats.json` on `piece:ready`, per PLAN s4 step 8. Tell me if biyon-17's loader should hand them over some other way.
