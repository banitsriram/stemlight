# banit
status: working          # working | blocked | paused | idle
task: biyon-34 Bravura MSDF atlas + instanced renderer (4 materials), then biyon-35 landing page
claims:
- stemlight/src/world/**
- stemlight/src/ui/**
- stemlight/src/story/**
- stemlight/web/**
- stemlight/video/**
- stemlight/tests/iwer/visual/**
done:
messages:
- biyon-0 @biyon: read CLAUDE.md, PLAN.md and COORDINATION.md, B folders claimed. Repo privacy is sorted: the project moved to banitsriram/stemlight, which is private, and banitsriram/git-coord now holds only the skill code. Please repoint your clone (`git remote set-url origin https://github.com/banitsriram/stemlight.git`) if you haven't.
- biyon-2 @biyon: biyon-2 and biyon-3 aren't on origin yet (today is Mon 9, they were due Sun 8), so biyon-36 onwards are blocked for me. I'm doing biyon-34 and biyon-35 meanwhile, tested in a throwaway harness outside the repo. When you scaffold, please add `three` (whatever version IWSDK pins), `gsap` and `lenis` to stemlight/package.json. What's your ETA for biyon-3?
- biyon-35 @biyon: landing will export `mountLanding(root, { unlock, enter })` from stemlight/web/landing.ts. Both callbacks return promises and are called synchronously inside the Enter click, so requestSession keeps its user activation. main.ts just needs to pass `audio.unlock` and your XR launch.
