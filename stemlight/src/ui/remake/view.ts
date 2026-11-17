// Draws the remake surfaces from a RemakeView: one dynamic additive triangle mesh (ribbon band, lane, preview,
// rings, soft glows), one dynamic LineSegments (beat ticks, playhead, region outlines, strings), the reset
// shell, our own NoteGlyphs instance (banit's class, reused unchanged) for the score, ghost outlines and amber
// notes, and the playable instruments (models.ts: harp frame, keyboard, drums; each one draw call, drawn only
// while shown). Every bright line has a soft camera-facing glow either side, so it reads like banit's glowing
// notes and lit instruments rather than a one-pixel line. About 6 to 8 draw calls; empty layers draw nothing.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Object3D,
} from 'three';
import type { StemId, Vec3 } from '../../contracts';
import { SEA } from '../../world/deepsea.ts';
import type { NoteGlyphs } from '../../world/notes/NoteGlyphs';
import { KEYS, laneLocal, PADS, playheadLocal, RESET, RIBBON, toWorld, type Frame } from './layout.ts';
import { drums, harpFrame, instrumentMesh, keyboard, placeModel, resetShell } from './models.ts';
import type { RemakeView } from './state.ts';

const TRI_CAP = 12000; // vertices
const LINE_CAP = 4000;

// Deep-sea glass (17 Nov, src/world/deepsea.ts): the ribbon is frosted teal glass with cyan edge light (cyan is
// touchable), ticks and quiet guides are the water's shallows, amber stays yours. Harp strings glow pale aqua; the
// two tonic strings are a deep rose, as a real harp marks its Cs (much darker than the aqua strings, so the
// marks survive colour blindness: luminance contrast about 4.3, the old red on cream was 3.3).
const C = {
  glass: new Color('#0F4F5E'), teal: new Color(SEA.shallows), cyan: new Color(SEA.cyan), amber: new Color(SEA.amber),
  foam: new Color(SEA.foam), gut: new Color('#D8F6FA'), tonic: new Color('#D0306A'),
};
const AMBER_CB = new Color('#D55E00');
/** How far (m) a freshly plucked string swings either side at its middle. */
export const STRING_SHIVER = 0.004;
const tmpC = new Color(); // scratch colour: Buf.v copies the components at once, so one shared instance is safe

class Buf {
  readonly pos: Float32Array; readonly col: Float32Array; n = 0;
  readonly geometry = new BufferGeometry();
  readonly cap: number;
  constructor(cap: number) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    // BufferAttribute shares the array (Float32BufferAttribute would copy it, and every write below would
    // land in an array the GPU never sees: the ribbon, pads and rings rendered empty until 12 Nov).
    const p = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    const c = new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
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
      const a = this.geometry.getAttribute(name) as BufferAttribute;
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

/**
 * `accent` is each section's colour (banit's ACCENT, passed in by index.ts rather than imported here, so this
 * file and its unit tests never load the world modules).
 */
export function createRemakeView(scene: Object3D, palette: 'default' | 'cb' = 'default', accent: Partial<Record<StemId, string>> = {}) {
  const STEM = Object.fromEntries(Object.entries(accent).map(([k, v]) => [k, new Color(v)])) as Partial<Record<StemId, Color>>;
  const group = new Group();
  group.name = 'remake';
  const tris = new Buf(TRI_CAP), lines = new Buf(LINE_CAP);
  const glow = { vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false } as const;
  const triMesh = new Mesh(tris.geometry, new MeshBasicMaterial({ ...glow, side: DoubleSide }));
  const lineMesh = new LineSegments(lines.geometry, new LineBasicMaterial(glow));
  triMesh.frustumCulled = lineMesh.frustumCulled = false;
  const shell = instrumentMesh(resetShell(), C.cyan, C.cyan); // a glass pearl shell; pinching glows it cyan (models.ts)
  const amber = palette === 'cb' ? AMBER_CB : C.amber;
  const models = {
    harp: instrumentMesh(harpFrame(), amber, C.cyan),
    keys: instrumentMesh(keyboard(), amber, C.cyan, 0.006),
    drums: instrumentMesh(drums(), amber, C.cyan),
  };
  group.add(triMesh, lineMesh, shell, models.harp, models.keys, models.drums);
  scene.add(group);
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
  /**
   * A soft glow along a line: a strip `w` wide either side, facing the eye, bright on the line and fading to
   * nothing at its edges (additive), so a thin line reads with a halo at arm's length.
   */
  function glowLine(a: Vec3, b: Vec3, eye: Vec3, c: Color, k: number, w: number) {
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const side = norm(cross(norm(sub(b, a)), norm(sub(eye, mid))));
    for (const s of [w, -w]) quad(a, addS(a, side, s), addS(b, side, s), b, c, k, 0); // a, b bright; the outer edge dark
  }
  const bright = (a: Vec3, b: Vec3, eye: Vec3, c: Color, k: number, w = 0.006) => { line(a, b, c, k); glowLine(a, b, eye, c, k * 0.35, w); };

  return {
    group,
    models,
    attachGlyphs(g: NoteGlyphs) { glyphs = g; group.add(g.object); },
    draw(view: RemakeView, eye: Vec3) {
      tris.begin(); lines.begin(); glyphs?.begin();
      group.visible = view.visible;
      shell.visible = view.visible;
      if (view.visible) drawAll(view, eye);
      else for (const m of Object.values(models)) m.visible = false;
      tris.end(); lines.end(); glyphs?.end();
    },
  };

  function drawAll(view: RemakeView, eye: Vec3) {
    const R = view.ribbon, hw = RIBBON.halfWidth, lr = RIBBON.laneRadius;
    const L = (x: number, y = 0): Vec3 => { const l = laneLocal(x); return toWorld(R, [l[0], l[1] + y, l[2]]); };
    const stemC = (view.stem && STEM[view.stem]) || C.cyan;

    // Ribbon band: frosted teal glass fading out at both ends (12 slices), a slow shimmer moving through it
    // like light through water, and a faint glint along its top edge.
    const N = 12;
    const kAt = (j: number) => 0.55 * Math.sin((Math.PI * j) / N) * (0.85 + 0.15 * Math.sin(view.clock * 0.8 + j * 0.9));
    for (let i = 0; i < N; i++) {
      const x0 = -hw + (2 * hw * i) / N, x1 = -hw + (2 * hw * (i + 1)) / N;
      const k0 = kAt(i), k1 = kAt(i + 1);
      quad(L(x0, -lr - 0.008), L(x0, lr + 0.008), L(x1, lr + 0.008), L(x1, -lr - 0.008), C.glass, k0, k1);
      line(L(x0, lr + 0.004), L(x1, lr + 0.004), C.foam, 0.1 * k0, 0.1 * k1);
    }
    // Its two edges carry the cyan edge light, brightest in the middle where "now" is.
    for (const y of [lr + 0.008, -lr - 0.008]) {
      for (let i = 0; i < N; i++) {
        const x0 = -hw + (2 * hw * i) / N, x1 = -hw + (2 * hw * (i + 1)) / N;
        const k = 0.3 * Math.sin((Math.PI * (i + 0.5)) / N);
        bright(L(x0, y), L(x1, y), eye, C.cyan, k, 0.008);
      }
    }

    // Lane fill in the stem colour, left open (hollow) where a region is cut.
    if (view.stem) {
      const gaps = view.regions.map((r) => [r.x0, r.x1]).sort((a, b) => a[0] - b[0]);
      let x = -hw;
      // Brighter along the middle, softer at the edges: two strips meeting at the centre line.
      const fill = (a: number, b: number) => {
        if (b <= a) return;
        quad(L(a, 0), L(a, lr), L(b, lr), L(b, 0), stemC, 0.16, 0.05);
        quad(L(a, 0), L(a, -lr), L(b, -lr), L(b, 0), stemC, 0.16, 0.05);
      };
      for (const [a, b] of gaps) { fill(x, a); x = Math.max(x, b); }
      fill(x, hw);
    }

    for (const t of view.ticks) line(L(t.x, t.down ? -lr : -lr * 0.5), L(t.x, t.down ? lr : lr * 0.5), C.teal, t.down ? 0.9 : 0.45);

    // Hollow regions: a bright glowing outline, nothing inside.
    for (const r of view.regions) {
      const a = L(r.x0, -lr), b = L(r.x0, lr), c2 = L(r.x1, lr), d = L(r.x1, -lr);
      bright(a, b, eye, stemC, 1, 0.007); bright(b, c2, eye, stemC, 1, 0.007); bright(c2, d, eye, stemC, 1, 0.007); bright(d, a, eye, stemC, 1, 0.007);
    }
    if (view.preview) {
      const { x0, x1 } = view.preview;
      quad(L(x0, -lr), L(x0, lr), L(x1, lr), L(x1, -lr), C.cyan, 0.22);
      bright(L(x0, -lr - 0.01), L(x0, lr + 0.01), eye, C.cyan, 1); bright(L(x1, -lr - 0.01), L(x1, lr + 0.01), eye, C.cyan, 1);
    }

    // Playhead: a line across the band, a stalk to the bead, the bead (brighter and larger while held).
    const held = view.playheadHeld;
    const bead = toWorld(R, playheadLocal());
    bright(L(0, -lr - 0.012), L(0, lr + 0.012), eye, C.cyan, held ? 1.4 : 0.9, held ? 0.009 : 0.006);
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
    for (const f of view.flights) if (f.k < 0.3) glowDisc(f.from, eye, 0.03 * (1 - f.k / 0.3), amber, 0.7);
    // Fingertips near something playable glow cyan, brighter and larger as they close in: with no controller
    // to buzz, this is the cue that a finger is about to touch.
    for (const t of view.tips ?? []) {
      glowDisc(t.at, eye, 0.01 + 0.012 * t.k, C.cyan, 0.25 + 0.9 * t.k);
      glowDisc(t.at, eye, 0.004, C.cyan, 0.6 + 0.8 * t.k, 8);
    }

    // Pads: two kettle drums (models.ts) whose heads are the strike surfaces. A soft cyan ring round each head
    // says "strike here"; a hit turns the head amber in the model and adds a warm halo above it.
    const up: Vec3 = [0, 1, 0];
    const P = view.play ?? view.seat; // pads, harp, keys and the reset shell all flank the summoned creature
    const sx: Vec3 = [Math.cos(P.yaw), 0, -Math.sin(P.yaw)], sz: Vec3 = [-Math.sin(P.yaw), 0, -Math.cos(P.yaw)];
    const r = PADS.radius;
    placeModel(models.drums, view.pads.length > 0, P, view.pads.map((p) => p.flash));
    for (const pad of view.pads) {
      const c = addS(pad.center, up, 0.002);
      const base = (view.stem === 'perc' || !view.stem ? STEM.perc : null) ?? C.cyan;
      ring(c, sx, sz, r + 0.003, r + 0.007, Math.PI * 2, tmpC.copy(base).lerp(C.cyan, 0.5), 0.55 * (1 - pad.flash), 40);
      ring(c, sx, sz, r + 0.007, r + 0.016, Math.PI * 2, C.cyan, 0.16 * (1 - pad.flash), 40);
      if (pad.flash > 0) glowDisc(addS(pad.center, up, 0.02), eye, r * 1.3, amber, 0.7 * pad.flash);
    }
    if (view.countIn && view.pads.length && view.countInOn !== 'row') {
      // Count-in: a ring around each pad fills clockwise over the bar, pulsing on each tick.
      const { fill, pulse } = view.countIn;
      for (const pad of view.pads) {
        const c = addS(pad.center, up, 0.004);
        ring(c, sx, sz, r + 0.012, r + 0.02, Math.PI * 2, C.teal, 0.5, 48);
        ring(c, sx, sz, r + 0.01, r + 0.024, Math.PI * 2 * fill, C.cyan, 0.8 + 1.2 * pulse, 48);
      }
    }

    // Harp: the frame is a model; the strings are glowing lines, pale aqua (the two tonic strings deep rose, as a
    // real harp marks its Cs), with a soft cyan glow; a plucked string turns amber, glows wider and flares.
    placeModel(models.harp, view.strings.length > 0, P);
    view.strings.forEach((st, i) => {
      const tonic = i === 0 || i === view.strings.length - 1;
      const col = tmpC.copy(tonic ? C.tonic : C.gut).lerp(amber, st.flash);
      line(st.a, st.b, col, 1 + 1.2 * st.flash);
      glowLine(st.a, st.b, eye, C.cyan, 0.22 * (1 - st.flash), 0.005);
      if (st.flash > 0) {
        // A plucked string blurs into a lens, widest in the middle and still at its ends, the way a vibrating
        // string looks to the eye; it flickers and narrows as the flash fades.
        const amp = STRING_SHIVER * st.flash * (0.75 + 0.25 * Math.sin(view.clock * 90 + i * 1.7));
        for (const side of [1, -1]) {
          let prev = st.a;
          for (let k = 1; k <= 8; k++) {
            const u = k / 8, off = side * amp * Math.sin(Math.PI * u);
            const p = addS([st.a[0] + (st.b[0] - st.a[0]) * u, st.a[1] + (st.b[1] - st.a[1]) * u, st.a[2] + (st.b[2] - st.a[2]) * u], sx, off);
            line(prev, p, col, 0.7 * st.flash);
            prev = p;
          }
        }
        glowLine(st.a, st.b, eye, amber, 0.6 * st.flash, 0.004 + 0.008 * st.flash);
        glowDisc([(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2, (st.a[2] + st.b[2]) / 2], eye, 0.03, amber, 0.6 * st.flash);
      }
    });
    // Keyboard: the keys are a model (a pressed key dips 6 mm and turns amber there); a soft cyan glow runs
    // along the front edge of the row, and a pressed key adds a warm halo.
    placeModel(models.keys, view.keys.length > 0, P, view.keys.map((k) => k.flash));
    if (view.keys.length) {
      const hw = KEYS.width / 2, hd = KEYS.depth / 2;
      const f0 = addS(view.keys[0].center, sx, -hw, sz, -hd), f1 = addS(view.keys[view.keys.length - 1].center, sx, hw, sz, -hd);
      glowLine(addS(f0, up, -0.004), addS(f1, up, -0.004), eye, C.cyan, 0.35, 0.006);
    }
    for (const k of view.keys) if (k.flash > 0) glowDisc(addS(k.center, up, 0.015), eye, 0.03, amber, 0.6 * k.flash);
    // Count-in for the harp or keyboard: a bar under the row fills left to right over the bar, pulsing on each tick.
    const row = view.strings.length ? view.strings.map((x) => x.a) : view.keys.map((x) => addS(x.center, sz, -KEYS.depth / 2));
    if (view.countIn && row.length && view.countInOn !== 'pads') {
      const { fill, pulse } = view.countIn;
      const a = addS(row[0], sx, -0.03, up, -0.02), b = addS(row[row.length - 1], sx, 0.03, up, -0.02);
      const m: Vec3 = [a[0] + (b[0] - a[0]) * fill, a[1] + (b[1] - a[1]) * fill, a[2] + (b[2] - a[2]) * fill];
      line(a, b, C.teal, 0.5);
      quad(addS(a, up, -0.004), addS(a, up, 0.004), addS(m, up, 0.004), addS(m, up, -0.004), C.cyan, 0.8 + 1.2 * pulse);
      glowLine(a, m, eye, C.cyan, 0.3 + 0.5 * pulse, 0.012);
    }

    // Reset shell at eye level on the right, a ring around it filling while pinched, a bloom on reset.
    const rc = view.reset.center;
    shell.position.set(rc[0], rc[1] - 0.01, rc[2]);
    shell.rotation.set(-0.5, P.yaw, 0);
    (shell.material.uniforms.uFlash.value as number[])[0] = Math.min(1, 0.8 * view.reset.progress + view.reset.flash);
    glowDisc(rc, eye, 0.05 + 0.03 * view.reset.flash, C.teal, 0.2 + view.reset.progress + view.reset.flash);
    if (view.reset.progress > 0) {
      const f = norm(sub(eye, rc)), u = norm(cross(f, [0, 1, 0])), v = cross(f, u);
      ring(rc, u, v, RESET.radius + 0.008, RESET.radius + 0.016, Math.PI * 2 * view.reset.progress, C.cyan, 1.2, 40);
    }
  }
}
