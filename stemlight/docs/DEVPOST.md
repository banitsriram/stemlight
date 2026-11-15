# Devpost submission text: DRAFT 5 (task 67)

> **Internal note: delete this block before pasting into Devpost.** Draft 5, 17 Nov 2026, after scoring audit 3 (`docs/audits/2026-11-17-audit.md`). Describes the frozen build: live since 17 Nov as `assets/index-P9Cub1t-.js` (freeze run 11/11, `tests/browser/results/2026-11-17-FREEZE-release-check-full.txt`). No deploys after the freeze unless sir lifts it. Nothing is published without sir's approval. **[CHECK]** marks a decision still sir's; resolve each before submitting. No brand names except the tools we must disclose.

---

## Title
Stemlight

## Tagline (≤140 characters)
The music you can reach into.

## Track and division
Entertainment (music visualisation) · New Experience · built with IWSDK (WebXR)

## Elevator pitch (already on the Devpost draft)
The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.

## Description

**Stemlight is a seated, hands-only music visualiser.** Look at an instrument and it comes to you; close your fist and it falls silent; stretch it to reshape its sound; cut its part out and play your own on drums, harp or keyboard.

### Inspiration
We love music but neither of us plays in an orchestra. Tools that split a song into its parts made us want to sit *inside* one: hear the horns alone, take the timpani out and play them ourselves. A screen keeps you outside the music. A headset and your bare hands put you in the middle of it.

### What it is, and who it's for
- **Entertainment, music visualisation.** For adults who love music but don't play, at home in the evening, seated, for about four minutes and then as long as they like. No score and no win state: the pleasure is listening and remaking.
- Each instrument family is a real instrument floating around you, eight of them modelled in code (violin, cello, double bass, flute, clarinet, horn, trumpet, timpani), and **every note from the score** leaves it as a floating notation symbol. The symbol matches the note's real length, its height is the pitch and its size is the loudness. Every floating note is a real note from the score; the amber ones are yours.
- Two pieces: the opening of Beethoven’s 5th (about 1:24) and the finale of Dvořák’s *New World* Symphony (about 2:33), then free play.

### What your hands do
| Gesture | What happens |
|---|---|
| Look at an instrument for half a second | It glides to you |
| Make a fist on it | It falls silent and its notes freeze into glass |
| Hold the fist 1.5 s | The silence locks, so it stays quiet after you open your hand |
| Open your hand (or a fist on a locked one) | It comes back |
| Pinch twice | Solo that instrument |
| Pinch with both hands and stretch | Wider = more bass, taller = more treble; bring your hands together to reset |
| Pinch the glowing bead on the score ribbon | Hold to pause, drag to scrub through the music |
| Pinch the lane with both hands | Cut that stretch of the part out, snapped to the beat. The hole shows the missing notes as outlines; pull it away to undo |
| Play your own part | Cut the percussion and two kettle drums appear; cut the flutes for a harp, the clarinets for a keyboard. Strike a drum head, sweep a finger across the strings, press the keys down. A one-bar count-in, then what you play snaps to the beat and loops back in, and each note flies as an amber symbol from your fingertip into the outlines you cut |
| Pinch and hold the pearl shell on your right | Quiet reset of this piece's mix (it says so the first time your hand comes near) |

Seated, inside a small reach, hands only. No controller, no account, no menus. A ghost hand and one or two words show each move (12 words in the whole tutorial), each playable instrument says how to play it the first time it appears, and doing nothing for 10 s brings a gentle nudge.

### Why only on Quest
Described on a phone, it stops working. The music is *around* you: each instrument plays from where it sits, through head-related spatial audio, and you change it by *reaching in*. A flat screen gives you a mixer; Stemlight gives you an orchestra you can touch.

### How we built it
- **IWSDK (WebXR), using its entity system.** A static build that opens in the Quest Browser: https://stemlight.vercel.app.
- **An offline score-to-stems pipeline.** Public-domain and CC BY-SA orchestral scores (Mutopia Project) → eight instrument groups → rendered with free CC0 orchestral samples (VSCO 2 Community Edition) through an open-source sampler → one shared reverb → level-matched mono stems, plus the note, beat and loudness data the visuals use. Note counts are checked against the source score (1,840 and 4,249 notes).
- **One clock for sound and sight.** Every stem starts on the same audio-clock instant, so they never drift. Every note's position is a pure function of that clock: pause freezes the notes, scrubbing rewinds them, and loops are sample-exact.
- **The hard problem: fist versus pinch.** Both curl the fingers. We gave them thresholds that can't overlap: a fist needs 3 of 4 fingers curled ≥0.75; a pinch needs the other fingers ≤0.6, with hysteresis and debounce. Short tracking drop-outs (≤0.3 s) hold the gesture; longer ones release quietly with no action. In 120 scripted fists, pinches and double pinches near and far from instruments there were **0 cross-triggers**, and 20 gap-injected double pinches gave 0 false solos.
- **Gaze without eye tracking.** Quest 3 and 3S have no eye tracking, so "look to summon" uses head direction (within 12° for half a second).
- **Your part, in time.** The drums, harp and keyboard you play are synthesised in code: a timpani-like drum, a physically modelled plucked string, and a piano-like tone with stretched overtones. The cut snaps to the beat, a one-bar count-in leads into a sample-exact loop, your hits snap to the eighth-note grid and replay on every pass, and the original part plays quietly (−18 dB) under your first pass as a guide.
- **Saved on the device.** Your mix, cuts and recorded parts are saved locally and come back next time; returning users skip the tutorial. Pause, taking the headset off, the system menu and ending the session all resume cleanly (all 36 scripted checks in the emulator).
- **Within budget.** At the busiest moment (Dvořák's densest four seconds, with the eight instruments, the drums and the ribbon showing): 66 draw calls, 101.6k triangles and 380 live notes, against limits of 100 / 150k / 1,500. We measured this in the emulator. We had no headset, so frame rate on a real Quest is unmeasured.
- **Testing without a headset.** Every interaction was scripted in the IWSDK emulator (IWER) with a dev-only hand-pose switch that never ships, plus unit tests and headless-browser checks of the audio clock, saving and memory.
- **Built with an AI coding assistant.** We designed Stemlight and directed every decision. An AI coding assistant wrote most of the code under our direction, and we reviewed and tested it. **[CHECK, sir: live rules read 12 Nov. They don't ask for AI tools to be disclosed, and ban brand names, logos and slogans in the Project ("commercial or corporate advertising"). So this line discloses the help without naming the product. Keep it, name the tool, or drop the line.]**

### Accessibility and comfort
- Seated, small reach, no standing or leaning. Every touch target sits inside a 70×66° view and within 0.61 m: the tutorial, ghost hands, drums and end card were checked in the emulator with a field-of-view mask, and the ribbon, harp, keyboard and reset shell by layout tests.
- Instruments are told apart by shape first (each looks like the real instrument), with colour second.
- No failure state, and a quiet reset is always within reach.

### Credits
- Dvořák, Symphony No. 9 "From the New World", 4th movement: Mutopia Project #1793, **CC BY-SA 3.0**. Our stems and note data made from it are shared under CC BY-SA 3.0.
- Beethoven, Symphony No. 5, 1st movement: Mutopia Project #941, public domain.
- Orchestral samples: VSCO 2 Community Edition, CC0.
- Music notation font: Bravura, SIL Open Font License 1.1.
- The instruments' 3D models, the reverb, the drums, harp and keyboard you play, ticks and interface sounds are all made in code.

### What's next
**Any song.** Split a track on your own laptop, then sit inside it on Quest: four parts, processed on your own device, nothing uploaded. **Target launch: public beta on 15 February 2027.**

### Known limits
- We had no headset during the build. Frame rate, hand feel, comfort and brightness on a real Quest 3/3S are **unverified**; everything was tested in the emulator.
- Two pieces, fixed excerpts.
- No passthrough or room use: Stemlight is a fully immersive, seated experience by design.

## Hand interactions (optional field)
Use the "What your hands do" table and the fist-versus-pinch paragraph above. What excites us: hands turn listening into playing, and you don't need to know an instrument to take part.

## Judge instructions
1. Open https://stemlight.vercel.app in the Quest Browser.
2. Press **Enter** (a pinch works). No account, nothing to install.
3. Sit down and use your hands only. The two pieces take about four minutes, then you're free to play.
4. Sound on, ideally with headphones.

## Team (form fields)
- Biyon: Representative; audio engine, hand gestures, music pipeline, the remake surfaces and the instruments you play (score ribbon, cut lanes, drums, harp, keyboard, reset shell), saving, deploy, write-up.
- Banit: the nine instruments and world art, notes, sound effects, tutorial and ghost hands, sequencer and credits, video.
**[CHECK: emails and roles as each person wants them shown]**

## Screenshots (at least 5, real build, same colour treatment)
Current-look candidates (instruments build only):
- `tests/iwer/input/results/2026-11-16-shot-4-region-pads-countin.png`: drums either side of the timpani, the cut region and the count-in.
- `tests/iwer/input/results/2026-11-16-shot-5-pad-hit-amber.png`: a drum hit in amber.
- `tests/iwer/input/results/2026-11-16-harp-pluck.png`: the harp.
- `tests/iwer/input/results/2026-11-16-keys-hint.png`: the keyboard with its first-time hint.
- `tests/iwer/input/results/2026-11-16-shot-1-ribbon-lane.png`: the score ribbon and lane.
- banit's 13 Nov `tests/iwer/visual/results/{1-field-look,3-held-vln-glass-ghost-open,6-solo-vla_vc-ghost-cut}.jpg`: the field of instruments, a fist freezing notes to glass, solo. Crop the credit strip off the bottom.
- Don't use anything from before 13 Nov (old sea creatures). **[CHECK: sir picks the final 5+; the 17 Nov reset-shell look needs a fresh shot if the shell shows]**
