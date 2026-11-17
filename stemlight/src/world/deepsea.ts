// The deep-sea glass look (17 Nov): one palette and one light for the whole world. Light comes only from the
// sunlit surface far above, so glints, shafts, caustics and the water's glow all agree on it. Colour has a job:
// cyan is something you can touch, amber is what you play, each section keeps its own glow, and everything
// else is water. Imported by the sky, the creatures and the play-surface models (no other imports, so the
// unit tests can load it).
import { Color } from 'three';

export const SEA = {
  abyss: '#03131A', // below you and far away
  deep: '#0B3D4A', // the haze at eye level: far things dissolve into it
  shallows: '#1E7F8C', // the water toward the surface
  surface: '#A8F4FF', // the sunlit surface seen through the window overhead
  foam: '#E6FDFF', // glints and highlights
  cyan: '#7FF6FF', // touchable
  amber: '#FFB547', // yours
} as const;

/** A palette colour as a GLSL vec3 in linear light (the shaders end with colorspace_fragment). */
export function glslColor(hex: string | Color): string {
  const c = typeof hex === 'string' ? new Color(hex) : hex;
  return `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;
}

/** The eye-level haze far things dissolve into: 70 % of the way from the abyss to the deep teal. */
const HAZE = new Color(SEA.abyss).lerp(new Color(SEA.deep), 0.7);

/** Fraction of haze at a distance in metres: about 13 % at 2 m, half at 10 m. */
export const FOG_DENSITY = 0.07;

/**
 * GLSL shared by everything lit in the sea. seaEnv: what a glossy surface reflects for a reflected ray's
 * height. seaGlass: glass lit from above, a tinted body you half see into, the surface's light reflected at
 * grazing angles and a sharp glint; `fres` comes back 0 facing you, 1 at the silhouette. seaFog: haze amount.
 * dapple: the surface's moving light on upward faces, -1..1, cheap enough for every lit fragment.
 */
export const SEA_GLSL = /* glsl */ `
const vec3 SEA_ABYSS = ${glslColor(SEA.abyss)};
const vec3 SEA_DEEP = ${glslColor(SEA.deep)};
const vec3 SEA_HAZE = ${glslColor(HAZE)};
const vec3 SEA_SHALLOWS = ${glslColor(SEA.shallows)};
const vec3 SEA_SURFACE = ${glslColor(SEA.surface)};
const vec3 SEA_FOAM = ${glslColor(SEA.foam)};
const vec3 SEA_L = vec3(-0.19, 0.95, 0.24);
vec3 seaEnv(float ry) {
  vec3 c = mix(SEA_ABYSS, SEA_DEEP, smoothstep(-0.7, 0.05, ry));
  c = mix(c, SEA_SHALLOWS * 0.6, smoothstep(0.1, 0.7, ry));
  return mix(c, SEA_SURFACE * 0.7, smoothstep(0.75, 0.98, ry));
}
vec3 seaGlass(vec3 N, vec3 V, vec3 tint, float gloss, out float fres) {
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  fres = pow(1.0 - ndv, 3.0);
  float diff = max(dot(N, SEA_L), 0.0);
  float wrap = 0.5 + 0.5 * dot(N, SEA_L);
  // Through the glass you half see the water behind it, tinted by the glass's own colour.
  vec3 through = SEA_HAZE * 1.6 * mix(vec3(1.0), tint * 1.6, 0.5);
  vec3 body = mix(through, tint * (0.08 + 0.22 * wrap + 0.2 * diff), 0.55 + 0.25 * gloss);
  // Reflections: the water, plus one bright band (the shafts' light) that draws streaks along curved parts.
  float ry = reflect(-V, N).y;
  vec3 env = seaEnv(ry) + SEA_FOAM * 0.45 * smoothstep(0.28, 0.4, ry) * (1.0 - smoothstep(0.48, 0.6, ry));
  env *= mix(vec3(1.0), tint * 2.2, 0.7 * gloss); // metal tints what it reflects: brass stays gold
  vec3 c = mix(body, env * (0.8 + 0.6 * gloss), clamp(mix(0.06, 0.35, gloss) + 0.6 * fres, 0.0, 0.85));
  float glint = pow(max(dot(N, normalize(SEA_L + V)), 0.0), mix(60.0, 200.0, gloss));
  return c + SEA_FOAM * glint * (0.5 + 1.0 * gloss);
}
float seaFog(float dist) { return 1.0 - exp(-dist * ${FOG_DENSITY.toFixed(3)}); }
float dapple(vec3 p, float t) {
  return 0.6 * sin(p.x * 11.0 + t * 1.1) * sin(p.z * 9.0 - t * 0.9) + 0.4 * sin((p.x + p.z) * 17.0 + t * 1.7);
}`;
