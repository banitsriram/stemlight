// Draws the remake surfaces from a RemakeView. Additive glow only, no textures besides banit's note atlas:
// one dynamic triangle mesh (ribbon band, lane, preview, pads, rings, glows), one dynamic LineSegments
// (beat ticks, playhead, hollow region outlines, pad rims), the reset shell, and our own NoteGlyphs
// instance (banit's class, reused unchanged) for the score, ghost outlines and amber notes.
// About 6 draw calls in all; the glyph layers only draw when they have notes.
import {
  AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, LatheGeometry,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D, Vector2,
} from 'three';
import type { StemId, Vec3 } from '../../contracts';
import { ACCENT } from '../../world/creatures';
import type { NoteGlyphs } from '../../world/notes/NoteGlyphs';
import { laneLocal, PADS, playheadLocal, RESET, RIBBON, toWorld, type Frame } from './layout.ts';
import type { RemakeView } from './state.ts';

const TRI_CAP = 12000; // vertices
const LINE_CAP = 4000;

const C = {
  violet: new Color('#2A1B4A'), teal: new Color('#0E5F6B'), cyan: new Color('#6FF3FF'), amber: new Color('#FFB547'),
};
const AMBER_CB = new Color('#D55E00');
const STEM = Object.fromEntries(Object.entries(ACCENT).map(([k, v]) => [k, new Color(v)])) as Record<StemId, Color>;

class Buf {
  readonly pos: Float32Array; readonly col: Float32Array; n = 0;
  readonly geometry = new BufferGeometry();
  constructor(readonly cap: number) {
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    const p = new Float32BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    const c = new Float32BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', p);
    this.geometry.setAttribute('color', c);
  }
  v(p: Vec3, c: Color, k: number) {
    if (this.n >= this.cap) return;
    const i = this.n++ * 3;
    this.pos[i] = p[0]; this.pos[i + 1] = p[1]; this.pos[i + 2] = p[2];
    this.col[i] = c.r * k; this.col[i + 1] = c.g * k; this.col[i + 2] = c.b * k;
  }
  begin() { this.n = 0; }
  end() {
    this.geometry.setDrawRange(0, this.n);
    for (const name of ['position', 'color']) {
      const a = this.geometry.getAttribute(name) as Float32BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * 3);
      a.needsUpdate = true;
    }
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const addS = (p: Vec3, a: Vec3, s: number, b?: Vec3, t = 0): Vec3 =>
  [p[0] + a[0] * s + (b ? b[0] * t : 0), p[1] + a[1] * s + (b ? b[1] * t : 0), p[2] + a[2] * s + (b ? b[2] * t : 0)];

function shellGeometry(): BufferGeometry {
  // A scallop: a shallow fluted dome, lathed, with ribs pressed into the rim.
  const prof: Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push(new Vector2(Math.sin(a) * 0.04, Math.cos(a) * 0.022)); }
  const g = new LatheGeometry(prof, 18);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const rib = 1 + 0.12 * Math.cos(Math.atan2(z, x) * 9) * (r / 0.04);
    p.setXYZ(i, x * rib, p.getY(i), z * rib);
  }
  g.computeVertexNormals();
  return g;
}

export function createRemakeView(scene: Object3D, palette: 'default' | 'cb' = 'default') {
  const group = new Group();
  group.name = 'remake';
  const tris = new Buf(TRI_CAP), lines = new Buf(LINE_CAP);
  const glow = { vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false } as const;
  const triMesh = new Mesh(tris.geometry, new MeshBasicMaterial({ ...glow, side: DoubleSide }));
  const lineMesh = new LineSegments(lines.geometry, new LineBasicMaterial(glow));
  triMesh.frustumCulled = lineMesh.frustumCulled = false;
  const shellMat = new MeshBasicMaterial({ color: C.teal, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const shell = new Mesh(shellGeometry(), shellMat);
  group.add(triMesh, lineMesh, shell);
  scene.add(group);
  const amber = palette === 'cb' ? AMBER_CB : C.amber;
  let glyphs: NoteGlyphs | null = null;

  /** A camera-facing soft disc: a fan bright at the centre fading to black (additive) at the rim. */
  function glowDisc(p: Vec3, eye: Vec3, r: number, c: Color, k: number, seg = 14) {
    const f = norm(sub(eye, p));
    const u = norm(cross(f, Math.abs(f[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0])), v = cross(f, u);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      tris.v(p, c, k);
      tris.v(addS(p, u, Math.cos(a0) * r, v, Math.sin(a0) * r), c, 0);
      tris.v(addS(p, u, Math.cos(a1) * r, v, Math.sin(a1) * r), c, 0);
    }
  }
  /** A flat band between two radii in the plane spanned by u, v, from angle 0 to `upto` (radians). */
  function ring(p: Vec3, u: Vec3, v: Vec3, r0: number, r1: number, upto: number, c: Color, k: number, seg = 48, sz = 1) {
    const n = Math.max(1, Math.ceil((seg * upto) / (Math.PI * 2)));
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI / 2 - (i / n) * upto, a1 = Math.PI / 2 - ((i + 1) / n) * upto; // clockwise from the top
      const q = (a: number, r: number) => addS(p, u, Math.cos(a) * r, v, Math.sin(a) * r * sz);
      const A = q(a0, r0), B = q(a0, r1), Cc = q(a1, r1), D = q(a1, r0);
      tris.v(A, c, k); tris.v(B, c, k); tris.v(Cc, c, k);
      tris.v(A, c, k); tris.v(Cc, c, k); tris.v(D, c, k);
    }
  }
  function quad(a: Vec3, b: Vec3, c2: Vec3, d: Vec3, col: Color, ka: number, kb = ka) {
    tris.v(a, col, ka); tris.v(b, col, kb); tris.v(c2, col, kb);
    tris.v(a, col, ka); tris.v(c2, col, kb); tris.v(d, col, ka);
  }
  const line = (a: Vec3, b: Vec3, c: Color, k: number, kb = k) => { lines.v(a, c, k); lines.v(b, c, kb); };

  return {
    group,
    attachGlyphs(g: NoteGlyphs) { glyphs = g; group.add(g.object); },
    draw(view: RemakeView, eye: Vec3) {
      tris.begin(); lines.begin(); glyphs?.begin();
      group.visible = view.visible;
      shell.visible = view.visible;
      if (view.visible) drawAll(view, eye);
      tris.end(); lines.end(); glyphs?.end();
    },
  };

  function drawAll(view: RemakeView, eye: Vec3) {
    const R = view.ribbon, hw = RIBBON.halfWidth, lr = RIBBON.laneRadius;
    const L = (x: number, y = 0): Vec3 => { const l = laneLocal(x); return toWorld(R, [l[0], l[1] + y, l[2]]); };
    const stemC = view.stem ? STEM[view.stem] : C.cyan;

    // Ribbon band: violet, fading out at both ends (12 slices).
    const N = 12;
    for (let i = 0; i < N; i++) {
      const x0 = -hw + (2 * hw * i) / N, x1 = -hw + (2 * hw * (i + 1)) / N;
      const k0 = 0.9 * Math.sin((Math.PI * i) / N), k1 = 0.9 * Math.sin((Math.PI * (i + 1)) / N);
      quad(L(x0, -lr - 0.008), L(x0, lr + 0.008), L(x1, lr + 0.008), L(x1, -lr - 0.008), C.violet, k0, k1);
    }
    line(L(-hw, lr + 0.008), L(hw, lr + 0.008), C.teal, 0.35);
    line(L(-hw, -lr - 0.008), L(hw, -lr - 0.008), C.teal, 0.35);

    // Lane fill in the stem colour, left open (hollow) where a region is cut.
    if (view.stem) {
      const gaps = view.regions.map((r) => [r.x0, r.x1]).sort((a, b) => a[0] - b[0]);
      let x = -hw;
      const fill = (a: number, b: number) => { if (b > a) quad(L(a, -lr), L(a, lr), L(b, lr), L(b, -lr), stemC, 0.1); };
      for (const [a, b] of gaps) { fill(x, a); x = Math.max(x, b); }
      fill(x, hw);
    }

    for (const t of view.ticks) line(L(t.x, t.down ? -lr : -lr * 0.5), L(t.x, t.down ? lr : lr * 0.5), C.teal, t.down ? 0.9 : 0.45);

    // Hollow regions: a bright outline with an inner second outline, nothing inside.
    for (const r of view.regions) {
      for (const inset of [0, 0.004]) {
        const a = L(r.x0 + inset, -lr + inset), b = L(r.x0 + inset, lr - inset), c2 = L(r.x1 - inset, lr - inset), d = L(r.x1 - inset, -lr + inset);
        const k = inset ? 0.4 : 1;
        line(a, b, stemC, k); line(b, c2, stemC, k); line(c2, d, stemC, k); line(d, a, stemC, k);
      }
    }
    if (view.preview) {
      const { x0, x1 } = view.preview;
      quad(L(x0, -lr), L(x0, lr), L(x1, lr), L(x1, -lr), C.cyan, 0.22);
      line(L(x0, -lr - 0.01), L(x0, lr + 0.01), C.cyan, 1); line(L(x1, -lr - 0.01), L(x1, lr + 0.01), C.cyan, 1);
    }

    // Playhead: a line across the band, a stalk to the bead, the bead (brighter and larger while held).
    const held = view.playheadHeld;
    const bead = toWorld(R, playheadLocal());
    line(L(0, -lr - 0.012), L(0, lr + 0.012), C.cyan, held ? 1.4 : 0.9);
    line(L(0, lr + 0.012), bead, C.cyan, held ? 1 : 0.5, held ? 1.2 : 0.7);
    glowDisc(bead, eye, held ? 0.034 : 0.022, C.cyan, held ? 1.6 : 0.8);
    glowDisc(bead, eye, 0.008, C.cyan, 1.5, 8);

    // Notes on the lane: the score, ghost outlines in cut regions, the user's amber notes.
    if (glyphs) {
      const size = 0.024;
      for (const m of view.notes) {
        const p = L(m.x, m.y - size * 0.3);
        const fade = 1 - Math.abs(m.x) / hw;
        glyphs.push('normal', m.note.glyph, p[0], p[1], p[2], size, stemC.r, stemC.g, stemC.b, 0.4 + 0.6 * fade);
      }
      for (const r of view.regions) {
        for (const m of r.ghosts) { const p = L(m.x, m.y - size * 0.3); glyphs.push('ghost', m.note.glyph, p[0], p[1], p[2], size * 1.1, stemC.r, stemC.g, stemC.b, 0.9); }
        for (const h of r.hits) { const p = L(h.x, h.y - size * 0.3); glyphs.push('amber', 'quarter', p[0], p[1], p[2], size, amber.r, amber.g, amber.b, 1); }
      }
      for (const f of view.flights) {
        const e = 1 - (1 - f.k) ** 2; // ease out
        const lift = Math.sin(Math.PI * f.k) * 0.06;
        const p: Vec3 = [f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e + lift, f.from[2] + (f.to[2] - f.from[2]) * e];
        glyphs.push('amber', f.glyph, p[0], p[1], p[2], 0.04 - 0.014 * e, amber.r, amber.g, amber.b, 1);
      }
    }
    for (const f of view.flights) if (f.k < 0.3) glowDisc(f.from, eye, 0.03 * (1 - f.k / 0.3), amber, 1.2);

    // Pads: glowing discs facing up with a rim; a hit flashes amber.
    const up: Vec3 = [0, 1, 0];
    const S = view.seat, sx: Vec3 = [Math.cos(S.yaw), 0, -Math.sin(S.yaw)], sz: Vec3 = [-Math.sin(S.yaw), 0, -Math.cos(S.yaw)];
    for (const pad of view.pads) {
      const flash = pad.flash;
      const base = view.stem === 'perc' || !view.stem ? STEM.perc : C.teal;
      for (let i = 0; i < 24; i++) {
        const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2, r = PADS.radius;
        tris.v(pad.center, flash > 0 ? amber : C.teal, 0.5 + 1.5 * flash);
        tris.v(addS(pad.center, sx, Math.cos(a0) * r, sz, Math.sin(a0) * r), C.teal, 0.12 + 0.3 * flash);
        tris.v(addS(pad.center, sx, Math.cos(a1) * r, sz, Math.sin(a1) * r), C.teal, 0.12 + 0.3 * flash);
        line(addS(pad.center, sx, Math.cos(a0) * r, sz, Math.sin(a0) * r), addS(pad.center, sx, Math.cos(a1) * r, sz, Math.sin(a1) * r), base, 0.7 + flash);
      }
      if (flash > 0) glowDisc(addS(pad.center, up, 0.01), eye, 0.05 + 0.04 * flash, amber, flash);
    }
    if (view.countIn && view.pads.length) {
      // Count-in ring around the pads: fills clockwise over the bar, pulsing on each tick.
      const mid = view.pads[Math.floor(view.pads.length / 2)].center;
      const c = addS(mid, sz, -0.02, up, 0.004);
      const { fill, pulse } = view.countIn;
      ring(c, sx, sz, 0.27, 0.28, Math.PI * 2, C.teal, 0.25, 64, 0.45);
      ring(c, sx, sz, 0.265, 0.285, Math.PI * 2 * fill, C.cyan, 0.6 + 1.2 * pulse, 64, 0.45);
    }

    // Reset shell beside the right knee, a ring around it filling while pinched, a bloom on reset.
    const rc = view.reset.center;
    shell.position.set(rc[0], rc[1] - 0.01, rc[2]);
    shell.rotation.set(-0.5, S.yaw, 0);
    shellMat.color.copy(C.teal).lerp(C.cyan, Math.min(1, view.reset.progress + view.reset.flash)).multiplyScalar(0.8 + view.reset.progress);
    glowDisc(rc, eye, 0.05 + 0.03 * view.reset.flash, C.teal, 0.6 + view.reset.progress + view.reset.flash);
    if (view.reset.progress > 0) {
      const f = norm(sub(eye, rc)), u = norm(cross(f, [0, 1, 0])), v = cross(f, u);
      ring(rc, u, v, RESET.radius + 0.008, RESET.radius + 0.016, Math.PI * 2 * view.reset.progress, C.cyan, 1.2, 40);
    }
  }
}
