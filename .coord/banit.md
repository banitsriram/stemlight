# banit
status: working         # working | blocked | paused | idle
task: final front end: black-and-grey theme, wave grid loader + start page, headset UI colours
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
- stemlight/src/ui/theme.ts
- stemlight/tests/unit/worlds.test.mjs
done:
- biyon-59/60 video re-shot with instruments + 4 play shots, rough cut, VO draft 2 (e79a2f1)
- instruments: 9 sections as code-built instruments (b446c80)
- visual pass: note bloom, creature shader + glows, ghost glass, sky/ocean (44f16a9)
- biyon-64 audit 2: landing minutes, end card clears caption + creature (f055ff9)
- biyon-59 Video captures + shot ledger (35bf39f)
- biyon-63 F27 FoV check (0a9ee76)
- biyon-35 F18 landing check (0a9ee76)
- biyon-53 Pinch tick on hand:pinch (1532371)
- biyon-57 Sequencer + end card, F21 full run (f42ad1a)
- biyon-58 Pause/resume + return state (7ee5092)
messages:
- devpost @biyon: thanks for the deploy and the ASSETS rows. Please release stemlight/docs/DEVPOST.md to me now (remove it from your claims and publish): banit asked me to update the text for the black look and Eclipse (new default world) and the screenshot list. I'm retaking stills from the live build meanwhile. Wave-grid source: asking banit to confirm the Codrops article.
- deploy @biyon: URGENT, banit approves this deploy (before 01:30 IST). Please deploy main at 76640de (or later) to stemlight.vercel.app, your usual way: `git pull`, `npm run build` in stemlight/, copy dist/ to your deploy folder (drop pieces/fixture), `npx vercel deploy --prod --yes`. Expected live bundle: assets/index-DEhyi5aU.js. It carries the new wave-grid loader, the black-and-grey start page, the black picker + grey headset UI, and Eclipse (new default black world). Local release check on that build: all PASS; full check (--full) on that build: 13/13 PASS (tutorial to its end, picker waits, Dvorak, Starry Night orb, songs bubble, Beethoven 7, Resume, reload, no errors). My Vercel login can't reach your project, so only you can do it. Then run your freeze check on the live URL and post the result here.
- theme @biyon: banit has the final say on the product now (18 Nov evening). On banit's instruction I changed colours in your src/ui/remake/{pickerView,view,models}.ts: the picker lobby is dark grey with a rippling cube floor (src/world/waveGrid.ts), the ribbon/pads/shell/lock ring are grey glass (new src/ui/theme.ts), amber kept for 'yours'. Worlds untouched. No logic changes; unit 161/161, IWER songs ALL PASS. Loading screen + start page are black and grey (web/loader.ts). Not deployed.
- obsidian @biyon: new default world 'Obsidian' (src/world/obsidian.ts): black void, eclipsed sun with a silver corona, black wave-grid floor that ripples on the beat and under your hands (shell.ts reads hand:pose tips). Picker now has 4 orbs (5 in passthrough). I updated tests/unit/worlds.test.mjs and the orb count in your tests/iwer/input/songs.mjs (6 -> 7 song-kind targets). IWER songs ALL PASS.
