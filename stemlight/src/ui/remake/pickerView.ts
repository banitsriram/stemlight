// The song picker's look, in the deep-sea glass of the play surfaces: each song a frosted glass bubble with cyan
// edge light (you can touch it), the song played last tinted amber (yours), its title and length above it, a
// caption over the arc, and the small songs bubble with its label and a ring that fills while it's held.
import { BackSide, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry, type Object3D } from 'three';
import type { Vec3 } from '../../contracts';
import { textSprite } from '../../story/card.ts';
import { SEA } from '../../world/deepsea.ts';
import { instrumentMesh, songBubble, worldOrb } from './models.ts';
import { ORBS, PICKER, SONGS_BUBBLE, songLabel, type SongInfo } from './picker.ts';

/** A world as the picker shows it: its name and its orb's glass and pearl colours. */
export interface WorldLook { id: string; name: string; orb: readonly [string, string] }

export interface PickerDraw {
  bubbles: Vec3[]; // the open picker's bubbles; empty while closed
  orbs: Vec3[]; // the open picker's world orbs; empty while closed
  orbIds?: string[]; // the world of each of orbs (default: every world, in order)
  world: number; // the current world (its orb tinted amber: yours)
  current: number; // the song played last (amber tint), -1 for none
  loading: number; // the song just touched, pulsing amber while it loads, -1 for none
  songsAt: Vec3 | null; // the songs bubble while a song plays
  hold: number; // 0..1 while the songs bubble is held
  eye: Vec3;
  clock: number; // seconds
}

const RING_STEPS = 24;

export function createPickerView(scene: Object3D, songs: readonly SongInfo[], worlds: readonly WorldLook[] = []) {
  const group = new Group();
  scene.add(group);
  const cyan = new Color(SEA.cyan), amber = new Color(SEA.amber);
  const geo = songBubble();
  // The lobby (sir, 18 Nov): choosing happens in a blank space, deep slate-teal overhead to near-black below.
  const lobbyGeo = new SphereGeometry(6, 24, 12);
  const top = new Color('#123A4A'), bottom = new Color('#060E16'), col: number[] = [], pos = lobbyGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) { const c = bottom.clone().lerp(top, (pos.getY(i) / 6 + 1) / 2); col.push(c.r, c.g, c.b); }
  lobbyGeo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const lobby = new Mesh(lobbyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide }));
  lobby.renderOrder = -20;
  lobby.frustumCulled = false;
  lobby.visible = false;
  group.add(lobby);
  const bubbles = songs.map(() => {
    const m = instrumentMesh(geo, amber, cyan);
    m.scale.setScalar(PICKER.radius);
    group.add(m);
    return m;
  });
  const labels = songs.map((s) => {
    const t = textSprite(0.17, 512, 2.4);
    t.set(songLabel(s), 0.17);
    t.sprite.visible = false;
    group.add(t.sprite);
    return t;
  });
  const orbs = worlds.map((w) => {
    const m = instrumentMesh(worldOrb(w.orb[0], w.orb[1]), amber, cyan);
    m.scale.setScalar(ORBS.radius);
    group.add(m);
    return m;
  });
  const orbLabels = worlds.map((w) => {
    const t = textSprite(0.1, 512, 5);
    t.set([w.name]);
    t.sprite.visible = false;
    group.add(t.sprite);
    return t;
  });
  const caption = textSprite(0.34, 1024, 6);
  caption.set(worlds.length ? ['Touch a song to play it', 'Touch an orb below to change the world'] : ['Touch a song to play it'], 0.13);
  caption.sprite.visible = false;
  group.add(caption.sprite);
  const small = instrumentMesh(geo, amber, cyan);
  small.scale.setScalar(SONGS_BUBBLE.radius);
  group.add(small);
  const smallLabel = textSprite(0.08, 256, 3);
  smallLabel.set(['Songs']);
  smallLabel.sprite.visible = false;
  group.add(smallLabel.sprite);
  const rings = Array.from({ length: RING_STEPS }, (_, k) =>
    new RingGeometry(SONGS_BUBBLE.radius + 0.006, SONGS_BUBBLE.radius + 0.013, 40, 1, Math.PI / 2, -(Math.PI * 2 * (k + 1)) / RING_STEPS));
  const ring = new Mesh(rings[0], new MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.visible = false;
  group.add(ring);

  return {
    /** Relabels song i (its length arrives with its manifest). */
    label(i: number, s: SongInfo) { labels[i]?.set(songLabel(s), 0.17); },
    draw(d: PickerDraw) {
      let cx = 0, cy = 0, cz = 0;
      lobby.visible = d.bubbles.length > 0;
      lobby.position.set(...d.eye);
      bubbles.forEach((m, i) => {
        const c = d.bubbles[i];
        m.visible = labels[i].sprite.visible = !!c;
        if (!c) return;
        const bob = 0.003 * Math.sin(d.clock * 1.6 + i * 2.1); // a slow drift, like a bubble in water
        m.position.set(c[0], c[1] + bob, c[2]);
        (m.material.uniforms.uFlash.value as number[])[0] =
          i === d.loading ? 0.55 + 0.45 * Math.sin(d.clock * 9) : i === d.current ? 0.3 : 0;
        labels[i].sprite.position.set(c[0], c[1] + 0.1, c[2]);
        cx += c[0]; cy += c[1]; cz += c[2];
      });
      orbs.forEach((m, i) => {
        const j = d.orbIds ? d.orbIds.indexOf(worlds[i].id) : i;
        const c = j < 0 ? undefined : d.orbs[j];
        m.visible = orbLabels[i].sprite.visible = !!c;
        if (!c) return;
        m.position.set(c[0], c[1] + 0.002 * Math.sin(d.clock * 1.3 + i * 1.7), c[2]);
        (m.material.uniforms.uFlash.value as number[])[0] = i === d.world ? 0.4 : 0;
        orbLabels[i].sprite.position.set(c[0], c[1] + 0.043, c[2]); // just above its orb: below it fell out of view
        orbLabels[i].sprite.material.opacity = i === d.world ? 1 : 0.7;
      });
      const n = d.bubbles.length;
      caption.sprite.visible = n > 0;
      if (n) caption.sprite.position.set(cx / n, cy / n + 0.19, cz / n);
      small.visible = smallLabel.sprite.visible = !!d.songsAt;
      ring.visible = !!d.songsAt && d.hold > 0;
      if (!d.songsAt) return;
      const [x, y, z] = d.songsAt;
      small.position.set(x, y, z);
      (small.material.uniforms.uFlash.value as number[])[0] = 0.8 * d.hold;
      smallLabel.sprite.position.set(x, y - 0.06, z);
      if (ring.visible) {
        ring.geometry = rings[Math.min(RING_STEPS - 1, Math.floor(d.hold * RING_STEPS))];
        ring.position.set(x, y, z);
        ring.lookAt(d.eye[0], d.eye[1], d.eye[2]);
      }
    },
  };
}
