#!/usr/bin/env python3
"""Build the note-glyph MSDF atlas from Bravura. Output is committed; rerun only to change glyphs.

Needs: pip install fonttools; npm i msdf-bmfont-xml@2.8.0
Font: https://raw.githubusercontent.com/steinbergmedia/bravura/37b194378b710cc40e406ab6c4b07608bb9548ae/redist/otf/Bravura.otf

  python3 build_atlas.py Bravura.otf node_modules/.bin/msdf-bmfont

Bravura has a Reserved Font Name under OFL 1.1, so the derived files don't use that name.
"""
import json
import pathlib
import subprocess
import sys
import tempfile

from fontTools.fontBuilder import FontBuilder
from fontTools.misc.transform import Offset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).parent
NAME = "note-glyphs-msdf"
EM_PX, RANGE_PX, ATLAS_PX = 96, 12, 512
DOT, DOT_GAP = 0xE1E7, 60

# Contract Glyph name -> SMuFL/Unicode code points drawn left to right.
GLYPHS = {
    "whole": [0xE1D2],
    "half": [0xE1D3],
    "dotted_half": [0xE1D3, DOT],
    "quarter": [0xE1D5],
    "dotted_quarter": [0xE1D5, DOT],
    "eighth": [0xE1D7],
    "sixteenth": [0xE1D9],
    "beamed_eighths": [0x266B],
    "beamed_sixteenths": [0x266C],
}


def compose_font(src_path, out_path):
    src = TTFont(src_path)
    source, cmap = src.getGlyphSet(), src.getBestCmap()
    charstrings = {".notdef": T2CharStringPen(500, source).getCharString()}
    metrics, new_cmap, centres = {".notdef": (500, 0)}, {}, {}

    for i, (name, points) in enumerate(GLYPHS.items()):
        x = 0
        width = sum(source[cmap[p]].width for p in points) + DOT_GAP * (len(points) - 1)
        pen = T2CharStringPen(width, source)
        bounds = BoundsPen(source)
        for p in points:
            glyph = source[cmap[p]]
            glyph.draw(TransformPen(pen, Offset(x, 0)))
            glyph.draw(TransformPen(bounds, Offset(x, 0)))
            x += glyph.width + DOT_GAP
        charstrings[name] = pen.getCharString()
        metrics[name] = (width, 0)
        new_cmap[0xE000 + i] = name
        centres[name] = (bounds.bounds[0] + bounds.bounds[2]) / 2 / 1000

    builder = FontBuilder(1000, isTTF=False)
    builder.setupGlyphOrder(list(charstrings))
    builder.setupCharacterMap(new_cmap)
    builder.setupCFF("NoteGlyphs", {"FullName": "NoteGlyphs"}, charstrings, {})
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=1000, descent=-300)
    builder.setupNameTable({"familyName": "NoteGlyphs", "styleName": "Regular"})
    builder.setupOS2(sTypoAscender=1000, sTypoDescender=-300)
    builder.setupPost()
    builder.save(out_path)
    return centres


def main(font, tool):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        centres = compose_font(font, tmp / "NoteGlyphs.otf")
        text = "".join(chr(0xE000 + i) for i in range(len(GLYPHS)))
        (tmp / "charset.txt").write_text(text, encoding="utf-8")
        subprocess.run(
            [str(pathlib.Path(tool).resolve()), "-f", "json", "-o", str(tmp / NAME), "-s", str(EM_PX),
             "-r", str(RANGE_PX), "-t", "msdf", "-m", f"{ATLAS_PX},{ATLAS_PX}", "-i", str(tmp / "charset.txt"),
             str(tmp / "NoteGlyphs.otf")],
            check=True,
        )
        bm = json.loads((tmp / "NoteGlyphs.json").read_text())
        (HERE / f"{NAME}.png").write_bytes((tmp / f"{NAME}.png").read_bytes())

    w, h = bm["common"]["scaleW"], bm["common"]["scaleH"]
    size, base = bm["info"]["size"], bm["common"]["base"]
    names = list(GLYPHS)
    out = {}
    for ch in bm["chars"]:
        i = ch["id"] - 0xE000
        if not 0 <= i < len(names):
            continue
        name = names[i]
        x0 = ch["xoffset"] / size - centres[name]
        top = (base - ch["yoffset"]) / size
        # uv: left, bottom, right, top in image space. quad: same corners in em, y=0 on the notehead.
        out[name] = {
            "uv": [ch["x"] / w, (ch["y"] + ch["height"]) / h, (ch["x"] + ch["width"]) / w, ch["y"] / h],
            "quad": [round(x0, 4), round(top - ch["height"] / size, 4),
                     round(x0 + ch["width"] / size, 4), round(top, 4)],
        }
    missing = set(names) - set(out)
    if missing:
        sys.exit(f"atlas is missing glyphs: {missing}")
    (HERE / f"{NAME}.json").write_text(json.dumps({"pxRange": RANGE_PX, "glyphs": out}, indent=1) + "\n")


if __name__ == "__main__":
    main(*sys.argv[1:])
