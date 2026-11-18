# Submission hand-off for banit (18 Nov 2026)

Sir asked for a final check before you make the video and submit. This file is everything you need. **Hard deadline: Thu 19 Nov 2026, 01:30 IST (18 Nov, 12:00 PM PT).**

## The build
- **Live:** https://stemlight.vercel.app. The final bundle name is in my coord note.
- **Freeze:** do not deploy after the deadline. The site must stay up until the winners are announced (about 11 Dec).
- **Checks run on 18 Nov** (emulator, no headset):

  | Check | Result |
  |---|---|
  | Type check | clean |
  | Unit tests | 161/161 |
  | Song picker | pass |
  | World orbs | pass |
  | Passthrough | 9/9 |
  | Pinch solo | 7/7 |
  | Harp and keys | pass |
  | Pause and resume | pass |
  | Onboarding | 4/4 |
  | Perf, each world | 5/5 (64 calls) |
  | Live freeze check | 14/14 |

  Not verified: the look, frame rate and hand feel on a real Quest, including passthrough.

## What shipped (video shot list)
1. **Start page:** Enter, plus *Enter in passthrough* on headsets that support it.
2. **Tutorial song**, Beethoven 5 (about 1:24), with your ghost hands. The tutorial now ends when the picker opens, and the ghost hands hide.
3. **Song picker:** a calm, empty slate-teal space. It holds 3 song bubbles (Beethoven 5, Dvořák *New World*, Beethoven 7) and, below them, the world orbs: Deep sea, Starry Night, Aurora, plus Passthrough in a passthrough session. The chosen world appears when the song starts.
4. **Gestures:**
   - look to summon an instrument;
   - fist to silence, open to bring it back, hold to lock;
   - pinch twice for solo;
   - pinch both hands and pull to cut a loop;
   - tap the drums, harp and keys to play along.
5. **The Songs bubble**, held mid-song, brings the picker back.
6. **Worlds:** the deep sea; Starry Night, a cartoon village after van Gogh; Aurora over ice.
7. **Passthrough:** the instruments and notes float in your own room.

**Stills:** `tests/iwer/input/results/2026-11-18-*` (picker, worlds, perf) and `tests/iwer/visual/results/2026-11-18-landing-*`. The suggested screenshots are listed in `docs/DEVPOST.md` under "Screenshots".

## Devpost form
- **Text:** paste from `docs/DEVPOST.md`.
  - Delete the internal-note block at the top.
  - Fill in the team emails at the `[CHECK]`.
  - The overview suggests about 500 words; ours is about 1,600. Trim if the form asks for it.
- **Track:** Entertainment, New Experience division. **Built with:** IWSDK (WebXR).
- **Video:** under 3 minutes, public on YouTube or Vimeo, real footage.
  - Put the Dvořák credit in the video description: Mutopia Project #1793, CC BY-SA 3.0.
  - `video/VOICEOVER.md` line 18 still says "Two symphonies". Make it three songs, or keep the cut showing two.
- **Screenshots:** at least 5 (the list is in DEVPOST.md).
- **Credits and licences:** every asset has a row in `docs/ASSETS.md`.
  - Dvořák is CC BY-SA 3.0, credited on the start page, the in-app credits, Devpost and the video end card.
  - Van Gogh is public domain.
  - **Please add:** a row for the msdf-bmfont tool you used for the note atlas, with its licence. I couldn't confirm it from here.
- **No brand names:** the build, the Devpost text and the video passed the brand check. "Quest" in the Devpost text names the sponsor's own device, which the rules name too.

## Only humans can do these
- **Sir:** confirm Start membership (the submitter must be a member at submission).
- **You:** Meta Developer Access on your account.
- **Both:** 18 or older, and not resident in Brazil, Quebec or a sanctioned country (rules §2).
- **Sir and you:** submit the form before 01:30 IST.
- **If the repo goes public:**
  - both of your commit emails are in the git history;
  - `.coord/` holds internal agent notes, so delete it first if you'd rather not show it.

## Known small things (not fixed, low risk)
- **Resume** re-enters the mode you last used. To switch between VR and passthrough, reload the page.
- **The credits card** may be close to full. If its top or bottom line looks cut off in your footage, tell me.
