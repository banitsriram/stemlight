import gsap from 'gsap';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './landing.css';

export interface LandingDeps {
  unlock(): Promise<void>;
  enter(): Promise<void>;
}

const PITCH = 'The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.';

/** The first visit's words, or the resume screen's after the headset session ends (biyon-58). */
export const COPY = {
  first: { title: 'Stemlight', pitch: PITCH, button: 'Enter' },
  resume: { title: 'Paused', pitch: 'Your place in the music and your mix are kept.', button: 'Resume' },
};

export function mountLanding(root: HTMLElement, { unlock, enter }: LandingDeps, copy = COPY.first): void {
  root.innerHTML = `
    <main class="landing">
      <h1 class="landing-in">${copy.title}</h1>
      <p class="landing-pitch landing-in">${copy.pitch}</p>
      <button class="landing-enter landing-in" type="button">${copy.button}</button>
      <p class="landing-hint landing-in">No account. Seated, hands only, about 5 minutes.<br>If your hands don't appear, turn on hand tracking in your headset settings.</p>
      <p class="landing-status" role="status"></p>
    </main>`;

  const page = root.querySelector<HTMLElement>('.landing')!;
  const button = root.querySelector<HTMLButtonElement>('.landing-enter')!;
  const status = root.querySelector<HTMLElement>('.landing-status')!;
  const lenis = new Lenis({ autoRaf: true });

  const motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.from('.landing-in', { y: 18, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.12 });
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '';
    try {
      // Both start inside the click: requestSession needs the user activation.
      await Promise.all([unlock(), enter()]);
    } catch {
      status.textContent = `Couldn't start VR. Open this page in your headset's browser, then press ${copy.button} again.`;
      button.disabled = false;
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
  });
}
