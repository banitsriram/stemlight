/**
 * Loading screen: a rippling grid of dark cubes, then particles that gather into the name.
 * Covers the cold start (World.create, save, first piece). Once the landing page mounts the name lifts and
 * the grid stays on as the page background (Start and Paused), resting while the headset session runs.
 * Wave grid adapted from the "3D Wave Grid" demo; particles from Bruno Imbrizi's Codrops
 * "Interactive Particles" (MIT). Both reworked here for one renderer, dark palette, text source.
 * The grid ripples on its own to a steady beat; the pointer (mouse, or the hand ray in a headset
 * browser) only scatters the name's particles.
 */
import gsap from 'gsap';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { createWaveTrail, fillGrid, waveVertex } from '../src/world/waveGrid';

const MIN_SHOW = 3.6; // s: long enough for the name to form even on a fast connection
const GRID = 40;
const BEAT = 1.1; // s between ripples
const BOLT = '#7a0a0a'; // thin blood-red lightning behind the name: flat lines, no glow
const COLOR_BASE = '#1b1e22';
const COLOR_HIGH = '#59626d';
const PARTICLE = '#e4e8ec';

let markLoaded: () => void = () => {};
/** Resolves when the loader starts lifting (or at once when it doesn't run): the landing intro waits for it. */
export const loaded = new Promise<void>((r) => { markLoaded = r; });

const SIMPLEX_2D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

const P_VERT = /* glsl */ `
precision highp float;
attribute float pindex;
attribute vec3 position;
attribute vec3 offset;
attribute vec2 uv;
attribute float angle;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime, uRandom, uDepth, uSize;
uniform vec2 uTextureSize;
uniform sampler2D uTexture, uTouch;
varying vec2 vPUv;
varying vec2 vUv;
${SIMPLEX_2D}
float random(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  vUv = uv;
  vec2 puv = offset.xy / uTextureSize;
  vPUv = puv;
  vec4 colA = texture2D(uTexture, puv);
  float grey = colA.r * 0.21 + colA.g * 0.71 + colA.b * 0.07;
  vec3 displaced = offset;
  displaced.xy += vec2(random(pindex) - 0.5, random(offset.x + pindex) - 0.5) * uRandom;
  float rndz = (random(pindex) + snoise(vec2(pindex * 0.1, uTime * 0.1)));
  displaced.z += rndz * (random(pindex) * 2.0 * uDepth);
  displaced.xy -= uTextureSize * 0.5;
  float t = texture2D(uTouch, puv).r;
  displaced.z += t * 20.0 * rndz;
  displaced.x += cos(angle) * t * 20.0 * rndz;
  displaced.y += sin(angle) * t * 20.0 * rndz;
  float psize = (snoise(vec2(uTime, pindex) * 0.5) + 2.0);
  psize *= max(grey, 0.2);
  psize *= uSize;
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  mvPosition.xyz += position * psize;
  gl_Position = projectionMatrix * mvPosition;
}`;

const P_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vPUv;
varying vec2 vUv;
void main() {
  vec4 colA = texture2D(uTexture, vPUv);
  float grey = colA.r * 0.21 + colA.g * 0.71 + colA.b * 0.07;
  float t = smoothstep(0.0, 0.45, 0.5 - distance(vUv, vec2(0.5)));
  gl_FragColor = vec4(vec3(grey) * uColor, t * (0.35 + 0.65 * grey) * uAlpha);
}`;

const VIGNETTE_RGB_SHIFT = {
  uniforms: { tDiffuse: { value: null }, shiftAmount: { value: 0.005 }, vignetteRadius: { value: 0.3 }, vignetteSoftness: { value: 0.3 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float shiftAmount, vignetteRadius, vignetteSoftness;
    varying vec2 vUv;
    void main() {
      vec2 c = vec2(0.5);
      float v = smoothstep(vignetteRadius, vignetteRadius + vignetteSoftness, distance(vUv, c));
      vec2 s = shiftAmount * v * vec2(sign(vUv.x - c.x), sign(vUv.y - c.y));
      vec3 col = vec3(texture2D(tDiffuse, vUv + s).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - s).b);
      gl_FragColor = vec4(col * (1.0 - v * 0.5), 1.0);
    }`,
};

/** Particle positions come from the name drawn in the landing title's font. */
async function nameCanvas(): Promise<HTMLCanvasElement> {
  const font = '400 112px "Bodoni Moda", Didot, "Times New Roman", serif';
  await Promise.race([document.fonts.load(font), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});
  const c = document.createElement('canvas');
  c.width = 480; c.height = 150;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('Stemlight', c.width / 2, c.height / 2 + 4);
  return c;
}

/** The cursor trail as a small greyscale texture the particle shader reads (from the Codrops demo). */
function touchTexture(radius: number) {
  const size = 64, maxAge = 120;
  const trail: { x: number; y: number; age: number; force: number }[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.Texture(canvas);
  const ease = (t: number) => Math.sin(t * Math.PI / 2);
  return {
    texture,
    add(x: number, y: number) {
      const last = trail[trail.length - 1];
      const force = last ? Math.min(((last.x - x) ** 2 + (last.y - y) ** 2) * 10000, 1) : 0;
      trail.push({ x, y, age: 0, force });
    },
    update() {
      g.fillStyle = 'black'; g.fillRect(0, 0, size, size);
      for (let i = trail.length - 1; i >= 0; i--) if (++trail[i].age > maxAge) trail.splice(i, 1);
      for (const p of trail) {
        const k = p.age < maxAge * 0.3 ? ease(p.age / (maxAge * 0.3)) : ease(1 - (p.age - maxAge * 0.3) / (maxAge * 0.7));
        const r = size * radius * k * p.force;
        if (r <= 0) continue;
        const px = p.x * size, py = (1 - p.y) * size;
        const grd = g.createRadialGradient(px, py, r * 0.25, px, py, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.2)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.beginPath(); g.fillStyle = grd; g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      }
      texture.needsUpdate = true;
    },
  };
}

function start(root: HTMLElement): void {
  const t0 = performance.now();
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  root.append(canvas);
  const view = () => ({ w: innerWidth || 1, h: innerHeight || 1, dpr: Math.min(devicePixelRatio, 1.5) });
  let v = view();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(v.dpr);
  renderer.setSize(v.w, v.h, false);

  // ── Wave grid ──────────────────────────────────────────────────────────────
  const cubeW = 0.8, cubeH = 3, bounds = GRID * (cubeW + 0.01);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR_BASE).multiplyScalar(0.5);
  const camera = new THREE.PerspectiveCamera(40, v.w / v.h, 0.1, 500);
  let radius = 12;
  const fit = () => {
    const vh = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hh = Math.atan(Math.tan(vh) * camera.aspect);
    radius = Math.min(bounds / 2 / Math.tan(vh), bounds / 2 / Math.tan(hh)) * 0.9 + cubeH * 0.5;
  };
  const place = () => {
    camera.position.set(0, radius, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
  };
  fit(); place();

  scene.add(new THREE.AmbientLight('#ffffff', 0.5));
  const key = new THREE.DirectionalLight('#ffffff', 4);
  key.position.set(-20, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  Object.assign(key.shadow.camera, { near: 0.1, far: 60, left: -22, right: 22, top: 22, bottom: -22 });
  key.shadow.bias = 0.0001;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#ffffff', 1);
  fill.position.set(10, 5, -3);
  scene.add(fill);

  const trail = createWaveTrail({ bounds, speed: 6, freq: 1.2, width: 3, amplitude: 0.4, jitter: 0.2, maxHeight: 0.4 }, BEAT);
  const wave = trail.uniforms;
  const colors = { uColorBase: { value: new THREE.Color(COLOR_BASE) }, uColorHigh: { value: new THREE.Color(COLOR_HIGH) } };
  const geometry = new THREE.BoxGeometry(cubeW, cubeH, cubeW);
  const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, wave, colors);
    s.vertexShader = waveVertex(s.vertexShader);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHeight;\nuniform vec3 uColorBase;\nuniform vec3 uColorHigh;\nuniform float uMaxHeight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(uColorBase, uColorHigh, clamp(vHeight / uMaxHeight, 0.0, 1.0));');
  };
  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (s) => { Object.assign(s.uniforms, wave); s.vertexShader = waveVertex(s.vertexShader); };
  const cubes = new THREE.InstancedMesh(geometry, material, GRID * GRID);
  cubes.customDepthMaterial = depthMaterial;
  cubes.castShadow = cubes.receiveShadow = true;
  fillGrid(cubes, GRID, cubeW, 0.01, 0); // centred on y = 0, as in the demo
  scene.add(cubes);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(VIGNETTE_RGB_SHIFT));
  composer.addPass(new OutputPass());

  // ── Particles (the name) ───────────────────────────────────────────────────
  // ── Lightning: thin dark-red bolts that flicker like distant thunder, once the name has formed ──
  const bolts = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: BOLT, transparent: true, opacity: 0, depthTest: false }));
  bolts.frustumCulled = false;
  const boltScene = new THREE.Scene().add(bolts);
  const boltCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  let storm = false, nextBolt = 0.6, boltAge = -1;
  /** One jagged bolt from above the screen downward, with a branch or two, as line segments in screen space. */
  const strike = () => {
    const pts: number[] = [];
    const branch = (x: number, y: number, len: number, depth: number) => {
      let px = x, py = y;
      const steps = Math.round(10 + len * 14);
      for (let i = 0; i < steps; i++) {
        const nx = px + (Math.random() - 0.5) * 0.09, ny = py - len / steps * (0.6 + Math.random() * 0.8);
        pts.push(px, py, 0, nx, ny, 0);
        if (depth < 2 && Math.random() < 0.08) branch(nx, ny, len * 0.45, depth + 1);
        px = nx; py = ny;
      }
    };
    branch(-0.95 + Math.random() * 1.9, 1.05, 0.9 + Math.random() * 1.0, 0);
    bolts.geometry.dispose();
    bolts.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    boltAge = 0;
  };
  // A real flash flickers: on, dim, on again, gone.
  const FLICKER = [[0, 0.9], [0.05, 0.25], [0.1, 0.85], [0.16, 0.4], [0.3, 0]] as const;
  const flicker = (t: number) => {
    for (let i = 1; i < FLICKER.length; i++) if (t < FLICKER[i][0]) {
      const [t0, a0] = FLICKER[i - 1], [t1, a1] = FLICKER[i];
      return a0 + (a1 - a0) * ((t - t0) / (t1 - t0));
    }
    return 0;
  };
  const thunder = (dt: number) => {
    if (!storm) return;
    if ((nextBolt -= dt) <= 0) { strike(); nextBolt = 1.6 + Math.random() * 3.2; }
    if (boltAge >= 0) {
      boltAge += dt;
      bolts.material.opacity = flicker(boltAge);
      if (boltAge > 0.3) boltAge = -1;
    }
    if (boltAge < 0) return;
    renderer.autoClear = false;
    renderer.render(boltScene, boltCam);
    renderer.autoClear = true;
  };

  const pScene = new THREE.Scene();
  const pCam = new THREE.PerspectiveCamera(50, v.w / v.h, 1, 10000);
  pCam.position.z = 300;
  let particles: THREE.Mesh | null = null, hit: THREE.Mesh | null = null, nameW = 1, nameH = 1;
  let pu: Record<string, THREE.IUniform> | null = null;
  const touch = touchTexture(0.15);
  const scaleName = () => {
    if (!particles || !hit) return;
    const fovH = 2 * Math.tan(THREE.MathUtils.degToRad(pCam.fov) / 2) * pCam.position.z;
    const s = Math.min((fovH * pCam.aspect * 0.78) / nameW, (fovH * 0.34) / nameH);
    particles.scale.set(s, s, 1); hit.scale.set(s, s, 1);
  };
  void nameCanvas().then((src) => {
    if (disposed) return;
    nameW = src.width; nameH = src.height;
    const texture = new THREE.CanvasTexture(src);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    const read = document.createElement('canvas');
    read.width = nameW; read.height = nameH;
    const rg = read.getContext('2d')!;
    rg.scale(1, -1); rg.drawImage(src, 0, 0, nameW, -nameH);
    const px = rg.getImageData(0, 0, nameW, nameH).data;
    const kept: number[] = [];
    for (let i = 0; i < nameW * nameH; i++) if (px[i * 4] > 34) kept.push(i);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    g.setIndex([0, 2, 1, 2, 3, 1]);
    g.setAttribute('pindex', new THREE.InstancedBufferAttribute(Float32Array.from(kept), 1));
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(Float32Array.from(kept.flatMap((i) => [i % nameW, Math.floor(i / nameW), 0])), 3));
    g.setAttribute('angle', new THREE.InstancedBufferAttribute(Float32Array.from(kept, () => Math.random() * Math.PI), 1));
    g.instanceCount = kept.length;
    pu = {
      uTime: { value: 0 }, uRandom: { value: 90 }, uDepth: { value: 160 }, uSize: { value: 0 },
      uTextureSize: { value: new THREE.Vector2(nameW, nameH) }, uTexture: { value: texture },
      uTouch: { value: touch.texture }, uColor: { value: new THREE.Color(PARTICLE) }, uAlpha: { value: 1 },
    };
    particles = new THREE.Mesh(g, new THREE.RawShaderMaterial({ uniforms: pu, vertexShader: P_VERT, fragmentShader: P_FRAG, depthTest: false, transparent: true }));
    particles.frustumCulled = false;
    hit = new THREE.Mesh(new THREE.PlaneGeometry(nameW, nameH), new THREE.MeshBasicMaterial({ visible: false }));
    pScene.add(particles, hit);
    scaleName();
    // The name gathers out of a deep, scattered cloud.
    const wait = Math.max(0, 0.7 - (performance.now() - t0) / 1000);
    gsap.to(pu.uSize, { value: 1.5, duration: 1.4, delay: wait, ease: 'power2.out' });
    gsap.to(pu.uRandom, { value: 1.8, duration: 2.4, delay: wait, ease: 'expo.out' });
    gsap.to(pu.uDepth, { value: 3, duration: 2.8, delay: wait, ease: 'expo.out', onComplete: () => { storm = true; } });
  });

  // ── Pointer ────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    if (!hit) return;
    ndc.set((e.clientX / v.w) * 2 - 1, -(e.clientY / v.h) * 2 + 1);
    ray.setFromCamera(ndc, pCam);
    const h = ray.intersectObject(hit)[0];
    if (h?.uv) touch.add(h.uv.x, h.uv.y);
  };
  addEventListener('pointermove', onMove);

  const resize = () => {
    v = view();
    camera.aspect = pCam.aspect = v.w / v.h;
    camera.updateProjectionMatrix(); pCam.updateProjectionMatrix();
    fit(); place();
    renderer.setPixelRatio(v.dpr); renderer.setSize(v.w, v.h, false);
    composer.setPixelRatio(v.dpr); composer.setSize(v.w, v.h);
    scaleName();
  };
  addEventListener('resize', resize);
  resize();

  // ── Loop ───────────────────────────────────────────────────────────────────
  let disposed = false;
  let prev = performance.now();
  const frame = (now: number) => {
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    trail.update(dt);
    composer.render();
    thunder(dt);
    if (particles && pu) {
      touch.update();
      pu.uTime.value += dt;
      renderer.autoClear = false;
      renderer.render(pScene, pCam);
      renderer.autoClear = true;
    }
  };
  renderer.setAnimationLoop(frame);

  // ── Lift the name once the landing page has mounted and the name has had its moment ──
  // The grid stays as the page's background; it rests while the landing is empty (the headset session).
  const landing = document.getElementById('landing');
  const lift = () => {
    if (disposed) return;
    disposed = true;
    markLoaded();
    root.style.zIndex = '0'; // under the landing page from now on
    removeEventListener('pointermove', onMove);
    if (!pu) return;
    const done = () => {
      pScene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      pScene.clear(); touch.texture.dispose(); particles = hit = null; pu = null;
    };
    gsap.to(pu.uRandom, { value: 40, duration: 0.9, ease: 'power2.in' });
    gsap.to(pu.uDepth, { value: 120, duration: 0.9, ease: 'power2.in' });
    gsap.to(pu.uAlpha, { value: 0, duration: 0.8, onComplete: done });
  };
  const ready = () => {
    const left = MIN_SHOW - (performance.now() - t0) / 1000;
    if (left > 0) setTimeout(lift, left * 1000); else lift();
  };
  const watch = () => {
    const up = !!landing?.childElementCount;
    if (up && !disposed) ready();
    if (disposed) { prev = performance.now(); renderer.setAnimationLoop(up ? frame : null); }
  };
  if (landing) new MutationObserver(watch).observe(landing, { childList: true });
  watch();
  if (!landing) ready();
}

// Runs once, on the first load. Reduced motion or no WebGL: the plain dark page stays, as before.
const root = document.createElement('div');
root.setAttribute('aria-hidden', 'true');
root.style.cssText = 'position:fixed;inset:0;z-index:10;background:#0d0f11';
if (matchMedia('(prefers-reduced-motion: reduce)').matches) markLoaded();
else {
  document.body.append(root);
  try { start(root); } catch (e) { console.warn('loader skipped', e); root.remove(); markLoaded(); }
}
