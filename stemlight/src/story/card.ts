// Text in the world: a canvas drawn once per change onto a sprite that always faces the viewer.
import { CanvasTexture, Sprite, SpriteMaterial } from 'three';

export function textSprite(widthM: number, px = 1024, aspect = 4) {
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = Math.round(px / aspect);
  const g = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(widthM, widthM / aspect, 1);
  sprite.renderOrder = 10;
  let last = '';

  const wrap = (text: string, max: number): string[] => {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > max) { out.push(line); line = word; } else line = next;
    }
    return line ? [...out, line] : out;
  };

  return {
    sprite,
    /** The first line is a large title; the rest are small and wrapped. `small` is a fraction of the canvas height. */
    set(lines: string[], small = 0.1) {
      const key = lines.join('\n') + small;
      if (key === last) return;
      last = key;
      const H = canvas.height, W = canvas.width;
      const bigPx = lines.length > 1 ? H * 0.22 : H * 0.5, smallPx = H * small;
      g.font = `400 ${smallPx}px system-ui, sans-serif`;
      const rest = lines.slice(1).flatMap((l) => (l ? wrap(l, W * 0.9) : ['']));
      const total = bigPx * 1.3 + rest.length * smallPx * 1.35;
      g.clearRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(111,243,255,0.8)';
      g.shadowBlur = 16;
      let y = (H - total) / 2 + bigPx * 0.65;
      g.font = `600 ${bigPx}px system-ui, sans-serif`;
      const fit = Math.min(1, (W * 0.92) / g.measureText(lines[0]).width); // a long title shrinks to fit
      g.font = `600 ${bigPx * fit}px system-ui, sans-serif`;
      g.fillStyle = '#F4F5F6';
      g.fillText(lines[0], W / 2, y);
      y += bigPx * 0.65 + smallPx * 0.7;
      g.font = `400 ${smallPx}px system-ui, sans-serif`;
      g.fillStyle = 'rgba(220,240,255,0.88)';
      g.shadowBlur = 6;
      for (const l of rest) { g.fillText(l, W / 2, y); y += smallPx * 1.35; }
      tex.needsUpdate = true;
    },
  };
}
