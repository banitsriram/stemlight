import gsap from 'gsap';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './landing.css';
import { loaded } from './loader';

export interface LandingDeps {
  unlock(): Promise<void>;
  /** 'ar' starts a passthrough session (the player's room); no mode re-enters the last one (Resume). */
  enter(mode?: 'vr' | 'ar'): Promise<void>;
  /** Whether this browser can start a passthrough session; the second button shows only then. */
  canPassthrough?(): Promise<boolean>;
}

const NOTES = 14;
const PITCH = 'The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.';

/** The first visit's words, or the resume screen's after the headset session ends (biyon-58). */
export const COPY = {
  first: { title: 'Stemlight', pitch: PITCH, button: 'Enter' },
  resume: { title: 'Paused', pitch: 'Your place in the music and your mix are kept.', button: 'Resume' },
};

export function mountLanding(root: HTMLElement, { unlock, enter, canPassthrough }: LandingDeps, copy = COPY.first): void {
  const note = '<svg class="landing-note" viewBox="0 0 20 40" aria-hidden="true"><ellipse cx="7" cy="33" rx="7" ry="5" transform="rotate(-20 7 33)"/><rect x="12" y="4" width="2" height="29"/><path d="M14 4c0 6 7 8 6 16 3-8-4-10-6-12z"/></svg>';
  root.innerHTML = `
    <main class="landing">
      <div class="landing-shafts" aria-hidden="true"></div>
      <div class="landing-notes" aria-hidden="true">${note.repeat(NOTES)}</div>
      <div class="landing-copy">
        <h1 class="landing-in">${copy.title}</h1>
        <p class="landing-pitch landing-in">${copy.pitch}</p>
        <button class="landing-enter landing-in" type="button">${copy.button}</button>
        <button class="landing-room" type="button" hidden>Enter in passthrough</button>
        <p class="landing-gestures landing-in">Close a fist to silence an instrument. Pinch twice to hear it alone. Tap the harp, drums and keys to play along.</p>
        <p class="landing-hint landing-in">No account. Seated, hands only, about 4 minutes.<br>If your hands don't appear, turn on hand tracking in your headset settings.</p>
        <p class="landing-status" role="status"></p>
      </div>
    </main>`;

  const page = root.querySelector<HTMLElement>('.landing')!;
  const button = root.querySelector<HTMLButtonElement>('.landing-enter')!;
  const room = root.querySelector<HTMLButtonElement>('.landing-room')!;
  // Passthrough (sir, 18 Nov): play in your own room. Offered on the first screen only; Resume re-enters the last mode.
  if (copy === COPY.first) void canPassthrough?.().then((ok) => { room.hidden = !ok; });
  const status = root.querySelector<HTMLElement>('.landing-status')!;
  const lenis = new Lenis({ autoRaf: true });

  const motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    const intro = gsap.from('.landing-in', { y: 16, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07, paused: true });
    void loaded.then(() => intro.play()); // after the loading screen starts to lift
    gsap.to('.landing-shafts', { skewX: 4, opacity: 0.6, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    // Notes rise like bubbles through the light, each at its own pace and sway.
    gsap.utils.toArray<SVGElement>('.landing-note').forEach((el) => {
      gsap.set(el, { left: `${gsap.utils.random(4, 96)}%`, scale: gsap.utils.random(0.5, 1.3) });
      gsap.fromTo(el, { y: 0 }, { y: () => -innerHeight - 120, duration: gsap.utils.random(14, 26), ease: 'none', repeat: -1, delay: -gsap.utils.random(0, 26) });
      gsap.to(el, { x: gsap.utils.random(-30, 30), rotation: gsap.utils.random(-15, 15), duration: gsap.utils.random(2.5, 4.5), ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
  });
  motion.add('(prefers-reduced-motion: reduce)', () => {
    gsap.from('.landing-in', { autoAlpha: 0, duration: 0.4, ease: 'none' });
    gsap.utils.toArray<SVGElement>('.landing-note').forEach((el) => gsap.set(el, { left: `${gsap.utils.random(4, 96)}%`, bottom: `${gsap.utils.random(5, 90)}%` }));
  });

  const start = async (pressed: HTMLButtonElement, mode?: 'vr' | 'ar') => {
    const label = pressed.textContent ?? '';
    button.disabled = room.disabled = true;
    pressed.setAttribute('aria-busy', 'true');
    pressed.textContent = copy.button === 'Enter' ? 'Entering…' : 'Resuming…';
    status.textContent = '';
    try {
      // Both start inside the click: requestSession needs the user activation.
      await Promise.all([unlock(), enter(mode)]);
    } catch {
      status.textContent = mode === 'ar'
        ? `Couldn't start passthrough. Press Enter to play in VR instead.`
        : `Couldn't start VR. Open this page in your headset's browser, then press ${copy.button} again.`;
      button.disabled = room.disabled = false;
      pressed.removeAttribute('aria-busy');
      pressed.textContent = label;
      return;
    }
    gsap.to(page, {
      autoAlpha: 0,
      duration: 0.4,
      onComplete: () => {
        motion.revert();
        lenis.destroy();
        root.replaceChildren();
      },
    });
  };
  button.addEventListener('click', () => void start(button, copy === COPY.first ? 'vr' : undefined));
  room.addEventListener('click', () => void start(room, 'ar'));
}
