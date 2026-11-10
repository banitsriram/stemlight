#!/usr/bin/env python
"""Download the sources the pipeline needs into pipeline/work/ (gitignored). Idempotent; free sources only.

  python -I stemlight/pipeline/fetch.py            # MIDI scores + only the VSCO 2 CE samples the groups.yaml files use

Scores: Mutopia #941 (Beethoven 5/i, Public Domain) and #1793 (Dvorak 9, CC BY-SA 3.0).
Samples: VSCO 2 Community Edition, SFZ branch (CC0-1.0), https://github.com/sgossner/VSCO-2-CE
"""
import json, pathlib, re, sys, urllib.parse, urllib.request, zipfile

HERE = pathlib.Path(__file__).resolve().parent
WORK = HERE / "work"
SRC, VSCO = WORK / "src", WORK / "vsco"
VSCO_RAW = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/SFZ/"
VSCO_TREE = "https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/SFZ?recursive=1"
UA = {"User-Agent": "stemlight-pipeline"}
SCORES = {
    "Symphony5_1.mid": "https://www.mutopiaproject.org/ftp/BeethovenLv/O67/Symphony5_1/Symphony5_1.mid",
    "Sym9-mids.zip": "https://www.mutopiaproject.org/ftp/DvorakA/O95/Sym9/Sym9-mids.zip",
    "p941.html": "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=941",
    "p1793.html": "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1793",
}
# Small custom SFZ written next to the VSCO files: the single suspended-cymbal stroke in Dvorak (GM key 49),
# pointing at the four rr1 crash samples of GM-StylePerc.sfz so we don't download the whole kit.
CYMBAL_SFZ = """// Stemlight: cymbal crash from VSCO 2 CE Percussion (CC0), regions copied from GM-StylePerc.sfz
<control>
default_path=Percussion/
<global>
ampeg_release=6
ampeg_dynamic=1
""" + "".join(f"""<region>
sample=cymbal-crash1_{d}_rr1.wav
lokey=0
hikey=127
pitch_keycenter=49
pitch_keytrack=0
lovel={lo}
hivel={hi}
volume={vol}
""" for d, lo, hi, vol in (("pp", 0, 30, 25), ("mp", 31, 62, 18), ("mf", 63, 94, 11), ("ff", 95, 127, 4)))


def get(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        data = r.read()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return True


def sfz_samples(text):
    """Return sample paths (forward slashes, default_path applied) referenced by an SFZ file."""
    default, out = "", []
    for line in text.splitlines():
        line = line.split("//")[0]
        m = re.search(r"default_path=(.+?)\s*$", line)
        if m:
            default = m.group(1).strip()
        m = re.search(r"sample=(.+?\.(?:wav|flac|ogg))", line, re.I)
        if m:
            out.append((default + m.group(1).strip()).replace("\\", "/"))
    return out


def needed_sfz():
    import yaml
    names = {"Cymbal-Stemlight.sfz"}
    for g in (HERE / "pieces").glob("*/groups.yaml"):
        cfg = yaml.safe_load(g.read_text(encoding="utf-8"))
        for stem in cfg["stems"].values():
            for part in stem["parts"]:
                names.update(v for k, v in part.items() if k in ("long", "short"))
    return sorted(names)


def main():
    for name, url in SCORES.items():
        if get(url, SRC / name):
            print("downloaded", name)
    with zipfile.ZipFile(SRC / "Sym9-mids.zip") as z:
        z.extract("Mvt4_conFuoco.mid", SRC)
    VSCO.mkdir(parents=True, exist_ok=True)
    (VSCO / "Cymbal-Stemlight.sfz").write_text(CYMBAL_SFZ)
    get(VSCO_RAW + "LICENSE", VSCO / "LICENSE")
    tree_file = WORK / "vsco_tree.json"
    get(VSCO_TREE, tree_file)
    tree = {t["path"].lower(): t for t in json.loads(tree_file.read_text())["tree"] if t["type"] == "blob"}
    wanted = {}
    for sfz in needed_sfz():
        if sfz != "Cymbal-Stemlight.sfz":
            get(VSCO_RAW + sfz, VSCO / sfz)
        for s in sfz_samples((VSCO / sfz).read_text(errors="replace")):
            real = tree.get(s.lower())
            if real is None:
                sys.exit(f"{sfz}: sample not in VSCO tree: {s}")
            wanted[s] = real  # saved at the SFZ's spelling so sfizz finds it on a case-sensitive filesystem
    total = sum(t["size"] for t in wanted.values())
    print(f"{len(wanted)} samples, {total / 1e6:.1f} MB")
    done = 0
    for s, real in sorted(wanted.items()):
        if get(VSCO_RAW + urllib.parse.quote(real["path"]), VSCO / s):
            done += 1
            if done % 100 == 0:
                print("  ...", done)
    bad = [s for s, real in wanted.items() if (VSCO / s).stat().st_size != real["size"]]
    if bad:
        sys.exit(f"size mismatch: {bad[:5]}")
    print(f"samples ok ({done} new)")


if __name__ == "__main__":
    main()
