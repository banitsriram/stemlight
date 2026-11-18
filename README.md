# Stemlight

**The music you can reach into.** A seated, hands-only music visualiser for VR headsets: look at an instrument and it comes to you, close your fist and it falls silent, pinch twice to hear it alone, cut a passage and play it yourself.

**Play it:** https://stemlight.vercel.app (open it in a headset's browser and press **Enter**; no account, nothing to install)

Built for the Meta VR Start Developer Competition 2026 (Entertainment track, new build) with the Immersive Web SDK (IWSDK) and WebXR.

## What it does
- **An orchestra around you.** Eight instruments, modelled in code, each play their own stem from where they sit through spatial audio. Every note from the score leaves its instrument as a floating notation symbol: its length is the note's length, its height the pitch, its size the loudness.
- **Your hands are the controls.**

  | Gesture | Result |
  |---|---|
  | Look at an instrument for half a second | It glides to you |
  | Close your fist on it | It falls silent and its notes freeze into glass |
  | Hold the fist | The silence locks |
  | Pinch twice | Solo |
  | Pinch both hands and stretch | Reshape its tone |
  | Pinch both hands on the lane and pull | Cut a passage, snapped to the beat |
  | Tap the drums, harp or keyboard that appear | Play the missing part yourself; it loops back in with the orchestra |

- **Three songs:** Beethoven's 5th (with a short tutorial), the finale of Dvořák's *New World* Symphony and the Allegretto of Beethoven's 7th, chosen in a quiet selection space.
- **Four worlds**, chosen with glass orbs:
  - **Eclipse,** the default: a black void with an eclipsed sun and a floor that ripples to the beat.
  - **The deep sea.**
  - **Starry Night,** stylised after van Gogh.
  - **Aurora over ice.**

  On headsets that support it, **Enter in passthrough** plays it in your own room.
- **Saved on your device:** your mix, cuts and recorded parts come back next time.

## How it's built
- **IWSDK and three.js (WebXR).** A static Vite build; all 3D art is generated in code, with no model or image files.
- **Score-to-stems pipeline** (`stemlight/pipeline/`). Open orchestral scores (Mutopia Project) become eight instrument stems, rendered with CC0 samples (VSCO 2 Community Edition). The pipeline also writes the note, beat and loudness data the visuals use.
- **One audio clock** drives sound and picture, so the parts never drift, and pause, scrubbing and loops stay sample-exact.
- **Fist versus pinch.** Thresholds that can't overlap, with hysteresis and drop-out handling: zero cross-triggers in 120 scripted gestures.
- **Within budget.** At the busiest moment: 64 draw calls and about 102k triangles (limits 100 and 150k).

## Run it locally
```bash
cd stemlight
npm install
npm run dev        # IWSDK dev server with the in-browser XR emulator
npm run typecheck
npm test           # unit tests
npm run build      # production build in dist/
```

## Repository layout
| Path | What it holds |
|---|---|
| `stemlight/src/audio` | Audio engine, transport, stems, cuts, saving |
| `stemlight/src/input` | Hand gestures: gaze summon, fist, pinch, cut |
| `stemlight/src/world` | Worlds, instruments, floating notes |
| `stemlight/src/ui` | Song picker, score ribbon, playable instruments |
| `stemlight/src/story` | Tutorial, ghost hands, credits |
| `stemlight/web` | Start page and loader |
| `stemlight/pipeline` | Offline score-to-stems pipeline (Python) |
| `stemlight/public/pieces` | Rendered stems and note data for the three songs |
| `stemlight/tests` | Unit, emulator (IWER) and browser tests, with result logs |
| `stemlight/docs` | Asset licences (`ASSETS.md`) and the submission text |

## Testing
There was no headset during the build. Every interaction was scripted in the IWSDK emulator (IWER), backed by unit tests and a headless production check of the live site (`stemlight/tests/browser/release-check.mjs`). Frame rate and hand feel on a real headset are unverified.

## Credits and licences
- **Code:** MIT (see `LICENSE`).
- **Dvořák, Symphony No. 9, 4th movement:** Mutopia Project #1793, CC BY-SA 3.0. Our stems and note data made from it are shared under CC BY-SA 3.0.
- **Beethoven, Symphonies No. 5 and No. 7:** Mutopia Project #941 and #595, public domain.
- **Vincent van Gogh,** *The Starry Night* (1889): public domain. The world is painted in code; no image is used.
- **Samples:** VSCO 2 Community Edition, CC0. **Notation font:** Bravura, SIL OFL 1.1.
- **Effects adapted from:**
  - [3d-wave-grid](https://github.com/franky-adl/3d-wave-grid) by Franky Hung (MIT);
  - [interactive-particles](https://github.com/brunoimbrizi/interactive-particles) by Bruno Imbrizi (Codrops licence).
- Every asset, with its source and licence, is listed in `stemlight/docs/ASSETS.md`.

## Team
Biyon and Banit. Built with the help of an AI coding assistant, under our direction; we designed, reviewed and tested every part.
