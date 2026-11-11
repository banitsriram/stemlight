import gsap from 'gsap';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import './landing.css';

export interface LandingDeps {
  unlock(): Promise<void>;
  enter(): Promise<void>;
}

const PITCH = 'The music you can reach into: silence it, reshape it, play your own part, while every real note floats around you.';

export function mountLanding(root: HTMLElement, { unlock, enter }: LandingDeps): void {
  root.innerHTML = `
    <main class="landing">
      <h1 class="landing-in">Stemlight</h1>
      <p class="landing-pitch landing-in">${PITCH}</p>
      <button class="landing-enter landing-in" type="button">Enter</button>
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
      status.textContent = "Couldn't start VR. Open this page in your headset's browser, then press Enter again.";
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
