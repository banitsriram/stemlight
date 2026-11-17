#!/usr/bin/env python
"""Stemlight offline music pipeline: one Mutopia MIDI in, eight .opus stems + four JSON files out.

  python -I stemlight/pipeline/fetch.py                 # once: scores + VSCO 2 CE samples into pipeline/work/
  wsl -d Ubuntu -- bash -l <repo>/stemlight/pipeline/setup_wsl.sh   # once: builds sfizz_render in ~/sfizz
  python -I stemlight/pipeline/build.py beethoven5      # or dvorak9
  python -I stemlight/pipeline/validate.py beethoven5

Steps (PLAN s4): groups.yaml track->stem split, bar excerpt -> seconds via the tempo map (plus fermata
stretches), seeded humanise (+-8 ms onsets, velocity curve per family), sfizz_render with VSCO 2 CE in WSL
(48 kHz), downmix to mono, one shared convolution reverb (synthetic IR generated here, see make_ir), per-stem
loudness normalisation (ffmpeg loudnorm measures, a linear gain applies), libopus 96 kbps mono, then
notes.json / beats.json / envelopes.json / manifest.json. Everything is deterministic for a given input.

Runs with Windows Python (numpy, scipy, mido, pyyaml) + Windows ffmpeg; only sfizz_render runs in WSL.
"""
import argparse, bisect, json, math, pathlib, random, re, shutil, subprocess, sys, time

import mido
import numpy as np
import yaml
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
WORK = HERE / "work"
SR = 48000
STEM_ORDER = ["vln", "vla_vc", "cb", "fl", "reeds", "hn", "brass", "perc"]
GLYPH_BEATS = [("whole", 4.0), ("dotted_half", 3.0), ("half", 2.0), ("dotted_quarter", 1.5),
               ("quarter", 1.0), ("eighth", 0.5), ("sixteenth", 0.25)]
JITTER_SEC = 0.008
RENDER_TPB, RENDER_TEMPO = 960, 480000          # 1 tick = 0.5 ms in the per-layer render MIDI files
SFIZZ = "$HOME/sfizz/build/library/bin/sfizz_render"
REVERB = {"rt60": {"low": 2.2, "mid": 1.8, "high": 1.0}, "predelay": 0.025, "length": 2.6, "wet": 0.30, "seed": 20261111}
MIX_PEAK_MAX = 10 ** (-1 / 20)                  # summed mix of all stems must stay under -1 dBFS
OPUS_KBPS = 96
LEAD_MAX_SEC = 0.080                            # cap on the per-patch attack compensation (see patch_lead)

LOG = []


def log(msg):
    print(msg, flush=True)
    LOG.append(msg)


def wsl_path(p):
    p = pathlib.Path(p).resolve()
    return "/mnt/" + p.drive[0].lower() + p.as_posix()[2:]


# ---------------------------------------------------------------- MIDI in

def read_midi(path):
    """Return (ticks_per_beat, tempo_us, (num, den), {track_name: [(start, end, pitch, vel)]}). One tempo, one metre."""
    mf = mido.MidiFile(path)
    tempos, metres, tracks = [], [], {}
    for tr in mf.tracks:
        t, open_notes, notes = 0, {}, []
        for msg in tr:
            t += msg.time
            if msg.type == "set_tempo":
                tempos.append((t, msg.tempo))
            elif msg.type == "time_signature":
                metres.append((t, msg.numerator, msg.denominator))
            elif msg.type == "note_on" and msg.velocity > 0:
                open_notes.setdefault((msg.channel, msg.note), []).append((t, msg.velocity))
            elif msg.type in ("note_off", "note_on"):
                stack = open_notes.get((msg.channel, msg.note))
                if stack:
                    s, v = stack.pop(0)
                    notes.append((s, t, msg.note, v))
        if any(open_notes.values()):
            sys.exit(f"{path}: unterminated notes in track {tr.name!r}")
        if notes:
            if tr.name in tracks:
                sys.exit(f"duplicate track name {tr.name!r}")
            tracks[tr.name] = sorted(notes, key=lambda n: (n[0], n[2], n[1]))
    tempos, metres = sorted(set(tempos)), sorted(set(metres))   # LilyPond 2.6 repeats both in every track
    if len(tempos) != 1 or len(metres) != 1 or tempos[0][0] or metres[0][0]:
        sys.exit(f"{path}: expected one tempo and one time signature at tick 0, got {tempos} {metres}")
    return mf.ticks_per_beat, tempos[0][1], metres[0][1:], tracks


class TempoMap:
    """Ticks -> seconds from the excerpt start. Fermata bars are slowed by their factor."""

    def __init__(self, tpb, tempo_us, bar_ticks, start_tick, end_tick, first_bar, fermatas):
        self.tpb, self.start = tpb, start_tick
        base = tempo_us / 1e6 / tpb                     # seconds per tick
        self.base_bpm = 60e6 / tempo_us
        self.seg_ticks, self.seg_spt = [start_tick], [base]
        for bar, factor in sorted((int(b), float(f)) for b, f in (fermatas or {}).items()):
            b0 = start_tick + (bar - first_bar) * bar_ticks
            if not (start_tick <= b0 < end_tick):
                continue
            for tick, spt in ((b0, base * factor), (b0 + bar_ticks, base)):
                if self.seg_ticks[-1] == tick:
                    self.seg_spt[-1] = spt
                else:
                    self.seg_ticks.append(tick)
                    self.seg_spt.append(spt)
        self.seg_sec = [0.0]
        for i in range(1, len(self.seg_ticks)):
            self.seg_sec.append(self.seg_sec[-1] + (self.seg_ticks[i] - self.seg_ticks[i - 1]) * self.seg_spt[i - 1])

    def sec(self, tick):
        i = max(0, bisect.bisect_right(self.seg_ticks, tick) - 1)
        return self.seg_sec[i] + (tick - self.seg_ticks[i]) * self.seg_spt[i]

    def tempo_list(self):
        out = []
        for s, spt in zip(self.seg_sec, self.seg_spt):
            bpm = round(60 / (spt * self.tpb), 3)
            if not out or out[-1]["bpm"] != bpm:
                out.append({"t": round(s, 4), "bpm": bpm})
        return out


# ---------------------------------------------------------------- notes

def glyph_for(beats):
    best = min(GLYPH_BEATS, key=lambda g: abs(math.log2(max(beats, 1e-3) / g[1])))
    return best[0]


def dynamics_fn(points):
    """groups.yaml `dynamics`: [[bar, vel], ...] steps to vel at that bar; [bar, vel, ramp] ramps linearly from the
    previous point. Bars are 1-based and may be fractional. Returns f(bar_position) -> velocity, or None."""
    if not points:
        return None
    pts = [(float(p[0]), float(p[1]), len(p) > 2 and p[2] == "ramp") for p in points]

    def f(bar):
        v = pts[0][1]
        for i, (b, vel, ramp) in enumerate(pts):
            if bar < b:
                if ramp and i > 0:
                    b0, v0 = pts[i - 1][0], pts[i - 1][1]
                    return v0 + (vel - v0) * (bar - b0) / (b - b0)
                return v
            v = vel
        return v
    return f


def build_notes(cfg, tpb, tempo_us, metre, tracks):
    num, den = metre
    bar_ticks = tpb * 4 * num // den
    ex = cfg["excerpt"]
    start_tick = (ex["first_bar"] - 1) * bar_ticks
    end_tick = ex["last_bar"] * bar_ticks
    # excerpt.notes_before_beat (opt-in): notes starting on or after this 1-based beat of last_bar are left out
    # (e.g. a pickup into the next section); the bar itself keeps its full length
    note_end = end_tick
    if ex.get("notes_before_beat") is not None:
        note_end = end_tick - bar_ticks + round((ex["notes_before_beat"] - 1) * tpb * 4 / den)
    tmap = TempoMap(tpb, tempo_us, bar_ticks, start_tick, end_tick, ex["first_bar"], cfg.get("fermatas"))

    track_to = {}
    for stem, sc in cfg["stems"].items():
        if stem not in STEM_ORDER:
            sys.exit(f"unknown stem {stem}")
        for pi, part in enumerate(sc["parts"]):
            for name in part["tracks"]:
                if name not in tracks:
                    sys.exit(f"groups.yaml names track {name!r}, MIDI has {list(tracks)}")
                if name in track_to:
                    sys.exit(f"track {name!r} mapped twice")
                track_to[name] = (stem, pi)

    dyn = dynamics_fn(cfg.get("dynamics"))
    source_count, dropped, unmapped = 0, 0, {}
    rng = random.Random(cfg["seed"])
    notes = []
    for name, tnotes in tracks.items():                      # file order: deterministic RNG draws
        for (s, e, pitch, vel) in tnotes:
            if not (start_tick <= s < end_tick):
                continue
            if s >= note_end:
                dropped += 1
                continue
            source_count += 1
            if name not in track_to:
                unmapped[name] = unmapped.get(name, 0) + 1
                continue
            stem, pi = track_to[name]
            sc = cfg["stems"][stem]
            fam = cfg["families"][sc["family"]]
            e = min(e, end_tick)
            t0, t1 = tmap.sec(s), tmap.sec(e)
            jitter = rng.uniform(-JITTER_SEC, JITTER_SEC)
            if dyn:                                         # score dynamics replace a flat source velocity
                vel = dyn(1 + s / bar_ticks)
            v = 127 * (vel / 127) ** fam["gamma"] * fam["gain"] + rng.randint(-fam["jitter"], fam["jitter"])
            part = sc["parts"][pi]
            pitch += int(part.get("transpose", 0))           # part.transpose (opt-in): semitones, for a mis-transposed track
            dur_beats = (e - s) / tpb
            notes.append({
                "t": max(0.0, t0 + jitter), "dur": t1 - t0, "pitch": pitch, "vel": int(min(127, max(1, round(v)))),
                "stem": stem, "beat": (s - start_tick) / tpb, "dur_beats": dur_beats, "tick": s, "ticks": e - s,
                "part": pi, "short": dur_beats <= part.get("short_beats", cfg["short_beats"]) + 1e-9,
                "src_vel": round(vel), "track": name,
            })
    if unmapped:
        sys.exit(f"tracks with notes in the excerpt but no stem: {unmapped}")

    # glyphs: nearest written value; eighths/sixteenths that touch a same-value neighbour in the stem are beamed
    for n in notes:
        n["glyph"] = glyph_for(n["dur_beats"])
    by_stem = {}
    for n in notes:
        if n["glyph"] in ("eighth", "sixteenth"):
            by_stem.setdefault((n["stem"], n["glyph"]), set()).add(n["tick"])
    for n in notes:
        if n["glyph"] in ("eighth", "sixteenth"):
            starts = by_stem[(n["stem"], n["glyph"])]
            if (n["tick"] + n["ticks"]) in starts or (n["tick"] - n["ticks"]) in starts:
                n["glyph"] = "beamed_eighths" if n["glyph"] == "eighth" else "beamed_sixteenths"

    notes.sort(key=lambda n: (n["t"], STEM_ORDER.index(n["stem"]), n["pitch"], n["tick"]))
    for i, n in enumerate(notes):
        n["id"] = i

    excerpt_sec = tmap.sec(end_tick)
    beats, downbeats = [], []
    beat_ticks = tpb * 4 // den
    for k, tick in enumerate(range(start_tick, end_tick, beat_ticks)):
        beats.append(round(tmap.sec(tick), 4))
        if (tick - start_tick) % bar_ticks == 0:
            downbeats.append(beats[-1])
    beats_json = {"tempo": tmap.tempo_list(), "beats": beats, "downbeats": downbeats}
    info = {"bar_ticks": bar_ticks, "start_tick": start_tick, "end_tick": end_tick, "excerpt_sec": excerpt_sec,
            "source_count": source_count, "base_bpm": tmap.base_bpm, "dropped": dropped}
    return notes, beats_json, info


# ---------------------------------------------------------------- render

def sfz_key_range(path):
    lo, hi = 127, 0
    names = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}

    def key(v):
        v = v.strip().lower()
        if v.lstrip("-").isdigit():
            return int(v)
        m = re.match(r"([a-g])([#b]?)(-?\d+)", v)
        return (int(m.group(3)) + 1) * 12 + names[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)

    text = path.read_text(errors="replace")
    for op, v in re.findall(r"\b(lokey|hikey|key)=(\S+)", text):
        k = key(v)
        if op in ("lokey", "key"):
            lo = min(lo, k)
        if op in ("hikey", "key"):
            hi = max(hi, k)
    return lo, hi


def patch_lead(sfz_path):
    """Seconds by which a patch's notes are triggered early so the audible attack lands on the written time:
    the median time for a sample's 10 ms envelope to reach -12 dB of its peak in the first 400 ms (bowed and
    blown attacks build up over 20-110 ms; timpani ~3 ms). Capped at LEAD_MAX_SEC. Cached per SFZ."""
    cache = WORK / "vsco" / "leads.json"
    leads = json.loads(cache.read_text()) if cache.exists() else {}
    if sfz_path.name not in leads:
        import fetch
        vals = []
        for s in fetch.sfz_samples(sfz_path.read_text(errors="replace")):
            x, rate = read_mono(sfz_path.parent / s, None)
            a = np.abs(x[: int(0.4 * rate)])
            env = np.convolve(a, np.ones(rate // 100) / (rate // 100), "same")
            vals.append(int(np.argmax(env >= env.max() * 0.25)) / rate)
        leads[sfz_path.name] = round(float(np.median(vals)), 4)
        cache.write_text(json.dumps(leads, indent=1, sort_keys=True))
    return min(leads[sfz_path.name], LEAD_MAX_SEC)


def write_layer_midi(notes, path, total_sec, key_range, lead=0.0):
    """Notes -> type-0 MIDI at 1 tick = 0.5 ms. Out-of-range pitches fold by octaves into the sample range (render only).
    Same-pitch notes within 30 ms are rendered once (unison doublings); an earlier same-pitch note is cut just before
    the next one starts so its note-off doesn't release the new voice. Returns (rendered, folded, merged)."""
    lo, hi = key_range
    folded = merged = 0
    tick = lambda sec: int(round(sec * 1e6 / RENDER_TEMPO * RENDER_TPB))
    items = []
    for n in sorted(notes, key=lambda n: (n["t"], n["pitch"])):
        p = n["pitch"]
        while p > hi:
            p -= 12
        while p < lo:
            p += 12
        if p != n["pitch"]:
            folded += 1
        on = tick(max(0.0, n["t"] - lead))
        items.append([on, max(tick(n["t"] + n["dur"] - lead), on + 20), p, n["vel"]])
    last = {}
    kept = []
    for it in items:
        prev = last.get(it[2])
        if prev is not None and it[0] - prev[0] < 60:          # < 30 ms: same attack, keep one
            prev[1] = max(prev[1], it[1])
            prev[3] = max(prev[3], it[3])
            merged += 1
            continue
        if prev is not None and prev[1] >= it[0]:
            prev[1] = max(prev[0] + 1, it[0] - 1)
        last[it[2]] = it
        kept.append(it)
    events = []
    for on, off, p, v in kept:
        events.append((on, 1, p, v))
        events.append((off, 0, p, 0))
    events.sort(key=lambda e: (e[0], e[1]))                   # offs before ons at the same tick
    mf = mido.MidiFile(type=0, ticks_per_beat=RENDER_TPB)
    tr = mido.MidiTrack()
    mf.tracks.append(tr)
    tr.append(mido.MetaMessage("set_tempo", tempo=RENDER_TEMPO, time=0))
    now = 0
    for t, kind, p, v in events:
        tr.append(mido.Message("note_on" if kind else "note_off", note=p, velocity=v if kind else 0, time=t - now))
        now = t
    # sfizz_render --use-eot stops at the last *event* (a trailing end-of-track delta is ignored), so a harmless
    # controller message at total_sec makes every layer render the same length, release tails included.
    tr.append(mido.Message("control_change", control=119, value=0, time=max(0, tick(total_sec) - now)))
    tr.append(mido.MetaMessage("end_of_track", time=0))
    mf.save(path)
    return len(kept), folded, merged


def render_layers(layers, render_dir):
    """layers: list of (name, sfz_file, midi_path). Runs every sfizz_render in one WSL call."""
    lines = ["set -euo pipefail", f"SFZ_BIN={SFIZZ}", f"cd {wsl_path(WORK / 'vsco')}"]
    for name, sfz, midi in layers:
        out = render_dir / f"{name}.wav"
        lines.append(f'echo "render {name} <- {sfz}"')
        lines.append(f'"$SFZ_BIN" --sfz "{sfz}" --midi "{wsl_path(midi)}" --wav "{wsl_path(out)}" '
                     f'--samplerate {SR} --polyphony 256 --use-eot > "{wsl_path(render_dir / (name + ".log"))}" 2>&1')
    script = render_dir / "render.sh"
    script.write_text("\n".join(lines) + "\n", newline="\n")
    t0 = time.time()
    r = subprocess.run(["wsl", "-d", "Ubuntu", "--", "bash", "-l", wsl_path(script)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"sfizz_render failed:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
    log(f"rendered {len(layers)} layers with sfizz_render in {time.time() - t0:.1f} s")


def read_mono(path, n):
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", wavfile.WavFileWarning)   # VSCO files carry extra RIFF chunks
        rate, data = wavfile.read(path)
    if rate != SR and n is not None:
        sys.exit(f"{path}: {rate} Hz, expected {SR}")
    x = data.astype(np.float64)
    if data.dtype == np.int16:
        x /= 32768
    elif data.dtype == np.int32:
        x /= 2147483648
    if x.ndim == 2:
        x = x.mean(axis=1)                                    # stereo sample libraries -> mono stem
    if n is None:
        return x, rate
    out = np.zeros(n)
    out[:min(n, len(x))] = x[:n]
    return out, len(x)


# ---------------------------------------------------------------- reverb, loudness, encode

def make_ir():
    """Synthetic hall impulse response, generated (so it is ours, CC0) and deterministic: sparse early reflections,
    then exponentially decaying noise split into three bands with their own RT60, energy-normalised."""
    rv = REVERB
    rng = np.random.default_rng(rv["seed"])
    n = int(rv["length"] * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    bands = {
        "low": butter(4, 300, "lowpass", fs=SR, output="sos"),
        "mid": butter(4, [300, 3000], "bandpass", fs=SR, output="sos"),
        "high": butter(4, 3000, "highpass", fs=SR, output="sos"),
    }
    tail = sum(sosfilt(sos, noise) * np.exp(-6.9078 * t / rv["rt60"][b]) for b, sos in bands.items())
    tail *= np.clip(t / 0.08, 0, 1)                           # late field builds up over 80 ms
    ir = np.zeros(n)
    pd = int(rv["predelay"] * SR)
    ir[pd:] = tail[: n - pd] * 0.6
    for k in range(14):                                       # early reflections 8-90 ms
        d = int(SR * (0.008 + 0.082 * (k / 13) ** 1.3 + rng.uniform(-0.002, 0.002)))
        ir[d] += rng.choice([-1, 1]) * 0.9 * math.exp(-k / 6)
    ir /= math.sqrt(np.sum(ir ** 2))
    return ir


def ffmpeg(*args, capture=False):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed: {' '.join(args)}\n{r.stderr[-2000:]}")
    return r.stderr


def loudness(x, tmp):
    """Integrated loudness (LUFS) and true peak (dBTP) from ffmpeg's loudnorm analysis pass."""
    wavfile.write(tmp, SR, x.astype(np.float32))
    err = ffmpeg("-i", str(tmp), "-af", "loudnorm=print_format=json", "-f", "null", "-")
    m = json.loads(err[err.rindex("{"): err.rindex("}") + 1])
    return float(m["input_i"]), float(m["input_tp"])


def decode_opus(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True)
    if r.returncode:
        sys.exit(f"decode failed {path}")
    return np.frombuffer(r.stdout, dtype=np.float32)


def db(v):
    return 20 * math.log10(max(v, 1e-12))


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("piece")
    ap.add_argument("--skip-render", action="store_true", help="reuse WAVs from a previous run")
    a = ap.parse_args()
    cfg = yaml.safe_load((HERE / "pieces" / a.piece / "groups.yaml").read_text(encoding="utf-8"))
    out_dir = APP / "public" / "pieces" / cfg["id"]
    work = WORK / cfg["id"]
    midi_dir, render_dir, final_dir = work / "midi", work / "render", work / "final"
    for d in (midi_dir, render_dir, final_dir, out_dir / "stems"):
        d.mkdir(parents=True, exist_ok=True)

    # 1. split + excerpt + humanise
    tpb, tempo_us, metre, tracks = read_midi(WORK / "src" / cfg["midi"])
    notes, beats_json, info = build_notes(cfg, tpb, tempo_us, metre, tracks)
    ex = cfg["excerpt"]
    total_sec = info["excerpt_sec"] + ex["tail_sec"]
    n_samples = int(round(total_sec * SR))
    total_sec = n_samples / SR
    counts = {s: sum(1 for n in notes if n["stem"] == s) for s in STEM_ORDER}
    log(f"{cfg['id']}: bars {ex['first_bar']}-{ex['last_bar']} ({metre[0]}/{metre[1]}, quarter = {info['base_bpm']:.1f}), "
        f"excerpt {info['excerpt_sec']:.3f} s + tail {ex['tail_sec']} s = {total_sec:.3f} s")
    log(f"source excerpt notes {info['source_count']}, stem notes {sum(counts.values())}: {counts}")
    if info["dropped"]:
        log(f"left out {info['dropped']} notes starting on or after beat {ex['notes_before_beat']} of bar {ex['last_bar']}")
    if sum(counts.values()) != info["source_count"]:
        sys.exit("note totals do not match the source excerpt")
    empty = [s for s in STEM_ORDER if counts[s] == 0]
    if empty:
        sys.exit(f"stems with no notes in the excerpt: {empty}")

    # 2. per-layer MIDI + render
    layers, layer_stem, layer_info = [], {}, {}
    for stem in STEM_ORDER:
        for pi, part in enumerate(cfg["stems"][stem]["parts"]):
            for art in ("long", "short"):
                sel = [n for n in notes if n["stem"] == stem and n["part"] == pi and n["short"] == (art == "short")]
                if not sel:
                    continue
                name = f"{stem}_{pi}_{art}"
                sfz = part[art]
                rng_ = sfz_key_range(WORK / "vsco" / sfz)
                lead = patch_lead(WORK / "vsco" / sfz)
                rendered, folded, merged = write_layer_midi(sel, midi_dir / f"{name}.mid", total_sec, rng_, lead)
                layer_info[name] = {"sfz": sfz, "notes": len(sel), "rendered": rendered, "folded": folded,
                                    "unison_merged": merged, "sfz_keys": list(rng_), "attack_lead_ms": round(lead * 1000, 1)}
                if folded:
                    log(f"FALLBACK {name}: {folded} notes outside {sfz} keys {rng_} folded by octaves for rendering")
                layers.append((name, sfz, midi_dir / f"{name}.mid"))
                layer_stem[name] = stem
    if not a.skip_render:
        for f in render_dir.glob("*.wav"):
            f.unlink()
        render_layers(layers, render_dir)
    raw = {s: np.zeros(n_samples) for s in STEM_ORDER}
    for name, sfz, _ in layers:
        x, got = read_mono(render_dir / f"{name}.wav", n_samples)
        layer_info[name]["wav_samples"] = got
        if got < n_samples - SR // 1000:
            log(f"note: {name}.wav has {got} samples, padded to {n_samples}")
        if np.max(np.abs(x)) < 1e-5:
            sys.exit(f"layer {name} rendered silent ({sfz})")
        raw[layer_stem[name]] += x

    # 3. reverb
    ir = make_ir()
    wavfile.write(work / "reverb_ir.wav", SR, ir.astype(np.float32))
    fade = np.ones(n_samples)
    fl = int(0.05 * SR)
    fade[-fl:] = np.linspace(1, 0, fl)
    wet = {}
    for s in STEM_ORDER:
        conv = fftconvolve(raw[s], ir)[:n_samples]
        wet[s] = (raw[s] + REVERB["wet"] * conv) * fade

    # 4. loudness: ffmpeg loudnorm measures, a linear gain applies (keeps the score's dynamics)
    tmp = work / "tmp_loud.wav"
    stats = {}
    for s in STEM_ORDER:
        lufs, tp = loudness(wet[s], tmp)
        target = cfg["stems"][s]["lufs"]
        gain_db = target - lufs
        peak = np.max(np.abs(wet[s]))
        if db(peak) + gain_db > -1.0:
            log(f"{s}: gain capped by peak ({db(peak) + gain_db:.1f} dBFS > -1)")
            gain_db = -1.0 - db(peak)
        wet[s] *= 10 ** (gain_db / 20)
        stats[s] = {"lufs_in": lufs, "target": target, "gain_db": round(gain_db, 2)}
    mix = sum(wet.values())
    mix_peak = np.max(np.abs(mix))
    common = 1.0
    if mix_peak > MIX_PEAK_MAX:
        common = MIX_PEAK_MAX / mix_peak
        log(f"mix of all stems peaked at {db(mix_peak):.2f} dBFS; all stems scaled by {db(common):.2f} dB")
        for s in STEM_ORDER:
            wet[s] *= common
        mix *= common
    mix_lufs, mix_tp = loudness(mix, tmp)
    log(f"mix: {mix_lufs:.1f} LUFS, sample peak {db(np.max(np.abs(mix))):.2f} dBFS, true peak {mix_tp:.1f} dBTP")
    wavfile.write(work / "mix_preview.wav", SR, mix.astype(np.float32))

    # 5. encode + measure decoded output
    report_stems = {}
    for s in STEM_ORDER:
        wav = final_dir / f"{s}.wav"
        wavfile.write(wav, SR, wet[s].astype(np.float32))
        opus = out_dir / "stems" / f"{s}.opus"
        ffmpeg("-i", str(wav), "-c:a", "libopus", "-b:a", f"{OPUS_KBPS}k", "-ac", "1", "-ar", str(SR),
               "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(opus))
        dec = decode_opus(opus)
        lufs_out, tp_out = loudness(dec.astype(np.float64), tmp)
        report_stems[s] = {
            "notes": counts[s], "opus_bytes": opus.stat().st_size, "decoded_samples": int(len(dec)),
            "decoded_sec": round(len(dec) / SR, 4), "peak_dbfs": round(db(float(np.max(np.abs(dec)))), 2),
            "rms_dbfs": round(db(float(np.sqrt(np.mean(dec.astype(np.float64) ** 2)))), 2),
            "lufs": round(lufs_out, 1), "true_peak_dbtp": round(tp_out, 1), **stats[s],
        }
    tmp.unlink(missing_ok=True)

    # 6. envelopes from the processed stems (what the listener hears), RMS at 30 Hz, each stem scaled to 0..1
    hop = SR // 30
    frames = int(math.ceil(n_samples / hop))
    env = {}
    for s in STEM_ORDER:
        x = np.zeros(frames * hop)
        x[:n_samples] = wet[s]
        rms = np.sqrt(np.mean(x.reshape(frames, hop) ** 2, axis=1))
        env[s] = [round(float(v), 4) for v in rms / max(float(rms.max()), 1e-12)]

    # 7. JSON
    fixture = json.loads((APP / "public" / "pieces" / "fixture" / "manifest.json").read_text())
    seats = {st["id"]: st["homeSeat"] for st in fixture["stems"]}
    notes_json = [{"id": n["id"], "t": round(n["t"], 4), "dur": round(n["dur"], 4), "pitch": n["pitch"], "vel": n["vel"],
                   "stem": n["stem"], "glyph": n["glyph"], "beat": round(n["beat"], 4)} for n in notes]
    manifest = {
        "id": cfg["id"], "title": cfg["title"], "composer": cfg["composer"], "durationSec": round(total_sec, 4),
        "stems": [{"id": s, "file": f"stems/{s}.opus", "homeSeat": seats[s],
                   "pitchRange": [min(n["pitch"] for n in notes if n["stem"] == s), max(n["pitch"] for n in notes if n["stem"] == s)]}
                  for s in STEM_ORDER],
        "scale": cfg["scale"], "replace": cfg["replace"], "credits": cfg["credits"],
    }
    for name, data in (("notes", notes_json), ("beats", beats_json), ("envelopes", {"rate": 30, "stems": env}),
                       ("manifest", manifest)):
        (out_dir / f"{name}.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n",
                                              encoding="utf-8", newline="\n")

    # 8. report (committed next to groups.yaml as build evidence)
    lengths = [r["decoded_samples"] for r in report_stems.values()]
    decoded_mb = total_sec * SR * 4 * len(STEM_ORDER) / 1e6
    log(f"decoded size estimate: {total_sec:.2f} s x 48000 x 4 B x {len(STEM_ORDER)} stems = {decoded_mb:.1f} MB")
    log(f"opus total {sum(r['opus_bytes'] for r in report_stems.values()) / 1e6:.2f} MB; decoded lengths "
        f"{min(lengths)}..{max(lengths)} samples (spread {(max(lengths) - min(lengths)) / SR * 1000:.2f} ms)")
    for s, r in report_stems.items():
        log(f"  {s:7s} notes {r['notes']:5d}  {r['opus_bytes'] / 1e3:7.1f} kB  {r['decoded_sec']:.3f} s  "
            f"peak {r['peak_dbfs']:6.2f} dBFS  rms {r['rms_dbfs']:6.2f} dBFS  {r['lufs']:6.1f} LUFS")
    report = {
        "piece": cfg["id"], "renderer": "sfizz_render 1.2.3 (built from source in WSL2 Ubuntu 24.04)",
        "samples": "VSCO 2 Community Edition, SFZ branch (CC0-1.0)",
        "reverb": {"type": "convolution with a synthetic IR generated by build.make_ir (no CC0 IR file was at hand)", **REVERB},
        "loudness": "ffmpeg loudnorm analysis pass per stem -> linear gain to the stem's LUFS target (no compression), "
                    f"then one common gain so the 8-stem sum stays under -1 dBFS (applied {db(common):.2f} dB)",
        "excerpt": {**ex, "seconds": round(info["excerpt_sec"], 4), "duration_sec": round(total_sec, 4),
                    "source_notes": info["source_count"]},
        "mix": {"lufs": round(mix_lufs, 1), "true_peak_dbtp": round(mix_tp, 1)},
        "decoded_mb_estimate": round(decoded_mb, 1), "stems": report_stems, "layers": layer_info, "log": LOG,
    }
    (HERE / "pieces" / cfg["id"] / "build_report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8",
                                                                   newline="\n")
    print("done:", out_dir)


if __name__ == "__main__":
    main()
