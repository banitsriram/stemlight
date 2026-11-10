// Dev instrumentation (biyon-30, F26 / F27 support): fps, draw calls, triangles and live note count
// in a corner overlay, plus a head-locked 70×66° field-of-view mask for FoV screenshots.
// Loaded only through a dynamic import behind import.meta.env.DEV, so none of it reaches dist/.
import { Mesh, MeshBasicMaterial, Object3D, Path, Shape, ShapeGeometry, type PerspectiveCamera, type WebGLRenderer } from 'three';

export interface DevSample { fps: number; calls: number; triangles: number; notes: number; maxCalls: number; maxTriangles: number; maxNotes: number }

const FOV_H = 70, FOV_V = 66;

function fovMask(): Mesh {
  const d = 1, hw = Math.tan((FOV_H / 2) * Math.PI / 180) * d, hh = Math.tan((FOV_V / 2) * Math.PI / 180) * d;
  const outer = new Shape().moveTo(-4, -4).lineTo(4, -4).lineTo(4, 4).lineTo(-4, 4).closePath();
  outer.holes.push(new Path().moveTo(-hw, -hh).lineTo(-hw, hh).lineTo(hw, hh).lineTo(hw, -hh).closePath());
  const mesh = new Mesh(new ShapeGeometry(outer), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
  mesh.position.z = -d;
  mesh.renderOrder = 10_000;
  mesh.frustumCulled = false;
  mesh.name = 'dev-fov-mask';
  return mesh;
}

/** Sum of live instances under `root` (the note glyph layers are instanced meshes). */
function countInstances(root: Object3D | null): number {
  let n = 0;
  root?.traverse((o) => {
    const g = (o as Mesh).geometry as { instanceCount?: number } | undefined;
    if ((o as Mesh).isMesh && o.visible && g && Number.isFinite(g.instanceCount)) n += g.instanceCount!;
  });
  return n;
}

export function initDevStats(renderer: WebGLRenderer, camera: PerspectiveCamera, notesRoot: Object3D | null) {
  const params = new URLSearchParams(location.search);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:12px/1.35 ui-monospace,monospace;color:#6FF3FF;background:rgba(7,6,15,.75);border-radius:6px;z-index:99;pointer-events:none;white-space:pre';
  if (params.has('stats')) document.body.appendChild(el);

  const mask = fovMask();
  mask.visible = params.has('fov');
  camera.add(mask);
  addEventListener('keydown', (e) => { if (e.key === 'm') mask.visible = !mask.visible; });

  let frames = 0, last = performance.now(), fps = 0;
  const s: DevSample = { fps: 0, calls: 0, triangles: 0, notes: 0, maxCalls: 0, maxTriangles: 0, maxNotes: 0 };

  return {
    /** Call once per frame, before render: reads the previous frame's renderer info. */
    update() {
      frames++;
      const now = performance.now();
      if (now - last >= 500) { fps = (frames * 1000) / (now - last); frames = 0; last = now; }
      const info = renderer.info.render;
      // The mask itself is one call; leave it out so budget numbers match the shipped build.
      const maskCalls = mask.visible ? 1 : 0;
      Object.assign(s, { fps: Math.round(fps), calls: info.calls - maskCalls, triangles: info.triangles, notes: countInstances(notesRoot) });
      s.maxCalls = Math.max(s.maxCalls, s.calls);
      s.maxTriangles = Math.max(s.maxTriangles, s.triangles);
      s.maxNotes = Math.max(s.maxNotes, s.notes);
      if (el.isConnected && frames % 10 === 0) {
        el.textContent = `fps ${s.fps} (emulator, not a device number)\ncalls ${s.calls} / 100   max ${s.maxCalls}\ntris  ${s.triangles} / 150k  max ${s.maxTriangles}\nnotes ${s.notes} / 1500  max ${s.maxNotes}`;
      }
    },
    sample: (): DevSample => ({ ...s }),
    resetMax() { s.maxCalls = s.maxTriangles = s.maxNotes = 0; },
    mask,
  };
}
