// Pause and resume (biyon-29, F23): page hidden, the XR session hidden by the system menu or headset
// removal, and session end all pause cleanly (app:pause, transport paused, state flushed by persist).
// Coming back resumes the audio clock and, if music was playing before, the music.
import type { AudioApi, Bus, Transport } from '../contracts';

export interface Lifecycle {
  pause(): void;
  resume(): Promise<void>;
  watchSession(session: XRSession): void;
  paused(): boolean;
}

export function initLifecycle(bus: Bus, transport: Transport, audio: AudioApi): Lifecycle {
  let isPaused = false, wasPlaying = false;

  const pause = () => {
    if (isPaused) return;
    wasPlaying = transport.playing();
    isPaused = true;
    bus.emit('app:pause', {}); // the engine pauses its transport on this
  };
  const resume = async () => {
    if (!isPaused) return;
    isPaused = false;
    try { await audio.context().resume(); } catch { /* resumed by the next gesture instead */ }
    bus.emit('app:resume', {});
    if (wasPlaying) transport.play();
  };

  // Re-entering XR starts playback directly; that also ends the paused state.
  bus.on('transport:state', ({ playing }) => { if (playing) isPaused = false; });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : void resume()));
    addEventListener('pagehide', pause);
  }

  return {
    pause, resume, paused: () => isPaused,
    watchSession(session) {
      session.addEventListener('visibilitychange', () => (session.visibilityState === 'visible' ? void resume() : pause()));
      session.addEventListener('end', pause);
    },
  };
}
