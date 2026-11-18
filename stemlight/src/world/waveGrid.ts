// The rippling grid of dark cubes: the loading screen and start page background (web/loader.ts) and the floor of
// the song picker's lobby (src/ui/remake/pickerView.ts). Ripples start on their own to a steady beat.
// Wave displacement adapted from the "3D Wave Grid" demo.
import { BoxGeometry, Color, DataTexture, FloatType, InstancedBufferAttribute, InstancedMesh, MeshBasicMaterial, Object3D, RGBAFormat } from 'three';

export const MAX_TRAIL = 128;

export interface WaveSize {
  bounds: number; speed: number; freq: number; width: number; amplitude: number; jitter: number; maxHeight: number;
}

/** The ripple sources as a data texture, plus their wave settings as shader uniforms. One ripple every `beat` s. */
export function createWaveTrail(size: WaveSize, beat = 1.1) {
  const data = new Float32Array(MAX_TRAIL * 4);
  const texture = new DataTexture(data, MAX_TRAIL, 1, RGBAFormat, FloatType);
  texture.needsUpdate = true;
  const uniforms = {
    uTrailTexture: { value: texture }, uTrailCount: { value: 0 }, uFadeTime: { value: 2 },
    uWaveSpeed: { value: size.speed }, uWaveFreq: { value: size.freq }, uWaveWidth: { value: size.width },
    uAmplitude: { value: size.amplitude }, uJitter: { value: size.jitter }, uMaxHeight: { value: size.maxHeight },
  };
  const trail: { x: number; z: number; age: number; d: number }[] = [];
  let t = beat; // the first ripple starts at once
  return {
    uniforms,
    update(dt: number) {
      for (let i = trail.length - 1; i >= 0; i--) if ((trail[i].age += dt) > 8) trail.splice(i, 1);
      if ((t += dt) >= beat) {
        t = 0;
        if (trail.length >= MAX_TRAIL) trail.shift();
        trail.push({ x: (Math.random() * 0.5 - 0.25) * size.bounds, z: (Math.random() * 0.5 - 0.25) * size.bounds, age: 0, d: 0.8 + Math.random() * 0.2 });
      }
      trail.forEach((p, i) => data.set([p.x, p.z, p.age, p.d], i * 4));
      texture.needsUpdate = true;
      uniforms.uTrailCount.value = trail.length;
    },
    dispose() { texture.dispose(); },
  };
}

/** Adds the trail's wave displacement to a built-in material's vertex shader (also used by the shadow material). */
export const waveVertex = (src: string) => src
  .replace('#include <common>', /* glsl */ `#include <common>
    varying float vHeight;
    attribute vec2 aOffset;
    uniform sampler2D uTrailTexture;
    uniform int uTrailCount;
    uniform float uWaveSpeed, uWaveFreq, uWaveWidth, uFadeTime, uAmplitude, uJitter, uMaxHeight;
    vec2 hash2(vec2 p) {
      p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
      return fract(sin(p) * 43758.5453123) - 0.5;
    }`)
  .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
    vHeight = 0.0;
    if (position.y > 0.0) {
      vec2 worldXZ = aOffset + hash2(aOffset) * uJitter;
      float waveHeight = 0.0, totalWeight = 0.0;
      for (int i = 0; i < ${MAX_TRAIL}; i++) {
        if (i >= uTrailCount) break;
        vec4 td = texture2D(uTrailTexture, vec2((float(i) + 0.5) / ${MAX_TRAIL}.0, 0.5));
        float dist = length(worldXZ - td.rg);
        float relDist = dist - uWaveSpeed * td.b;
        float weight = exp(-td.b / uFadeTime) * exp(-(relDist * relDist) / (uWaveWidth * uWaveWidth)) / (1.0 + dist * 0.1) * td.a;
        waveHeight += weight * cos(uWaveFreq * relDist);
        totalWeight += weight;
      }
      waveHeight /= max(totalWeight, 1.0);
      float d = clamp(waveHeight * uAmplitude, -uMaxHeight, uMaxHeight);
      transformed.y += d;
      vHeight = d;
    }`);

/** Fills an instanced grid of cubes centred on the origin, tops at y = 0, with each cube's xz in `aOffset`. */
export function fillGrid(mesh: InstancedMesh, grid: number, cube: number, gap: number, height: number): void {
  const aOffset = new InstancedBufferAttribute(new Float32Array(grid * grid * 2), 2);
  mesh.geometry.setAttribute('aOffset', aOffset);
  const dummy = new Object3D();
  const half = ((grid - 1) * (cube + gap)) / 2;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const x = i * (cube + gap) - half, z = j * (cube + gap) - half;
    dummy.position.set(x, -height / 2, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i * grid + j, dummy.matrix);
    aOffset.setXY(i * grid + j, x, z);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * The lobby's floor for the headset: unlit (no lights or shadows to set up), tops lighter than sides, fading into
 * the lobby's dark toward its edge. Call update(dt) each frame while it shows.
 */
export function createWaveFloor(opts: { grid: number; cube: number; base: string; high: string; fade: string; fadeFrom: number; fadeTo: number }) {
  const { grid, cube } = opts, gap = 0.01, height = cube * 3.5;
  const k = cube / 0.8; // the start page's grid in metres
  const trail = createWaveTrail({ bounds: grid * (cube + gap), speed: 6 * k, freq: 1.2 / k, width: 3 * k, amplitude: 0.4 * k, jitter: 0.2 * k, maxHeight: 0.4 * k });
  const colors = {
    uColorBase: { value: new Color(opts.base) }, uColorHigh: { value: new Color(opts.high) }, uFade: { value: new Color(opts.fade) },
    uFadeFrom: { value: opts.fadeFrom }, uFadeTo: { value: opts.fadeTo },
  };
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, trail.uniforms, colors);
    s.vertexShader = waveVertex(s.vertexShader)
      .replace('#include <common>', '#include <common>\nvarying float vShade;\nvarying float vDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = normal.y > 0.5 ? 1.0 : (abs(normal.x) > 0.5 ? 0.62 : 0.48);\nvDist = length(aOffset);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeight;\nvarying float vShade;\nvarying float vDist;\nuniform vec3 uColorBase, uColorHigh, uFade;\nuniform float uMaxHeight, uFadeFrom, uFadeTo;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(mix(uColorBase, uColorHigh, clamp(vHeight / uMaxHeight, 0.0, 1.0)) * vShade, uFade, smoothstep(uFadeFrom, uFadeTo, vDist));');
  };
  const mesh = new InstancedMesh(new BoxGeometry(cube, height, cube), material, grid * grid);
  fillGrid(mesh, grid, cube, gap, height);
  mesh.frustumCulled = false;
  return {
    mesh,
    update: (dt: number) => trail.update(dt),
  };
}
