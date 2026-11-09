#!/usr/bin/env python3
"""Writes public/pieces/fixture/: 30 notes, 9 synthetic 20 s mono stems (needs ffmpeg). Output is committed."""
import json, math, pathlib, struct, subprocess, tempfile, wave

OUT = pathlib.Path(__file__).parents[2] / "public/pieces/fixture"
SECONDS, RATE, BPM = 20, 16000, 120
BEAT = 60 / BPM
STEMS = [  # id, MIDI range, tone Hz, (radius, yaw deg, height): front tier of 4, back tier of 5, 100 degree arc
    ("vln", (55, 96), 660, (1.6, -36, 1.0)), ("vla_vc", (36, 76), 330, (1.6, -12, 1.0)),
    ("fl", (60, 98), 880, (1.6, 12, 1.0)), ("reeds", (46, 91), 520, (1.6, 36, 1.0)),
    ("cb", (28, 60), 110, (2.4, -48, 1.7)), ("hn", (41, 77), 262, (2.4, -24, 1.7)),
    ("brass", (40, 82), 392, (2.4, 0, 1.7)), ("perc", (40, 60), 80, (2.4, 24, 1.7)),
    ("harp", (36, 96), 740, (2.4, 48, 1.7)),
]
GLYPHS = [("whole", 4), ("half", 2), ("dotted_half", 3), ("quarter", 1), ("dotted_quarter", 1.5),
          ("eighth", 0.5), ("sixteenth", 0.25), ("beamed_eighths", 0.5), ("beamed_sixteenths", 0.25)]


def seat(radius, yaw, height):
    a = math.radians(yaw)
    return [round(radius * math.sin(a), 3), height, round(-radius * math.cos(a), 3)]


def main():
    (OUT / "stems").mkdir(parents=True, exist_ok=True)
    notes = []
    for i in range(30):
        stem, (low, high), _, _ = STEMS[i % 9]
        glyph, beats = GLYPHS[i % 9]
        notes.append({"id": i, "t": round(i * BEAT * 1.25, 4), "dur": beats * BEAT, "pitch": low + (i * 7) % (high - low),
                      "vel": 50 + (i * 13) % 78, "stem": stem, "glyph": glyph, "beat": i * 1.25})
    beats = [round(i * BEAT, 4) for i in range(int(SECONDS / BEAT))]
    envelopes = {}
    for index, (stem, _, tone, _) in enumerate(STEMS):
        pulse = lambda t: math.exp(-(((t + index * 0.1) % 1.0)) * 3)  # one decaying swell a second, offset per stem
        envelopes[stem] = [round(pulse(i / 30), 4) for i in range(SECONDS * 30)]
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "s.wav"
            with wave.open(str(path), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
                w.writeframes(b"".join(struct.pack("<h", int(9000 * pulse(i / RATE) * math.sin(2 * math.pi * tone * i / RATE)))
                                       for i in range(SECONDS * RATE)))
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-c:a", "libopus", "-b:a", "24k",
                            "-map_metadata", "-1", "-fflags", "+bitexact", str(OUT / "stems" / f"{stem}.opus")], check=True)

    manifest = {
        "id": "fixture", "title": "Test fixture", "composer": "None (synthetic)", "durationSec": SECONDS,
        "stems": [{"id": s, "file": f"stems/{s}.opus", "homeSeat": seat(*p), "pitchRange": list(r)} for s, r, _, p in STEMS],
        "scale": {"tonic": 60, "steps": [0, 2, 4, 5, 7, 9, 11]},
        "replace": [{"stem": "perc", "instrument": "pads"}, {"stem": "vln", "instrument": "harp"}],
        "credits": [],
    }
    files = {"manifest": manifest, "notes": notes,
             "beats": {"tempo": [{"t": 0, "bpm": BPM}], "beats": beats, "downbeats": beats[::4]},
             "envelopes": {"rate": 30, "stems": envelopes}}
    for name, data in files.items():
        (OUT / f"{name}.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
