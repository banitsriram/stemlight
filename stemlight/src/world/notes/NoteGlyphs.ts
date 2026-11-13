import {
  DoubleSide, AdditiveBlending, BufferGeometry, Float32BufferAttribute, Group, DynamicDrawUsage,
  InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, LinearFilter, Mesh,
  NoColorSpace, NormalBlending, ShaderMaterial, Texture, TextureLoader,
} from 'three';
import atlas from './atlas/note-glyphs-msdf.json';
import atlasUrl from './atlas/note-glyphs-msdf.png?url';

export type AtlasGlyph = keyof typeof atlas.glyphs;
export type GlyphMaterial = 'normal' | 'glass' | 'ghost' | 'amber';

export const NOTE_CAP = 1500;
const MATERIALS: GlyphMaterial[] = ['normal', 'glass', 'ghost', 'amber'];
const STRIDE = 16; // iPos 3, iSize 1, iUv 4, iQuad 4, iColor 4

const VERT = /* glsl */ `
attribute vec3 iPos; attribute float iSize; attribute vec4 iUv; attribute vec4 iQuad; attribute vec4 iColor;
varying vec2 vUv; varying vec4 vColor;
void main() {
  vUv = mix(iUv.xy, iUv.zw, position.xy);
  vColor = iColor;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vColor.a *= smoothstep(0.18, 0.5, -mv.z); // a note right at the face fades instead of filling the view
  mv.xy += mix(iQuad.xy, iQuad.zw, position.xy) * iSize; // always faces the viewer
  gl_Position = projectionMatrix * mv;
}`;

// sd is the signed distance in atlas units: 0 on the outline, positive inside.
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float pxRange;
varying vec2 vUv; varying vec4 vColor;
float median(vec3 v) { return max(min(v.r, v.g), min(max(v.r, v.g), v.b)); }
void main() {
  float sd = median(texture2D(map, vUv).rgb) - 0.5;
  float screenRange = max(0.5 * dot(vec2(pxRange) / vec2(textureSize(map, 0)), 1.0 / fwidth(vUv)), 1.0);
  float fill = clamp(screenRange * sd + 0.5, 0.0, 1.0);
  vec3 rgb = vColor.rgb;
  float a = fill;
  // Soft bloom from the distance field outside the outline (no post-processing on Quest).
  float halo = smoothstep(-0.5, 0.0, sd);
  halo *= halo;
#if !defined(GLASS) && !defined(GHOST) && !defined(AMBER)
  rgb = mix(rgb, vec3(1.0), 0.45 * smoothstep(0.02, 0.2, sd)); // hot core
  a = max(fill, 0.5 * halo);
#endif
#if defined(GLASS)
  rgb = mix(rgb, vec3(0.8, 0.92, 1.0), 0.6);
  a *= 0.2 + 0.8 * (1.0 - smoothstep(0.1, 0.3, sd));
#elif defined(GHOST)
  a *= 1.0 - smoothstep(0.18, 0.28, sd);
  a = max(a, 0.3 * halo);
#elif defined(AMBER)
  a = max(a, 0.35 * smoothstep(-0.3, 0.0, sd));
#endif
  a *= vColor.a;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(rgb, a);
  #include <colorspace_fragment>
}`;

function quad(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

class Layer {
  readonly data = new Float32Array(NOTE_CAP * STRIDE);
  readonly buffer = new InstancedInterleavedBuffer(this.data, STRIDE).setUsage(DynamicDrawUsage);
  readonly geometry = new InstancedBufferGeometry();
  readonly mesh: Mesh;
  count = 0;

  constructor(kind: GlyphMaterial, map: Texture, base: BufferGeometry) {
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    const add = (name: string, size: number, offset: number) =>
      this.geometry.setAttribute(name, new InterleavedBufferAttribute(this.buffer, size, offset));
    add('iPos', 3, 0);
    add('iSize', 1, 3);
    add('iUv', 4, 4);
    add('iQuad', 4, 8);
    add('iColor', 4, 12);
    this.geometry.instanceCount = 0;

    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { map: { value: map }, pxRange: { value: atlas.pxRange } },
      defines: kind === 'normal' ? {} : { [kind.toUpperCase()]: 1 },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: kind === 'glass' ? NormalBlending : AdditiveBlending,
    });
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
}

/** Instanced note symbols, one draw call per material. Each frame: begin(), push() per note, end(). */
export class NoteGlyphs {
  readonly object = new Group();
  private readonly layers = {} as Record<GlyphMaterial, Layer>;

  constructor(map: Texture) {
    const base = quad();
    for (const kind of MATERIALS) {
      this.layers[kind] = new Layer(kind, map, base);
      this.object.add(this.layers[kind].mesh);
    }
  }

  begin(): void {
    for (const kind of MATERIALS) this.layers[kind].count = 0;
  }

  /** size is the em height in metres; r, g, b are linear (THREE.Color values). */
  push(kind: GlyphMaterial, glyph: AtlasGlyph, x: number, y: number, z: number, size: number,
    r: number, g: number, b: number, a: number): void {
    const layer = this.layers[kind];
    if (layer.count >= NOTE_CAP) return; // ponytail: per-layer guard only, biyon-37 culls oldest across layers
    const { uv, quad: q } = atlas.glyphs[glyph];
    layer.data.set([x, y, z, size, uv[0], uv[1], uv[2], uv[3], q[0], q[1], q[2], q[3], r, g, b, a], layer.count * STRIDE);
    layer.count++;
  }

  end(): void {
    for (const kind of MATERIALS) {
      const layer = this.layers[kind];
      layer.geometry.instanceCount = layer.count;
      layer.mesh.visible = layer.count > 0;
      layer.buffer.clearUpdateRanges();
      layer.buffer.addUpdateRange(0, layer.count * STRIDE);
      layer.buffer.needsUpdate = true;
    }
  }
}

export async function loadNoteGlyphs(): Promise<NoteGlyphs> {
  const map = await new TextureLoader().loadAsync(atlasUrl);
  map.flipY = false;
  map.generateMipmaps = false;
  map.minFilter = map.magFilter = LinearFilter; // MSDF breaks under mipmapping
  map.colorSpace = NoColorSpace;
  return new NoteGlyphs(map);
}
