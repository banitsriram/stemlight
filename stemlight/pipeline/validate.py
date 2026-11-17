#!/usr/bin/env python
"""Check a built piece in public/pieces/<id>/ against src/contracts.ts and its source score.

  python -I stemlight/pipeline/validate.py beethoven5 [dvorak9 ...]

Checks: every JSON file's shape and value ranges against the contract types (the StemId / Glyph / Instrument /
PieceId unions are read from contracts.ts itself), notes sorted by t with unique ids, per-stem and total note
counts recounted independently from the source MIDI + groups.yaml, all stems' decoded lengths equal within
1 ms and equal to durationSec, opus size, and no stem silent or clipping. Exits 1 on any failure.
"""
import json, math, pathlib, re, subprocess, sys

import mido
import numpy as np
import yaml

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
SR = 48000
MAX_OPUS_BYTES = 2_200_000


def unions():
    src = (APP / "src" / "contracts.ts").read_text(encoding="utf-8")
    out = {}
    for name in ("PieceId", "StemId", "Glyph", "Instrument"):
        m = re.search(rf"export type {name}\s*=\s*([^;]+);", src)
        out[name] = set(re.findall(r"'([^']+)'", m.group(1)))
    return out


class Check:
    def __init__(self, piece):
        self.piece, self.fails, self.passes = piece, [], 0

    def ok(self, cond, msg):
        if cond:
            self.passes += 1
        else:
            self.fails.append(msg)
        return cond


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def source_counts(cfg):
    """Recount notes per stem straight from the source MIDI (independent of build.py)."""
    mf = mido.MidiFile(HERE / "work" / "src" / cfg["midi"])
    ts = [m for tr in mf.tracks for m in tr if m.type == "time_signature"][0]
    bar = mf.ticks_per_beat * 4 * ts.numerator // ts.denominator
    t0, t1 = (cfg["excerpt"]["first_bar"] - 1) * bar, cfg["excerpt"]["last_bar"] * bar
    nb = cfg["excerpt"].get("notes_before_beat")       # opt-in: notes from this beat of the last bar on are left out
    if nb is not None:
        t1 += round((nb - 1) * mf.ticks_per_beat * 4 / ts.denominator) - bar
    stem_of = {name: stem for stem, sc in cfg["stems"].items() for part in sc["parts"] for name in part["tracks"]}
    per_stem, total = {}, 0
    for tr in mf.tracks:
        t = 0
        for m in tr:
            t += m.time
            if m.type == "note_on" and m.velocity > 0 and t0 <= t < t1:
                total += 1
                s = stem_of.get(tr.name, "<unmapped>")
                per_stem[s] = per_stem.get(s, 0) + 1
    return per_stem, total


def decode(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32) if r.returncode == 0 else None


def sync_lag_ms(x, stem_notes, log_domain):
    """Lag (ms) that best lines the stem's audio onsets up with its notes.json onsets (10 ms frames, +-150 ms).
    Positive = audio later than the notes. A gross-error detector for sample pre-roll or a time-map bug (which
    can't be heard here). Bowed/blown attacks are slow, so the two onset measures bracket the perceived attack:
    log_domain=True finds where sound starts (reads early), False finds the steepest amplitude rise (reads late)."""
    hop = SR // 100
    n = len(x) // hop
    rms = np.sqrt(np.mean(x[: n * hop].astype(np.float64).reshape(n, hop) ** 2, axis=1))
    level = 20 * np.log10(np.maximum(rms, rms.max() * 1e-3)) if log_domain else np.sqrt(rms)
    onset = np.maximum(0, np.diff(level, prepend=level[0]))
    imp = np.zeros(n)
    for note in stem_notes:
        i = int(round(note["t"] * 100))
        if i < n:
            imp[i] += note["vel"]
    lags = range(-15, 16)
    score = [float(np.dot(imp[max(0, -l): n - max(0, l)], onset[max(0, l): n - max(0, -l)])) for l in lags]
    return list(lags)[int(np.argmax(score))] * 10


def validate(piece, U):
    c = Check(piece)
    d = APP / "public" / "pieces" / piece
    load = lambda n: json.loads((d / f"{n}.json").read_text(encoding="utf-8"))
    notes, beats, env, man = load("notes"), load("beats"), load("envelopes"), load("manifest")

    # manifest: PieceManifest
    c.ok(set(man) == {"id", "title", "composer", "durationSec", "stems", "scale", "replace", "credits"}, f"manifest keys {sorted(man)}")
    c.ok(man["id"] in U["PieceId"] and man["id"] == piece, f"manifest.id {man['id']!r}")
    c.ok(isinstance(man["title"], str) and man["title"] and isinstance(man["composer"], str) and man["composer"], "title/composer")
    dur = man["durationSec"]
    c.ok(is_num(dur) and dur > 0, "durationSec")
    stem_ids = [s["id"] for s in man["stems"]]
    c.ok(len(stem_ids) == len(set(stem_ids)) and set(stem_ids) <= U["StemId"], f"stem ids {stem_ids}")
    c.ok(len(stem_ids) == 8 and "harp" not in stem_ids, "8 stems, no harp")
    for s in man["stems"]:
        c.ok(set(s) == {"id", "file", "homeSeat", "pitchRange"}, f"stem keys {sorted(s)}")
        c.ok(s["file"] == f"stems/{s['id']}.opus" and (d / s["file"]).is_file(), f"stem file {s['file']}")
        c.ok(isinstance(s["homeSeat"], list) and len(s["homeSeat"]) == 3 and all(map(is_num, s["homeSeat"])), f"homeSeat {s['id']}")
        pr = s["pitchRange"]
        c.ok(isinstance(pr, list) and len(pr) == 2 and all(map(is_int, pr)) and 0 <= pr[0] <= pr[1] <= 127, f"pitchRange {s['id']}")
    sc = man["scale"]
    c.ok(set(sc) == {"tonic", "steps"} and is_int(sc["tonic"]) and 0 <= sc["tonic"] <= 127, "scale.tonic")
    c.ok(all(is_int(x) and 0 <= x < 12 for x in sc["steps"]) and sc["steps"] == sorted(set(sc["steps"])) and sc["steps"][0] == 0, "scale.steps")
    for r in man["replace"]:
        c.ok(set(r) == {"stem", "instrument"} and r["stem"] in stem_ids and r["instrument"] in U["Instrument"], f"replace {r}")
    c.ok(len(man["credits"]) > 0, "credits present")
    for cr in man["credits"]:
        c.ok(set(cr) == {"text", "licence", "url"} and all(isinstance(cr[k], str) and cr[k] for k in cr), f"credit {cr}")
    credit_text = json.dumps(man["credits"])
    if piece == "dvorak9":
        c.ok("CC BY-SA 3.0" in credit_text and "mutopiaproject.org" in credit_text and "1793" in credit_text,
             "Dvorak credit states CC BY-SA 3.0 and the Mutopia source")
    if piece == "beethoven5":
        c.ok("Public Domain" in credit_text and "id=941" in credit_text, "Beethoven credit states PD + Mutopia 941")

    # notes: NoteEvent[] sorted by t
    keys = {"id", "t", "dur", "pitch", "vel", "stem", "glyph", "beat"}
    bad = [n for n in notes if set(n) != keys or not (is_int(n["id"]) and is_num(n["t"]) and is_num(n["dur"]) and is_int(n["pitch"])
           and is_int(n["vel"]) and is_num(n["beat"]) and n["stem"] in U["StemId"] and n["glyph"] in U["Glyph"])]
    c.ok(not bad, f"{len(bad)} notes break the NoteEvent type, e.g. {bad[:1]}")
    c.ok(all(notes[i]["t"] <= notes[i + 1]["t"] for i in range(len(notes) - 1)), "notes sorted by t")
    c.ok(sorted(n["id"] for n in notes) == list(range(len(notes))), "note ids unique 0..n-1")
    c.ok(all(0 <= n["t"] < dur and n["dur"] > 0 and n["t"] + n["dur"] <= dur + 1e-6 for n in notes), "note times inside the piece")
    c.ok(all(0 <= n["pitch"] <= 127 and 1 <= n["vel"] <= 127 and n["beat"] >= 0 for n in notes), "pitch/vel/beat ranges")
    c.ok(all(n["stem"] in stem_ids for n in notes), "note stems are manifest stems")
    got = {s: sum(1 for n in notes if n["stem"] == s) for s in stem_ids}
    for s in man["stems"]:
        ps = [n["pitch"] for n in notes if n["stem"] == s["id"]]
        c.ok(ps and s["pitchRange"] == [min(ps), max(ps)], f"pitchRange {s['id']} matches its notes")
    cfg = yaml.safe_load((HERE / "pieces" / piece / "groups.yaml").read_text(encoding="utf-8"))
    src_stem, src_total = source_counts(cfg)
    c.ok(len(notes) == src_total, f"note total {len(notes)} vs source excerpt {src_total}")
    c.ok("<unmapped>" not in src_stem, "every source track with excerpt notes is mapped")
    for s in stem_ids:
        c.ok(got[s] == src_stem.get(s, 0), f"{s}: {got[s]} notes vs source {src_stem.get(s, 0)}")
        c.ok(got[s] > 0, f"{s} has notes")

    # beats: Beats
    c.ok(set(beats) == {"tempo", "beats", "downbeats"}, "beats keys")
    tp = beats["tempo"]
    c.ok(tp and tp[0]["t"] == 0 and all(set(x) == {"t", "bpm"} and is_num(x["t"]) and is_num(x["bpm"]) and x["bpm"] > 0 for x in tp)
         and all(tp[i]["t"] < tp[i + 1]["t"] for i in range(len(tp) - 1)), "tempo map")
    b = beats["beats"]
    c.ok(b and b[0] == 0 and all(map(is_num, b)) and all(b[i] < b[i + 1] for i in range(len(b) - 1)) and b[-1] < dur, "beats ascending in range")
    c.ok(set(beats["downbeats"]) <= set(b) and beats["downbeats"] == sorted(beats["downbeats"]) and beats["downbeats"][0] == 0, "downbeats subset of beats")

    # envelopes: Envelopes
    c.ok(set(env) == {"rate", "stems"} and env["rate"] == 30, "envelopes rate 30")
    c.ok(set(env["stems"]) == set(stem_ids), "envelope per stem")
    frames = math.ceil(dur * 30 - 1e-9)
    for s, arr in env["stems"].items():
        c.ok(abs(len(arr) - frames) <= 1, f"envelope {s} length {len(arr)} vs {frames}")
        c.ok(all(is_num(v) and 0 <= v <= 1 for v in arr) and max(arr) == 1, f"envelope {s} in 0..1 with max 1")

    # stems: decoded length, size, level
    lengths, sync = {}, {}
    for s in man["stems"]:
        p = d / s["file"]
        c.ok(p.stat().st_size <= MAX_OPUS_BYTES, f"{s['id']}.opus {p.stat().st_size} bytes")
        x = decode(p)
        if not c.ok(x is not None and len(x) > 0, f"{s['id']}.opus decodes"):
            continue
        lengths[s["id"]] = len(x)
        peak = float(np.max(np.abs(x)))
        c.ok(peak > 10 ** (-40 / 20), f"{s['id']} not silent (peak {20 * math.log10(peak + 1e-12):.1f} dBFS)")
        c.ok(peak < 1.0, f"{s['id']} not clipping (peak {peak:.3f})")
        sn = [n for n in notes if n["stem"] == s["id"]]
        lags = (sync_lag_ms(x, sn, True), sync_lag_ms(x, sn, False))
        sync[s["id"]] = lags
        c.ok(all(abs(l) <= 100 for l in lags), f"{s['id']} audio onsets within 100 ms of notes.json (start/rise lags {lags} ms)")
    if lengths:
        spread = (max(lengths.values()) - min(lengths.values())) / SR
        c.ok(spread <= 0.001, f"stem lengths equal within 1 ms (spread {spread * 1000:.2f} ms)")
        c.ok(all(abs(n / SR - dur) <= 0.001 for n in lengths.values()), f"stem lengths match durationSec {dur}")

    print(f"[{piece}] {c.passes} checks passed, {len(c.fails)} failed; notes {len(notes)} (source {src_total}); "
          f"per stem {got}; duration {dur} s; decoded lengths {sorted(set(lengths.values()))} samples; "
          f"audio-vs-notes onset lag ms (sound start, steepest rise) {sync}")
    for f in c.fails:
        print("  FAIL:", f)
    return not c.fails


def main():
    pieces = sys.argv[1:] or ["beethoven5", "dvorak9"]
    U = unions()
    ok = all([validate(p, U) for p in pieces])
    print("VALIDATE", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
