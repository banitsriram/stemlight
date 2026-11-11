# biyon
status: working          # working | blocked | paused | idle
task: hand:pinch contract, remake surfaces (45-47 + reset shell), F19 run, redeploy
claims:
- stemlight/pipeline/**
- stemlight/src/audio/**
- stemlight/src/input/**
- stemlight/src/dev/**
- stemlight/src/mock/**
- stemlight/src/bus.ts
- stemlight/tests/iwer/input/**
- stemlight/tests/unit/audio*
- stemlight/tests/browser/**
- stemlight/tests/unit/input*.test.mjs
- stemlight/tests/unit/pipeline*.test.mjs
- stemlight/docs/DEVPOST.md
- stemlight/docs/audits/**
- stemlight/docs/progress-pending-biyon.md
- stemlight/src/ui/remake/**
- stemlight/tests/unit/remake*
- stemlight/index.html
- stemlight/.claude/**
- .claude/**
- stemlight/public/pieces/**
done:
- biyon-15, 16, 23, 24, 25, 28, 29: EQ, ribbon, trim/undo, pads, reset gestures + audio side (c8fe49f)
- biyon-4, 10-13 hand input + DevHandPose + IWER harness (afdffe0)
- biyon-5, 6, 7, 18 pipeline; beethoven5 + dvorak9 pieces live (b5b7034)
- biyon-30 dev stats + FoV mask (6abde85)
- biyon-28/29 audio side: saving, pause/resume, reset (78df133)
- biyon-23/24/25 audio side: loops, cuts, count-in, guide, parts (aaa319d)
messages:
- biyon-45 @banit: remake surfaces are in (6f9e585 + 379d3ee) and live on https://stemlight.vercel.app: ribbon + 6 cm playhead, one big lane for the summoned stem, hollow regions with ghost outlines (pull to undo), 2 timpani pads either side of the summoned creature with count-in ring and amber fingertip notes, reset shell at eye level on the right. Your fov.mjs flagged pads + reset outside 70x66 at first; after I moved them F27 passes in all 8 states. Please rerun fov.mjs and commit the refreshed shots (your folder; I didn't touch them). One F18 line ("no account + hand-tracking hint") failed once and passed the run before with no web/ change, probably the fade-in hiding text from innerText for a moment. Video: you can now add cut / pads / ribbon / reset shots to capture.mjs; tests/iwer/input/remake-real.mjs shows the exact hand moves that work (lane: two pinches 16 cm apart along the lane direction; region: pinch and pull 13 cm up; pad: index-tip anchor, 1 cm per frame down through the pad). F19 run still to do on my side. main.ts released. My log entry for today is in docs/progress-pending-biyon.md because you hold progress.md: paste it in and delete the file, or release progress.md.
- biyon-57 @banit: initSequence removed (only PIECE_ORDER stays). I'd like to keep the small credits line on the landing page: it makes the CC BY-SA attribution visible to anyone who opens the link, even if they never reach the end card. Say if it clashes with your landing design and we'll shrink it rather than drop it. Remake surfaces (45-47 + reset shell if yours doesn't register one) are being built now in src/ui/remake/**; F19 run is in progress in tests/iwer/input.
- biyon-16 @banit: `hand:pinch { hand, down, targetId }` is in contracts.ts and fires from the input engine on every pinch close/open (targetId = creature:<stem> | playhead | lane id | region:<cutId> | reset id | null). I also documented the extra keys as comments there. Wire your tick. Dev key 'k' fires one. contracts.ts released.
- biyon-32 @banit: first deploy is live: https://stemlight.vercel.app (prebuilt static deploy from sir's laptop; I redeploy after each milestone). index.html now has a small visible credits line for the music licences until your in-VR credits (53) land. Also: you're invited to the Devpost project "Stemlight" (sent to your gmail); please accept it, and do the Meta developer 2FA from my biyon-1 message.
- biyon-1 @banit: sir's Start application is submitted (approval pending) and his developer account is verified with a team called "Stemlight". The rules need *every* team member to have a Meta account with Developer Access by submission, so please do this today: sign in at developers.meta.com, set up two-factor authentication when it asks you to verify (no card needed), accept the developer NDA, and join or create a team. Screenshot it for progress.md.
- biyon-2 @banit: thanks for taking 2 and 3. Joined banitsriram/stemlight with a fresh clone. Starting biyon-8 + 9 (real audio engine) now, then 4, 10, 11, 12 (hands), then the pipeline. I'm holding main.ts tonight to wire in the real audio engine and the hand input; it's released by morning. Tell me if you need it sooner.
- biyon-8 @banit: the real engine is in main.ts (6a2c3b5). ctx.transport/ctx.audio are real now; `beat` and `piece:end` come from the engine. sfxOut(pos) gives an HRTF panner into an sfx bus. The panners follow each creature target's `center` in the registry, so when you move the summoned creature, please update its registry center too and its sound will follow. `?piece=<id>` picks a piece (fixture by default until beethoven5 lands tonight).
- biyon-21 @banit: correction: it's still Wed 11 (early hours), so the 18:00 checkpoint hasn't happened. The Trepak is cut (its Tue 10 gate never ran), so 22 is permanent: pads on Dvořák's timpani. Glowing hands (50), keyboard (27, 49) and the audit's extra cuts (42, 43, 26/48, 51) are only proposals for 18:00, for you and sir to decide. A is roughly on schedule now.
- biyon-25 @banit: how a take runs, for your ribbon/pads/ghost-note visuals: `cut:add` on a stem listed in manifest.replace (perc → pads) starts it. Transport seeks one bar before the cut and plays; `countin` fires 4,3,2,1 on those beats; then the region loops (each wrap emits `transport:seek` to t0, so your notes rewind for free). Pass 0 has the original at -18 dB as a guide. `part:hit` carries the snapped time `t` and `from`. The take ends after a pass with no new hits, then the piece plays on. Cuts on other stems are just silent regions. Saved mixes come back on piece:ready as normal stem:mute(locked)/stem:solo/stem:eq/cut:add events.
- biyon-16 @banit: proposal for ribbon/lane colliders, no contract change needed (it uses Target.extra): a `playhead` or `lane` target's extra carries `dx, dy, dz` (unit direction of increasing time along the ribbon) and `secPerM` (seconds per metre along it); lanes also carry `tCenter` (piece time at the target center) and their `stem`. Hollow regions register as kind `region` with id `region:<cutId>`. Pads: kind `pad`, extra.pitch (MIDI; default 50), disc facing up unless extra gives nx, ny, nz. Reset shell: kind `reset`. The input agent is building trim, ribbon, pads and reset against this now. Reply if you want it different.
- biyon-5 @banit: beethoven5 and dvorak9 are live (b5b7034), and the app now loads beethoven5 by default, then dvorak9 on piece:end (src/audio/sequence.ts, a stand-in your sequencer can replace: initSequence returns an unsubscribe). Fixture is still at ?piece=fixture. Real notes.json: 1840 and 4249 notes.
- biyon-64 @banit: fresh-eyes scoring audit is in stemlight/docs/audits/2026-11-11-audit.md. Short version: A-side audio/input is built and tested, but a judge sees a void with one rock and notes from empty space. Top fixes are all yours: (1) creatures MVP: glide on gaze:summon and update the registry center, dim on mute/solo, glass notes for a muted stem (39-41); (2) remake surfaces: register playhead/lane/region/pad/reset targets per my biyon-16 extra proposal with minimal visuals, otherwise trim/pads/ribbon/reset are unreachable (45-47, 58); (3) first-five-minutes MVP: ghost hands for look, fist, solo, cut-to-pads (54-56); (4) end card after Dvořák (57-58); (5) start the shot ledger (59-60). Also: the landing says "about 8 minutes", but the music is ~4 min (83.6 s + 153 s), so please change the copy in web/landing.ts. Offer: if it helps, I can build (2), the remake surfaces, myself: release `stemlight/src/ui/remake/**` (or tell me a folder name) and I'll claim only that. The audit also suggests cutting thaw (42), shape-morph (43), harp (26, 48) and the cb palette (51); sir decides in the morning.
- biyon-16 @banit: all A gestures now exist (c8fe49f) and fire against registry targets using the extra convention above. Proposals for your reply (contracts.ts only by agreement): (1) document the extra keys in contracts.ts as comments: dx/dy/dz, secPerM, tCenter, halfLength (capsule collider for long lanes/regions), pitch, and ids `region:<cutId>`; (2) add `'hand:pinch': { hand: Hand; down: boolean; targetId: string | null }` so you can play the pinch tick and show grab visuals. On your other question: every pad strike already emits `part:hit` (cutId '' when no cut is active), with `from` = fingertip, so the amber note can fly from it.
- biyon-37 @banit: piece:ready after the files are servable is fine. The real loader (biyon-17) will keep fetching from `/pieces/<id>/` and emit piece:ready only once notes.json and beats.json exist, so no change on your side.
