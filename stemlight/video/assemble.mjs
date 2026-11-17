// Video 2 (biyon-60), first pass: a rough cut from the captured shots (no narration yet) plus stills.
// Cards are rendered by the browser (ffmpeg here has no drawtext); every clip keeps its emulator label.
// Run from stemlight/ after video/capture.mjs: node video/assemble.mjs
// Writes video/captures/rough-cut.mp4 (gitignored) and video/stills/*.jpg.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const C = 'video/captures', STILLS = 'video/stills', FADE = 0.5;
mkdirSync(STILLS, { recursive: true });
const PITCH = 'The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.';
const ledger = Object.fromEntries(JSON.parse(readFileSync('video/shots.json', 'utf8')).map((e) => [e.id, e]));

// [kind, id or card, seconds to keep (clips: from the start; null = whole clip), start offset]
const EDIT = [
  ['clip', '02-fist-glass', 10.5, 2.4],
  ['card', { title: 'Stemlight', sub: PITCH }, 4],
  ['clip', '01-opening', 8, 0],
  ['clip', '03-solo', 11, 3],
  ['clip', '08-cut', 9, 6],
  ['clip', '09-drums', 9, 7.5],
  ['clip', '10-harp', 8, 9],
  ['clip', '11-keys', 9, 7],
  ['clip', '04-field-pan', null, 1.6],
  ['clip', '05-dvorak-brass', 8, 2.5],
  ['clip', '07-second-visit', 6, 1],
  ['clip', '06-end-card', 9, 4],
  ['card', { title: 'Stemlight', sub: 'Seated · hands only · about 4 minutes · no account', foot: 'Dvořák, Symphony No. 9, mvt 4: Mutopia #1793, CC BY-SA 3.0 (creativecommons.org/licenses/by-sa/3.0) · Beethoven, Symphony No. 5: Mutopia #941, public domain' }, 5],
];
// Stills: [clip, second]
const STILL_AT = [['02-fist-glass', 8.6], ['02-fist-glass', 12.5], ['03-solo', 9], ['08-cut', 11], ['09-drums', 12], ['10-harp', 13], ['11-keys', 13], ['04-field-pan', 5], ['05-dvorak-brass', 9], ['06-end-card', 9], ['07-second-visit', 4]];

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const parts = [];
let n = 0;
for (const [kind, what, keep, from] of EDIT) {
  const out = `${C}/.part${n++}.mp4`;
  if (kind === 'card') {
    await page.setContent(`<body style="margin:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 0%,#1E7F8C 0%,#0B3D4A 45%,#03131A 80%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#E4F6F8">
      <div style="font-size:120px;font-weight:600;letter-spacing:.04em;text-shadow:0 0 40px #7FF6FF88">${what.title}</div>
      <div style="margin-top:28px;max-width:1300px;text-align:center;font-size:40px;line-height:1.35;color:#B5D5DA">${what.sub}</div>
      ${what.foot ? `<div style="position:absolute;bottom:60px;max-width:1500px;text-align:center;font-size:22px;color:#7FA3AB">${what.foot}</div>` : ''}</body>`);
    const png = `${C}/.card${n}.png`;
    await page.screenshot({ path: png });
    sh(`ffmpeg -v error -y -loop 1 -t ${keep} -i ${png} -f lavfi -t ${keep} -i anullsrc=r=48000:cl=stereo -vf fps=60,format=yuv420p -c:v libx264 -crf 16 -c:a aac -b:a 256k -shortest ${out}`);
    parts.push({ out, sec: keep });
  } else {
    const src = ledger[what].file, sec = keep ?? ledger[what].seconds - from;
    // Pad, then trim on output: a clip whose video ends a little before its audio would otherwise end the whole xfade chain early.
    sh(`ffmpeg -v error -y -ss ${from} -i ${src} -t ${sec} -vf tpad=stop_mode=clone:stop_duration=2,fps=60,format=yuv420p -af apad -c:v libx264 -crf 16 -c:a aac -b:a 256k -ar 48000 -ac 2 ${out}`);
    parts.push({ out, sec });
  }
}
await browser.close();

// Crossfade chain: video xfade + audio acrossfade, FADE seconds each.
const inputs = parts.map((p) => `-i ${p.out}`).join(' ');
let v = '[0:v]', a = '[0:a]', t = parts[0].sec, f = '';
for (let i = 1; i < parts.length; i++) {
  const off = (t - FADE).toFixed(3);
  f += `${v}[${i}:v]xfade=transition=fade:duration=${FADE}:offset=${off}[v${i}];${a}[${i}:a]acrossfade=d=${FADE}[a${i}];`;
  v = `[v${i}]`; a = `[a${i}]`; t += parts[i].sec - FADE;
}
sh(`ffmpeg -v error -y ${inputs} -filter_complex "${f.slice(0, -1)}" -map "${v}" -map "${a}" -c:v libx264 -crf 17 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart ${C}/rough-cut.mp4`);
sh(`rm -f ${C}/.part*.mp4 ${C}/.card*.png`);
console.log('rough cut', sh(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${C}/rough-cut.mp4`).trim(), 's');

for (const [id, s] of STILL_AT) {
  const out = `${STILLS}/${id}-${String(s).replace('.', '_')}s.jpg`;
  sh(`ffmpeg -v error -y -ss ${s} -i ${ledger[id].file} -frames:v 1 -q:v 2 ${out}`);
  console.log('still', out);
}
