# Devpost submission text: DRAFT 5 (task 67)

> **Internal note: delete this block before pasting into Devpost.** Final text, 18 Nov 2026. Describes the live build `assets/index-CwPwIwlo.js` (full freeze check 14/14, `tests/browser/results/2026-11-18-release-check-stemlight.vercel.app-full.txt`). Do not deploy after the deadline (Thu 19 Nov 01:30 IST). The hand-off for banit is `docs/audits/2026-11-18-submission-handoff.md`.

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
- Three songs. The opening of Beethoven’s 5th (about 1:24) carries the short tutorial. When it ends, you move to a calm, empty space where a glass bubble for each song floats in reach: touch one to play the finale of Dvořák’s *New World* Symphony (about 2:33), the Allegretto of Beethoven’s 7th (about 2:41), or the 5th again. Each song's end brings the bubbles back, and a small songs bubble beside the reset shell switches songs mid-way.
- Three worlds to sit in, chosen with a row of small glass orbs under the song bubbles (the chosen world appears as the song starts): the deep sea, a stylised, cartoon-shaded **Starry Night** laid out after van Gogh's 1889 canvas (a village of outlined cottages round you, brush-stroke swirls that flow slowly, stars whose rings swell with the beat), and **Aurora over ice**. The instruments take on each world's light.
- **Passthrough:** on headsets that support it, a second button on the start page, *Enter in passthrough*, plays Stemlight in your own room. The instruments and notes float around you there, and a fourth orb lets you switch between your room and the three worlds.

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
- **An offline score-to-stems pipeline.** Public-domain and CC BY-SA orchestral scores (Mutopia Project) → eight instrument groups → rendered with free CC0 orchestral samples (VSCO 2 Community Edition) through an open-source sampler → one shared reverb → level-matched mono stems, plus the note, beat and loudness data the visuals use. Note counts are checked against each source score.
- **One clock for sound and sight.** Every stem starts on the same audio-clock instant, so they never drift. Every note's position is a pure function of that clock: pause freezes the notes, scrubbing rewinds them, and loops are sample-exact.
- **The hard problem: fist versus pinch.** Both curl the fingers. We gave them thresholds that can't overlap: a fist needs 3 of 4 fingers curled ≥0.75; a pinch needs the other fingers ≤0.6, with hysteresis and debounce. Short tracking drop-outs (≤0.3 s) hold the gesture; longer ones release quietly with no action. In 120 scripted fists, pinches and double pinches near and far from instruments there were **0 cross-triggers**, and 20 gap-injected double pinches gave 0 false solos.
- **Gaze without eye tracking.** Quest 3 and 3S have no eye tracking, so "look to summon" uses head direction (within 12° for half a second).
- **Your part, in time.** The drums, harp and keyboard you play are synthesised in code: a timpani-like drum, a physically modelled plucked string, and a piano-like tone with stretched overtones. The cut snaps to the beat, a one-bar count-in leads into a sample-exact loop, your hits snap to the eighth-note grid and replay on every pass, and the original part plays quietly (−18 dB) under your first pass as a guide.
- **Saved on the device.** Your mix, cuts and recorded parts are saved locally and come back next time; returning users skip the tutorial. Pause, taking the headset off, the system menu and ending the session all resume cleanly (all 36 scripted checks in the emulator).
- **Within budget.** At the busiest moment (Dvořák's densest four seconds, with the eight instruments, the drums, the ribbon and the songs bubble showing): 64 draw calls, 101.7k triangles and 380 live notes, against limits of 100 / 150k / 1,500. We measured this in the emulator. We had no headset, so frame rate on a real Quest is unmeasured.
- **Testing without a headset.** Every interaction was scripted in the IWSDK emulator (IWER) with a dev-only hand-pose switch that never ships, plus unit tests and headless-browser checks of the audio clock, saving and memory.
- **Built with an AI coding assistant.** We designed Stemlight and directed every decision. An AI coding assistant wrote most of the code under our direction, and we reviewed and tested it.

### Accessibility and comfort
- Seated, small reach, no standing or leaning. Every touch target sits inside a 70×66° view and within 0.61 m: the tutorial, ghost hands, drums and end card were checked in the emulator with a field-of-view mask, and the ribbon, harp, keyboard, reset shell and song bubbles by layout tests.
- Instruments are told apart by shape first (each looks like the real instrument), with colour second.
- No failure state, and a quiet reset is always within reach.

### Credits
- Dvořák, Symphony No. 9 "From the New World", 4th movement: Mutopia Project #1793, **CC BY-SA 3.0**. Our stems and note data made from it are shared under CC BY-SA 3.0.
- Beethoven, Symphony No. 5, 1st movement: Mutopia Project #941, public domain.
- Beethoven, Symphony No. 7, 2nd movement: Mutopia Project #595, public domain.
- Starry Night world: after Vincent van Gogh, *The Starry Night* (1889), public domain; painted in code, no image used.
- Orchestral samples: VSCO 2 Community Edition, CC0.
- Music notation font: Bravura, SIL Open Font License 1.1.
- The instruments' 3D models, the reverb, the drums, harp and keyboard you play, ticks and interface sounds are all made in code.

### What's next
**Any song.** Split a track on your own laptop, then sit inside it on Quest: four parts, processed on your own device, nothing uploaded. **Target launch: public beta on 15 February 2027.**

### Known limits
- We had no headset during the build. Frame rate, hand feel, comfort and brightness on a real Quest 3/3S are **unverified**; everything was tested in the emulator.
- Three songs, fixed excerpts.
- Seated by design. Passthrough is optional: the default is fully immersive.

## Hand interactions (optional field)
Use the "What your hands do" table and the fist-versus-pinch paragraph above. What excites us: hands turn listening into playing, and you don't need to know an instrument to take part.

## Judge instructions
1. Open https://stemlight.vercel.app in the Quest Browser.
2. Press **Enter** (a pinch works). No account, nothing to install.
3. Sit down and use your hands only. The first song (about 1:24) teaches the gestures; then touch a glass bubble to choose any of the three songs, and an orb below them to choose a world.
5. Optional, on headsets that support it: **Enter in passthrough** plays it in your own room.
4. Sound on, ideally with headphones.

## Team (form fields)
- Biyon: Representative; audio engine, hand gestures, music pipeline, the remake surfaces and the instruments you play (score ribbon, cut lanes, drums, harp, keyboard, reset shell), saving, deploy, write-up.
- Banit: the eight instruments and world art, notes, sound effects, tutorial and ghost hands, sequencer and credits, video.
**[CHECK: emails and roles as each person wants them shown]**

## Screenshots (at least 5, real build)
Current look, 18 Nov (crop the credit strip off the bottom where it shows):
- `tests/iwer/input/results/2026-11-18-passthrough-sea-in-ar.png`: the song picker's empty space, three songs and four world orbs.
- `tests/iwer/input/results/2026-11-18-world-starry-ahead.png`: the Starry Night world.
- `tests/iwer/input/results/2026-11-18-world-aurora-ahead.png`: the Aurora world.
- `tests/iwer/input/results/2026-11-18-songs-4-beethoven7-playing.png`: a song playing in the deep sea, with the instruments and notes.
- `tests/iwer/input/results/2026-11-18-perf-heaviest.png`: the busiest moment, every instrument and the drums showing.
- `tests/iwer/visual/results/2026-11-18-landing-desktop.png`: the start page (before the passthrough button was added; retake if it should show).
