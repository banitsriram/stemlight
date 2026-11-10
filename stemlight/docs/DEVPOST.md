# Devpost submission text: DRAFT (task 67)

Draft written 11 Nov 2026 by sir's account. Nothing here is published without sir's approval. Lines marked **[CHECK]** depend on a feature or number that isn't built or measured yet: verify or delete each before submitting. No brand names anywhere except the tools we must disclose.

---

## Title
Stemlight

## Tagline
The music you can reach into.

## Track and division
Entertainment (music visualisation) · New Experience · built with IWSDK

## One-line description
*The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.*

## Description

**Stemlight is a seated, hands-only music visualiser.** Look at any instrument and it comes to you; close your fist and it falls silent; stretch it to reshape its sound; cut its part and play your own.

### Inspiration
We love music but neither of us plays in an orchestra. Tools that split a song into its parts made us want to *stand inside* one: hear the horns alone, take the timpani out and drum it ourselves. A screen keeps you outside the music. A headset and your bare hands can put you in the middle of it.

### What it is, and who it's for
- **Entertainment, music visualisation.** Adults who love music but don't play, at home in the evening, seated, for about ten minutes. No score, no win state: the pleasure is listening and remaking.
- A piece is split into its instrument families. Each family is a glowing sea creature around you, and **every real note from the score** leaves it as a floating notation symbol: the glyph matches the note's real length, height is pitch, size is loudness. Nothing on screen is decorative noise.
- Two pieces: Beethoven's 5th (opening) and Dvořák's *New World* finale. **[CHECK: final excerpt lengths]**

### What your hands do
| Gesture | What happens |
|---|---|
| Look at an instrument (0.5 s) | It glides to you |
| Fist, held | It falls silent; its notes freeze into glass |
| Hold the fist 1.5 s | The glass locks, so it stays silent after you open your hand |
| Open hand | It comes back (the glass thaws) **[CHECK: thaw shipped]** |
| Double pinch | Solo that instrument |
| Two-hand stretch | Wide = more bass, tall = more treble; squeeze together to reset **[CHECK: EQ shipped]** |
| Pinch the playhead | Hold to pause, drag to scrub |
| Two-hand pinch on a lane | Cut that part out (snapped to the beat); pull the hollow away to undo |
| Pads | After a percussion cut: a one-bar count-in, then drum your own part. It snaps to the beat and loops back in, and your notes fly out in amber to fill the outlines of the notes you removed |

Everything is seated, inside a small reach, with hands only. No controller, no account, no menus.

### Why only on Quest
Described on a phone, it stops working: the point is that the music is *around* you (each instrument plays from its own place in space, through head-related spatial audio) and that you change it by *reaching in* with your hands. A flat screen gives you a mixer; Stemlight gives you an orchestra you can touch.

### How we built it
- **IWSDK** (WebXR, TypeScript, Three.js under IWSDK's entity system). Static build, opens in the Quest Browser. **[CHECK: final URL]**
- **An offline score-to-stems pipeline.** Public-domain and CC BY-SA orchestral scores → instrument groups → rendered with free CC0 orchestral samples → one shared reverb → loudness-normalised mono stems, plus the note, beat and loudness data the visuals use. Every symbol you see is a note from that score. **[CHECK: renderer and samples actually used, from ASSETS.md]**
- **One clock for sound and sight.** All stems start on one audio-clock time, so they never drift, and every note's position is a pure function of that clock. Pause freezes the notes, scrubbing rewinds them, and loops are sample-exact, with no extra state.
- **The hard problem: fist versus pinch.** Both curl the fingers. We gave them thresholds that can't overlap (a fist needs 3 of 4 fingers curled ≥0.75; a pinch needs the other fingers ≤0.6), added hysteresis and debounce, and made short tracking dropouts (≤0.3 s) hold the gesture while longer ones release quietly with no action. A scripted suite of fist, pinch and gap cases checks there are no cross-triggers. **[CHECK: suite results]**
- **Gaze without eye tracking.** Quest 3 and 3S have no eye tracking, so "look to summon" uses head direction (within 12° for half a second).
- **Your part, in time.** A cut is snapped to the beat. A one-bar count-in leads into a sample-exact loop; your hits snap to the eighth-note grid and are replayed on every pass; the original part plays quietly under your first pass as a guide.
- **Saved on the device.** Your mix, cuts and recorded parts are saved locally and come back next time. Pause, taking the headset off and ending the session all resume cleanly.
- **Testing without a headset.** We had no headset, so every interaction was tested in the IWSDK emulator with scripted hands and head, using a dev-only hand-pose switch that never ships in the build.
- **Built with Claude Code.** Our two-person team designed Stemlight and directed the work; Claude Code (an AI coding assistant) wrote most of the code under our direction, and we reviewed and tested it.

### Accessibility and comfort
- Seated, small reach, no standing or leaning; essential targets sit inside a narrow field of view. **[CHECK: FoV screenshots]**
- Instruments are told apart by **shape first**, colour second, and there's a colour-blind palette. **[CHECK: palette shipped]**
- No failure state; a quiet reset is always available (pinch and hold the small shell by your right knee).

### Credits
- Dvořák, Symphony No. 9, 4th movement: Mutopia Project #1793, **CC BY-SA 3.0**. Our stems and note data made from it are released under CC BY-SA 3.0.
- Beethoven, Symphony No. 5, 1st movement: Mutopia Project #941, public domain.
- Orchestral samples: **[CHECK from ASSETS.md: VSCO 2 Community Edition, CC0 / fallback used]**
- Music notation font: Bravura, SIL Open Font License 1.1.
- Pads, ticks and interface sounds are synthesised in code.

### What's next
**Any song.** Split a track on your own laptop, then sit inside it on Quest: four parts, processed on your own device, nothing uploaded. **Target launch: public beta on 15 February 2027.**

### Known limits
- We had no headset during the build: frame rate and hand feel on a real Quest 3/3S are **unverified**. Everything was tested in the emulator.
- Two pieces, fixed excerpts.
- No passthrough or room use: Stemlight is a fully immersive, seated experience by design.

## Judge instructions
1. Open the link in the Quest Browser. **[CHECK: URL]**
2. Press **Enter** (pinch works). No account, nothing to install.
3. Hands only, seated. About 8 minutes for the guided part, then free play.
4. Sound on, ideally headphones.

## Screenshots (at least 5, real build, same colour treatment)
**[CHECK: banit's FoV/stills set: first fist freezing the violins to glass, the thaw, the Dvořák brass entry with a full field of notes, amber notes filling ghost outlines, the landing page]**
